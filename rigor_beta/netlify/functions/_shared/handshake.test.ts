import { describe, expect, it } from "vitest";
import { activeProduction, createWorkspace, departmentSummary, extractRequirements, normalizeWorkspace, progress, readiness, rebuildConflicts } from "./model.js";
import { johnPmBrief } from "./john-ai-pm.js";

function reviewedProduction() {
  const state = activeProduction(createWorkspace("Synthetic Handshake PM", "PM"));
  state.documents.push({ name: "advance.txt", status: "PROCESSED", source_kind: "TESTER", review_status: "REVIEWED" });
  extractRequirements(state, "advance.txt", ["Show power must provide 400A service."]);
  state.requirements.forEach(item => { item.status = "CONFIRMED"; item.owner = "Power Lead"; });
  state.checkpoints.forEach(item => { item.status = "COMPLETE"; });
  return state;
}

describe("production handshake safety", () => {
  it("detects incompatible capacities on separate pages of one advance", () => {
    const state = reviewedProduction();
    extractRequirements(state, "advance.txt", ["", "Show power is limited to 200A service."]);
    expect(state.conflicts).toHaveLength(1);
    expect(state.conflicts[0]).toMatchObject({ status: "OPEN", severity: "CRITICAL", right_source: "advance.txt · p2" });
    expect(readiness(state).status).toBe("BLOCKED");
  });

  it("retains unchanged human decisions but reopens them when the same requirement's facts change", () => {
    const state = reviewedProduction();
    extractRequirements(state, "venue.txt", ["Show power is limited to 200A service."]);
    const conflict = state.conflicts[0];
    Object.assign(conflict, { status: "RESOLVED", resolution: "Human decision: rent additional power.", owner: "PM", resolved_at: "2026-10-28" });
    state.requirements.reverse();
    rebuildConflicts(state);
    expect(state.conflicts[0]).toMatchObject({ conflict_id: conflict.conflict_id, status: "RESOLVED", owner: "PM" });
    const requirement = state.requirements.find(item => item.document_name === "venue.txt")!;
    requirement.detail = requirement.excerpt = "Show power is limited to 100A service.";
    rebuildConflicts(state);
    expect(state.conflicts[0]).toMatchObject({ conflict_id: conflict.conflict_id, status: "OPEN", owner: null, resolution: null, resolved_at: null });
    expect(state.conflicts[0].previous_decision).toMatchObject({ owner: "PM", resolution: "Human decision: rent additional power." });
    expect(state.checkpoints.find(item => item.department === "Power")?.status).toBe("PENDING");
    Object.assign(state.conflicts[0], { status: "RESOLVED", resolution: "Human reapproval of revised capacity.", owner: "PM" });
    requirement.page_number = 2;
    rebuildConflicts(state);
    expect(state.conflicts[0]).toMatchObject({ status: "OPEN", resolution: null, owner: null });
  });

  it.each(["", " \t ", null, 123])("does not accept owner %s as a completed department handshake", owner => {
    const state = reviewedProduction();
    state.requirements[0].owner = owner;
    expect(readiness(state)).toMatchObject({ status: "NEEDS_REVIEW", ownership_gaps: 1 });
    expect(departmentSummary(state).find(item => item.department === "Power")).toMatchObject({ status: "NEEDS_REVIEW", ownership_gaps: 1 });
    expect(progress(state).sessions["2"].complete).toBe(false);
  });

  it("blocks an orphan source dependency in master and affected department but leaves other departments scoped", () => {
    const state = reviewedProduction();
    state.documents = [];
    state.documents.push({ name: "audio.txt", status: "PROCESSED", source_kind: "TESTER", review_status: "REVIEWED" });
    state.requirements.push({ requirement_id: "audio", document_name: "audio.txt", department: "Audio", status: "CONFIRMED", owner: "Audio Lead" });
    expect(readiness(state)).toMatchObject({ status: "BLOCKED", missing_source_dependencies: 1 });
    expect(departmentSummary(state).find(item => item.department === "Power")).toMatchObject({ status: "BLOCKED", missing_source_dependencies: 1 });
    expect(progress(state).sessions["1"].complete).toBe(false);
    expect(departmentSummary(state).find(item => item.department === "Audio")?.status).toBe("READY");
    expect(readiness(state, state.requirements.filter(item => item.department === "Audio"), [], [], []).status).toBe("SHOW_READY");
    const before = structuredClone(state);
    expect(johnPmBrief(state).actions.some(item => item.type === "MISSING_SOURCE_DEPENDENCY" && item.approval_required)).toBe(true);
    expect(state).toEqual(before);
    state.documents.push({ name: "advance.txt", status: "PROCESSED", source_kind: "TESTER", review_status: "REVIEWED" });
    expect(readiness(state)).toMatchObject({ status: "SHOW_READY", missing_source_dependencies: 0 });
    state.documents.find(item => item.name === "advance.txt")!.production_id = "another-production";
    expect(readiness(state)).toMatchObject({ status: "BLOCKED", missing_source_dependencies: 1 });
  });

  it("rebuilds old workspaces so same-source contradictions cannot evade the new rules", () => {
    const workspace = createWorkspace("Synthetic Migration PM", "PM");
    const state = activeProduction(workspace);
    extractRequirements(state, "advance.txt", ["Show power must provide 400A service.", "Show power is limited to 200A service."]);
    state.conflicts = [];
    state.production.conflict_rules_version = "pod2-source-v2";
    state.checkpoints.forEach(item => { item.status = "COMPLETE"; });
    normalizeWorkspace(workspace);
    expect(state.conflicts).toHaveLength(1);
    expect(state.checkpoints.find(item => item.department === "Power")?.status).toBe("PENDING");
    const conflictId = state.conflicts[0].conflict_id;
    state.checkpoints.forEach(item => { item.status = "COMPLETE"; });
    normalizeWorkspace(workspace);
    expect(state.conflicts[0].conflict_id).toBe(conflictId);
    expect(state.checkpoints.every(item => item.status === "COMPLETE")).toBe(true);
  });
});
