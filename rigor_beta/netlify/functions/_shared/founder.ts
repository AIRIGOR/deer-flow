import { timingSafeEqual } from "node:crypto";
import { getDeployStore, getStore } from "@netlify/blobs";
import type { Context } from "@netlify/functions";
export type FounderCommand = {
  command_id: string; command: string; mode: "INTERNAL_RESEARCH" | "RUN_COMPANY_PULSE";
  status: "QUEUED" | "RUNNING" | "COMPLETE" | "FAILED";
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
