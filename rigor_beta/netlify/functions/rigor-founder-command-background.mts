import type { Context } from "@netlify/functions";
import { authorized, companyStore, type FounderCommand } from "./_shared/founder.js";
import { companyActionContext, deerFlowRequest } from "./_shared/deerflow.js";
import { localSimulationContext, persistSimulatedHandoff, validSimulationAuthority } from "./_shared/founder-dry-run.js";
import { hostedFounderBlocked } from "./_shared/staging-policy.js";
// Beyond both gateway budgets (10/13 minutes). Age means uncertainty, not failure.
const INTERRUPTED_REVIEW_AFTER_MS = 30 * 60 * 1000;
// Trusted internal entry; both HTTP callers authenticate before invoking it.
export async function processFounderCommand(context: Context, id: string) {
  const store = companyStore(context), key = `commands/${id}`;
  const saved = await store.getWithMetadata(key, { type: "json", consistency: "strong" });
  const record = saved?.data as FounderCommand | null;
  if (!record || !saved?.etag) return;
  if (record.mode !== "LOCAL_DRY_RUN" && hostedFounderBlocked(context) && ["QUEUED", "RUNNING"].includes(record.status)) {
    await store.setJSON(key, { ...record, status: "BLOCKED", updated_at: new Date().toISOString(), error_code: "LIVE_EXECUTION_DISABLED" }, { onlyIfMatch: saved.etag });
    return;
  }
  if (record.mode === "LOCAL_DRY_RUN" && ["QUEUED", "RUNNING"].includes(record.status)
    && (!localSimulationContext(context) || !validSimulationAuthority(record))) {
    await store.setJSON(key, { ...record, status: "BLOCKED", updated_at: new Date().toISOString(), error_code: "AUTHORITY_NOT_VERIFIED" }, { onlyIfMatch: saved.etag });
    return;
  }
  if (record.status === "RUNNING") {
    const updatedAt = Date.parse(record.updated_at);
    if (Number.isFinite(updatedAt) && Date.now() - updatedAt >= INTERRUPTED_REVIEW_AFTER_MS) {
      await store.setJSON(key, { ...record, status: "BLOCKED", updated_at: new Date().toISOString(), error_code: "INTERRUPTED_REVIEW_REQUIRED" }, { onlyIfMatch: saved.etag });
    }
    // Never reclaim/replay an invocation whose execution outcome is unknown.
    return;
  }
  if (record.status !== "QUEUED") return;
  const running: FounderCommand = { ...record, status: "RUNNING", updated_at: new Date().toISOString() };
  const claim = await store.setJSON(key, running, { onlyIfMatch: saved.etag });
  if (!claim.modified || !claim.etag) return;
  try {
    if (record.mode === "LOCAL_DRY_RUN") {
      const result = await persistSimulatedHandoff(store, running);
      await store.setJSON(key, { ...running, status: "DRY_RUN_COMPLETE", updated_at: new Date().toISOString(), result, execution_id: record.command_id }, { onlyIfMatch: claim.etag });
      return;
    }
    const latest = await store.get("pulse/latest", { type: "json" });
    const pulse = record.mode === "RUN_COMPANY_PULSE";
    const response = await deerFlowRequest(context, pulse ? "company_pulse" : "company_action", pulse
      ? { objective: record.command, context: companyActionContext(id, latest) }
      : { proposal: record.proposal, context: companyActionContext(id, latest) });
    const result = await response.json();
    await store.setJSON(key, { ...running, status: "COMPLETE", updated_at: new Date().toISOString(), result, execution_id: response.headers.get("X-RIGOR-Execution-Id") }, { onlyIfMatch: claim.etag });
  } catch {
    await store.setJSON(key, { ...running, status: "FAILED", updated_at: new Date().toISOString(), error_code: record.mode === "LOCAL_DRY_RUN" ? "DRY_RUN_EXECUTION_FAILED" : "EXECUTION_FAILED" }, { onlyIfMatch: claim.etag });
  }
}
export default async (request: Request, context: Context) => {
  if (request.method !== "POST" || authorized(request, "RIGOR_DEERFLOW_TOKEN", "X-RIGOR-Automation-Token") !== "AUTHORIZED") return;
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^[a-f0-9-]{36}$/.test(id)) return;
  await processFounderCommand(context, id);
};
