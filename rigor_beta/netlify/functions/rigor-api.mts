import { createHash, randomBytes } from "node:crypto";
import { getStore } from "@netlify/blobs";
import type { Context, Config } from "@netlify/functions";
import pdfParse from "pdf-parse";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { DEPARTMENTS } from "./_shared/seed.js";
import { PRODUCTION_LIMIT, activeProduction, affectsDepartment, canonicalizeRequirement, createProduction, createWorkspace, extractRequirements, invalidateChangedCheckpoints, loadSampleProduction, newId, normalizeWorkspace, now, readiness, rebuildConflicts, reconcileSourceRequirements, snapshot, validateDepartment, type ProductionState, type WorkspaceState } from "./_shared/model.js";

const COOKIE = "rigor_beta_session";
const MAX_UPLOAD = 5 * 1024 * 1024;

function storeFor(context: Context) {
  const name = context.deploy.context === "production" ? "rigor-beta" : "rigor-beta-preview";
  return getStore({ name, consistency: "strong" });
}

function commonHeaders(contentType = "application/json") {
  return { "Content-Type": contentType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "strict-origin-when-cross-origin", "Permissions-Policy": "camera=(), microphone=(), geolocation=()" };
}

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...commonHeaders(), ...headers } });
}

function fail(detail: string, status = 422) { return json({ detail }, status); }
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function cookieValue(request: Request) {
  return request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? null;
}

async function authenticated(request: Request, context: Context) {
  const token = cookieValue(request);
  if (!token) return null;
  const store = storeFor(context);
  const session = await store.get(`session/${hash(token)}`, { type: "json" }) as { testerId: string; expiresAt: string } | null;
  if (!session || session.expiresAt <= now()) return null;
  const stored = await store.get(`workspace/${session.testerId}`, { type: "json" }) as WorkspaceState | null;
  return stored ? { store, state: normalizeWorkspace(stored) } : null;
}

async function save(store: ReturnType<typeof getStore>, state: WorkspaceState) {
  state.workspace.updated_at = now();
  await store.setJSON(`workspace/${state.tester.tester_id}`, state);
}

async function body(request: Request) {
  try { return await request.json() as Record<string, any>; } catch { throw new Error("Invalid JSON request"); }
}

type DeerFlowRequirement = {
  department?: string;
  category?: string;
  requirement_text?: string;
  normalized_value?: string | null;
  unit?: string | null;
  source_page?: number | null;
  source_excerpt?: string;
  confidence?: number;
};

async function analyzeWithDeerFlow(documentName: string, pages: string[]) {
  const baseUrl = Netlify.env.get("RIGOR_DEERFLOW_URL")?.trim();
  if (!baseUrl) return null;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = Netlify.env.get("RIGOR_DEERFLOW_TOKEN")?.trim();
  if (token) headers["X-RIGOR-Service-Token"] = token;

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/rigor/analyze`, {
      method: "POST",
      headers,
      body: JSON.stringify({ document_name: documentName, pages }),
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) {
      console.warn("RIGOR DeerFlow analysis failed", response.status, await response.text());
      return null;
    }
    const payload = await response.json() as { requirements?: DeerFlowRequirement[] };
    return Array.isArray(payload.requirements) ? payload.requirements : null;
  } catch (error) {
    console.warn("RIGOR DeerFlow analysis unavailable; using local extraction", error);
    return null;
  }
}

function ingestDeerFlowRequirements(production: ProductionState, documentName: string, items: DeerFlowRequirement[]) {
  const seen = new Set(production.requirements.map((item) => `${item.document_name}|${item.excerpt}`));
  const created: Record<string, any>[] = [];
  for (const candidate of items.slice(0, 250)) {
    const detail = String(candidate.requirement_text || "").trim();
    const excerpt = String(candidate.source_excerpt || detail).trim();
    if (!detail || !excerpt) continue;
    const dedupeKey = `${documentName}|${excerpt}`;
    if (seen.has(dedupeKey)) continue;
    const item = {
      requirement_id: newId("req"),
      production_id: production.production.production_id,
      workspace_id: production.production.workspace_id,
      department: validateDepartment(candidate.department) ? candidate.department : "Production",
      category: String(candidate.category || "PRODUCTION_GENERAL").trim().toUpperCase().replace(/\s+/g, "_").slice(0, 80),
      title: detail.slice(0, 82).replace(/[ ,.;:]+$/, ""),
      detail,
      normalized_value: candidate.normalized_value ? String(candidate.normalized_value).slice(0, 240) : null,
      unit: candidate.unit ? String(candidate.unit).slice(0, 40) : null,
      confidence: Math.max(0, Math.min(1, Number(candidate.confidence ?? 0.7))),
      origin_type: "SOURCE_DOCUMENT",
      status: "NEEDS_CONFIRMATION",
      owner: null,
      due_at: null,
      document_name: documentName,
      page_number: Number(candidate.source_page) > 0 ? Number(candidate.source_page) : null,
      source_location: Number(candidate.source_page) > 0 ? `Page ${Number(candidate.source_page)}` : null,
      excerpt,
      source_kind: "DEERFLOW",
      analysis_engine: "DEERFLOW",
    };
    canonicalizeRequirement(item);
    production.requirements.push(item);
    created.push(item);
    seen.add(dedupeKey);
  }
  rebuildConflicts(production);
  return created;
}

function event(state: ProductionState, type: string, payload: Record<string, unknown>) {
  state.events.push({ event_id: newId("event"), type, created_at: now(), payload });
}

function wrap(text: string, limit = 92) {
  const words = text.replace(/\s+/g, " ").split(" "); const lines: string[] = []; let line = "";
  for (const word of words) { const next = line ? `${line} ${word}` : word; if (next.length > limit && line) { lines.push(line); line = word; } else line = next; }
  if (line) lines.push(line); return lines;
}

async function reportPdf(state: ProductionState, department: string | null) {
  const requirements = department ? state.requirements.filter((item) => affectsDepartment(item, department)) : state.requirements;
  const conflicts = department ? state.conflicts.filter((item) => affectsDepartment(item, department)) : state.conflicts;
  const checkpoints = department ? state.checkpoints.filter((item) => item.department === department) : state.checkpoints;
  const incidents = department ? state.incidents.filter((item) => item.department === department) : state.incidents;
  const relevantRequirementIds = new Set(requirements.map((item) => item.requirement_id));
  const relevantConflictIds = new Set(conflicts.map((item) => item.conflict_id));
  const relevantCheckpointIds = new Set(checkpoints.map((item) => item.checkpoint_id));
  const relevantEvents = state.events.filter((item) => {
    if (!department) return true;
    const payload = item.payload || {};
    return payload.department === department
      || relevantRequirementIds.has(payload.requirement_id)
      || relevantConflictIds.has(payload.conflict_id)
      || relevantCheckpointIds.has(payload.checkpoint_id);
  });
  const relevantDocumentNames = new Set(requirements.map((item) => item.document_name));
  const documents = department
    ? state.documents.filter((item) => relevantDocumentNames.has(item.name))
    : state.documents;

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([612, 792]);
  let y = 748;
  const linesFor = (text: string, size: number, isBold = false) => {
    const font = isBold ? bold : regular;
    const lines: string[] = [];
    let line = "";
    for (const word of text.replace(/\s+/g, " ").trim().split(" ")) {
      const next = line ? line + " " + word : word;
      if (font.widthOfTextAtSize(next, size) > 528 && line) {
        lines.push(line);
        line = "";
      }
      for (const character of word) {
        if (font.widthOfTextAtSize(line + character, size) > 528 && line) {
          lines.push(line);
          line = "";
        }
        line += character;
      }
      line += " ";
    }
    if (line.trim()) lines.push(line.trim());
    return lines;
  };
  const ensureSpace = (height: number) => {
    if (y - height < 48 && y < 748) {
      page = pdf.addPage([612, 792]);
      y = 748;
    }
  };
  const draw = (text: string, size = 9, isBold = false, color = rgb(0.11, 0.16, 0.2)) => {
    for (const line of linesFor(text, size, isBold)) {
      ensureSpace(size + 4);
      page.drawText(line.trim(), { x: 42, y, size, font: isBold ? bold : regular, color });
      y -= size + 4;
    }
  };
  const block = (rows: Array<[string, number, boolean?]>) => {
    const height = rows.reduce((sum, [text, size, isBold]) =>
      sum + linesFor(text, size, isBold).length * (size + 4), 0) + 3;
    ensureSpace(Math.min(height, 700));
    for (const [text, size, isBold] of rows) draw(text, size, isBold);
    y -= 3;
  };
  const section = (title: string) => {
    ensureSpace(60);
    y -= 8;
    draw(title, 12, true);
  };

  draw("RIGOR", 22, true, rgb(0.05, 0.45, 0.32));
  draw(department ? `${department} Department Advance Report` : "Master Advance Report", 15, true);
  draw(`${state.show.show_name} · ${state.show.venue} · ${state.show.show_date}`, 10);
  if (state.production.sample_demo) draw("SAMPLE PRODUCTION — demonstration data, not a real show", 8, true, rgb(0.55, 0.36, 0.08));

  const score = department
    ? readiness(state, requirements, conflicts, checkpoints, incidents)
    : readiness(state);
  section("Executive readiness");
  draw(`Status: ${score.status.replaceAll("_", " ")} · Readiness: ${score.score}%`, 13, true);
  draw(`${score.confirmed_requirements}/${score.total_requirements} requirements reviewed · ${score.open_conflicts} open conflicts · ${score.open_incidents || 0} open incidents · ${score.completed_checkpoints}/${score.total_checkpoints} checkpoints complete`, 8);
  draw(`${score.unreviewed_documents} source documents awaiting full review`, 8);

  section("Open items / assumptions");
  const openRequirements = requirements.filter((item) => !["CONFIRMED", "REJECTED", "RESOLVED"].includes(item.status));
  const ownerGaps = requirements.filter((item) => ["CONFIRMED", "RESOLVED"].includes(item.status) && !item.owner);
  const openConflicts = conflicts.filter((item) => item.status !== "RESOLVED");
  const openIncidents = incidents.filter((item) => !String(item.resolution || "").trim());
  if (!openRequirements.length && !ownerGaps.length && !openConflicts.length && !openIncidents.length && !score.unreviewed_documents) {
    draw("No open items in this report scope.", 9);
  } else {
    for (const item of openRequirements) draw(`REVIEW · ${item.department} · ${item.detail || item.title}`, 8);
    for (const item of ownerGaps) draw(`OWNER · ${item.department} · ${item.title}`, 8);
    for (const item of openConflicts) draw(`CONFLICT · ${item.severity} · ${item.department} · ${item.title}`, 8);
    for (const item of openIncidents) draw(`INCIDENT · ${item.severity} · ${item.department} · ${item.summary}`, 8);
    for (const doc of documents.filter((doc) => doc.source_kind !== "SAMPLE" && doc.review_status !== "REVIEWED")) draw(`SOURCE REVIEW · ${doc.name} · Check the complete document for missed or uncertain requirements.`, 8);
  }

  section("Requirements");
  if (!requirements.length) draw("No requirements in this report scope.", 9);
  for (const item of requirements) {
    const rows: Array<[string, number, boolean?]> = [
      [`${item.department} · ${item.detail || item.title}`, 9, true],
      [`${item.status.replaceAll("_", " ")} · Owner: ${item.owner || "—"} · Source: ${item.document_name}, p${item.page_number || "—"} · Confidence: ${Math.round(Number(item.confidence || 0) * 100)}%`, 8],
      [`Evidence: ${item.excerpt || item.detail}`, 8],
    ];
    if (item.coverage_review_required) rows.push(["Source review candidate: reconcile this statement with the original document before confirming.", 8]);
    block(rows);
  }

  section("Conflict decisions");
  if (!conflicts.length) draw("No conflicts in this report scope.", 9);
  for (const item of conflicts) {
    block([
      [`${item.department} · ${item.title} · ${item.severity} · ${item.status}`, 9, true],
      [item.status === "RESOLVED"
        ? `Decision: ${item.resolution} · Owner: ${item.owner}`
        : `Open: ${item.left_value} vs ${item.right_value} · Sources: ${item.left_source} / ${item.right_source}`, 8],
    ]);
  }

  section("Show-day checkpoints");
  if (!checkpoints.length) draw("No checkpoints in this report scope.", 9);
  for (const item of checkpoints) {
    draw(`${item.status} · ${item.department} · ${item.label}${item.completed_at ? ` · ${item.completed_at}` : ""}`, 8);
  }

  section("Incident log");
  if (!incidents.length) draw("No incidents recorded in this report scope.", 9);
  for (const item of incidents) {
    draw(`${item.severity} · ${item.department} · ${item.summary}`, 9, true);
    draw(item.resolution ? `Resolution: ${item.resolution}${item.resolved_at ? ` · Closed ${item.resolved_at}` : ""}` : "Status: OPEN — resolution required", 8);
    y -= 3;
  }

  section("Analysis & AI provenance");
  if (!documents.length) draw("No source documents in this report scope.", 9);
  for (const item of documents) {
    draw(`${item.name} · ${item.page_count || "—"} pages · Analysis: ${String(item.analysis_engine || "STRUCTURED_EXTRACTION_V1").replaceAll("_", " ")} · Source: ${item.source_kind || "UNKNOWN"}`, 8);
  }

  section("Decision chronology");
  if (!relevantEvents.length) draw("No decision events recorded in this report scope.", 9);
  for (const item of relevantEvents.slice(-80)) {
    const payload = JSON.stringify(item.payload || {}).replace(/[{}"]/g, "").replace(/,/g, " · ").slice(0, 220);
    draw(`${item.created_at} · ${String(item.type).replaceAll("_", " ")}${payload ? ` · ${payload}` : ""}`, 7);
  }

  y -= 8;
  draw(`Generated ${now()} · RIGOR operational source of truth · Source evidence and decision chronology preserved`, 8, false, rgb(0.35, 0.42, 0.46));
  return pdf.save();
}
async function queueUpload(request: Request, context: Context, state: WorkspaceState, production: ProductionState, documentId: string) {
  const store = storeFor(context);
  const jobId = randomBytes(32).toString("hex");
  await store.setJSON(`document-job/${jobId}`, { testerId: state.tester.tester_id, productionId: production.production.production_id, documentId });
  const dispatch = async () => {
    try {
      const response = await fetch(new URL("/.netlify/functions/rigor-document-background", request.url), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId }), signal: AbortSignal.timeout(10000),
      });
      if (response.status !== 202) throw new Error("Background analysis could not start");
    } catch {
      const latest = await store.get(`workspace/${state.tester.tester_id}`, { type: "json" }) as WorkspaceState | null;
      const doc = latest?.productions.find(p => p.production.production_id === production.production.production_id)?.documents.find(d => d.document_id === documentId);
      if (latest && doc && doc.status === "PROCESSING") {
        doc.status = "FAILED"; doc.processing_error = "Document saved, but analysis could not start. Retry analysis.";
        await save(store, latest);
      }
    }
  };
  context.waitUntil(dispatch());
}

export async function processUpload(request: Request, context: Context) {
  const { jobId } = await request.json() as { jobId?: string };
  if (!jobId || !/^[a-f0-9]{64}$/.test(jobId)) return;
  const store = storeFor(context);
  const job = await store.get(`document-job/${jobId}`, { type: "json" }) as { testerId: string; productionId: string; documentId: string } | null;
  if (!job) return;
  const load = async () => {
    const stored = await store.get(`workspace/${job.testerId}`, { type: "json" }) as WorkspaceState | null;
    if (!stored) throw new Error("Workspace unavailable");
    const state = normalizeWorkspace(stored);
    const production = state.productions.find(p => p.production.production_id === job.productionId);
    const document = production?.documents.find(d => d.document_id === job.documentId);
    if (!production || !document) throw new Error("Document unavailable");
    return { state, production, document };
  };
  try {
    const initial = await load();
    if (initial.document.status !== "PROCESSING") return;
    const raw = await store.get(`upload/${initial.state.workspace.workspace_id}/${job.productionId}/${job.documentId}`, { type: "arrayBuffer" });
    if (!raw) throw new Error("Saved document unavailable");
    const pages: string[] = [];
    if (/\.pdf$/i.test(initial.document.name)) {
      await pdfParse(Buffer.from(raw), { pagerender: async (page: any) => {
        const content = await page.getTextContent();
        let lastY: number | undefined;
        const text = content.items.map((item: any) => {
          const y = item.transform?.[5]; const prefix = lastY !== undefined && y !== lastY ? "\n" : " ";
          lastY = y; return prefix + item.str;
        }).join("");
        pages.push(text); return text;
      } });
    } else pages.push(new TextDecoder().decode(raw));
    if (!pages.some(page => page.trim())) throw new Error("No readable text found. Use a text PDF or TXT document.");
    const deerFlowRequirements = await analyzeWithDeerFlow(initial.document.name, pages);
    // Rebase on current state after slow analysis, preserving production selection and human decisions.
    const { state, production, document } = await load();
    if (document.status !== "PROCESSING") return;
    const extracted = deerFlowRequirements ? ingestDeerFlowRequirements(production, document.name, deerFlowRequirements) : extractRequirements(production, document.name, pages);
    const recovered = deerFlowRequirements ? reconcileSourceRequirements(production, document.name, pages) : [];
    extracted.push(...recovered); invalidateChangedCheckpoints(production, extracted);
    Object.assign(document, { status: "PROCESSED", page_count: pages.length, analysis_engine: deerFlowRequirements ? "DEERFLOW" : "STRUCTURED_EXTRACTION_V1", source_review_candidates: recovered.length, processed_at: now() });
    delete document.processing_error;
    event(production, "DOCUMENT_PROCESSED", { document_id: job.documentId, requirements: extracted.length, analysis_engine: document.analysis_engine });
    await save(store, state);
  } catch (error) {
    const { state, production, document } = await load();
    if (document.status === "PROCESSING") {
      document.status = "FAILED"; document.processing_error = "Analysis failed. Retry analysis or upload a readable PDF/TXT.";
      event(production, "DOCUMENT_PROCESSING_FAILED", { document_id: job.documentId });
      await save(store, state);
    }
    console.error("Document processing failed", error instanceof Error ? error.name : "Unknown error");
  } finally { await store.delete(`document-job/${jobId}`); }
}

export default async (request: Request, context: Context) => {
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/\.netlify\/functions\/rigor-api/, "") || "/";
    if (path === "/api/health" && request.method === "GET") {
      const deerFlowUrl = Netlify.env.get("RIGOR_DEERFLOW_URL")?.trim();
      const deerFlowToken = Netlify.env.get("RIGOR_DEERFLOW_TOKEN")?.trim();
      return json({
        status: "ok",
        service: "rigor",
        version: "partner-demo-v1",
        deerflow: { configured: Boolean(deerFlowUrl && deerFlowToken) },
      });
    }
    if (path === "/api/start" && request.method === "POST") {
      const data = await body(request); const displayName = String(data.display_name ?? "").trim(); const role = String(data.role ?? "");
      if (displayName.length < 2 || displayName.length > 60) return fail("Enter a name between 2 and 60 characters");
      if (!["TM", "PM", "Video", "Audio", "Lighting", "Rigging", "Backline", "Partner / Investor", "Other"].includes(role)) return fail("Select a valid production role");
      const state = createWorkspace(displayName, role);
      if (data.sample_demo === true) loadSampleProduction(state); const token = randomBytes(36).toString("base64url"); const expiresAt = new Date(Date.now() + 45 * 86400000).toISOString(); const store = storeFor(context);
      await Promise.all([store.setJSON(`workspace/${state.tester.tester_id}`, state), store.setJSON(`session/${hash(token)}`, { testerId: state.tester.tester_id, expiresAt })]);
      return json(snapshot(state), 200, { "Set-Cookie": `${COOKIE}=${token}; Max-Age=3888000; Path=/; HttpOnly; Secure; SameSite=Lax` });
    }
    if (path === "/api/logout" && request.method === "POST") return json({ ok: true }, 200, { "Set-Cookie": `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax` });

    const auth = await authenticated(request, context); if (!auth) return fail("Start or resume your RIGOR session", 401);
    const { store, state } = auth;
    if (path === "/api/workspace" && request.method === "GET") { return json(snapshot(state)); }
    const documentReviewMatch = path.match(/^\/api\/documents\/([^/]+)\/review$/);
    if (documentReviewMatch && request.method === "POST") {
      const production = activeProduction(state);
      const document = production.documents.find((doc) => doc.document_id === documentReviewMatch[1]);
      if (!document) return fail("Document not found", 404);
      if (document.status !== "PROCESSED") return fail("Wait for document analysis to complete before source review");
      const data = await body(request);
      if (data.complete_source_review !== true) return fail("Confirm the complete source document has been reviewed");
      const candidates = production.requirements.filter((req) => req.document_name === document.name);
      if (candidates.some((req) => !["CONFIRMED", "REJECTED", "RESOLVED"].includes(req.status))) return fail("Review the document's requirement candidates first");
      document.review_status = "REVIEWED";
      document.reviewed_by = state.tester.display_name;
      document.reviewed_at = now();
      event(production, "SOURCE_REVIEW_COMPLETED", {document_id: document.document_id, reviewer: document.reviewed_by});
      await save(store, state);
      return json(snapshot(state));
    }

    if (path === "/api/productions" && request.method === "POST") {
      if (state.productions.length >= PRODUCTION_LIMIT) return fail(`RIGOR workspaces support up to ${PRODUCTION_LIMIT} productions`);
      const data = await body(request);
      const details = {
        show_name: String(data.show_name ?? "").trim(), artist: String(data.artist ?? "").trim(), venue: String(data.venue ?? "").trim(),
        city: String(data.city ?? "").trim(), show_date: String(data.show_date ?? "").trim(),
      };
      if (details.show_name.length < 2 || details.show_name.length > 100) return fail("Enter a production name between 2 and 100 characters");
      if (details.artist.length < 2 || details.artist.length > 100) return fail("Enter an artist or client name");
      if (details.venue.length < 2 || details.venue.length > 120) return fail("Enter a venue name");
      if (details.city.length < 2 || details.city.length > 100) return fail("Enter a city");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(details.show_date)) return fail("Choose a valid show date");
      const created = createProduction(state.workspace.workspace_id, details, state.productions.length + 1);
      state.productions.push(created); state.workspace.active_production_id = created.production.production_id;
      await save(store, state); return json(snapshot(state), 201);
    }

    let match = path.match(/^\/api\/productions\/([^/]+)\/select$/);
    if (match && request.method === "POST") {
      const selected = state.productions.find((item) => item.production.production_id === match![1]);
      if (!selected) return fail("Production not found", 404);
      state.workspace.active_production_id = selected.production.production_id;
      await save(store, state); return json(snapshot(state));
    }

    const production = activeProduction(state);

    match = path.match(/^\/api\/requirements\/([^/]+)$/);
    if (match && request.method === "PATCH") {
      const item = production.requirements.find((entry) => entry.requirement_id === match![1]); if (!item) return fail("Requirement not found", 404); const data = await body(request);
      if (data.status !== undefined) { if (!["EXTRACTED", "NEEDS_CONFIRMATION", "CONFIRMED", "REJECTED", "RESOLVED"].includes(data.status)) return fail("Invalid requirement status"); item.status = data.status; }
      if (data.department !== undefined) { if (!validateDepartment(data.department)) return fail("Invalid department"); item.department = data.department; }
      if (data.owner !== undefined) item.owner = String(data.owner).trim().slice(0, 80) || null;
      if (data.due_at !== undefined) item.due_at = String(data.due_at).slice(0, 40) || null;
      event(production, "REQUIREMENT_UPDATED", { requirement_id: item.requirement_id, status: item.status }); await save(store, state); return json(snapshot(state));
    }
    match = path.match(/^\/api\/conflicts\/([^/]+)\/resolve$/);
    if (match && request.method === "POST") {
      const item = production.conflicts.find((entry) => entry.conflict_id === match![1]); if (!item) return fail("Conflict not found", 404); const data = await body(request); const resolution = String(data.resolution ?? "").trim(); const owner = String(data.owner ?? "").trim();
      if (resolution.length < 8) return fail("Resolution must explain the operational decision"); if (owner.length < 2) return fail("Enter a decision owner");
      Object.assign(item, { status: "RESOLVED", resolution: resolution.slice(0, 600), owner: owner.slice(0, 80), resolved_at: now() }); event(production, "CONFLICT_RESOLVED", { conflict_id: item.conflict_id }); await save(store, state); return json(snapshot(state));
    }
    match = path.match(/^\/api\/checkpoints\/([^/]+)$/);
    if (match && request.method === "PATCH") {
      const item = production.checkpoints.find((entry) => entry.checkpoint_id === match![1]); if (!item) return fail("Checkpoint not found", 404); const data = await body(request); item.status = data.complete ? "COMPLETE" : "PENDING"; item.completed_at = data.complete ? now() : null; event(production, "CHECKPOINT_UPDATED", { checkpoint_id: item.checkpoint_id, complete: Boolean(data.complete) }); await save(store, state); return json(snapshot(state));
    }
    if (path === "/api/incidents" && request.method === "POST") {
      const data = await body(request);
      if (!validateDepartment(data.department)) return fail("Invalid department");
      if (!["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(data.severity)) return fail("Invalid severity");
      const summary = String(data.summary ?? "").trim();
      if (summary.length < 5) return fail("Describe what changed");
      const resolution = String(data.resolution ?? "").trim().slice(0, 800) || null;
      const createdAt = now();
      production.incidents.unshift({
        incident_id: newId("incident"),
        production_id: production.production.production_id,
        workspace_id: state.workspace.workspace_id,
        department: data.department,
        summary: summary.slice(0, 500),
        severity: data.severity,
        resolution,
        created_at: createdAt,
        resolved_at: resolution ? createdAt : null,
      });
      event(production, "INCIDENT_LOGGED", { department: data.department, severity: data.severity, resolved: Boolean(resolution) });
      await save(store, state);
      return json(snapshot(state));
    }
    match = path.match(/^\/api\/incidents\/([^/]+)$/);
    if (match && request.method === "PATCH") {
      const item = production.incidents.find((entry) => entry.incident_id === match![1]);
      if (!item) return fail("Incident not found", 404);
      const data = await body(request);
      const resolution = String(data.resolution ?? "").trim();
      if (resolution.length < 5) return fail("Resolution must explain how the incident was closed");
      item.resolution = resolution.slice(0, 800);
      item.resolved_at = now();
      event(production, "INCIDENT_RESOLVED", { incident_id: item.incident_id, department: item.department, severity: item.severity });
      await save(store, state);
      return json(snapshot(state));
    }
    if (path === "/api/feedback" && request.method === "POST") {
      const data = await body(request); if (![1, 2, 3].includes(Number(data.session_number)) || Number(data.useful_score) < 1 || Number(data.useful_score) > 5 || Number(data.trust_score) < 1 || Number(data.trust_score) > 5) return fail("Invalid feedback values");
      production.feedback.push({ feedback_id: newId("feedback"), production_id: production.production.production_id, workspace_id: state.workspace.workspace_id, session_number: Number(data.session_number), useful_score: Number(data.useful_score), trust_score: Number(data.trust_score), comments: String(data.comments ?? "").trim().slice(0, 2000), created_at: now() }); await save(store, state); return json({ ok: true });
    }
    if (path === "/api/documents" && request.method === "POST") {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return fail("Choose a PDF or TXT document");
      if (!file.size) return fail("The document is empty");
      if (file.size > MAX_UPLOAD) return fail("Document exceeds the 5 MB upload limit");
      const safeName = file.name.replace(/[^A-Za-z0-9._ -]/g, "_").trim().slice(0, 120) || "uploaded-document";
      if (!/\.(pdf|txt)$/i.test(safeName)) return fail("Upload a PDF or TXT document");
      const documentId = newId("doc");
      await store.set(`upload/${state.workspace.workspace_id}/${production.production.production_id}/${documentId}`, await file.arrayBuffer());
      production.documents.push({ document_id: documentId, production_id: production.production.production_id,
        workspace_id: state.workspace.workspace_id, name: safeName, doc_type: "UPLOADED", status: "PROCESSING",
        review_status: "PENDING", page_count: 0, source_kind: "TESTER", created_at: now(), processing_started_at: now() });
      event(production, "DOCUMENT_SAVED", { document_id: documentId });
      await save(store, state);
      await queueUpload(request, context, state, production, documentId);
      return json({ result: { document_id: documentId, name: safeName, status: "PROCESSING" }, workspace: snapshot(state) }, 202);
    }
    const retryMatch = path.match(/^\/api\/documents\/([^/]+)\/retry$/);
    if (retryMatch && request.method === "POST") {
      const document = production.documents.find(doc => doc.document_id === retryMatch[1]);
      if (!document) return fail("Document not found", 404);
      if (document.status === "PROCESSED") return fail("Document is already processed");
      if (document.status === "PROCESSING" && Date.now() - Date.parse(document.processing_started_at) < 16 * 60 * 1000) return fail("Analysis is still running");
      document.status = "PROCESSING"; document.processing_started_at = now(); delete document.processing_error;
      await save(store, state);
      await queueUpload(request, context, state, production, document.document_id);
      return json(snapshot(state), 202);
    }
    if (path === "/api/reports/advance.pdf" && request.method === "GET") {
      const department = url.searchParams.get("department"); if (department && !(DEPARTMENTS as readonly string[]).includes(department)) return fail("Invalid department"); const bytes = await reportPdf(production, department); const pdfBody = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer; const filename = `RIGOR-${production.show.show_name}-${department || "Master"}-Advance-Report.pdf`.replace(/[^A-Za-z0-9.-]+/g, "-"); return new Response(pdfBody, { headers: { ...commonHeaders("application/pdf"), "Content-Disposition": `attachment; filename=\"${filename}\"` } });
    }
    return fail("Not found", 404);
  } catch (error) { console.error(error); return fail(error instanceof Error ? error.message : "Unexpected server error", 500); }
};

export const config: Config = {
  path: ["/api/health", "/api/start", "/api/logout", "/api/workspace", "/api/productions", "/api/productions/:id/select", "/api/requirements/:id", "/api/conflicts/:id/resolve", "/api/checkpoints/:id", "/api/incidents", "/api/incidents/:id", "/api/feedback", "/api/documents", "/api/documents/:id/review", "/api/documents/:id/retry", "/api/reports/advance.pdf"],
};
