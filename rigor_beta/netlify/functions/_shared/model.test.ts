import { describe, expect, it } from "vitest";
import {
  activeProduction,
  createProduction,
  createWorkspace,
  departmentSummary,
  extractRequirements,
  loadSampleProduction,
  normalizeWorkspace,
  progress,
  readiness,
  snapshot,
} from "./model.js";

describe("RIGOR beta model", () => {
  it("starts new productions from uploaded source data instead of seeded intelligence", () => {
    const state = createWorkspace("Test PM", "PM");
    const view = snapshot(state);

    expect(view.documents).toHaveLength(0);
    expect(view.requirements).toHaveLength(0);
    expect(view.conflicts).toHaveLength(0);
    expect(view.checkpoints).toHaveLength(8);
    expect(view.progress.current_session).toBe(1);
    expect(view.progress.sessions["1"].complete).toBe(false);
    expect(view.readiness.status).toBe("DOCUMENTS_PENDING");
    expect(view.intelligence).toMatchObject({
      seeded: false,
      source_of_truth: "UPLOADED_DOCUMENTS",
    });
  });

  it("loads an explicitly labeled guided sample production without disguising it as real data", () => {
    const state = createWorkspace("Partner Viewer", "Partner / Investor");
    loadSampleProduction(state);
    const production = activeProduction(state);
    const view = snapshot(state);

    expect(production.production.sample_demo).toBe(true);
    expect(production.show.show_name).toContain("SAMPLE");
    expect(production.documents.length).toBeGreaterThan(0);
    expect(production.documents.every((item) => item.source_kind === "SAMPLE")).toBe(true);
    expect(production.requirements.length).toBeGreaterThan(0);
    expect(production.conflicts.length).toBeGreaterThan(0);
    expect(view.readiness.status).toBe("BLOCKED");
  });

  it("keeps show readiness blocked until field incidents are resolved", () => {
    const state = createWorkspace("Show PM", "PM");
    const production = activeProduction(state);

    extractRequirements(state, "show.txt", ["Venue must provide 200A show power service."]);
    production.requirements[0].status = "CONFIRMED";
    production.requirements[0].owner = "Power Lead";
    production.checkpoints.forEach((item) => { item.status = "COMPLETE"; });
    expect(readiness(state).status).toBe("SHOW_READY");

    production.incidents.push({
      incident_id: "incident_test",
      department: "Power",
      severity: "HIGH",
      summary: "Temporary distro lost one leg.",
      resolution: null,
      created_at: new Date().toISOString(),
    });
    expect(progress(state).sessions["3"].complete).toBe(false);
    expect(readiness(state)).toMatchObject({
      status: "BLOCKED",
      open_incidents: 1,
      blocking_incidents: 1,
    });

    production.incidents[0].resolution = "Swapped distro and retested all phases.";
    expect(progress(state).sessions["3"].complete).toBe(true);
    expect(readiness(state).status).toBe("SHOW_READY");
  });

  it("extracts normalized source-backed requirement candidates", () => {
    const state = createWorkspace("Video Lead", "Video");
    const created = extractRequirements(state, "venue-tech-pack.txt", [
      "Venue must provide two tactical fiber paths from FOH to video world.",
    ]);

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      department: "Video",
      category: "VIDEO_TRANSPORT",
      normalized_value: "FIBER",
      document_name: "venue-tech-pack.txt",
      page_number: 1,
      origin_type: "SOURCE_DOCUMENT",
      source_kind: "TESTER",
      status: "NEEDS_CONFIRMATION",
    });
    expect(created[0].confidence).toBeGreaterThan(0.8);
  });

  it("detects cross-document contradictions from normalized production requirements", () => {
    const state = createWorkspace("Production Manager", "PM");

    extractRequirements(state, "tour-rider.txt", [
      "Tour requires 400A show power service at stage right.",
    ]);
    extractRequirements(state, "venue-tech-pack.txt", [
      "Venue power service is limited to 200A at stage right.",
    ]);

    const production = activeProduction(state);
    expect(production.requirements).toHaveLength(2);
    expect(production.conflicts).toHaveLength(1);
    expect(production.conflicts[0]).toMatchObject({
      department: "Power",
      category: "POWER_CAPACITY",
      severity: "CRITICAL",
      status: "OPEN",
    });
    expect(new Set([production.conflicts[0].left_value, production.conflicts[0].right_value])).toEqual(
      new Set(["400A", "200A"]),
    );
    expect(production.conflicts[0].left_source).toContain("tour-rider.txt");
    expect(production.conflicts[0].right_source).toContain("venue-tech-pack.txt");
  });

  it("requires every extracted requirement and owner before unlocking show day", () => {
    const state = createWorkspace("Test TM", "TM");
    const production = activeProduction(state);

    extractRequirements(state, "production-notes.txt", [
      "Venue must provide 200A show power service.",
      "Production shall confirm dock access opens at 07:00.",
    ]);

    expect(progress(state).sessions["1"].total).toBe(2);
    production.requirements[0].status = "CONFIRMED";
    expect(progress(state).sessions["1"].complete).toBe(false);
    production.requirements[1].status = "CONFIRMED";
    expect(progress(state).sessions["1"].complete).toBe(true);

    production.requirements[0].owner = "Department Lead";
    expect(progress(state).sessions["2"].complete).toBe(false);
    production.requirements[1].owner = "Department Lead";
    expect(progress(state).sessions["2"].complete).toBe(true);

    production.checkpoints.forEach((item) => { item.status = "COMPLETE"; });
    expect(progress(state).sessions["3"].complete).toBe(true);
    expect(readiness(state).status).toBe("SHOW_READY");
  });

  it("never reports show ready while requirements or owners remain open", () => {
    const state = createWorkspace("Safety PM", "PM");
    const production = activeProduction(state);

    extractRequirements(state, "large-tour.txt", [
      "Venue must provide 400A show power service.",
      "Production shall confirm dock access opens at 07:00.",
      "Venue must provide two tactical fiber paths.",
    ]);
    production.requirements[0].status = "CONFIRMED";
    production.requirements[0].owner = "Power Lead";
    production.checkpoints.forEach((item) => { item.status = "COMPLETE"; });

    expect(progress(state).sessions["1"].complete).toBe(false);
    expect(progress(state).sessions["3"].complete).toBe(false);
    expect(readiness(state).status).toBe("NEEDS_REVIEW");

    production.requirements.forEach((item) => { item.status = "CONFIRMED"; });
    expect(readiness(state).status).toBe("NEEDS_REVIEW");
    production.requirements.forEach((item) => { item.owner = "Department Lead"; });
    expect(readiness(state).status).toBe("SHOW_READY");
  });

  it("migrates old demo records without removing uploaded tester intelligence", () => {
    const state = createWorkspace("Existing Tester", "PM");
    const production = activeProduction(state);
    production.documents.push(
      { document_id: "demo-doc", source_kind: "DEMO", name: "Demo Rider" },
      { document_id: "real-doc", source_kind: "TESTER", name: "Real Venue Pack" },
    );
    production.requirements.push(
      { requirement_id: "demo-req", source_kind: "DEMO", document_name: "Demo Rider", department: "Power", status: "EXTRACTED" },
      { requirement_id: "real-req", source_kind: "TESTER", document_name: "Real Venue Pack", department: "Video", status: "NEEDS_CONFIRMATION" },
    );
    production.conflicts.push({ conflict_id: "demo-conflict", status: "OPEN" });

    const migrated = normalizeWorkspace(state);
    const active = activeProduction(migrated);

    expect(active.documents.map((item) => item.document_id)).toEqual(["real-doc"]);
    expect(active.requirements.map((item) => item.requirement_id)).toEqual(["real-req"]);
    expect(active.conflicts).toEqual([]);
    expect(active.events.some((item) => item.type === "DEMO_DATA_REMOVED")).toBe(true);
  });

  it("keeps multiple productions operationally isolated", () => {
    const state = createWorkspace("Portfolio PM", "PM");
    const second = createProduction(
      state.workspace.workspace_id,
      { show_name: "Show Two", artist: "Client Two", venue: "Venue Two", city: "Chicago, IL", show_date: "2026-11-08" },
      2,
    );
    state.productions.push(second);

    extractRequirements(state, "show-one.txt", ["Tour requires 400A show power service."]);
    expect(activeProduction(state).requirements).toHaveLength(1);

    state.workspace.active_production_id = second.production.production_id;
    expect(activeProduction(state).requirements).toHaveLength(0);
    expect(departmentSummary(state)).toEqual([]);
    expect(snapshot(state).productions).toHaveLength(2);
  });
});
