import { describe, expect, it } from "vitest";
import {
  createMission,
  decideApproval,
  mergeApprovals,
  reviewMission,
  selectNextMission,
  setMissionActive,
  updateMission,
  type CompanyApproval,
  type CompanyMission,
} from "./company.js";

const t = "2026-09-24T12:00:00.000Z";

describe("RIGOR company control helpers", () => {
  it("prioritizes an active mission, then highest-priority queued mission", () => {
    const missions: CompanyMission[] = [
      createMission({ title: "Medium", objective: "Do the medium mission", priority: "MEDIUM" }, "m1", t),
      createMission({ title: "Critical", objective: "Do the critical mission", priority: "CRITICAL" }, "m2", t),
    ];
    expect(selectNextMission(missions)?.mission_id).toBe("m2");
    const active = setMissionActive(missions, "m1", t);
    expect(selectNextMission(active)?.mission_id).toBe("m1");
  });

  it("moves reviewed missions into approval state when founder authority is needed", () => {
    const missions = [
      createMission({ title: "Launch", objective: "Prepare the company launch" }, "m1", t),
    ];
    const reviewed = reviewMission(missions, "m1", t, "Contract approval required.", true);
    expect(reviewed[0].status).toBe("NEEDS_APPROVAL");
    expect(reviewed[0].last_summary).toContain("Contract approval");
  });

  it("updates mission fields without permitting invalid state", () => {
    const missions = [
      createMission({ title: "Pipeline", objective: "Build qualified production pipeline" }, "m1", t),
    ];
    const next = updateMission(missions, "m1", { status: "COMPLETE", priority: "HIGH" }, t);
    expect(next[0].status).toBe("COMPLETE");
    expect(next[0].priority).toBe("HIGH");
    expect(() => updateMission(missions, "m1", { status: "UNKNOWN" }, t)).toThrow("Invalid mission status");
  });

  it("deduplicates pending approvals and records founder decisions", () => {
    let counter = 0;
    const idFactory = () => `a${++counter}`;
    const first = mergeApprovals([], ["Approve demo outreach"], "pulse-1", t, idFactory);
    const second = mergeApprovals(first, ["Approve demo outreach"], "pulse-2", t, idFactory);
    expect(second).toHaveLength(1);
    expect(second[0].source_ref).toBe("pulse-2");

    const decided = decideApproval(second, "a1", "APPROVED", "Proceed with draft only", t);
    expect(decided[0].status).toBe("APPROVED");
    expect(decided[0].decision_note).toContain("draft");
  });
});
