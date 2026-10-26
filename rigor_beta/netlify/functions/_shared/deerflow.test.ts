import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "@netlify/functions";
import { companyActionContext, coherentFlowCheck, deerFlowRequest, integrationHealth } from "./deerflow.js";
const { records } = vi.hoisted(() => ({ records: new Map<string, any>() }));
vi.mock("@netlify/blobs", () => { const store = () => ({ setJSON: async (key: string, value: any) => records.set(key, structuredClone(value)), get: async (key: string) => records.get(key) ?? null }); return { getStore: store, getDeployStore: store }; });
const context = { deploy: { context: "production", id: "deploy-1" } } as Context;
const candidate = { department: "Video", category: "VIDEO_POWER", requirement_text: "Provide 400 amps.", source_excerpt: "Provide 400 amps.", source_page: 90, confidence: .95 };
beforeEach(() => { records.clear(); vi.restoreAllMocks(); vi.stubGlobal("Netlify", { env: { get: (name: string) => name === "RIGOR_DEERFLOW_URL" ? "https://gateway.test" : "test-token" } }); });
describe("shared DeerFlow execution contract", () => {
  it("rejects a pulse with unregistered specialists before saving verified evidence", async () => {
    const agents = ["invented-agent", "rigor-engineering", "rigor-qa-security", "rigor-market-intel", "rigor-finance-runway", "rigor-chief-of-staff"];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ current_state: "Claimed", top_priorities: [], state_updates: [],
      execution_receipts: agents.map((agent, index) => ({ agent, task_id: `task-${index}`, status: "COMPLETE" })) })));
    await expect(deerFlowRequest(context, "company_pulse", { objective: "Review" })).rejects.toThrow("DELEGATION_NOT_VERIFIED");
    expect(records.get("latest/company_pulse")).toMatchObject({ status: "FAILED", error_code: "DELEGATION_NOT_VERIFIED" });
  });
  it("keeps oversized action context within the backend request limit", () => {
    const context = companyActionContext("proof-action", { result: '"\\'.repeat(30000) });
    expect(context.length).toBeLessThanOrEqual(20000);
    expect(JSON.parse(context).action_key).toBe("proof-action");
    expect(JSON.parse(context).latest_company_pulse_excerpt.length).toBe(8000);
  });
  it("queues only an internal evidence review after both real prerequisites verify", async () => {
    expect(coherentFlowCheck(await integrationHealth(context), "deploy-1")).toBeNull();
    records.set("latest/document_analysis", { status: "VERIFIED", execution_id: "document-proof", deploy_id: "deploy-1" });
    expect(coherentFlowCheck(await integrationHealth(context), "deploy-1")).toBeNull();
    records.set("latest/company_pulse", { status: "VERIFIED", execution_id: "pulse-proof", deploy_id: "deploy-1" });
    expect(coherentFlowCheck(await integrationHealth(context), "deploy-1")).toMatchObject({ action_type: "INTERNAL_TEST", scope: "OBSERVE", owner_agent: "rigor-qa-security", evidence_refs: ["document-proof", "pulse-proof"] });
  });
  it("does not reuse earlier or unbound receipts for a deployment review", async () => {
    for (const deploy_id of [undefined, "old-deploy"]) {
      for (const operation of ["document_analysis", "company_pulse"]) records.set(`latest/${operation}`, {status: "VERIFIED", execution_id: operation, deploy_id});
      expect(coherentFlowCheck(await integrationHealth(context), "deploy-1")).toBeNull();
    }
  });
  it("rejects invented quotations and citations to the wrong page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({requirements: [{...candidate, source_page: 1}]})));
    await expect(deerFlowRequest(context, "document_analysis", {pages: ["No power confirmed.", candidate.source_excerpt]})).rejects.toThrow("INVALID_SOURCE_PROVENANCE");
    expect(records.get("latest/document_analysis")).toMatchObject({status: "FAILED", deploy_id: "deploy-1"});
  });
  it("accepts whitespace-normalized quotations without rewriting source facts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({requirements: [{...candidate, source_page: 1}]})));
    await deerFlowRequest(context, "document_analysis", {pages: ["Provide\n 400\tamps."]});
    expect(records.get("latest/document_analysis")).toMatchObject({status: "VERIFIED", deploy_id: "deploy-1"});
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
  it('rejects model-only company completions rather than verifying integration', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({current_state: 'Claimed', top_priorities: [], state_updates: []})));
    await expect(deerFlowRequest(context, 'company_pulse', {objective: 'Review'})).rejects.toThrow('DELEGATION_NOT_VERIFIED');
    expect(records.get('latest/company_pulse')).toMatchObject({status: 'FAILED', error_code: 'DELEGATION_NOT_VERIFIED'});
  });
  it("uses the same gateway/auth for 3NETRA company pulse and action", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ current_state: "Reviewed", top_priorities: [], state_updates: [], execution_receipts: ["rigor-product-ops", "rigor-engineering", "rigor-qa-security", "rigor-market-intel", "rigor-finance-runway", "rigor-chief-of-staff"].map((agent,index)=>({agent, task_id: `task-${index}`, status: "COMPLETE"})) })).mockResolvedValueOnce(Response.json({ status: "COMPLETE", result_summary: "Internal execution completed", execution_receipts: [{agent:"rigor-qa-security", task_id:"qa-task", status:"COMPLETE"}] })); vi.stubGlobal("fetch", fetcher);
    await deerFlowRequest(context, "company_pulse", { objective: "Review" }); await deerFlowRequest(context, "company_action", { proposal: { scope: "INTERNAL_EXECUTE" } });
    expect(fetcher.mock.calls.map(c => c[0])).toEqual(["https://gateway.test/api/rigor/company/pulse", "https://gateway.test/api/rigor/company/action/execute"]); expect(fetcher.mock.calls.every(c => c[1].headers["X-RIGOR-Service-Token"] === "test-token")).toBe(true);
    expect(records.get("latest/company_pulse").status).toBe("VERIFIED"); expect(records.get("latest/company_action").status).toBe("VERIFIED");
  });
});
