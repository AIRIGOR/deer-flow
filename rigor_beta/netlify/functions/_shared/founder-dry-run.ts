import { createHash } from "node:crypto";
import type { Context } from "@netlify/functions";
import type { getStore } from "@netlify/blobs";
import type { FounderCommand } from "./founder.js";
import { stagingSimulationEnabled } from "./staging-policy.js";

export const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const localSimulationContext = (context: Context) => context.deploy.context === "dev" || stagingSimulationEnabled(context);
export type DryRunPlan = {
  intent: string;
  specialist: "rigor-qa-security";
  scope: "LOCAL_SIMULATION";
  authority_check: "LOCAL_SIMULATION_ONLY" | "BLOCKED";
  evidence: Array<{ source_id: string; text_sha256: string }>;
  steps: string[];
};

export function prepareDryRun(body: Record<string, any>, command: string) {
  if (typeof body.intent !== "string" || !body.intent.trim() || body.intent.length > 80
    || !Array.isArray(body.evidence) || body.evidence.length < 1 || body.evidence.length > 6
    || body.evidence.some((e: any) => !e || typeof e.source_id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(e.source_id)
      || typeof e.text !== "string" || !e.text.trim() || e.text.length > 2000)
    || new Set(body.evidence.map((e: any) => e.source_id)).size !== body.evidence.length) {
    throw new Error("Explicit intent and 1–6 distinct bounded evidence sources are required");
  }
  const evidence = body.evidence.map((e: any) => ({ source_id: e.source_id as string, text: e.text as string }));
  const intent = body.intent.trim();
  const plan: DryRunPlan = {
    intent, specialist: "rigor-qa-security", scope: "LOCAL_SIMULATION",
    authority_check: intent === "REVIEW_EVIDENCE" ? "LOCAL_SIMULATION_ONLY" : "BLOCKED",
    evidence: evidence.map(e => ({ source_id: e.source_id, text_sha256: digest(e.text) })),
    steps: ["Validate internal token capability", "Validate bounded intent/evidence", "Check simulation-only authority", "Simulate existing QA handoff without tools", "Persist correlated dry-run receipt"],
  };
  return { plan, request_sha256: digest({ command, mode: "LOCAL_DRY_RUN", intent, evidence }) };
}

export function validSimulationAuthority(record: FounderCommand) {
  return record.authentication?.mechanism === "FOUNDER_TOKEN"
    && record.authentication.capability === "LOCAL_SIMULATION_ONLY"
    && record.authentication.human_identity_verified === false
    && record.authentication.production_authority_verified === false
    && record.plan?.intent === "REVIEW_EVIDENCE"
    && record.plan.authority_check === "LOCAL_SIMULATION_ONLY"
    && record.plan.scope === "LOCAL_SIMULATION"
    && record.plan.specialist === "rigor-qa-security"
    && Array.isArray(record.plan.evidence) && record.plan.evidence.length > 0
    && /^[a-f0-9]{64}$/.test(record.request_sha256 || "");
}

export async function persistSimulatedHandoff(store: ReturnType<typeof getStore>, record: FounderCommand) {
  if (!validSimulationAuthority(record)) throw new Error("Unverified simulation authority");
  const result = {
    mode: "LOCAL_DRY_RUN", real_agent_executed: false, production_action_executed: false,
    result_summary: "Dry run complete: QA handoff simulated; no real agent or production action executed.",
    delegation: { agent: record.plan!.specialist, status: "SIMULATED", evidence_ids: record.plan!.evidence.map(e => e.source_id) },
    human_review_required: true,
  };
  const receipt = {
    command_id: record.command_id, execution_id: record.command_id, status: "DRY_RUN_COMPLETE",
    source: "LOCAL_SIMULATION", verification_scope: "LOCAL_SIMULATED_HANDOFF",
    request_sha256: record.request_sha256, response_sha256: digest(result), plan_sha256: digest(record.plan),
    real_agent_executed: false, production_action_executed: false, created_at: new Date().toISOString(),
  };
  const written = await store.setJSON(`dry-run-receipts/${record.command_id}`, receipt, { onlyIfNew: true });
  if (!written.modified) throw new Error("Dry-run receipt already exists; review execution before retrying");
  return result;
}
