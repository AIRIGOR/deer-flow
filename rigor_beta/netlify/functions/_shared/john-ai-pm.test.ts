import { describe, expect, it } from "vitest";
import { activeProduction, createWorkspace, extractRequirements, rebuildConflicts } from "./model.js";
import { JOHN_AI_PM, JOHN_SYSTEM_INSTRUCTIONS, johnPmBrief } from "./john-ai-pm.js";

describe("John AI PM fictional production agent", () => {
  it("has explicitly constrained authority and an adversarial touring mission", () => {
    expect(JOHN_AI_PM.name).toBe("John");
    expect(JOHN_AI_PM.mode).toBe("SYNTHETIC_STAGING_ONLY");
    expect(JOHN_AI_PM.prohibited).toContain("APPROVE_SHOW");
    expect(JOHN_SYSTEM_INSTRUCTIONS).toContain("25 trucks");
    expect(JOHN_SYSTEM_INSTRUCTIONS).toContain("Never invent verified venue facts");
  });

  it("blocks a fictional tour, cites both sources and cannot mutate production state", () => {
    const workspace = createWorkspace("John AI PM", "PM");
    const state = activeProduction(workspace);
    state.show.show_name = "Celestial Circuit World Tour - FICTIONAL";
    state.documents.push(
      { name: "rider.txt", status: "PROCESSED", review_status: "PENDING", doc_type: "UPLOADED", analysis_engine: "DEERFLOW" },
      { name: "venue.txt", status: "PROCESSED", review_status: "PENDING", doc_type: "UPLOADED", analysis_engine: "DEERFLOW" },
    );
    extractRequirements(state, "rider.txt", ["Tour requires 400A show power service at stage right."]);
    extractRequirements(state, "venue.txt", ["Venue show power service is limited to 200A at stage right."]);
    rebuildConflicts(state);
    const before = structuredClone(workspace);
    const briefing = johnPmBrief(workspace);
    expect(briefing.agent.name).toBe("John");
    expect(briefing.release_decision).toBe("HOLD_SHOW");
    expect(briefing.autonomous_show_approval).toBe(false);
    expect(briefing.readiness.status).toBe("BLOCKED");
    const conflict = briefing.actions.find(action => action.type === "CONFLICT");
    expect(conflict?.priority).toBe("P0");
    expect(conflict?.evidence.join(" ")).toContain("rider.txt");
    expect(conflict?.evidence.join(" ")).toContain("venue.txt");
    expect(briefing.actions.every(action => action.approval_required)).toBe(true);
    expect(workspace).toEqual(before);
  });

  it("holds a production with no uploaded evidence", () => {
    const briefing = johnPmBrief(createWorkspace("John Empty Test", "PM"));
    expect(briefing.release_decision).toBe("HOLD_SHOW");
    expect(briefing.actions.some(action => action.type === "MISSING_DOCUMENTS")).toBe(true);
    expect(briefing.readiness.status).toBe("DOCUMENTS_PENDING");
  });
});
