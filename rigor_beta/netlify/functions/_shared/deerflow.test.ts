import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "@netlify/functions";
import { deerFlowRequest, integrationHealth } from "./deerflow.js";
const { records } = vi.hoisted(() => ({ records: new Map<string, any>() }));
vi.mock("@netlify/blobs", () => { const store = () => ({ setJSON: async (key: string, value: any) => records.set(key, structuredClone(value)), get: async (key: string) => records.get(key) ?? null }); return { getStore: store, getDeployStore: store }; });
const context = { deploy: { context: "production" } } as Context;
const candidate = { department: "Video", category: "VIDEO_POWER", requirement_text: "Provide 400 amps.", source_excerpt: "Provide 400 amps.", source_page: 90, confidence: .95 };
beforeEach(() => { records.clear(); vi.restoreAllMocks(); vi.stubGlobal("Netlify", { env: { get: (name: string) => name === "RIGOR_DEERFLOW_URL" ? "https://gateway.test" : "test-token" } }); });
describe("shared DeerFlow execution contract", () => {
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
    expect(fetcher.mock.calls.map(c => c[0])).toEqual(["https://gateway.test/api/rigor/company/pulse", "https://gateway.test/api/rigor/company/action/execute"]); expect(fetcher.mock.calls.every(c => c[1].headers["X-RIGOR-Service-Token"] === "test-token")).toBe(true);
    expect(records.get("latest/company_pulse").status).toBe("VERIFIED"); expect(records.get("latest/company_action").status).toBe("VERIFIED");
  });
});
