import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { Context } from "@netlify/functions";
import { activeProduction, createProduction, createWorkspace, progress, readiness } from "./model.js";
const { records, pdf } = vi.hoisted(() => ({ records: new Map<string, any>(), pdf: vi.fn() }));
vi.mock("@netlify/blobs", () => ({ getStore: () => ({
  get: async (key: string) => records.has(key) ? structuredClone(records.get(key)) : null,
  set: async (key: string, value: any) => { records.set(key, structuredClone(value)); },
  setJSON: async (key: string, value: any) => { records.set(key, structuredClone(value)); },
  delete: async (key: string) => { records.delete(key); },
}) }));
vi.mock("pdf-parse", () => ({ default: pdf }));
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
    pdf.mockImplementation(async (_bytes, opts) => {
      for (let i = 0; i < 90; i++) await opts.pagerender({ getTextContent: async () => ({ items: [{ str: "Lighting requires 400 amps of power.", transform: [0,0,0,0,0,10] }] }) });
      const latest = saved();
      const added = createProduction(latest.workspace.workspace_id, { show_name: "Other show", artist: "Artist", venue: "Venue", city: "City", show_date: "2027-01-01" }, 2);
      latest.productions.push(added); latest.workspace.active_production_id = added.production.production_id;
      records.set(`workspace/${workspace.tester.tester_id}`, latest);
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
});
