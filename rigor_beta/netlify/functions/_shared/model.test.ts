import { describe, expect, it } from "vitest";
import { activeProduction, createProduction, createWorkspace, departmentSummary, extractRequirements, progress, readiness, snapshot } from "./model.js";

describe("RIGOR beta model", () => {
  it("creates an isolated production with a three-stage workflow", () => {
    const state = createWorkspace("Test PM", "PM");
    const view = snapshot(state);
    expect(view.requirements).toHaveLength(18);
    expect(view.conflicts).toHaveLength(4);
    expect(view.checkpoints).toHaveLength(8);
    expect(view.progress.current_session).toBe(1);
    expect(view.readiness.status).toBe("BLOCKED");
  });

  it("unlocks all three sessions through real workflow decisions", () => {
    const state = createWorkspace("Test TM", "TM");
    const production = activeProduction(state);
    production.requirements.slice(0, 6).forEach((item) => { item.status = "CONFIRMED"; });
    expect(progress(state).sessions["1"].complete).toBe(true);
    production.conflicts.forEach((item) => { item.status = "RESOLVED"; item.resolution = "Approved alternate supplied onsite"; item.owner = "Production Manager"; });
    production.requirements.slice(0, 4).forEach((item) => { item.owner = "Department Lead"; });
    expect(progress(state).sessions["2"].complete).toBe(true);
    production.checkpoints.forEach((item) => { item.status = "COMPLETE"; });
    expect(progress(state).sessions["3"].complete).toBe(true);
    expect(readiness(state).status).toBe("SHOW_READY");
  });

  it("extracts source-backed requirement candidates", () => {
    const state = createWorkspace("Video Lead", "Video");
    const created = extractRequirements(state, "camera-notes.txt", ["Venue must provide two tactical fiber paths from FOH to video world."]);
    expect(created).toHaveLength(1);
    expect(created[0].department).toBe("Video");
    expect(created[0].document_name).toBe("camera-notes.txt");
  });

  it("keeps three demo productions operationally isolated", () => {
    const state = createWorkspace("Portfolio PM", "PM");
    const second = createProduction(state.workspace.workspace_id, { show_name: "Show Two", artist: "Client Two", venue: "Venue Two", city: "Chicago, IL", show_date: "2026-11-08" }, 2);
    const third = createProduction(state.workspace.workspace_id, { show_name: "Show Three", artist: "Client Three", venue: "Venue Three", city: "New York, NY", show_date: "2026-11-15" }, 3);
    state.productions.push(second, third);
    activeProduction(state).requirements[0].status = "CONFIRMED";
    state.workspace.active_production_id = second.production.production_id;
    expect(activeProduction(state).requirements[0].status).not.toBe("CONFIRMED");
    expect(snapshot(state).productions).toHaveLength(3);
  });

  it("calculates department isolation", () => {
    const state = createWorkspace("Audio Lead", "Audio");
    const departments = departmentSummary(state);
    expect(departments.find((item) => item.department === "Power")?.status).toBe("BLOCKED");
    expect(departments.find((item) => item.department === "Audio")?.total).toBe(1);
  });
});
