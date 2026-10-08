import type { Context } from "@netlify/functions";
import { authorized, companyStore, type FounderCommand } from "./_shared/founder.js";
import { companyActionContext, deerFlowRequest } from "./_shared/deerflow.js";
export default async (request: Request, context: Context) => {
  if (request.method !== "POST" || authorized(request, "RIGOR_DEERFLOW_TOKEN", "X-RIGOR-Automation-Token") !== "AUTHORIZED") return;
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^[a-f0-9-]{36}$/.test(id)) return;
  const store = companyStore(context), key = `commands/${id}`;
  const saved = await store.getWithMetadata(key, { type: "json" });
  const record = saved?.data as FounderCommand | null;
  if (!record || record.status !== "QUEUED" || !saved?.etag) return;
  const running: FounderCommand = { ...record, status: "RUNNING", updated_at: new Date().toISOString() };
  const claim = await store.setJSON(key, running, { onlyIfMatch: saved.etag });
  if (!claim.modified) return;
  try {
    const latest = await store.get("pulse/latest", { type: "json" });
    const pulse = record.mode === "RUN_COMPANY_PULSE";
    const response = await deerFlowRequest(context, pulse ? "company_pulse" : "company_action", pulse
      ? { objective: record.command, context: companyActionContext(id, latest) }
      : { proposal: record.proposal, context: companyActionContext(id, latest) });
    const result = await response.json();
    await store.setJSON(key, { ...running, status: "COMPLETE", updated_at: new Date().toISOString(), result, execution_id: response.headers.get("X-RIGOR-Execution-Id") });
  } catch {
    await store.setJSON(key, { ...running, status: "FAILED", updated_at: new Date().toISOString(), error_code: "EXECUTION_FAILED" });
  }
};
