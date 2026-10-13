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
import handler, { processUpload } from "../rigor-api.mjs";
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
beforeEach(() => {
  records.clear(); waits = []; pdf.mockReset();
  workspace = createWorkspace("Upload Tester", "PM");
  records.set(`workspace/${workspace.tester.tester_id}`, structuredClone(workspace));
  records.set(`session/${createHash("sha256").update("test-session").digest("hex")}`, { testerId: workspace.tester.tester_id, expiresAt: "2099-01-01" });
  ctx = { deploy: { context: "production" }, waitUntil: (p: Promise<unknown>) => waits.push(p) } as unknown as Context;
  vi.stubGlobal("Netlify", { env: { get: (name: string) => name === "RIGOR_DEERFLOW_URL" ? "https://gateway.test" : "test-token" } });
  fetchMock = vi.fn().mockImplementation(async (url: string) => String(url).includes("gateway.test") ? Response.json({ requirements: [{ department: "Lighting", category: "POWER_CAPACITY", requirement_text: "Lighting requires 400 amps of power.", source_excerpt: "Lighting requires 400 amps of power.", source_page: 1, confidence: .95 }] }) : new Response(null, { status: 202 })); vi.stubGlobal("fetch", fetchMock);
});
describe("durable document upload", () => {
  it("runs John model in staging with sample evidence without changing readiness", async () => {
    const sample = saved();
    const { loadSampleProduction } = await import("./model.js");
    loadSampleProduction(activeProduction(sample));
    records.set(`workspace/${workspace.tester.tester_id}`, sample);
    const before = structuredClone(saved());
    ctx = { ...ctx, deploy: { context: "deploy-preview" } } as Context;
    fetchMock.mockImplementation(async (url: string) => String(url).includes("/agents/john/analyze")
      ? Response.json({ agent: "John", mode: "MODEL_ADVISORY_ONLY",
          release_decision: "HOLD_SHOW", autonomous_show_approval: false,
          actions: [{ priority: "P0", department: "Power",
            question: "Verify venue show power before load in.",
            evidence_ids: [activeProduction(sample).requirements[0].requirement_id] }] })
      : new Response(null, { status: 202 }));
    const response = await handler(request("/api/agents/john/analyze", "{}"), ctx);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({ agent: "John", mode: "MODEL_ADVISORY_ONLY",
      release_decision: "HOLD_SHOW", autonomous_show_approval: false, synthetic: true });
    expect(result.actions[0].priority).toBe("P0");
    expect(saved()).toEqual(before);
    expect(fetchMock.mock.calls[0][0]).toContain("/api/rigor/agents/john/analyze");
  });

  it("refuses John model on production deploy or real customer evidence", async () => {
    const production = await handler(request("/api/agents/john/analyze", "{}"), ctx);
    expect(production.status).toBe(403);
    ctx = { ...ctx, deploy: { context: "deploy-preview" } } as Context;
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
    const count = activeProduction(saved()).requirements.length;
    await worker(); expect(activeProduction(saved()).requirements).toHaveLength(count);
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
