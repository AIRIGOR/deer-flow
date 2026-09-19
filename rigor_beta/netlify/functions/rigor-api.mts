import { createHash, randomBytes } from "node:crypto";
import { getStore } from "@netlify/blobs";
import type { Context, Config } from "@netlify/functions";
import pdfParse from "pdf-parse";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { DEPARTMENTS } from "./_shared/seed.js";
import { PRODUCTION_LIMIT, activeProduction, createProduction, createWorkspace, extractRequirements, newId, normalizeWorkspace, now, readiness, rebuildConflicts, snapshot, validateDepartment, type ProductionState, type WorkspaceState } from "./_shared/model.js";

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
  const requirements = department ? state.requirements.filter((item) => item.department === department) : state.requirements;
  const conflicts = department ? state.conflicts.filter((item) => item.department === department) : state.conflicts;
  const pdf = await PDFDocument.create(); const regular = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([612, 792]); let y = 748;
  const draw = (text: string, size = 9, isBold = false, color = rgb(0.11, 0.16, 0.2)) => {
    for (const line of wrap(text, size >= 16 ? 60 : 100)) { if (y < 48) { page = pdf.addPage([612, 792]); y = 748; } page.drawText(line, { x: 42, y, size, font: isBold ? bold : regular, color }); y -= size + 5; }
  };
  draw("RIGOR", 22, true, rgb(0.05, 0.45, 0.32)); draw(department ? `${department} Department Advance Report` : "Master Advance Report", 15, true); draw(`${state.show.show_name} · ${state.show.venue} · ${state.show.show_date}`, 10); y -= 8;
  const score = readiness(state, requirements, conflicts); draw(`Readiness: ${score.status.replaceAll("_", " ")} · ${score.score}%`, 13, true); y -= 8;
  draw("Requirements", 12, true);
  for (const item of requirements) { draw(`${item.department} · ${item.title}`, 9, true); draw(`${item.status.replaceAll("_", " ")} · Owner: ${item.owner || "—"} · Source: ${item.document_name}, p${item.page_number || "—"}`, 8); y -= 4; }
  y -= 6; draw("Conflicts", 12, true);
  if (!conflicts.length) draw("No conflicts in this report scope.", 9);
  for (const item of conflicts) { draw(`${item.department} · ${item.title} · ${item.status}`, 9, true); draw(item.status === "RESOLVED" ? `Decision: ${item.resolution} · Owner: ${item.owner}` : `${item.left_value} vs ${item.right_value}`, 8); y -= 4; }
  y -= 8; draw(`Generated ${now()} · Source evidence preserved by RIGOR`, 8, false, rgb(0.35, 0.42, 0.46));
  return pdf.save();
}

export default async (request: Request, context: Context) => {
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/\.netlify\/functions\/rigor-api/, "") || "/";
    if (path === "/api/health" && request.method === "GET") return json({ status: "ok", service: "rigor-netlify-beta" });
    if (path === "/api/start" && request.method === "POST") {
      const data = await body(request); const displayName = String(data.display_name ?? "").trim(); const role = String(data.role ?? "");
      if (displayName.length < 2 || displayName.length > 60) return fail("Enter a name between 2 and 60 characters");
      if (!["TM", "PM", "Video", "Audio", "Lighting", "Rigging", "Backline", "Other"].includes(role)) return fail("Select a valid production role");
      const state = createWorkspace(displayName, role); const token = randomBytes(36).toString("base64url"); const expiresAt = new Date(Date.now() + 45 * 86400000).toISOString(); const store = storeFor(context);
      await Promise.all([store.setJSON(`workspace/${state.tester.tester_id}`, state), store.setJSON(`session/${hash(token)}`, { testerId: state.tester.tester_id, expiresAt })]);
      return json(snapshot(state), 200, { "Set-Cookie": `${COOKIE}=${token}; Max-Age=3888000; Path=/; HttpOnly; Secure; SameSite=Lax` });
    }
    if (path === "/api/logout" && request.method === "POST") return json({ ok: true }, 200, { "Set-Cookie": `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax` });

    const auth = await authenticated(request, context); if (!auth) return fail("Start or resume your RIGOR beta session", 401);
    const { store, state } = auth;
    if (path === "/api/workspace" && request.method === "GET") { await save(store, state); return json(snapshot(state)); }

    if (path === "/api/productions" && request.method === "POST") {
      if (state.productions.length >= PRODUCTION_LIMIT) return fail(`Demo workspaces support up to ${PRODUCTION_LIMIT} productions`);
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
      const data = await body(request); if (!validateDepartment(data.department)) return fail("Invalid department"); if (!["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(data.severity)) return fail("Invalid severity"); const summary = String(data.summary ?? "").trim(); if (summary.length < 5) return fail("Describe what changed");
      production.incidents.unshift({ incident_id: newId("incident"), production_id: production.production.production_id, workspace_id: state.workspace.workspace_id, department: data.department, summary: summary.slice(0, 500), severity: data.severity, resolution: String(data.resolution ?? "").trim().slice(0, 800) || null, created_at: now() }); event(production, "INCIDENT_LOGGED", { department: data.department, severity: data.severity }); await save(store, state); return json(snapshot(state));
    }
    if (path === "/api/feedback" && request.method === "POST") {
      const data = await body(request); if (![1, 2, 3].includes(Number(data.session_number)) || Number(data.useful_score) < 1 || Number(data.useful_score) > 5 || Number(data.trust_score) < 1 || Number(data.trust_score) > 5) return fail("Invalid feedback values");
      production.feedback.push({ feedback_id: newId("feedback"), production_id: production.production.production_id, workspace_id: state.workspace.workspace_id, session_number: Number(data.session_number), useful_score: Number(data.useful_score), trust_score: Number(data.trust_score), comments: String(data.comments ?? "").trim().slice(0, 2000), created_at: now() }); await save(store, state); return json({ ok: true });
    }
    if (path === "/api/documents" && request.method === "POST") {
      const form = await request.formData(); const file = form.get("file"); if (!(file instanceof File)) return fail("Choose a PDF or TXT document"); if (file.size > MAX_UPLOAD) return fail("Document exceeds the 5 MB beta limit");
      const safeName = file.name.replace(/[^A-Za-z0-9._ -]/g, "_").trim().slice(0, 120) || "uploaded-document"; const fileBuffer = await file.arrayBuffer(); const bytes = new Uint8Array(fileBuffer); let pages: string[];
      if (safeName.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") { const parsed = await pdfParse(Buffer.from(bytes)); pages = parsed.text.split(/\f/).filter(Boolean); if (!pages.length) pages = [parsed.text]; }
      else if (safeName.toLowerCase().endsWith(".txt") || file.type === "text/plain") pages = [new TextDecoder().decode(bytes)]; else return fail("Upload a PDF or TXT document");
      const documentId = newId("doc");
      await store.set(`upload/${state.workspace.workspace_id}/${production.production.production_id}/${documentId}`, fileBuffer);
      const deerFlowRequirements = await analyzeWithDeerFlow(safeName, pages);
      const analysisEngine = deerFlowRequirements ? "DEERFLOW" : "STRUCTURED_EXTRACTION_V1";
      production.documents.push({
        document_id: documentId,
        production_id: production.production.production_id,
        workspace_id: state.workspace.workspace_id,
        name: safeName,
        doc_type: "UPLOADED",
        status: "PROCESSED",
        page_count: pages.length,
        source_kind: "TESTER",
        analysis_engine: analysisEngine,
        created_at: now(),
      });
      const extracted = deerFlowRequirements
        ? ingestDeerFlowRequirements(production, safeName, deerFlowRequirements)
        : extractRequirements(production, safeName, pages);
      event(production, "DOCUMENT_PROCESSED", { document_id: documentId, requirements: extracted.length, analysis_engine: analysisEngine });
      await save(store, state);
      return json({
        result: {
          document_id: documentId,
          name: safeName,
          page_count: pages.length,
          requirements_added: extracted.length,
          conflicts_detected: production.conflicts.filter((item) => item.status !== "RESOLVED").length,
          analysis_engine: analysisEngine,
        },
        workspace: snapshot(state),
      });
    }
    if (path === "/api/reports/advance.pdf" && request.method === "GET") {
      const department = url.searchParams.get("department"); if (department && !(DEPARTMENTS as readonly string[]).includes(department)) return fail("Invalid department"); const bytes = await reportPdf(production, department); const pdfBody = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer; const filename = `RIGOR-${production.show.show_name}-${department || "Master"}-Advance-Report.pdf`.replace(/[^A-Za-z0-9.-]+/g, "-"); return new Response(pdfBody, { headers: { ...commonHeaders("application/pdf"), "Content-Disposition": `attachment; filename=\"${filename}\"` } });
    }
    return fail("Not found", 404);
  } catch (error) { console.error(error); return fail(error instanceof Error ? error.message : "Unexpected server error", 500); }
};

export const config: Config = {
  path: ["/api/health", "/api/start", "/api/logout", "/api/workspace", "/api/productions", "/api/productions/:id/select", "/api/requirements/:id", "/api/conflicts/:id/resolve", "/api/checkpoints/:id", "/api/incidents", "/api/feedback", "/api/documents", "/api/reports/advance.pdf"],
};
