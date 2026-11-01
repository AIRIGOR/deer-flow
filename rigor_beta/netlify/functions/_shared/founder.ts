import { timingSafeEqual } from "node:crypto";
import { getDeployStore, getStore } from "@netlify/blobs";
import type { Context } from "@netlify/functions";
import type { DryRunPlan } from "./founder-dry-run.js";
export type FounderCommand = {
  command_id: string; command: string; mode: "INTERNAL_RESEARCH" | "RUN_COMPANY_PULSE" | "LOCAL_DRY_RUN";
  status: "QUEUED" | "RUNNING" | "COMPLETE" | "FAILED" | "BLOCKED" | "DRY_RUN_COMPLETE";
  request_sha256?: string;
  plan?: DryRunPlan;
  authentication?: { mechanism: "FOUNDER_TOKEN"; capability: "LOCAL_SIMULATION_ONLY"; human_identity_verified: false; production_authority_verified: false };
  created_at: string; updated_at: string; execution_id?: string | null; result?: unknown; error_code?: string;
  proposal: { action_type: "INTERNAL_RESEARCH"; scope: "INTERNAL_EXECUTE"; title: string; summary: string; reversible: true };
};
export function companyStore(context: Context) {
  return context.deploy.context === "production" ? getStore({ name: "rigor-company", consistency: "strong" }) : getDeployStore("rigor-company");
}
export function authorized(request: Request, environmentKey: string, header: string) {
  const expected = Netlify.env.get(environmentKey)?.trim();
  if (!expected) return "NOT_CONFIGURED";
  const supplied = request.headers.get(header)?.trim() || "";
  const left = Buffer.from(supplied), right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right) ? "AUTHORIZED" : "UNAUTHORIZED";
}
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
