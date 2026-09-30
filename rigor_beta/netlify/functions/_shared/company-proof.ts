import { createHash } from "node:crypto";

const specialists = new Set(["rigor-product-ops", "rigor-engineering", "rigor-qa-security", "rigor-market-intel", "rigor-partnerships-capital", "rigor-growth-revenue", "rigor-customer-success", "rigor-finance-runway"]);
export function requireReceipts(value: unknown, mode: "pulse" | "action") {
  if (!Array.isArray(value)) throw new Error("Runtime delegation evidence missing");
  const valid = value.every(item => item && item.status === "completed" && typeof item.call_id === "string" && /^[0-9a-f]{64}$/.test(item.result_sha256));
  if (!valid || new Set(value.map(item => item.call_id)).size !== value.length) throw new Error("Invalid runtime delegation evidence");
  if (mode === "pulse" && (value.length !== 6 || new Set(value.slice(0, 5).map(item => item.agent)).size !== 5 || !value.slice(0, 5).every(item => specialists.has(item.agent)) || value[5].agent !== "rigor-chief-of-staff")) throw new Error("Incomplete company delegation sequence");
  if (mode === "action" && (value.length !== 1 || value[0].agent !== "rigor-qa-security")) throw new Error("Evidence artifact was not delegated to QA/Security");
  return value;
}

export function proofArtifact(checks: Array<{ url: string; status: number; healthy: boolean }>) {
  const evidence = JSON.stringify(checks);
  const reference = `evidence://sha256/${createHash("sha256").update(evidence).digest("hex")}`;
  const markdown = "# RIGOR public health verification\n\n" + checks.map(check => `- ${check.url}: HTTP ${check.status}; healthy=${check.healthy}`).join("\n") + `\n\nSource: ${reference}\n\nScope: public health only. Tests, security audits, PDFs, production readiness, customers, revenue, and team credentials were not verified by this command.\n`;
  return { evidence, reference, markdown };
}

export function verifyArtifact(result: any, expected: ReturnType<typeof proofArtifact>) {
  requireReceipts(result?.delegation_receipts, "action");
  if (result?.status !== "COMPLETE" || result.artifact_markdown !== expected.markdown || !Array.isArray(result.evidence_refs) || !result.evidence_refs.includes(expected.reference)) throw new Error("Artifact failed independent evidence verification");
}

export function queueCounts(actions: Array<{ status?: string }> | null, fallback?: Partial<Record<string, number>>) {
  if (!Array.isArray(actions)) return { total: 0, approved: 0, needs_founder_approval: 0, executing: 0, complete: 0, ...fallback };
  return { total: actions.length, approved: actions.filter(item => item.status === "APPROVED").length, needs_founder_approval: actions.filter(item => item.status === "NEEDS_APPROVAL").length, executing: actions.filter(item => item.status === "EXECUTING").length, complete: actions.filter(item => item.status === "COMPLETE").length };
}
