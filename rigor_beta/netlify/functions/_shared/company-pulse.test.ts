import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "@netlify/functions";

const { store, records } = vi.hoisted(() => {
  const records = new Map<string, unknown>();
  return {records, store: {
    get: vi.fn(async (key: string) => records.get(key) ?? null),
    setJSON: vi.fn(async (key: string, value: unknown) => { records.set(key, value); }),
    list: vi.fn(async () => ({blobs: []})),
    delete: vi.fn(async () => {}),
  }};
});
vi.mock("@netlify/blobs", () => ({getStore: () => store, getDeployStore: () => store}));
import pulse, {runCompanyPulse} from "../rigor-company-pulse-background.mjs";
import health from "../rigor-company-health.mjs";

const context = {deploy: {context: "production"}} as Context;
const authorized = () => new Request("https://example.test/.netlify/functions/rigor-company-pulse-background", {
  method: "POST", headers: {"X-RIGOR-Automation-Token": "test-service-token"},
});

beforeEach(() => {
  vi.clearAllMocks();
  records.clear();
  vi.stubGlobal("Netlify", {env: {get: (key: string) => ({RIGOR_DEERFLOW_TOKEN: "test-service-token", RIGOR_DEERFLOW_URL: "https://example-deerflow.test"})[key]}});
});

describe("company pulse durable failure reporting", () => {
  it("propagates the sanitized upstream failure to a Founder command", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(
      JSON.stringify({detail: "private model output"}), {status: String(url).endsWith("/api/rigor/company/pulse") ? 502 : 200}
    )));
    await expect(runCompanyPulse(authorized(), context, "Review release evidence")).rejects.toThrow("UPSTREAM_HTTP_502");
    expect(records.get("pulse/last-attempt")).toMatchObject({status: "FAILED", failure_code: "UPSTREAM_HTTP_502"});
    expect(JSON.stringify(records.get("pulse/last-attempt"))).not.toContain("private model output");
  });
  it("keeps unauthorized invocations out of durable attempt state", async () => {
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    await pulse(new Request("https://example.test", {method: "POST"}), context);
    expect(store.setJSON).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it("persists an upstream 401 and returns degraded health without erasing previous evidence", async () => {
    records.set("pulse/latest", {generated_at: "2026-09-29T15:00:00Z", source: "RIGOR_AI_COMPANY_V1"});
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(
      String(url).endsWith("/api/rigor/company/pulse") ? {detail: "Invalid token"} : {}
    ), {status: String(url).endsWith("/api/rigor/company/pulse") ? 401 : 200})));
    await pulse(authorized(), context);
    expect(records.get("pulse/last-attempt")).toMatchObject({status: "FAILED", failure_code: "UPSTREAM_HTTP_401"});
    expect(records.get("pulse/latest")).toMatchObject({generated_at: "2026-09-29T15:00:00Z"});
    const response = await health(new Request("https://example.test/api/company/health"), context);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({status: "degraded", latest_attempt_failure: "UPSTREAM_HTTP_401", has_latest_pulse: true});
  });

  it("records thrown execution errors as failed without publishing exception details", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).endsWith("/api/rigor/company/pulse")) throw new Error("private diagnostic text");
      return new Response("{}");
    }));
    await pulse(authorized(), context);
    expect(records.get("pulse/last-attempt")).toMatchObject({status: "FAILED", failure_code: "PULSE_EXECUTION_FAILED"});
    expect(JSON.stringify(records.get("pulse/last-attempt"))).not.toContain("private diagnostic text");
  });

  it("does not persist a model-only completion as a successful company cycle", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({current_state: "claimed success", state_updates: []}))));
    await pulse(authorized(), context);
    expect(records.get("pulse/last-attempt")).toMatchObject({status: "FAILED", failure_code: "DELEGATION_NOT_VERIFIED"});
    expect(records.get("pulse/latest")).toBeUndefined();
  });

  it("records completion only after a valid pulse has persisted", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(
      String(url).endsWith("/api/rigor/company/pulse")
        ? {execution_receipts: ["rigor-product-ops", "rigor-engineering", "rigor-qa-security", "rigor-market-intel", "rigor-finance-runway", "rigor-chief-of-staff"].map((agent, index) => ({agent, task_id: `task-${index}`, status: "COMPLETE"})), state_updates: [{record_type: "OBJECTIVE", title: "Release verification"}], action_proposals: [], top_priorities: []}
        : {}
    ))));
    await pulse(authorized(), context);
    expect(records.get("pulse/last-attempt")).toMatchObject({status: "COMPLETE"});
    expect(records.get("pulse/latest")).toMatchObject({source: "RIGOR_AI_COMPANY_V1", durable_state_records: 1});
    const response = await health(new Request("https://example.test/api/company/health"), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({status: "ok", latest_attempt_status: "COMPLETE"});
  });
});
