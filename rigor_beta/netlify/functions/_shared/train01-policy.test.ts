import { beforeEach, expect, it, vi } from "vitest";
import type { Context } from "@netlify/functions";
import founder from "../rigor-founder.mjs";
import schedule from "../rigor-company-schedule.mjs";
import pulse from "../rigor-company-pulse-background.mjs";
import action from "../rigor-company-action-runner-background.mjs";
import outreach from "../rigor-approved-outreach.mjs";
import { deerFlowRequest } from "./deerflow.js";

const { records } = vi.hoisted(() => ({ records: new Map<string, any>() }));
vi.mock("@netlify/blobs", () => {
  const store = () => ({
    get: async (key: string) => records.has(key) ? structuredClone(records.get(key)) : null,
    getWithMetadata: async (key: string) => records.has(key) ? { data: structuredClone(records.get(key)), etag: JSON.stringify(records.get(key)) } : null,
    setJSON: async (key: string, value: any, options: any = {}) => {
      if ((options.onlyIfNew && records.has(key)) || (options.onlyIfMatch && JSON.stringify(records.get(key)) !== options.onlyIfMatch)) return { modified: false };
      records.set(key, structuredClone(value)); return { modified: true, etag: JSON.stringify(value) };
    },
  });
  return { getStore: store, getDeployStore: store };
});
const staging = { site: { id: "96331e39-86a9-45a3-910c-edd321d60bb7" }, deploy: { context: "production", id: "synthetic-deploy" } } as Context;
const request = (mode = "LOCAL_DRY_RUN") => new Request("https://rigor-staging.netlify.app/api/founder/commands", { method: "POST", headers: { "X-RIGOR-Founder-Token": "synthetic-founder", "Idempotency-Key": "55555555-5555-4555-8555-555555555555" }, body: JSON.stringify({ command: "Review synthetic evidence", mode, intent: "REVIEW_EVIDENCE", evidence: [{ source_id: "fixture", text: "Synthetic only" }] }) });
beforeEach(() => {
  records.clear(); vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("Netlify", { env: { get: (key: string) => ({ RIGOR_FOUNDER_TOKEN: "synthetic-founder", RIGOR_STAGING_DRY_RUN_ENABLED: "true", RIGOR_DEERFLOW_TOKEN: "synthetic-service", RIGOR_DEERFLOW_URL: "https://invalid.test" } as any)[key] } });
});
it("completes only explicit staging simulation and preserves correlated receipt", async () => {
  const response = await founder(request(), staging);
  expect(response.status).toBe(200);
  const record = await response.json();
  expect(record.status).toBe("DRY_RUN_COMPLETE");
  expect(records.get(`dry-run-receipts/${record.execution_id}`).command_id).toBe(record.command_id);
  expect(record.authentication.production_authority_verified).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});
it.each(["INTERNAL_RESEARCH", "RUN_COMPANY_PULSE"])("blocks hosted live Founder mode %s", async mode => {
  expect((await founder(request(mode), staging)).status).toBe(403);
  expect(records.size).toBe(0); expect(fetch).not.toHaveBeenCalled();
});
it("denies unknown sites, missing simulation flag and missing token", async () => {
  expect((await founder(request(), { ...staging, site: { id: "unknown" } } as Context)).status).toBe(403);
  vi.stubGlobal("Netlify", { env: { get: (key: string) => key === "RIGOR_FOUNDER_TOKEN" ? "synthetic-founder" : undefined } });
  expect((await founder(request(), staging)).status).toBe(403);
  expect((await founder(new Request(request().url, { method: "POST", body: "{}" }), staging)).status).toBe(401);
});
it("blocks the staging gateway before any live fetch or receipt write", async () => {
  await expect(deerFlowRequest(staging, "company_pulse", {})).rejects.toThrow("LIVE_EXECUTION_DISABLED");
  expect(fetch).not.toHaveBeenCalled(); expect(records.size).toBe(0);
});
it("disables staging schedules, pulse/action workers and external outreach", async () => {
  const req = new Request("https://rigor-staging.netlify.app/worker", { method: "POST", headers: { "X-RIGOR-Automation-Token": "synthetic-service" } });
  await schedule(req, staging); await pulse(req, staging); await action(req, staging); await outreach(new Request(req.url), staging);
  expect(fetch).not.toHaveBeenCalled(); expect(records.size).toBe(0);
});
