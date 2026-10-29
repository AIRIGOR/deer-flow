import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { Context } from "@netlify/functions";
import { activeProduction, createProduction, createWorkspace, progress, readiness } from "./model.js";
const { records, pdf } = vi.hoisted(() => ({ records: new Map<string, any>(), pdf: vi.fn() }));
vi.mock("@netlify/blobs", () => ({ getStore: () => ({
  get: async (key: string) => records.has(key) ? structuredClone(records.get(key)) : null,
  set: async (key: string, value: any) => { records.set(key, structuredClone(value)); },
  setJSON: async (key: string, value: any) => { records.set(key, structuredClone(value)); },
  delete: async (key: string) => { records.delete(key); },
}), getDeployStore: () => ({
  get: async (key: string) => records.has(key) ? structuredClone(records.get(key)) : null,
  setJSON: async (key: string, value: any) => { records.set(key, structuredClone(value)); },
}) }));
vi.mock("./pdf-text.js", () => ({ readPdfPages: pdf }));
import handler, { processUpload, processJohnJob } from "../rigor-api.mjs";
let waits: Promise<unknown>[];
let ctx: Context;
let workspace: ReturnType<typeof createWorkspace>;
let fetchMock: ReturnType<typeof vi.fn>;
const request = (path: string, body?: BodyInit) => new Request(`https://rigor.test${path}`, { method: body ? "POST" : "GET", headers: { cookie: "rigor_beta_session=test-session" }, body });
async function upload(name = "source.txt", contents = "Lighting requires 400 amps of power.") {
  const form = new FormData(); form.append("file", new File([contents], name));
  return handler(request("/api/documents", form), ctx);
}
async function worker() {
  const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
  return processUpload(new Request("https://rigor.test/worker", { method: "POST", body: JSON.stringify(payload) }), ctx);
}
const saved = () => records.get(`workspace/${workspace.tester.tester_id}`);
const patchRequest = (path: string, data: Record<string, unknown>) => new Request(`https://rigor.test${path}`, {
  method: "PATCH", headers: { cookie: "rigor_beta_session=test-session", "content-type": "application/json" }, body: JSON.stringify(data),
});
function impactFixture() {
  const latest = saved();
  const production = activeProduction(latest);
  production.production.conflict_rules_version = "session05-handshake-v1";
  production.documents.push({ document_id: "impact-doc", name: "impact.txt", status: "PROCESSED", doc_type: "UPLOADED", analysis_engine: "DEERFLOW", review_status: "REVIEWED", source_kind: "TESTER" });
  production.requirements.push({ requirement_id: "impact-req", document_name: "impact.txt", title: "Synthetic impact requirement", detail: "Synthetic operational requirement.", department: "Rigging", affected_departments: ["Rigging", "Video"], category: "PRODUCTION_GENERAL", status: "CONFIRMED", owner: "Original Lead", due_at: "2026-11-01" });
  production.checkpoints.forEach(item => { item.status = "COMPLETE"; item.completed_at = "2026-10-28"; });
  const other = createProduction(latest.workspace.workspace_id);
  other.production.conflict_rules_version = "session05-handshake-v1";
  other.checkpoints.forEach(item => { item.status = "COMPLETE"; });
  latest.productions.push(other);
  records.set(`workspace/${workspace.tester.tester_id}`, latest);
  return { production, other };
}
beforeEach(() => {
  records.clear(); waits = []; pdf.mockReset();
  workspace = createWorkspace("Upload Tester", "PM");
  records.set(`workspace/${workspace.tester.tester_id}`, structuredClone(workspace));
  records.set(`session/${createHash("sha256").update("test-session").digest("hex")}`, { testerId: workspace.tester.tester_id, expiresAt: "2099-01-01" });
  ctx = { deploy: { context: "production" }, waitUntil: (p: Promise<unknown>) => waits.push(p) } as unknown as Context;
  vi.stubGlobal("Netlify", { env: { get: (name: string) => name === "RIGOR_JOHN_STAGING_ENABLED" ? "true" : name === "RIGOR_DEERFLOW_URL" ? "https://gateway.test" : "test-token" } });
  fetchMock = vi.fn().mockImplementation(async (url: string) => String(url).includes("gateway.test") ? Response.json({ requirements: [{ department: "Lighting", category: "POWER_CAPACITY", requirement_text: "Lighting requires 400 amps of power.", source_excerpt: "Lighting requires 400 amps of power.", source_page: 1, confidence: .95 }] }) : new Response(null, { status: 202 })); vi.stubGlobal("fetch", fetchMock);
});
describe("durable document upload", () => {
  it.each([
    { owner: "Replacement Lead" }, { due_at: "2026-11-02" },
    { status: "NEEDS_CONFIRMATION" }, { department: "Lighting" },
  ])("traces requirement changes and revokes only affected department approvals: %j", async change => {
    const { other } = impactFixture();
    const response = await handler(patchRequest("/api/requirements/impact-req", change), ctx);
    expect(response.status).toBe(200);
    const production = activeProduction(saved());
    for (const department of ["Rigging", "Video", ...(change.department ? ["Lighting"] : [])]) {
      expect(production.checkpoints.find(item => item.department === department)).toMatchObject({ status: "PENDING", completed_at: null });
    }
    expect(production.checkpoints.find(item => item.department === "Audio")?.status).toBe("COMPLETE");
    expect(saved().productions.find((item: any) => item.production.production_id === other.production.production_id).checkpoints).toEqual(other.checkpoints);
    const trace = production.events.find(item => item.type === "CHANGE_IMPACT_RECORDED")?.payload;
    expect(trace).toMatchObject({ entity_type: "REQUIREMENT", entity_id: "impact-req", requirement_ids: ["impact-req"], readiness_before: "SHOW_READY", actor: "Upload Tester" });
    expect(trace?.changed_fields).toEqual(Object.keys(change));
    expect(trace?.affected_departments).toEqual(expect.arrayContaining(["Rigging", "Video"]));
    expect(trace?.invalidated_checkpoint_ids.length).toBe(change.department ? 3 : 2);
    expect(trace?.readiness_after).toBe(change.status ? "NEEDS_REVIEW" : "ADVANCE_READY");
    expect(production.documents[0].review_status).toBe("REVIEWED");
  });

  it("preserves approvals and omits impact records for a no-op requirement update", async () => {
    impactFixture();
    await handler(patchRequest("/api/requirements/impact-req", { owner: "Original Lead" }), ctx);
    const production = activeProduction(saved());
    expect(production.checkpoints.every(item => item.status === "COMPLETE")).toBe(true);
    expect(production.events.filter(item => item.type === "CHANGE_IMPACT_RECORDED")).toHaveLength(0);
    expect(readiness(production).status).toBe("SHOW_READY");
  });

  it("rebuilds conflict comparisons after a department reassignment", async () => {
    impactFixture();
    const latest = saved();
    const production = activeProduction(latest);
    Object.assign(production.requirements[0], { category: "RESOURCE_CAPACITY", normalized_value: "400A" });
    production.requirements.push({ ...structuredClone(production.requirements[0]), requirement_id: "lighting-resource", department: "Lighting", affected_departments: ["Lighting"], normalized_value: "200A" });
    records.set(`workspace/${workspace.tester.tester_id}`, latest);
    await handler(patchRequest("/api/requirements/impact-req", { department: "Lighting" }), ctx);
    const after = activeProduction(saved());
    expect(after.conflicts).toHaveLength(1);
    expect(readiness(after).status).toBe("BLOCKED");
    expect(after.events.find(item => item.type === "CHANGE_IMPACT_RECORDED")!.payload.readiness_after).toBe("BLOCKED");
  });

  it("traces amended conflict resolutions without reusing affected checkpoint approvals", async () => {
    impactFixture();
    const latest = saved();
    activeProduction(latest).conflicts.push({ conflict_id: "impact-conflict", department: "Rigging", affected_departments: ["Rigging", "Video"], status: "RESOLVED", resolution: "Original human resolution.", owner: "Original Lead", left_requirement_id: "impact-req", right_requirement_id: "other-req" });
    records.set(`workspace/${workspace.tester.tester_id}`, latest);
    expect((await handler(request("/api/conflicts/impact-conflict/resolve", JSON.stringify({ resolution: "Revised human operational resolution.", owner: "Replacement Lead" })), ctx)).status).toBe(200);
    const production = activeProduction(saved());
    expect(production.checkpoints.find(item => item.department === "Video")?.status).toBe("PENDING");
    expect(production.events.some(item => item.type === "CHANGE_IMPACT_RECORDED" && item.payload.entity_type === "CONFLICT")).toBe(true);
    expect(readiness(production).status).toBe("ADVANCE_READY");
  });

  it("requires fresh checkpoint signoff after a resolved field change and traces human reapproval", async () => {
    impactFixture();
    expect((await handler(request("/api/incidents", JSON.stringify({ department: "Video", severity: "LOW", summary: "Synthetic replacement screen installed", resolution: "Replacement tested by human lead" })), ctx)).status).toBe(200);
    const production = activeProduction(saved());
    const checkpoint = production.checkpoints.find(item => item.department === "Video")!;
    expect(checkpoint.status).toBe("PENDING");
    expect(readiness(production).status).toBe("ADVANCE_READY");
    const invalidated = production.events.find(item => item.type === "CHANGE_IMPACT_RECORDED")!.payload.invalidated_checkpoint_ids;
    for (const checkpointId of invalidated) await handler(patchRequest(`/api/checkpoints/${checkpointId}`, { complete: true }), ctx);
    const after = activeProduction(saved());
    expect(readiness(after).status).toBe("SHOW_READY");
    expect(after.events.filter(item => item.type === "CHANGE_IMPACT_RECORDED").map(item => item.payload.entity_type)).toEqual(["INCIDENT", ...invalidated.map(() => "CHECKPOINT")]);
    expect(after.events.filter(item => item.type === "CHANGE_IMPACT_RECORDED" && item.payload.entity_type === "CHECKPOINT").every(item => item.payload.requirement_ids.includes("impact-req"))).toBe(true);
    const completedAt = after.checkpoints.find(item => item.checkpoint_id === checkpoint.checkpoint_id)!.completed_at;
    const changeCount = after.events.filter(item => item.type === "CHANGE_IMPACT_RECORDED").length;
    await handler(patchRequest(`/api/checkpoints/${checkpoint.checkpoint_id}`, { complete: true }), ctx);
    expect(activeProduction(saved()).checkpoints.find(item => item.checkpoint_id === checkpoint.checkpoint_id)!.completed_at).toBe(completedAt);
    expect(activeProduction(saved()).events.filter(item => item.type === "CHANGE_IMPACT_RECORDED")).toHaveLength(changeCount);
  });

  it("rejects non-boolean checkpoint approval without changing persisted state", async () => {
    impactFixture();
    const before = structuredClone(saved());
    const checkpoint = activeProduction(before).checkpoints[0];
    expect((await handler(patchRequest(`/api/checkpoints/${checkpoint.checkpoint_id}`, { complete: "false" }), ctx)).status).toBe(422);
    expect(saved()).toEqual(before);
  });

  it("revokes interim signoffs again when a blocking incident is closed", async () => {
    impactFixture();
    await handler(request("/api/incidents", JSON.stringify({ department: "Video", severity: "HIGH", summary: "Synthetic screen failure" })), ctx);
    const latest = saved();
    const production = activeProduction(latest);
    production.checkpoints.forEach(item => { item.status = "COMPLETE"; });
    records.set(`workspace/${workspace.tester.tester_id}`, latest);
    expect(readiness(production).status).toBe("BLOCKED");
    const id = production.incidents[0].incident_id;
    await handler(patchRequest(`/api/incidents/${id}`, { resolution: "Replacement screen tested by human lead" }), ctx);
    const after = activeProduction(saved());
    expect(after.checkpoints.find(item => item.department === "Video")?.status).toBe("PENDING");
    expect(after.checkpoints.find(item => item.department === "Rigging")?.status).toBe("PENDING");
    const trace = after.events.filter(item => item.type === "CHANGE_IMPACT_RECORDED").at(-1)!.payload;
    expect(trace).toMatchObject({ entity_id: id, readiness_before: "BLOCKED", readiness_after: "ADVANCE_READY", requirement_ids: ["impact-req"] });
  });

  it("traces explicit human source review without revoking unchanged checkpoint approvals", async () => {
    impactFixture();
    const latest = saved();
    activeProduction(latest).documents[0].review_status = "PENDING";
    records.set(`workspace/${workspace.tester.tester_id}`, latest);
    expect((await handler(request("/api/documents/impact-doc/review", JSON.stringify({ complete_source_review: true })), ctx)).status).toBe(200);
    const production = activeProduction(saved());
    const trace = production.events.find(item => item.type === "CHANGE_IMPACT_RECORDED")!.payload;
    expect(trace).toMatchObject({ entity_type: "SOURCE_REVIEW", readiness_before: "NEEDS_REVIEW", readiness_after: "SHOW_READY", invalidated_checkpoint_ids: [], actor: "Upload Tester" });
    expect(production.checkpoints.every(item => item.status === "COMPLETE")).toBe(true);
  });

  it("does not revoke approvals or replace the timestamp when a conflict decision is unchanged", async () => {
    impactFixture();
    const latest = saved();
    activeProduction(latest).conflicts.push({ conflict_id: "same-conflict", department: "Rigging", status: "RESOLVED", resolution: "Original human resolution.", owner: "Original Lead", resolved_at: "2026-10-28T10:00:00Z" });
    records.set(`workspace/${workspace.tester.tester_id}`, latest);
    await handler(request("/api/conflicts/same-conflict/resolve", JSON.stringify({ resolution: "Original human resolution.", owner: "Original Lead" })), ctx);
    const production = activeProduction(saved());
    expect(production.checkpoints.every(item => item.status === "COMPLETE")).toBe(true);
    expect(production.conflicts[0].resolved_at).toBe("2026-10-28T10:00:00Z");
    expect(production.events.filter(item => item.type === "CHANGE_IMPACT_RECORDED")).toHaveLength(0);
  });

  it("includes a cross-department change trace in affected reports and excludes unrelated scope", async () => {
    impactFixture();
    await handler(patchRequest("/api/requirements/impact-req", { owner: "Replacement Lead" }), ctx);
    const actualParser = await vi.importActual<typeof import("./pdf-text.js")>("./pdf-text.js");
    for (const department of ["", "Rigging", "Video", "Audio"]) {
      const response = await handler(request(`/api/reports/advance.pdf${department ? `?department=${department}` : ""}`), ctx);
      expect(response.status).toBe(200);
      const text = (await actualParser.readPdfPages(await response.arrayBuffer())).join(" ").replace(/\s+/g, " ");
      if (department === "Audio") expect(text).not.toContain("impact-req");
      else {
        expect(text).toContain("impact-req");
        expect(text).toContain("SHOW_READY -> ADVANCE_READY");
        expect(text).toContain("Replacement Lead");
      }
    }
  });
  it("shows a missing source dependency as a blocker in master and department PDF reports", async () => {
    await upload(); await Promise.all(waits); await worker();
    const latest = saved();
    const production = activeProduction(latest);
    production.documents = [];
    production.requirements.forEach(item => { item.status = "CONFIRMED"; item.owner = "Lighting Lead"; });
    production.checkpoints.forEach(item => { item.status = "COMPLETE"; });
    records.set(`workspace/${workspace.tester.tester_id}`, latest);
    const actualParser = await vi.importActual<typeof import("./pdf-text.js")>("./pdf-text.js");
    for (const path of ["/api/reports/advance.pdf", "/api/reports/advance.pdf?department=Lighting"]) {
      const response = await handler(request(path), ctx);
      expect(response.status).toBe(200);
      const text = (await actualParser.readPdfPages(await response.arrayBuffer())).join(" ").replace(/\s+/g, " ");
      expect(text).toContain("BLOCKED");
      expect(text).toContain("MISSING SOURCE DEPENDENCY");
      expect(text).toContain("source.txt");
      expect(text).not.toContain("No open items in this report scope.");
    }
  });
  it.each([undefined, "false", "TRUE"])("keeps the isolated John fixture disabled with flag %s", async (flag) => {
    ctx = { ...ctx, site: { id: "96331e39-86a9-45a3-910c-edd321d60bb7" } } as Context;
    vi.stubGlobal("Netlify", { env: { get: () => flag } });
    expect((await handler(request("/api/agents/john/fixture", "{}"), ctx)).status).toBe(403);
  });
  it("authorizes John's fixture on the explicitly enabled isolated staging site even in production deploy context", async () => {
    ctx = { ...ctx, site: { id: "96331e39-86a9-45a3-910c-edd321d60bb7" } } as Context;
    vi.stubGlobal("Netlify", { env: { get: (key: string) => key === "RIGOR_JOHN_STAGING_ENABLED" ? "true" : undefined } });
    expect((await handler(request("/api/agents/john/fixture", "{}"), ctx)).status).toBe(200);
  });

  it.each(["017e4a4d-7db9-4e61-88fd-56dd2b2be844", "unknown-site", ""])("denies John's fixture on unapproved site %s even with the flag and a preview context", async (id) => {
    ctx = { ...ctx, site: { id }, deploy: { context: "deploy-preview" } } as Context;
    vi.stubGlobal("Netlify", { env: { get: () => "true" } });
    expect((await handler(request("/api/agents/john/fixture", "{}"), ctx)).status).toBe(403);
    expect(saved().productions[0].documents).toHaveLength(0);
  });
  it("accepts a faithful model citation with normalized source whitespace", async () => {
    const response = await upload("wrapped-source.txt", "Lighting requires\n400 amps of power.");
    expect(response.status).toBe(202);
    await worker();
    const production = activeProduction(saved());
    expect(production.documents[0].status).toBe("PROCESSED");
    expect(production.requirements.some(item => item.analysis_engine === "DEERFLOW")).toBe(true);
  });

  it("runs the fictional tour through the durable John lifecycle", async () => {
    ctx = { ...ctx, site: { id: "96331e39-86a9-45a3-910c-edd321d60bb7" },
      deploy: { context: "deploy-preview" } } as Context;
    expect((await handler(request("/api/agents/john/fixture", "{}"), ctx)).status).toBe(200);
    const before = structuredClone(saved());
    const sourceId = activeProduction(before).requirements[0].requirement_id;

    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("gateway.test")
        ? Response.json({
            agent: "John", mode: "MODEL_ADVISORY_ONLY",
            release_decision: "HOLD_SHOW", autonomous_show_approval: false,
            actions: [{ priority: "P0", department: "Power",
              question: "Resolve the conflicting venue power capacities.",
              evidence_ids: [sourceId] }]
          })
        : new Response(null, { status: 202 }));

    const started = await handler(request("/api/agents/john/analyze", "{}"), ctx);
    expect(started.status).toBe(202);
    const { jobId } = await started.json();
    expect(jobId).toMatch(/^[a-f0-9]{64}$/);

    const pending = await handler(request(`/api/agents/john/jobs/${jobId}`), ctx);
    expect(pending.status).toBe(202);

    await processJohnJob(
      new Request("https://rigor.test/worker", {
        method: "POST", body: JSON.stringify({ jobId })
      }), ctx
    );

    const completed = await handler(request(`/api/agents/john/jobs/${jobId}`), ctx);
    expect(completed.status).toBe(200);
    const { result } = await completed.json();
    expect(result.readiness.status).toBe("BLOCKED");
    expect(result.release_decision).toBe("HOLD_SHOW");
    expect(result.autonomous_show_approval).toBe(false);
    expect(result.actions[0].evidence_ids).toContain(sourceId);
    expect(result.deterministic_actions.some((x: any) => x.type === "CONFLICT")).toBe(true);
    expect(saved()).toEqual(before);

    const callsBeforeRetry = fetchMock.mock.calls.filter(
      ([url]) => String(url).includes("gateway.test")).length;
    await processJohnJob(
      new Request("https://rigor.test/worker", {
        method: "POST", body: JSON.stringify({ jobId })
      }), ctx
    );
    const callsAfterRetry = fetchMock.mock.calls.filter(
      ([url]) => String(url).includes("gateway.test")).length;
    expect(callsAfterRetry).toBe(callsBeforeRetry);
  });
  it("loads John's 14-source rehearsal only into an empty staging production", async () => {
    ctx = { ...ctx, site: { id: "96331e39-86a9-45a3-910c-edd321d60bb7" }, deploy: { context: "deploy-preview" } } as Context;
    const response = await handler(request("/api/agents/john/fixture", "{}"), ctx);
    expect(response.status).toBe(200);
    const fixture = await response.json();
    expect(fixture.show.show_name).toContain("Celestial Circuit");
    expect(fixture.documents).toHaveLength(14);
    expect(fixture.requirements.length).toBeGreaterThanOrEqual(12);
    expect(fixture.readiness.status).toBe("BLOCKED");
    expect(fixture.readiness.open_conflicts).toBeGreaterThanOrEqual(2);
    expect(fixture.documents.every((doc: any) => doc.source_kind === "SAMPLE")).toBe(true);
    const repeat = await handler(request("/api/agents/john/fixture", "{}"), ctx);
    expect(repeat.status).toBe(409);
    expect(saved().productions).toHaveLength(1);
  });

  it("blocks John fixture on production and before authentication", async () => {
    const production = await handler(request("/api/agents/john/fixture", "{}"), ctx);
    expect(production.status).toBe(403);
    const anonymous = await handler(new Request("https://rigor.test/api/agents/john/fixture", { method: "POST", body: "{}" }), ctx);
    expect(anonymous.status).toBe(401);
  });


  it("runs a synthetic John job without changing production readiness", async () => {
    const sample = saved();
    const { loadSampleProduction } = await import("./model.js");
    loadSampleProduction(activeProduction(sample));
    records.set(`workspace/${workspace.tester.tester_id}`, sample);
    const before = structuredClone(saved());
    ctx = { ...ctx, site: { id: "96331e39-86a9-45a3-910c-edd321d60bb7" },
      deploy: { context: "deploy-preview" } } as Context;

    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("gateway.test")
        ? Response.json({
            agent: "John", mode: "MODEL_ADVISORY_ONLY",
            release_decision: "HOLD_SHOW", autonomous_show_approval: false,
            actions: [{ priority: "P0", department: "Power",
              question: "Verify venue show power before load in.",
              evidence_ids: [activeProduction(sample).requirements[0].requirement_id] }]
          })
        : new Response(null, { status: 202 }));

    const started = await handler(request("/api/agents/john/analyze", "{}"), ctx);
    expect(started.status).toBe(202);
    const { jobId } = await started.json();

    await processJohnJob(
      new Request("https://rigor.test/worker", {
        method: "POST", body: JSON.stringify({ jobId })
      }), ctx
    );

    const response = await handler(request(`/api/agents/john/jobs/${jobId}`), ctx);
    expect(response.status).toBe(200);
    const { result } = await response.json();
    expect(result).toMatchObject({
      agent: "John", synthetic: true, mode: "MODEL_ADVISORY_ONLY",
      release_decision: "HOLD_SHOW", autonomous_show_approval: false
    });
    expect(result.actions[0].priority).toBe("P0");
    expect(saved()).toEqual(before);
    expect(fetchMock.mock.calls.some(
      ([url]) => String(url).includes("/api/rigor/agents/john/analyze")
    )).toBe(true);
  });
  it("refuses John model on production deploy or real customer evidence", async () => {
    const production = await handler(request("/api/agents/john/analyze", "{}"), ctx);
    expect(production.status).toBe(403);
    ctx = { ...ctx, site: { id: "96331e39-86a9-45a3-910c-edd321d60bb7" }, deploy: { context: "deploy-preview" } } as Context;
    const real = await handler(request("/api/agents/john/analyze", "{}"), ctx);
    expect(real.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });


  it("serves John's read-only brief only to authenticated workspace users", async () => {
    const unauthorized = await handler(new Request("https://rigor.test/api/agents/john/brief"), ctx);
    expect(unauthorized.status).toBe(401);
    const before = structuredClone(saved());
    const response = await handler(request("/api/agents/john/brief"), ctx);
    expect(response.status).toBe(200);
    const brief = await response.json();
    expect(brief.agent.name).toBe("John");
    expect(brief.mode).toBe("DETERMINISTIC_READ_ONLY_BRIEF");
    expect(brief.autonomous_show_approval).toBe(false);
    expect(brief.release_decision).toBe("HOLD_SHOW");
    expect(saved()).toEqual(before);
  });

  it("persists raw bytes and processing state before parsing or analysis", async () => {
    const response = await upload("tour.pdf");
    expect(response.status).toBe(202);
    expect(pdf).not.toHaveBeenCalled();
    const doc = activeProduction(saved()).documents[0];
    expect(doc.status).toBe("PROCESSING");
    expect([...records.keys()].some(k => k.startsWith("upload/"))).toBe(true);
    expect(progress(saved()).sessions["1"].complete).toBe(false);
    const review = await handler(request(`/api/documents/${doc.document_id}/review`, JSON.stringify({ complete_source_review: true })), ctx);
    expect(review.status).toBe(422);
    await Promise.all(waits);
  });
  it("processes saved text and is idempotent after completion", async () => {
    await upload(); await Promise.all(waits); await worker();
    const doc = activeProduction(saved()).documents[0];
    expect(doc).toMatchObject({ status: "PROCESSED", page_count: 1, review_status: "PENDING", analysis_engine: "DEERFLOW" });
    expect(activeProduction(saved()).requirements.length).toBeGreaterThan(0);
    const trace = activeProduction(saved()).events.find(item => item.type === "CHANGE_IMPACT_RECORDED")!.payload;
    expect(trace).toMatchObject({ entity_type: "DOCUMENT_ANALYSIS", entity_id: doc.document_id, actor: "DOCUMENT_ANALYSIS", before: { status: "PROCESSING" }, after: { status: "PROCESSED" } });
    expect(trace.requirement_ids).toEqual(activeProduction(saved()).requirements.map(item => item.requirement_id));
    const eventCount = activeProduction(saved()).events.length;
    const count = activeProduction(saved()).requirements.length;
    await worker(); expect(activeProduction(saved()).requirements).toHaveLength(count);
    expect(activeProduction(saved()).events).toHaveLength(eventCount);
  });
  it("preserves page boundaries, latest human decisions and production selection", async () => {
    await upload("tour.pdf"); await Promise.all(waits);
    pdf.mockImplementation(async () => {
      const latest = saved();
      const added = createProduction(latest.workspace.workspace_id, { show_name: "Other show", artist: "Artist", venue: "Venue", city: "City", show_date: "2027-01-01" }, 2);
      latest.productions.push(added); latest.workspace.active_production_id = added.production.production_id;
      records.set(`workspace/${workspace.tester.tester_id}`, latest);
      return Array(90).fill("Lighting requires 400 amps of power.");
    });
    await worker();
    expect(saved().productions[0].documents[0].page_count).toBe(90);
    expect(activeProduction(saved()).production.production_id).not.toBe(workspace.workspace.active_production_id);
  });
  it("retains saved document on parser failure and supports retry", async () => {
    await upload("bad.pdf"); await Promise.all(waits); pdf.mockRejectedValue(new Error("bad PDF")); await worker();
    const doc = activeProduction(saved()).documents[0]; expect(doc.status).toBe("FAILED");
    expect([...records.keys()].some(k => k.startsWith("upload/"))).toBe(true);
    const response = await handler(request(`/api/documents/${doc.document_id}/retry`, "{}"), ctx);
    expect(response.status).toBe(202); expect(activeProduction(saved()).documents[0].status).toBe("PROCESSING");
  });
  it("records dispatch failure and does not let polling overwrite state", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
    await upload(); await Promise.all(waits);
    expect(activeProduction(saved()).documents[0].status).toBe("FAILED");
    const before = structuredClone(saved()); await handler(request("/api/workspace"), ctx);
    expect(saved()).toEqual(before);
  });
  it("rejects unsupported files and unauthorized requests", async () => {
    expect((await upload("tour.zip")).status).toBe(422);
    expect((await handler(new Request("https://rigor.test/api/documents", { method: "POST", body: new FormData() }), ctx)).status).toBe(401);
    await processUpload(new Request("https://rigor.test/worker", { method: "POST", body: JSON.stringify({ jobId: "a".repeat(64) }) }), ctx);
    expect(pdf).not.toHaveBeenCalled();
  });
  it("processes a ten-document packet, blocks contradictions and exports both PDF scopes", async () => {
    fetchMock.mockImplementation(async (url: string, opts: any) => {
      if (!String(url).includes("gateway.test")) return new Response(null, { status: 202 });
      const payload = JSON.parse(opts.body);
      const text = payload.pages[0];
      return Response.json({ requirements: text.includes("Show power")
        ? [{
          department: "Power", category: "POWER_CAPACITY", requirement_text: text,
          source_excerpt: text, source_page: 1, confidence: 0.99,
        }] : [] });
    });
    const packet = [
      ["tour-rider.txt", "Show power must provide 400A service."],
      ["venue-spec.txt", "Show power must provide 200A service."],
      ["stage-plot.txt", "Stage plot: downstage left and upstage right."],
      ["audio-inputs.txt", "Input list: 24 channels."],
      ["lighting.txt", "Lighting plot: DMX universe 1."],
      ["video.txt", "Video specification: LED wall pixel pitch."],
      ["hospitality.txt", "Hospitality rider: catering and dressing room."],
      ["schedule.txt", "Show schedule: soundcheck and doors at 19:00."],
      ["rigging.txt", "Rigging plot: point load 1000 lbs."],
      ["trucking.txt", "Truck manifest: trailer and truck parking."],
    ];
    for (const [name, content] of packet) {
      expect((await upload(name, content)).status).toBe(202);
      await Promise.all(waits.splice(0));
    }
    const jobs = [...records.keys()].filter(key => key.startsWith("document-job/"));
    expect(jobs).toHaveLength(10);
    for (const key of jobs) {
      await processUpload(new Request("https://rigor.test/worker", {
        method: "POST", body: JSON.stringify({ jobId: key.split("/")[1] }),
      }), ctx);
    }
    const production = activeProduction(saved());
    expect(production.documents).toHaveLength(10);
    expect(production.documents.every(doc => doc.status === "PROCESSED")).toBe(true);
    expect(production.conflicts.some(c => c.category === "POWER_CAPACITY")).toBe(true);
    expect(readiness(production).status).toBe("BLOCKED");
    expect(production.documents.find(d => d.name === "hospitality.txt")?.suggested_type).toBe("HOSPITALITY");
    for (const path of ["/api/reports/advance.pdf", "/api/reports/advance.pdf?department=Power"]) {
      const response = await handler(request(path), ctx);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/pdf");
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
    }
  });
  it("rejects fabricated model citations without marking a document processed", async () => {
    fetchMock.mockImplementation(async (url: string) => String(url).includes("gateway.test")
      ? Response.json({ requirements: [{
        department: "Lighting", category: "POWER_CAPACITY",
        requirement_text: "Lighting requires 400 amps of power.",
        source_excerpt: "Fabricated requirement never present in the uploaded file.",
        source_page: 2, confidence: 0.99,
      }] })
      : new Response(null, { status: 202 }));
    await upload("tour.txt", "Lighting requires 400 amps of power.");
    await Promise.all(waits);
    await worker();
    const production = activeProduction(saved());
    expect(production.documents[0].status).toBe("FAILED");
    expect(production.requirements).toHaveLength(0);
    expect(readiness(production).status).not.toBe("SHOW_READY");
  });
  it("retains bytes and exposes a retryable failure when DeerFlow is unavailable", async () => {
    await upload(); await Promise.all(waits);
    vi.stubGlobal("Netlify", { env: { get: () => undefined } });
    await worker();
    const doc = activeProduction(saved()).documents[0];
    expect(doc.status).toBe("FAILED"); expect(doc.processing_error).toContain("NOT_CONFIGURED");
    expect(activeProduction(saved()).requirements).toHaveLength(0);
    expect([...records.keys()].some(k => k.startsWith("upload/"))).toBe(true);
  });
  it("allows fallback reanalysis but blocks source completion until DeerFlow verifies", async () => {
    await upload(); await Promise.all(waits); await worker();
    const latest = saved(); const doc = activeProduction(latest).documents[0];
    doc.analysis_engine = "STRUCTURED_EXTRACTION_V1"; doc.review_status = "REVIEWED";
    records.set(`workspace/${workspace.tester.tester_id}`, latest);
    expect(readiness(activeProduction(latest)).unreviewed_documents).toBe(1);
    const review = await handler(request(`/api/documents/${doc.document_id}/review`, JSON.stringify({ complete_source_review: true })), ctx);
    expect(review.status).toBe(422);
    const response = await handler(request(`/api/documents/${doc.document_id}/retry`, "{}"), ctx);
    expect(response.status).toBe(202); expect(activeProduction(saved()).documents[0].review_status).toBe("PENDING");
  });
  it("blocks department readiness for unprocessed sources even when no department is known yet", () => {
    const production = activeProduction(workspace);
    production.documents.push({ name: "new.pdf", status: "PROCESSING", review_status: "REVIEWED" });
    production.requirements.push({ department: "Lighting", document_name: "old.txt", status: "CONFIRMED", owner: "Lead" });
    const result = readiness(production, production.requirements, [], [], []);
    expect(result.status).not.toBe("SHOW_READY"); expect(result.unreviewed_documents).toBe(1);
  });
  it("runs ten genuine PDF uploads through durable worker, conflict detection and both report exports", async () => {
    // Unlike the text-packet regression, this exercises real PDF bytes and pdfjs extraction.
    const actualParser = await vi.importActual<typeof import("./pdf-text.js")>("./pdf-text.js");
    pdf.mockImplementation((raw: ArrayBuffer) => actualParser.readPdfPages(raw));
    fetchMock.mockImplementation(async (url: string, options: any) => {
      if (!String(url).includes("gateway.test")) return new Response(null, { status: 202 });
      const pages: string[] = JSON.parse(options.body).pages;
      const excerpt = pages[0].includes("Show power") ? pages[0] : null;
      return Response.json({ requirements: excerpt ? [{
        department: "Power", category: "POWER_CAPACITY", requirement_text: excerpt,
        source_excerpt: excerpt, source_page: 1, confidence: 0.99,
      }] : [] });
    });
    const documents = [
      ["artist-rider.pdf", "Artist technical rider. Show power must provide 400A service."],
      ["venue-pack.pdf", "Venue technical specifications. Show power must provide 200A service."],
      ["stage-plot.pdf", "Stage plot: stage width 48 feet."],
      ["audio-list.pdf", "Audio input list: 32 channels."],
      ["lighting.pdf", "Lighting rider: DMX universe 1."],
      ["video.pdf", "Video rider: LED wall and signal paths."],
      ["rigging.pdf", "Rigging specification: point load 600 kg."],
      ["hospitality.pdf", "Hospitality rider: crew meals for 17."],
      ["show-schedule.pdf", "Show schedule: doors at 19:00."],
      ["trucking.pdf", "Truck manifest: dock access required."],
    ] as const;
    for (const [name, text] of documents) {
      const document = await PDFDocument.create();
      const font = await document.embedFont(StandardFonts.Helvetica);
      document.addPage([612, 792]).drawText(text, { x: 36, y: 700, size: 12, font });
      const form = new FormData();
      form.append("file", new File([new Uint8Array(await document.save())], name, { type: "application/pdf" }));
      expect((await handler(request("/api/documents", form), ctx)).status).toBe(202);
      await Promise.all(waits.splice(0));
    }
    const jobs = [...records.keys()].filter(key => key.startsWith("document-job/"));
    expect(jobs).toHaveLength(10);
    for (const key of jobs) {
      await processUpload(new Request("https://rigor.test/worker", {
        method: "POST", body: JSON.stringify({ jobId: key.split("/")[1] }),
      }), ctx);
    }
    const state = activeProduction(saved());
    expect(state.documents).toHaveLength(10);
    expect(state.documents.every(doc => doc.status === "PROCESSED" && doc.page_count === 1)).toBe(true);
    expect(state.conflicts.some(item => item.category === "POWER_CAPACITY" && item.status === "OPEN")).toBe(true);
    expect(readiness(state).status).toBe("BLOCKED");
    expect(state.documents.find(doc => doc.name === "hospitality.pdf")?.suggested_type).toBe("HOSPITALITY");
    for (const path of ["/api/reports/advance.pdf", "/api/reports/advance.pdf?department=Power"]) {
      const response = await handler(request(path), ctx);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/pdf");
      const report = await response.arrayBuffer();
      expect(new TextDecoder().decode(new Uint8Array(report.slice(0, 4)))).toBe("%PDF");
      const reportText = (await actualParser.readPdfPages(report)).join(" ");
      expect(reportText).toContain(path.includes("department=Power")
        ? "Power Department Advance Report" : "Master Advance Report");
      expect(reportText).toContain("BLOCKED");
      expect(reportText).toContain("400A");
      expect(reportText).toContain("200A");
    }
    const other = saved();
    other.productions.push(createProduction(other.workspace.workspace_id, { show_name: "Independent second show" }, 2));
    other.workspace.active_production_id = other.productions[1].production.production_id;
    expect(activeProduction(other).documents).toHaveLength(0);
    expect(activeProduction(other).conflicts).toHaveLength(0);
    expect(readiness(activeProduction(other)).status).not.toBe("SHOW_READY");
  });

});
