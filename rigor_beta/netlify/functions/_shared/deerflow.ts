import { randomUUID } from "node:crypto";
import { getDeployStore, getStore } from "@netlify/blobs";
import type { Context } from "@netlify/functions";

export const OPERATING_MOTTO = "Flow like water";
export type DeerFlowOperation = "document_analysis" | "company_pulse" | "company_action";
const routes = {
  document_analysis: { path: "/api/rigor/analyze", timeout: 10 * 60 * 1000 },
  company_pulse: { path: "/api/rigor/company/pulse", timeout: 13 * 60 * 1000 },
  company_action: { path: "/api/rigor/company/action/execute", timeout: 10 * 60 * 1000 },
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

// RIGOR product and 3NETRA company operations use the same authenticated gateway,
// bounded execution, sanitized failures, and durable execution receipts.
export async function deerFlowRequest(context: Context, operation: DeerFlowOperation, payload: Record<string, unknown>) {
  const store = integrationStore(context);
  const executionId = randomUUID();
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const receipt = { execution_id: executionId, operation, started_at: startedAt, engine: "DEERFLOW" };
  const save = async (status: string, extra: Record<string, unknown> = {}) => {
    const record = { ...receipt, status, ...extra };
    await store.setJSON(`execution/${executionId}`, record);
    await store.setJSON(`latest/${operation}`, record);
  };
  await save("RUNNING");
  try {
    const baseUrl = Netlify.env.get("RIGOR_DEERFLOW_URL")?.trim();
    const token = Netlify.env.get("RIGOR_DEERFLOW_TOKEN")?.trim();
    if (!baseUrl || !token) throw new DeerFlowIntegrationError("NOT_CONFIGURED");
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}${routes[operation].path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-RIGOR-Service-Token": token, "X-RIGOR-Execution-Id": executionId },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(routes[operation].timeout),
    });
    if (!response.ok) throw new DeerFlowIntegrationError(`HTTP_${response.status}`);
    const data = await response.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new DeerFlowIntegrationError("INVALID_RESPONSE");
    if (operation === "document_analysis") {
      const pages = payload.pages as string[];
      if (!Array.isArray(data.requirements) || data.requirements.some((item: any) =>
        !item || typeof item.requirement_text !== "string" || !item.requirement_text.trim() ||
        typeof item.source_excerpt !== "string" || !item.source_excerpt.trim() ||
        !Number.isInteger(item.source_page) || item.source_page < 1 || item.source_page > pages.length ||
        !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1)) {
        throw new DeerFlowIntegrationError("INVALID_SOURCE_PROVENANCE");
      }
    } else if (operation === "company_pulse" &&
      (typeof data.current_state !== "string" || !Array.isArray(data.top_priorities) || !Array.isArray(data.state_updates))) {
      throw new DeerFlowIntegrationError("INVALID_RESPONSE");
    }
    if (operation === "company_action" && (data.status !== "COMPLETE" || typeof data.result_summary !== "string" || !data.result_summary.trim())) throw new DeerFlowIntegrationError("INVALID_RESPONSE");
    await save("VERIFIED", { completed_at: new Date().toISOString(), duration_ms: Date.now() - started,
      ...(operation === "document_analysis" ? { pages_submitted: (payload.pages as string[]).length, requirements_returned: data.requirements.length } : {}) });
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", "X-RIGOR-Execution-Id": executionId } });
  } catch (error) {
    const code = error instanceof DeerFlowIntegrationError ? error.code
      : error instanceof Error && error.name === "TimeoutError" ? "TIMEOUT" : "UNAVAILABLE";
    await save("FAILED", { completed_at: new Date().toISOString(), duration_ms: Date.now() - started, error_code: code });
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
