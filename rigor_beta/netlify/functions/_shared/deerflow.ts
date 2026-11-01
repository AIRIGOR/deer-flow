import { createHash, randomUUID } from "node:crypto";
import { getDeployStore, getStore } from "@netlify/blobs";
import type { Context } from "@netlify/functions";
import { restrictedStaging } from "./staging-policy.js";

export const OPERATING_MOTTO = "Flow like water";
export type DeerFlowOperation = "document_analysis" | "company_pulse" | "company_action" | "john_pm";
const routes = {
  document_analysis: { path: "/api/rigor/analyze", timeout: 10 * 60 * 1000 },
  company_pulse: { path: "/api/rigor/company/pulse", timeout: 13 * 60 * 1000 },
  company_action: { path: "/api/rigor/company/action/execute", timeout: 10 * 60 * 1000 },
  john_pm: { path: "/api/rigor/agents/john/analyze", timeout: 45 * 1000 },
};

function integrationStore(context: Context) {
  return context.deploy.context === "production"
    ? getStore({ name: "rigor-integration", consistency: "strong" })
    : getDeployStore("rigor-integration");
}

export class DeerFlowIntegrationError extends Error {
  constructor(public code: string) {
    super(`DeerFlow integration ${code}. Analysis and readiness remain blocked; retry after the service recovers.`);
  }
}

function companyEvidence(data: any, operation: DeerFlowOperation, payload: Record<string, any>) {
  const p = data.execution_evidence;
  const pulse = operation === "company_pulse";
  const text = (value: unknown, max = 500) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
  const digest = (value: unknown) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
  if (!p || p.source !== "DEERFLOW_CHECKPOINT_LEDGER" || !text(p.thread_id, 200) || !p.thread_id.startsWith(`rigor-company-${pulse ? "pulse" : "action"}-`) || !text(p.checkpoint_id, 200) || !text(p.run_id, 200) || !digest(p.model_output_sha256)
    || !Array.isArray(p.delegations) || p.delegations.length !== (pulse ? 6 : 1)
    || p.delegations.some((d: any) => !d || !text(d.id, 200) || !text(d.agent, 128) || !d.agent.startsWith("rigor-") || d.status !== "completed" || d.stop_reason || !digest(d.result_sha256) || !text(d.result_ref))
    || new Set(p.delegations.map((d: any) => d.id)).size !== p.delegations.length) return null;
  const agents = p.delegations.map((d: any) => d.agent);
  if (pulse && (new Set(agents).size !== 6 || agents.filter((name: string) => name === "rigor-chief-of-staff").length !== 1)) return null;
  if (!pulse && payload.proposal?.owner_agent != null && agents[0] !== payload.proposal.owner_agent) return null;
  const ids = new Set(p.delegations.map((d: any) => d.id));
  const validRefs = (refs: any, min: number) => Array.isArray(refs) && refs.length >= min && refs.length <= 6 && new Set(refs).size === refs.length && refs.every(id => typeof id === "string" && ids.has(id));
  if (pulse && (!Array.isArray(data.findings) || !data.findings.length || data.findings.length > 12 || data.findings.some((item: any) => !item || !text(item.summary, 2000) || !validRefs(item.evidence_ids, 1))
    || !Array.isArray(data.reconciliations) || data.reconciliations.length > 12 || data.reconciliations.some((item: any) => !item || !text(item.topic, 240) || !text(item.assessment, 2000) || !validRefs(item.evidence_ids, 2) || !["UNRESOLVED", "PROPOSED_FOR_REVIEW"].includes(item.status) || item.approval_required !== true))) return null;
  return { source: p.source, thread_id: p.thread_id, checkpoint_id: p.checkpoint_id, run_id: p.run_id, model_output_sha256: p.model_output_sha256,
    delegations: p.delegations.map((d: any) => ({ id: d.id, agent: d.agent, status: d.status, result_sha256: d.result_sha256, result_ref: d.result_ref })) };
}

// RIGOR product and 3NETRA company operations use the same authenticated gateway,
// bounded execution, sanitized failures, and durable execution receipts.
export async function deerFlowRequest(context: Context, operation: DeerFlowOperation, payload: Record<string, unknown>) {
  if (restrictedStaging(context)) throw new DeerFlowIntegrationError("LIVE_EXECUTION_DISABLED");
  const store = integrationStore(context);
  const executionId = randomUUID();
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const requestBody = JSON.stringify(payload);
  const receipt = { execution_id: executionId, operation, started_at: startedAt, engine: "DEERFLOW", deployment_id: context.deploy.id || null, site_id: context.site?.id || null, request_sha256: createHash("sha256").update(requestBody).digest("hex") };
  const save = async (status: string, extra: Record<string, unknown> = {}) => {
    const record = { ...receipt, status, ...extra };
    await store.setJSON(`execution/${executionId}`, record);
    await store.setJSON(`latest/${operation}`, record);
  };
  try { await save("RUNNING"); } catch { throw new DeerFlowIntegrationError("RECEIPT_UNAVAILABLE"); }
  try {
    const baseUrl = Netlify.env.get("RIGOR_DEERFLOW_URL")?.trim();
    const token = Netlify.env.get("RIGOR_DEERFLOW_TOKEN")?.trim();
    if (!baseUrl || !token) throw new DeerFlowIntegrationError("NOT_CONFIGURED");
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}${routes[operation].path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-RIGOR-Service-Token-SHA256": createHash("sha256").update(token, "utf8").digest("hex"), "X-RIGOR-Execution-Id": executionId },
      body: requestBody,
      signal: AbortSignal.timeout(routes[operation].timeout),
    });
    if (!response.ok) throw new DeerFlowIntegrationError(`HTTP_${response.status}`);
    const data = await response.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new DeerFlowIntegrationError("INVALID_RESPONSE");
    if (operation === "document_analysis") {
      const pages = payload.pages as string[];
      const normalized = (value: string) => value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
      if (!Array.isArray(data.requirements) || data.requirements.some((item: any) =>
        !item || typeof item.requirement_text !== "string" || !item.requirement_text.trim() ||
        typeof item.source_excerpt !== "string" || !item.source_excerpt.trim() ||
        !Number.isInteger(item.source_page) || item.source_page < 1 || item.source_page > pages.length ||
        !normalized(pages[item.source_page - 1]).includes(normalized(item.source_excerpt)) ||
        !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1)) {
        throw new DeerFlowIntegrationError("INVALID_SOURCE_PROVENANCE");
      }
    } else if (operation === "john_pm" &&
      (data.agent !== "John" || data.mode !== "MODEL_ADVISORY_ONLY" || data.release_decision !== "HOLD_SHOW" ||
        data.autonomous_show_approval !== false || !Array.isArray(data.actions) || data.actions.length > 20 ||
        data.actions.some((item: any) => !["P0", "P1", "P2"].includes(item.priority) ||
          typeof item.question !== "string" || !Array.isArray(item.evidence_ids) || !item.evidence_ids.length))) {
      throw new DeerFlowIntegrationError("INVALID_PM_RESPONSE");
    } else if (operation === "john_pm") {
      const allowedIds = new Set(((payload.evidence || []) as Array<{ source_id: string }>).map(item => item.source_id));
      allowedIds.add("MISSING_EVIDENCE");
      if (data.actions.some((item: any) => item.evidence_ids.some((id: unknown) =>
        typeof id !== "string" || !allowedIds.has(id)))) {
        throw new DeerFlowIntegrationError("INVALID_PM_SOURCE_CITATION");
      }
    } else if (operation === "company_pulse" &&
      (typeof data.current_state !== "string" || !Array.isArray(data.top_priorities) || !Array.isArray(data.state_updates))) {
      throw new DeerFlowIntegrationError("INVALID_RESPONSE");
    }
    if (operation === "company_action" && (data.status !== "COMPLETE" || typeof data.result_summary !== "string" || !data.result_summary.trim())) throw new DeerFlowIntegrationError("INVALID_RESPONSE");
    const delegationEvidence = ["company_pulse", "company_action"].includes(operation) ? companyEvidence(data, operation, payload) : null;
    if (["company_pulse", "company_action"].includes(operation) && !delegationEvidence) throw new DeerFlowIntegrationError("INVALID_COMPANY_EVIDENCE");
    const responseBody = JSON.stringify(data);
    await save("VERIFIED", { completed_at: new Date().toISOString(), duration_ms: Date.now() - started,
      response_sha256: createHash("sha256").update(responseBody).digest("hex"),
      verification_scope: delegationEvidence ? "CHECKPOINT_DELEGATION_COMPLETION" : operation === "document_analysis" ? "SOURCE_CITATION_PRESENCE" : "ADVISORY_SOURCE_IDS",
      ...(delegationEvidence ? { delegation_evidence: delegationEvidence } : {}),
      ...(operation === "document_analysis" ? { pages_submitted: (payload.pages as string[]).length, requirements_returned: data.requirements.length } : {}) });
    return new Response(responseBody, { headers: { "Content-Type": "application/json", "X-RIGOR-Execution-Id": executionId } });
  } catch (error) {
    const code = error instanceof DeerFlowIntegrationError ? error.code
      : error instanceof Error && error.name === "TimeoutError" ? "TIMEOUT" : "UNAVAILABLE";
    try { await save("FAILED", { completed_at: new Date().toISOString(), duration_ms: Date.now() - started, error_code: code }); }
    catch { throw new DeerFlowIntegrationError("RECEIPT_UNAVAILABLE"); }
    throw new DeerFlowIntegrationError(code);
  }
}

export async function integrationHealth(context: Context) {
  const store = integrationStore(context);
  const operations = Object.keys(routes) as DeerFlowOperation[];
  const receipts = await Promise.all(operations.map(operation => store.get(`latest/${operation}`, { type: "json" })));
  return { motto: OPERATING_MOTTO, components: { product: "RIGOR", runtime: "DEERFLOW", company_operator: "3NETRA" },
    configured: Boolean(Netlify.env.get("RIGOR_DEERFLOW_URL")?.trim() && Netlify.env.get("RIGOR_DEERFLOW_TOKEN")?.trim()),
    operations: Object.fromEntries(operations.map((operation, index) => [operation, receipts[index] || { status: "UNVERIFIED" }])) };
}

export function coherentFlowCheck(integration: Awaited<ReturnType<typeof integrationHealth>>, deployId: string) {
  const analysis = integration.operations.document_analysis;
  const pulse = integration.operations.company_pulse;
  if (analysis?.status !== "VERIFIED" || pulse?.status !== "VERIFIED") return null;
  if (!deployId || analysis.deployment_id !== deployId || pulse.deployment_id !== deployId || pulse.verification_scope !== "CHECKPOINT_DELEGATION_COMPLETION"
    || typeof analysis.execution_id !== "string" || !analysis.execution_id.trim() || typeof pulse.execution_id !== "string" || !pulse.execution_id.trim()) return null;
  return {
    action_type: "INTERNAL_TEST" as const,
    scope: "OBSERVE" as const,
    title: `Verify coherent RIGOR, DeerFlow and 3NETRA execution for ${deployId}`,
    summary: "Review the supplied completed execution receipts. Report what is proven and any missing proof. This is an internal evidence review; do not send messages, spend, change code, deploy, change credentials, or perform external actions. No additional research is required.",
    owner_agent: "rigor-qa-security",
    target: `deployment:${deployId}`,
    reversible: true,
    evidence_refs: [analysis.execution_id, pulse.execution_id],
    payload: { motto: OPERATING_MOTTO, document_analysis: analysis, company_pulse: pulse },
  };
}

// Keep action context within the backend 20,000-character limit.
export function companyActionContext(actionKey: string, latest: unknown) {
  return JSON.stringify({ action_key: actionKey, latest_company_pulse_excerpt: JSON.stringify(latest ?? null).slice(0, 8000) });
}
