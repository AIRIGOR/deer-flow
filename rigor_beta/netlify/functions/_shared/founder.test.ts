import { beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import type { Context } from "@netlify/functions";
import api from "../rigor-founder.mjs";
import worker from "../rigor-founder-command-background.mjs";
const { records, dryReceiptWrite } = vi.hoisted(() => ({ records: new Map<string, any>(), dryReceiptWrite: vi.fn() }));
vi.mock("@netlify/blobs", () => {
  const store = () => ({
    get: async (key: string) => records.get(key) ?? null,
    getWithMetadata: async (key: string) => records.has(key) ? { data: structuredClone(records.get(key)), etag: JSON.stringify(records.get(key)) } : null,
    setJSON: async (key: string, value: any, options?: any) => {
      if (key.startsWith("dry-run-receipts/")) await dryReceiptWrite(key, value, options);
      if (options?.onlyIfMatch && JSON.stringify(records.get(key)) !== options.onlyIfMatch) return { modified: false };
      if (options?.onlyIfNew && records.has(key)) return { modified: false };
      records.set(key, structuredClone(value)); return { modified: true, etag: JSON.stringify(value) };
    },
  }); return { getStore: store, getDeployStore: store };
});
const context = { deploy: { context: "dev", id: "isolated" } } as Context;
const request = (body: unknown, token = "founder") => new Request("https://site.test/api/founder/commands", { method: "POST", headers: { "Content-Type": "application/json", "X-RIGOR-Founder-Token": token }, body: JSON.stringify(body) });
beforeEach(() => {
  records.clear(); vi.restoreAllMocks(); dryReceiptWrite.mockReset();
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
  const fetcher = vi.fn().mockResolvedValue(Response.json({ status: "COMPLETE", result_summary: "Reviewed", evidence_refs: ["proof"], execution_evidence: { source: "DEERFLOW_CHECKPOINT_LEDGER", thread_id: "rigor-company-action-synthetic", checkpoint_id: "synthetic-checkpoint", run_id: "synthetic-run", model_output_sha256: "b".repeat(64), delegations: [{ id: "task-1", agent: "rigor-qa-security", status: "completed", result_sha256: "a".repeat(64), result_ref: "result-1" }] } })); vi.stubGlobal("fetch", fetcher);
  const invocation = () => new Request(`https://site.test/.netlify/functions/rigor-founder-command-background?id=${record.command_id}`, { method: "POST", headers: { "X-RIGOR-Automation-Token": "gateway" } });
  await Promise.all([worker(invocation(), context), worker(invocation(), context)]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const completed = records.get(`commands/${record.command_id}`); expect(completed.status).toBe("COMPLETE"); expect(completed.execution_id).toBeTruthy(); expect(completed.result.result_summary).toBe("Reviewed");
  expect(completed.result.execution_evidence.checkpoint_id).toBe("synthetic-checkpoint");
  expect(records.get(`execution/${completed.execution_id}`).delegation_evidence.checkpoint_id).toBe("synthetic-checkpoint");
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

it("blocks an old RUNNING command for review without replaying it", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  records.set(`commands/${id}`, { command_id: id, status: "RUNNING", updated_at: "2000-01-01T00:00:00.000Z", command: "Review interrupted research", mode: "INTERNAL_RESEARCH" });
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const invoke = () => new Request(`https://site.test/worker?id=${id}`, { method: "POST", headers: { "X-RIGOR-Automation-Token": "gateway" } });
  await worker(invoke(), context);
  expect(records.get(`commands/${id}`)).toMatchObject({ status: "BLOCKED", error_code: "INTERRUPTED_REVIEW_REQUIRED" });
  await worker(invoke(), context);
  expect(fetcher).not.toHaveBeenCalled();
});

it("does not let an unauthorized recovery request change interrupted state", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const record = { status: "RUNNING", updated_at: "2000-01-01T00:00:00.000Z" };
  records.set(`commands/${id}`, record);
  await worker(new Request(`https://site.test/worker?id=${id}`, { method: "POST" }), context);
  expect(records.get(`commands/${id}`)).toEqual(record);
});

it("leaves a recent RUNNING command untouched without a second execution", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const record = { status: "RUNNING", updated_at: new Date().toISOString() };
  records.set(`commands/${id}`, record);
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await worker(new Request(`https://site.test/worker?id=${id}`, { method: "POST", headers: { "X-RIGOR-Automation-Token": "gateway" } }), context);
  expect(records.get(`commands/${id}`)).toEqual(record);
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(["success", "failure"])("preserves newer command state after late worker %s", async outcome => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 202 })));
  const record = await (await api(request({ command: "Review blockers" }), context)).json();
  let newer: any;
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
    newer = { ...records.get(`commands/${record.command_id}`), status: "BLOCKED", error_code: "INTERRUPTED_REVIEW_REQUIRED" };
    records.set(`commands/${record.command_id}`, newer);
    if (outcome === "failure") throw new Error("Synthetic interruption");
    return Response.json({ status: "COMPLETE", result_summary: "Reviewed", execution_evidence: { source: "DEERFLOW_CHECKPOINT_LEDGER", thread_id: "rigor-company-action-synthetic", checkpoint_id: "synthetic-checkpoint", run_id: "synthetic-run", model_output_sha256: "b".repeat(64), delegations: [{ id: "task-1", agent: "rigor-qa-security", status: "completed", result_sha256: "a".repeat(64), result_ref: "result-1" }] } });
  }));
  await worker(new Request(`https://site.test/worker?id=${record.command_id}`, { method: "POST", headers: { "X-RIGOR-Automation-Token": "gateway" } }), context);
  expect(records.get(`commands/${record.command_id}`)).toEqual(newer);
});


const dryRunId = "22222222-2222-4222-8222-222222222222";
const dryBody = { command: "Review fictional screen evidence", mode: "LOCAL_DRY_RUN", intent: "REVIEW_EVIDENCE", evidence: [{ source_id: "fictional-screen", text: "Synthetic screen available" }] };
const dryRequest = (body: any = dryBody, token = "founder", id = dryRunId) => new Request("http://localhost:8888/api/founder/commands", { method: "POST", headers: { "Content-Type": "application/json", "X-RIGOR-Founder-Token": token, "Idempotency-Key": id }, body: JSON.stringify(body) });
it("completes a token-authorized local simulation with correlated plan and dry-run receipt", async () => {
  vi.stubGlobal("Netlify", { env: { get: (name: string) => name === "RIGOR_FOUNDER_TOKEN" ? "founder" : undefined } });
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const response = await api(dryRequest(), context);
  expect(response.status).toBe(200);
  const command = await response.json();
  expect(command.status).toBe("DRY_RUN_COMPLETE");
  expect(command.authentication).toEqual({ mechanism: "FOUNDER_TOKEN", capability: "LOCAL_SIMULATION_ONLY", human_identity_verified: false, production_authority_verified: false });
  expect(command.plan.specialist).toBe("rigor-qa-security");
  expect(command.result).toMatchObject({ real_agent_executed: false, production_action_executed: false, mode: "LOCAL_DRY_RUN" });
  const receipt = records.get(`dry-run-receipts/${command.execution_id}`);
  expect(receipt).toMatchObject({ command_id: dryRunId, execution_id: command.execution_id, status: "DRY_RUN_COMPLETE", verification_scope: "LOCAL_SIMULATED_HANDOFF", request_sha256: command.request_sha256 });
  expect(receipt.response_sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(receipt.response_sha256).toBe(createHash("sha256").update(JSON.stringify(command.result)).digest("hex"));
  expect(receipt.request_sha256).toBe(createHash("sha256").update(JSON.stringify(dryBody)).digest("hex"));
  expect(fetcher).not.toHaveBeenCalled();
  expect(JSON.stringify(receipt)).not.toContain("founder");
});
it.each(["wrong", ""])("rejects unauthenticated local simulation (%s)", async token => {
  expect((await api(dryRequest(dryBody, token), context)).status).toBe(401);
  expect(records.size).toBe(0);
});
it("blocks privileged intent even with claimed approval and generic Founder-token access", async () => {
  const response = await api(dryRequest({ ...dryBody, intent: "PRODUCTION_PROMOTE", approved: true, role: "Founder" }), context);
  expect(response.status).toBe(403);
  expect((await response.json()).status).toBe("BLOCKED");
  expect(dryReceiptWrite).not.toHaveBeenCalled();
});
it("rejects hosted dry runs, missing versioned intent input and missing evidence", async () => {
  expect((await api(dryRequest(), { deploy: { context: "production" } } as Context)).status).toBe(403);
  expect((await api(dryRequest({ ...dryBody, evidence: [] }), context)).status).toBe(422);
  const missingKey = new Request("http://localhost/api/founder/commands", { method: "POST", headers: { "X-RIGOR-Founder-Token": "founder" }, body: JSON.stringify(dryBody) });
  expect((await api(missingKey, context)).status).toBe(422);
  expect(records.size).toBe(0);
});
it("deduplicates concurrent submissions and rejects changed content under the same key", async () => {
  const responses = await Promise.all([api(dryRequest(), context), api(dryRequest(), context)]);
  expect(responses.every(r => [200, 202].includes(r.status))).toBe(true);
  expect(dryReceiptWrite).toHaveBeenCalledTimes(1);
  const newer = structuredClone(records.get(`commands/${dryRunId}`));
  expect((await api(dryRequest({ ...dryBody, command: "Different command" }), context)).status).toBe(409);
  expect(records.get(`commands/${dryRunId}`)).toEqual(newer);
});
it("fails closed on receipt persistence failure", async () => {
  dryReceiptWrite.mockRejectedValueOnce(new Error("private storage error"));
  const response = await api(dryRequest(), context);
  expect(response.status).toBe(500);
  expect((await response.json()).status).toBe("FAILED");
  expect(records.get(`commands/${dryRunId}`).error_code).toBe("DRY_RUN_EXECUTION_FAILED");
});
it("preserves newer state when the dry-run receipt finishes after interruption", async () => {
  let newer: any;
  dryReceiptWrite.mockImplementationOnce(() => { newer = { ...records.get(`commands/${dryRunId}`), status: "BLOCKED", error_code: "INTERRUPTED_REVIEW_REQUIRED" }; records.set(`commands/${dryRunId}`, newer); });
  const response = await api(dryRequest(), context);
  expect(response.status).toBe(403);
  expect(records.get(`commands/${dryRunId}`)).toEqual(newer);
  expect(dryReceiptWrite).toHaveBeenCalledTimes(1);
});
it("does not replay an interrupted dry-run submission", async () => {
  await api(dryRequest(), context);
  const record = records.get(`commands/${dryRunId}`);
  records.set(`commands/${dryRunId}`, { ...record, status: "RUNNING", updated_at: "2000-01-01T00:00:00.000Z" });
  const response = await api(dryRequest(), context);
  expect(response.status).toBe(403);
  expect((await response.json()).error_code).toBe("INTERRUPTED_REVIEW_REQUIRED");
  expect(dryReceiptWrite).toHaveBeenCalledTimes(1);
});

it.each([false, true])("completes browser-to-handler dry run with lost reply=%s", async loseReply => {
  const nodes: Record<string, any> = {};
  const stored = new Map<string, string>();
  let dropReply = loseReply;
  const fetcher = vi.fn(async (path: string, init: RequestInit) => {
    const response = await api(new Request(`http://localhost:8888${path}`, init), context);
    if (dropReply) { dropReply = false; throw new Error("Synthetic lost response"); }
    return response;
  });
  const sandbox: any = {
    document: { getElementById: (id: string) => nodes[id] ||= { value: "", disabled: false, textContent: "", handlers: {}, addEventListener(name: string, handler: any) { this.handlers[name] = handler; } } },
    fetch: fetcher, setTimeout: vi.fn(), clearTimeout: vi.fn(), crypto: { randomUUID: () => dryRunId },
    sessionStorage: { getItem: (key: string) => stored.get(key) || null, setItem: (key: string, value: string) => stored.set(key, value) },
  };
  runInNewContext(readFileSync(new URL("../../../app/static/founder.js", import.meta.url), "utf8"), sandbox);
  for (const id of ["founder-token", "command-input", "command-mode"]) sandbox.document.getElementById(id);
  nodes["founder-token"].value = "founder";
  nodes["access-form"].handlers.submit({ preventDefault() {} });
  nodes["command-input"].value = "Review fictional evidence";
  nodes["command-mode"].value = "LOCAL_DRY_RUN";
  await nodes["command-form"].handlers.submit({ preventDefault() {} });
  if (loseReply) {
    expect(nodes["command-result"].textContent).toContain("Submission not confirmed");
    expect(stored.get("rigorFounderDryRunId")).toBe(dryRunId);
    await nodes["command-form"].handlers.submit({ preventDefault() {} });
  }
  expect(fetcher).toHaveBeenCalledTimes(loseReply ? 2 : 1);
  expect(dryReceiptWrite).toHaveBeenCalledTimes(1);
  expect(nodes["command-result"].textContent).toContain("DRY_RUN_COMPLETE");
  expect(nodes["command-result"].textContent).toContain("no real agent or production action executed");
  expect(nodes["command-evidence"].textContent).toContain('"human_identity_verified": false');
  expect(records.get(`dry-run-receipts/${dryRunId}`).verification_scope).toBe("LOCAL_SIMULATED_HANDOFF");
  expect(nodes["submit-command"].disabled).toBe(false);
  expect(sandbox.setTimeout).not.toHaveBeenCalled();
  expect(JSON.stringify([...stored.values()])).not.toContain("founder");
});

it.each(["missing_authentication", "hosted_context"])("blocks unsafe persisted simulation: %s", async failure => {
  await api(dryRequest(), context);
  const record = { ...records.get(`commands/${dryRunId}`), status: "QUEUED" };
  if (failure === "missing_authentication") delete record.authentication;
  records.set(`commands/${dryRunId}`, record);
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  dryReceiptWrite.mockClear();
  await worker(new Request(`http://localhost/worker?id=${dryRunId}`, { method: "POST", headers: { "X-RIGOR-Automation-Token": "gateway" } }), failure === "hosted_context" ? { deploy: { context: "production" } } as Context : context);
  expect(records.get(`commands/${dryRunId}`)).toMatchObject({ status: "BLOCKED", error_code: "AUTHORITY_NOT_VERIFIED" });
  expect(fetcher).not.toHaveBeenCalled();
  expect(dryReceiptWrite).not.toHaveBeenCalled();
});

it("never overwrites a pre-existing dry-run receipt or reports successful completion", async () => {
  const oldReceipt = { status: "EXISTING", marker: "preserve" };
  records.set(`dry-run-receipts/${dryRunId}`, oldReceipt);
  expect((await api(dryRequest(), context)).status).toBe(500);
  expect(records.get(`dry-run-receipts/${dryRunId}`)).toEqual(oldReceipt);
  expect(records.get(`commands/${dryRunId}`).status).toBe("FAILED");
});
