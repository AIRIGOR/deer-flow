import { describe, expect, it } from "vitest";
import { proofArtifact, queueCounts, requireReceipts, verifyArtifact } from "./company-proof.js";
const receipt = (agent: string, call_id: string) => ({ agent, call_id, status: "completed", result_sha256: "a".repeat(64) });
describe("independent company proof", () => {
  it("does not resurrect approved actions from stale pulse counts", () => {
    expect(queueCounts([{ status: "COMPLETE" }], { approved: 2 })).toMatchObject({ approved: 0, complete: 1 });
    expect(queueCounts([], { complete: 2 })).toMatchObject({ complete: 0, total: 0 });
    expect(queueCounts(null)).toMatchObject({ complete: 0, total: 0, approved: 0 });
  });
  it("requires actual five specialist receipts and Chief of Staff", () => {
    expect(() => requireReceipts(undefined, "pulse")).toThrow();
    const agents = ["rigor-product-ops", "rigor-engineering", "rigor-qa-security", "rigor-market-intel", "rigor-partnerships-capital", "rigor-chief-of-staff"];
    expect(requireReceipts(agents.map((agent, index) => receipt(agent, String(index))), "pulse")).toHaveLength(6);
    expect(() => requireReceipts(agents.slice(1).map((agent, index) => receipt(agent, String(index))), "pulse")).toThrow();
  });
  it("rejects invented facts and absent artifacts even when model says COMPLETE", () => {
    const expected = proofArtifact([{ url: "https://rigor-beta.netlify.app/api/health", status: 200, healthy: true }]);
    const valid = { status: "COMPLETE", artifact_markdown: expected.markdown, evidence_refs: [expected.reference], delegation_receipts: [receipt("rigor-qa-security", "qa")] };
    expect(() => verifyArtifact(valid, expected)).not.toThrow();
    expect(() => verifyArtifact({ ...valid, artifact_markdown: `${expected.markdown}\nRevenue: $1.2M` }, expected)).toThrow();
    expect(() => verifyArtifact({ ...valid, artifact_markdown: null }, expected)).toThrow();
    expect(() => verifyArtifact({ ...valid, delegation_receipts: [] }, expected)).toThrow();
  });
});
