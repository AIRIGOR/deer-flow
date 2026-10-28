import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { Context } from "@netlify/functions";
import { companyActionContext, coherentFlowCheck, deerFlowRequest, integrationHealth } from "./deerflow.js";
const { records } = vi.hoisted(() => ({ records: new Map<string, any>() }));
vi.mock("@netlify/blobs", () => { const store = () => ({ setJSON: async (key: string, value: any) => records.set(key, structuredClone(value)), get: async (key: string) => records.get(key) ?? null }); return { getStore: store, getDeployStore: store }; });
const context = { deploy: { context: "production" } } as Context;
const candidate = { department: "Video", category: "VIDEO_POWER", requirement_text: "Provide 400 amps.", source_excerpt: "Provide 400 amps.", source_page: 90, confidence: .95 };
beforeEach(() => { records.clear(); vi.restoreAllMocks(); vi.stubGlobal("Netlify", { env: { get: (name: string) => name === "RIGOR_DEERFLOW_URL" ? "https://gateway.test" : "test-token" } }); });
describe("shared DeerFlow execution contract", () => {
  it.each(["Invented power capacity.", "Provide 400 amps."])("records failed provenance for an absent or wrong-page excerpt: %s", async excerpt => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ requirements: [{ ...candidate, source_page: 1, source_excerpt: excerpt }] })));
    await expect(deerFlowRequest(context, "document_analysis", { pages: ["Cover sheet", "Provide 400 amps."] })).rejects.toThrow("INVALID_SOURCE_PROVENANCE");
    expect(records.get("latest/document_analysis")).toMatchObject({ status: "FAILED", error_code: "INVALID_SOURCE_PROVENANCE" });
    expect([...records.values()].some(record => record.status === "VERIFIED")).toBe(false);
  });
  it("verifies faithful excerpts across whitespace and case differences", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ requirements: [{ ...candidate, source_page: 1 }] })));
    await deerFlowRequest(context, "document_analysis", { pages: ["PROVIDE\n400 amps."] });
    expect(records.get("latest/document_analysis").status).toBe("VERIFIED");
  });
  it("transports exact non-ASCII credentials as an ASCII digest without exposing the raw secret", async () => {
    const secret = "synthetic-€-credential";
    vi.stubGlobal("Netlify", { env: { get: (name: string) => name === "RIGOR_DEERFLOW_URL" ? "https://gateway.test" : secret } });
    const fetcher = vi.fn().mockResolvedValue(Response.json({requirements: []}));
    vi.stubGlobal("fetch", fetcher);
    await deerFlowRequest(context, "document_analysis", {pages: ["synthetic"]});
    expect(fetcher.mock.calls[0][1].headers["X-RIGOR-Service-Token-SHA256"]).toBe(createHash("sha256").update(secret, "utf8").digest("hex"));
    expect(fetcher.mock.calls[0][1].headers["X-RIGOR-Service-Token"]).toBeUndefined();
    expect(JSON.stringify([...records.values()])).not.toContain(secret);
  });
  it("rejects John's fabricated source IDs at the gateway boundary", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      agent: "John", mode: "MODEL_ADVISORY_ONLY", release_decision: "HOLD_SHOW",
      autonomous_show_approval: false,
      actions: [{ priority: "P0", department: "Power", question: "Verify source.",
        evidence_ids: ["fabricated-id"] }],
    })));
    await expect(deerFlowRequest(context, "john_pm", {
      synthetic: true, evidence: [{ source_id: "real-id", text: "Tour requires 400A power" }],
    })).rejects.toThrow("INVALID_PM_SOURCE_CITATION");
    expect(records.get("latest/john_pm")).toMatchObject({ status: "FAILED", error_code: "INVALID_PM_SOURCE_CITATION" });
  });


  it("keeps oversized action context within the backend request limit", () => {
    const context = companyActionContext("proof-action", { result: '"\\'.repeat(30000) });
    expect(context.length).toBeLessThanOrEqual(20000);
    expect(JSON.parse(context).action_key).toBe("proof-action");
    expect(JSON.parse(context).latest_company_pulse_excerpt.length).toBe(8000);
  });
  it("queues only an internal evidence review after both real prerequisites verify", async () => {
    expect(coherentFlowCheck(await integrationHealth(context), "deploy-1")).toBeNull();
    records.set("latest/document_analysis", { status: "VERIFIED", execution_id: "document-proof" });
    expect(coherentFlowCheck(await integrationHealth(context), "deploy-1")).toBeNull();
    records.set("latest/company_pulse", { status: "VERIFIED", execution_id: "pulse-proof" });
    expect(coherentFlowCheck(await integrationHealth(context), "deploy-1")).toMatchObject({ action_type: "INTERNAL_TEST", scope: "OBSERVE", owner_agent: "rigor-qa-security", evidence_refs: ["document-proof", "pulse-proof"] });
  });
  it("submits every page with a background budget and a durable receipt", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ requirements: [candidate] })); vi.stubGlobal("fetch", fetcher); const deadline = vi.spyOn(AbortSignal, "timeout");
    const response = await deerFlowRequest(context, "document_analysis", { pages: Array.from({ length: 90 }, () => "Provide 400 amps.") });
    expect(deadline).toHaveBeenCalledWith(600000); expect(JSON.parse(fetcher.mock.calls[0][1].body).pages).toHaveLength(90); expect(response.headers.get("X-RIGOR-Execution-Id")).toBeTruthy();
    expect(records.get("latest/document_analysis")).toMatchObject({ status: "VERIFIED", pages_submitted: 90, requirements_returned: 1 });
    expect((await integrationHealth(context)).operations.company_pulse).toEqual({ status: "UNVERIFIED" });
  });
  it.each([401, 502, 504])("fails closed on HTTP %s", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("upstream body must not leak", { status })));
    await expect(deerFlowRequest(context, "document_analysis", { pages: ["source"] })).rejects.toThrow(`HTTP_${status}`);
    expect(records.get("latest/document_analysis")).toMatchObject({ status: "FAILED", error_code: `HTTP_${status}` }); expect(JSON.stringify([...records.values()])).not.toContain("upstream body");
  });
  it("rejects invalid provenance and missing configuration", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ requirements: [candidate] })));
    await expect(deerFlowRequest(context, "document_analysis", { pages: ["source"] })).rejects.toThrow("INVALID_SOURCE_PROVENANCE"); vi.stubGlobal("Netlify", { env: { get: () => undefined } });
    await expect(deerFlowRequest(context, "document_analysis", { pages: ["source"] })).rejects.toThrow("NOT_CONFIGURED");
  });
  it("records timeout failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("aborted", "TimeoutError"))); await expect(deerFlowRequest(context, "document_analysis", { pages: ["source"] })).rejects.toThrow("TIMEOUT");
    expect((await integrationHealth(context)).operations.document_analysis).toMatchObject({ status: "FAILED", error_code: "TIMEOUT" });
  });
  it("uses the same gateway/auth for 3NETRA company pulse and action", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ current_state: "Reviewed", top_priorities: [], state_updates: [] })).mockResolvedValueOnce(Response.json({ status: "COMPLETE", result_summary: "Internal execution completed" })); vi.stubGlobal("fetch", fetcher);
    await deerFlowRequest(context, "company_pulse", { objective: "Review" }); await deerFlowRequest(context, "company_action", { proposal: { scope: "INTERNAL_EXECUTE" } });
    expect(fetcher.mock.calls.map(c => c[0])).toEqual(["https://gateway.test/api/rigor/company/pulse", "https://gateway.test/api/rigor/company/action/execute"]); expect(fetcher.mock.calls.every(c => c[1].headers["X-RIGOR-Service-Token-SHA256"] === createHash("sha256").update("test-token").digest("hex"))).toBe(true);
    expect(records.get("latest/company_pulse").status).toBe("VERIFIED"); expect(records.get("latest/company_action").status).toBe("VERIFIED");
  });
});
