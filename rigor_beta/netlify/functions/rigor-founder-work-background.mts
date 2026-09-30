import type { Context } from "@netlify/functions";
import { authorized, commandStore } from "./_shared/company-command.js";
import { proofArtifact, requireReceipts, verifyArtifact } from "./_shared/company-proof.js";

export default async (request: Request, context: Context) => {
  if (request.method !== "POST" || !authorized(request)) return;
  const { command_id: id } = await request.json();
  if (!/^[0-9a-f-]{36}$/.test(String(id))) return;
  const store = commandStore(context);
  let record: any = await store.get(`commands/${id}`, { type: "json" });
  if (!record || record.status !== "QUEUED") return;
  const save = async (update: Record<string, unknown>) => { record = { ...record, ...update, updated_at: new Date().toISOString() }; await store.setJSON(`commands/${id}`, record); };
  await save({ status: "ACTIVE" });
  try {
    const base = Netlify.env.get("RIGOR_DEERFLOW_URL")?.replace(/\/$/, "");
    const token = Netlify.env.get("RIGOR_DEERFLOW_TOKEN");
    if (!base || !token) throw new Error("Hosted DeerFlow wiring missing");
    const checks = [];
    let receiptSupport = false;
    for (const url of ["https://rigor-beta.netlify.app/api/health", `${base}/health`]) {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      const body = await response.json();
      if (url === `${base}/health`) receiptSupport = body.company_execution_receipts === "v1";
      checks.push({ url, status: response.status, healthy: response.ok && ["healthy", "ok"].includes(body.status) });
    }
    await save({ independent_checks: checks });
    if (checks.some(check => !check.healthy)) throw new Error("Independent public health check failed");
    if (!receiptSupport) throw new Error("Company runtime must be updated: execution receipt support missing");
    const expected = proofArtifact(checks);
    const invoke = async (path: string, body: unknown) => {
      const response = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", "X-RIGOR-Service-Token": token }, body: JSON.stringify(body), signal: AbortSignal.timeout(6 * 60 * 1000) });
      if (!response.ok) throw new Error(`Company runtime HTTP ${response.status}`);
      return response.json();
    };
    const pulse = await invoke("/api/rigor/company/pulse", { objective: record.objective, context: `Only the following independently captured facts are established. Prior company memory, revenue, biographies, partners and test results are unverified. Evidence: ${expected.evidence}. Do not initiate unrelated work. Source: ${expected.reference}` });
    await save({ status: "VERIFYING_DELEGATION", pulse, pulse_is_unverified_advisory: true });
    requireReceipts(pulse.delegation_receipts, "pulse");
    await save({ status: "EXECUTING" });
    const action = await invoke("/api/rigor/company/action/execute", { proposal: { action_type: "INTERNAL_DOCUMENT", scope: "INTERNAL_EXECUTE", title: `Public health evidence artifact ${id}`, owner_agent: "rigor-qa-security", reversible: true, evidence_refs: [expected.reference], payload: { required_artifact: expected.markdown } }, context: `Produce artifact_markdown EXACTLY equal to this verified text, without additions or invented facts: ${JSON.stringify(expected.markdown)}. Return evidence_refs including ${expected.reference}. Delegate exactly one task to rigor-qa-security.` });
    await save({ status: "VERIFYING_ARTIFACT", action_result: action });
    verifyArtifact(action, expected);
    const artifactKey = `artifacts/${id}.md`;
    await store.set(artifactKey, action.artifact_markdown);
    if (await store.get(artifactKey, { type: "text" }) !== expected.markdown) throw new Error("Durable artifact read-back failed");
    await save({ status: "COMPLETE", completed_at: new Date().toISOString(), artifact_ref: artifactKey, evidence_ref: expected.reference, founder_report: "Public health checks passed. Five specialist reviews, Chief of Staff synthesis, and the QA/Security evidence artifact have runtime receipts. The artifact matches independently captured facts and was saved and read back. Product release readiness remains outside this command's scope." });
  } catch (error) {
    await save({ status: "FAILED", failure: error instanceof Error ? error.message : "Company command failed" });
  }
};
