import { beforeEach, expect, it, vi } from "vitest";
import type { Context } from "@netlify/functions";
import api from "../rigor-founder.mjs";
import worker from "../rigor-founder-command-background.mjs";
const { records } = vi.hoisted(() => ({ records: new Map<string, any>() }));
vi.mock("@netlify/blobs", () => {
  const store = () => ({
    get: async (key: string) => records.get(key) ?? null,
    getWithMetadata: async (key: string) => records.has(key) ? { data: structuredClone(records.get(key)), etag: JSON.stringify(records.get(key)) } : null,
    setJSON: async (key: string, value: any, options?: any) => {
      if (options?.onlyIfMatch && JSON.stringify(records.get(key)) !== options.onlyIfMatch) return { modified: false };
      if (options?.onlyIfNew && records.has(key)) return { modified: false };
      records.set(key, structuredClone(value)); return { modified: true, etag: JSON.stringify(value) };
    },
  }); return { getStore: store, getDeployStore: store };
});
const context = { deploy: { context: "dev", id: "isolated" } } as Context;
const request = (body: unknown, token = "founder") => new Request("https://site.test/api/founder/commands", { method: "POST", headers: { "Content-Type": "application/json", "X-RIGOR-Founder-Token": token }, body: JSON.stringify(body) });
beforeEach(() => {
  records.clear(); vi.restoreAllMocks();
  vi.stubGlobal("Netlify", { env: { get: (name: string) => ({ RIGOR_FOUNDER_TOKEN: "founder", RIGOR_DEERFLOW_TOKEN: "gateway", RIGOR_DEERFLOW_URL: "https://engine.test" } as any)[name] } });
});
it("rejects unauthenticated commands before persistence or dispatch", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  expect((await api(request({ command: "Review blockers" }, "wrong"), context)).status).toBe(401);
  expect(records.size).toBe(0); expect(fetcher).not.toHaveBeenCalled();
});
it("fails closed when founder authentication is not configured", async () => {
  vi.stubGlobal("Netlify", { env: { get: () => undefined } });
  expect((await api(request({ command: "Review blockers" }), context)).status).toBe(503);
});
it("persists QUEUED before dispatch and preserves the exact command", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
    expect([...records.values()].some(x => x.status === "QUEUED")).toBe(true);
    return new Response(null, { status: 202 });
  }));
  const response = await api(request({ command: "Review readiness", mode: "INTERNAL_RESEARCH", scope: "EXTERNAL_EXECUTE" }), context);
  expect(response.status).toBe(202);
  const record = await response.json(); expect(record.command).toBe("Review readiness"); expect(record.proposal.scope).toBe("INTERNAL_EXECUTE");
});
it("rejects reserved modes and commands above 3900 characters", async () => {
  expect((await api(request({ command: "x".repeat(3901) }), context)).status).toBe(422);
  expect((await api(request({ command: "send", mode: "EMAIL_SEND" }), context)).status).toBe(422);
});
it("persists a failed dispatch rather than leaving a false queued state", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private token upstream")));
  const response = await api(request({ command: "Review blockers" }), context);
  expect(response.status).toBe(502);
  const record = await response.json(); expect(record.status).toBe("FAILED"); expect(JSON.stringify(record)).not.toContain("private token");
});
it("executes a persisted command once and saves its result and receipt", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 202 })));
  const record = await (await api(request({ command: "Review blockers" }), context)).json();
  const fetcher = vi.fn().mockResolvedValue(Response.json({ status: "COMPLETE", result_summary: "Reviewed", evidence_refs: ["proof"] })); vi.stubGlobal("fetch", fetcher);
  const invocation = () => new Request(`https://site.test/.netlify/functions/rigor-founder-command-background?id=${record.command_id}`, { method: "POST", headers: { "X-RIGOR-Automation-Token": "gateway" } });
  await Promise.all([worker(invocation(), context), worker(invocation(), context)]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const completed = records.get(`commands/${record.command_id}`); expect(completed.status).toBe("COMPLETE"); expect(completed.execution_id).toBeTruthy(); expect(completed.result.result_summary).toBe("Reviewed");
});
it("rejects invalid execution output and exposes only sanitized failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 202 })));
  const record = await (await api(request({ command: "Review blockers" }), context)).json();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ status: "COMPLETE" })));
  await worker(new Request(`https://site.test/.netlify/functions/rigor-founder-command-background?id=${record.command_id}`, { method: "POST", headers: { "X-RIGOR-Automation-Token": "gateway" } }), context);
  expect(records.get(`commands/${record.command_id}`).status).toBe("FAILED");
});
it("does not disclose command records without founder authentication", async () => {
  expect((await api(new Request("https://site.test/api/founder/commands?id=test"), context)).status).toBe(401);
});
