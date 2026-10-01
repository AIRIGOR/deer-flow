import { timingSafeEqual } from "node:crypto";
import {companyStore} from "./company-store.js";
import type { Context } from "@netlify/functions";

export type CommandKind = "RELEASE_REVIEW" | "MOAT_REVIEW" | "COMPANY_REVIEW" | "RUN_COMPANY_PULSE";
export type FounderCommand = {
  command_id: string;
  kind: CommandKind;
  objective: string;
  issued_by: string;
  request_hash: string;
  status: "QUEUED" | "RUNNING" | "COMPLETE" | "FAILED";
  created_at: string;
  started_at?: string;
  completed_at?: string;
  owner_agent: string;
  failure_code?: string;
  result?: Record<string, unknown>;
  execution_receipt?: Record<string, unknown>;
};

export function commandOwners(): Record<CommandKind, string> {
  return {RELEASE_REVIEW: "rigor-qa-security", MOAT_REVIEW: "rigor-product-ops", COMPANY_REVIEW: "rigor-chief-of-staff", RUN_COMPANY_PULSE: "rigor-chief-of-staff"};
}

export function validCommandId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function serviceAuthorized(request: Request) {
  const expected = Netlify.env.get("RIGOR_DEERFLOW_TOKEN")?.trim() || "";
  const provided = request.headers.get("x-rigor-automation-token")?.trim() || "";
  const a = Buffer.from(expected), b = Buffer.from(provided);
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

export const founderStore = companyStore;

export function commandView(command: FounderCommand, time = Date.now()) {
  return {...command, request_hash: undefined,
    status: ["RUNNING", "QUEUED"].includes(command.status) && time - Date.parse(command.started_at || command.created_at) > 15 * 60 * 1000
      ? "TIMED_OUT" : command.status};
}

export function founderJson(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {status, headers: {
    "Content-Type": "application/json", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY",
  }});
}

export function delegationVerified(result: Record<string, unknown>, owner?: string, pulse = false) {
  const receipts = result.execution_receipts;
  if (!Array.isArray(receipts)) return false;
  const valid = receipts.every((item) => item?.status === "COMPLETE"
    && typeof item.task_id === "string" && item.task_id.length > 0
    && typeof item.agent === "string");
  if (!valid || new Set(receipts.map((item) => item.task_id)).size !== receipts.length) return false;
  if (pulse) return receipts.length === 6 && new Set(receipts.map((item) => item.agent)).size === 6
    && receipts.filter((item) => item.agent === "rigor-chief-of-staff").length === 1;
  return receipts.length === 1 && (!owner || receipts[0].agent === owner);
}

// The deployed company runtime records uncapped, completed task-tool results
// using call IDs and SHA-256 digests. Normalize that authenticated wire format
// without accepting missing, failed or model-only completion evidence.
export function normalizeExecutionResult(result: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(result.execution_receipts)) return result;
  const legacy = result.delegation_receipts;
  const receipts = Array.isArray(legacy) && legacy.every((item) => item?.status === "completed"
    && typeof item.call_id === "string" && item.call_id.length > 0
    && typeof item.agent === "string" && typeof item.result_sha256 === "string"
    && /^[0-9a-f]{64}$/.test(item.result_sha256))
    ? legacy.map((item) => ({task_id: item.call_id, agent: item.agent, status: "COMPLETE", result_sha256: item.result_sha256})) : [];
  return {...result, execution_receipts: receipts};
}
