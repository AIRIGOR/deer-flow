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
  canonicalizeRequirement,
  rebuildConflicts,
  reconcileSourceRequirements,
  invalidateChangedCheckpoints,
  affectsDepartment,
} from "./model.js";

describe("RIGOR beta model", () => {
  it("detects all four guided-sample contradictions", () => {
    const workspace = createWorkspace("Comparison PM", "PM");
    loadSampleProduction(workspace);
    const state = activeProduction(workspace);
    rebuildConflicts(state);
    expect(state.conflicts.map((c) => c.category).sort()).toEqual([
      "BACKLINE_RISER", "POWER_CAPACITY", "RIGGING_TRIM", "VIDEO_TRANSPORT",
    ]);
    expect(state.conflicts.find((c) => c.category==="RIGGING_TRIM")).toMatchObject({
      severity:"CRITICAL", left_value:"42FT", right_value:"38FT", status:"OPEN",
    });
    expect(state.conflicts.find((c) => c.category==="VIDEO_TRANSPORT")).toMatchObject({
      department:"Video", severity:"HIGH", left_value:"FIBER", right_value:"COPPER",
    });
    state.requirements.forEach((r) => { r.status="CONFIRMED"; r.owner="Sample Lead"; });
    state.checkpoints.forEach((c) => { c.status="COMPLETE"; });
    expect(readiness(state).status).toBe("BLOCKED");
  });

  it("blocks stale source packs even after every requirement and checkpoint is approved", () => {
    const state = activeProduction(createWorkspace("Stale Source PM", "PM"));
    state.documents.push({
      name: "venue-power.txt", status: "PROCESSED", source_kind: "TESTER",
      review_status: "REVIEWED", expires_at: "2020-01-01T00:00:00.000Z",
    });
    state.requirements.push({
      requirement_id: "power-1", document_name: "venue-power.txt", department: "Power",
      category: "POWER_CAPACITY", detail: "Venue power is 400A.", status: "CONFIRMED",
      owner: "Venue Electrician", confidence: 0.98,
    });
    state.checkpoints.forEach((item) => { item.status = "COMPLETE"; });
    expect(readiness(state)).toMatchObject({ status: "BLOCKED", stale_documents: 1 });
    expect(departmentSummary(state).find((item) => item.department === "Power")?.status).toBe("BLOCKED");
    state.documents[0].expires_at = "2099-01-01T00:00:00.000Z";
    expect(readiness(state).status).toBe("SHOW_READY");
  });

  it("blocks unverified low-confidence evidence despite a confirmed checkbox", () => {
    const state = activeProduction(createWorkspace("Evidence PM", "PM"));
    state.documents.push({ name: "venue.txt", status: "PROCESSED", source_kind: "TESTER", review_status: "REVIEWED" });
    state.requirements.push({
      requirement_id: "power-uncertain", document_name: "venue.txt", department: "Power",
      category: "POWER_CAPACITY", detail: "Power may be 400A.", status: "CONFIRMED",
      owner: "Power Lead", confidence: 0.41,
    });
    state.checkpoints.forEach((item) => { item.status = "COMPLETE"; });
    expect(readiness(state)).toMatchObject({ status: "BLOCKED", unverified_requirements: 1 });
    expect(departmentSummary(state).find((item) => item.department === "Power")?.status).toBe("BLOCKED");
    state.requirements[0].evidence_verified = true;
    expect(readiness(state).status).toBe("SHOW_READY");
    state.requirements[0].source_verified = false;
    expect(readiness(state).status).toBe("BLOCKED");
  });

  it("never marks a show or department ready with a rejected requirement", () => {
    const state = activeProduction(createWorkspace("Safety PM", "PM"));
    state.documents.push({ name: "venue.txt", status: "PROCESSED", source_kind: "SAMPLE" });
    state.requirements.push({
      requirement_id: "req_rejected", document_name: "venue.txt",
      department: "Rigging", category: "RIGGING_LOAD", status: "REJECTED",
      detail: "Rigging capacity request was rejected.", owner: "Head Rigger",
    });
    state.checkpoints.forEach((item) => { item.status = "COMPLETE"; });
    expect(readiness(state)).toMatchObject({
      status: "BLOCKED", rejected_requirements: 1,
    });
    expect(departmentSummary(state).find((item) => item.department === "Rigging")?.status).toBe("BLOCKED");
  });

  it("normalizes feet and inches without equating different trim heights", () => {
    const make = (excerpt: string) => canonicalizeRequirement({
      department:"Rigging", category:"RIGGING_TRIM", excerpt,
    }).normalized_value;
    expect(make("Minimum downstage truss trim: 42'-0\".")).toBe("42FT");
    expect(make("Maximum available trim at DS centerline is 38'-0\".")).toBe("38FT");
    expect(make("Minimum trim height: 42'-6\".")).toBe("42.5FT");
    expect(make("Minimum trim height: 42.5 feet.")).toBe("42.5FT");
  });

  it("keeps master readiness blocked by an unreviewed document with no candidates", () => {
    const state = activeProduction(createWorkspace("Source PM", "PM"));
    state.documents.push(
      {name:"power.txt", source_kind:"TESTER", review_status:"REVIEWED"},
      {name:"unparsed.txt", source_kind:"TESTER", review_status:"PENDING"},
    );
    extractRequirements(state, "power.txt", ["Show power must provide 400A service."]);
    state.requirements.forEach((r) => { r.status="CONFIRMED"; r.owner="Power Lead"; });
    state.checkpoints.forEach((c) => { c.status="COMPLETE"; });
    expect(readiness(state)).toMatchObject({
      status:"NEEDS_REVIEW", unreviewed_documents:1,
    });
    state.documents[1].review_status="REVIEWED";
    expect(readiness(state).status).toBe("SHOW_READY");
  });

  it("reopens affected checkpoints for a new requirement without a contradiction", () => {
    const state = activeProduction(createWorkspace("Change PM", "PM"));
    state.checkpoints.forEach((c) => { c.status="COMPLETE"; });
    const added = extractRequirements(state, "addition.txt",
      ["The automated LED section requires a suspended weight allowance of 12000 kg."]);
    expect(state.conflicts).toHaveLength(0);
    invalidateChangedCheckpoints(state, added);
    expect(state.checkpoints.find((c) => c.department==="Rigging")?.status).toBe("PENDING");
    expect(state.checkpoints.find((c) => c.department==="Video")?.status).toBe("PENDING");
    expect(state.checkpoints.find((c) => c.department==="Audio")?.status).toBe("COMPLETE");
  });

  it("does not silently drop hazards after thirty pairwise conflicts", () => {
    const state = activeProduction(createWorkspace("Large Advance PM", "PM"));
    for(let index=0;index<10;index++) {
      state.requirements.push({requirement_id:`req_${index}`,document_name:`revision-${index}.txt`,department:"Power",category:"POWER_CAPACITY",detail:`Show power must provide ${100+index*10}A service.`,normalized_value:null});
    }
    rebuildConflicts(state);
    expect(state.conflicts).toHaveLength(45);
    expect(readiness(state).open_conflicts).toBe(45);
  });
  it("requires full source review even after all extracted candidates are confirmed", () => {
    const state = activeProduction(createWorkspace("Document Reviewer", "PM"));
    state.documents.push({document_id:"doc",name:"tour.txt",source_kind:"TESTER",review_status:"PENDING"});
    extractRequirements(state,"tour.txt",["Show power must provide 400A service."]);
    state.requirements.forEach((r) => {r.status="CONFIRMED";r.owner="Power Lead";});
    state.checkpoints.forEach((c) => {c.status="COMPLETE";});
    expect(readiness(state)).toMatchObject({status:"NEEDS_REVIEW",unreviewed_documents:1,score:95});
    expect(progress(state).sessions["1"].complete).toBe(false);
    state.documents[0].review_status="REVIEWED";
    expect(readiness(state)).toMatchObject({status:"SHOW_READY",unreviewed_documents:0,score:100});
    expect(progress(state).sessions["3"].complete).toBe(true);
  });
  it("matches dock and B-stage source facts despite differing model labels", () => {
    const state = activeProduction(createWorkspace("World Tour PM", "PM"));
    state.requirements = [
      {requirement_id:"dock1", document_name:"tour", department:"Production", category:"DOCK_ACCESS", excerpt:"Load-in dock must provide 4 simultaneous truck loading bays for 25 trucks."},
      {requirement_id:"dock2", document_name:"venue", department:"Stage Management", category:"LOAD_IN_DOCK_CAPACITY", excerpt:"Load-in dock can only provide 2 simultaneous truck loading bays for 25 trucks."},
      {requirement_id:"stage1", document_name:"tour", department:"Video", category:"VIDEO_AUTOMATED_B_STAGE_FOOTPRINT", excerpt:"Automated B-stage requires a clear footprint of 40 ft x 30 ft."},
      {requirement_id:"stage2", document_name:"venue", department:"Rigging", category:"STAGE_DIMENSIONS", excerpt:"Automated B-stage has a maximum clear footprint of 30 ft x 20 ft available."},
    ];
    rebuildConflicts(state);
    expect(state.conflicts.map((c) => c.category)).toEqual(["DOCK_ACCESS", "BSTAGE_FOOTPRINT"]);
    expect(state.requirements[0]).toMatchObject({department:"Stage Management", normalized_value:"4BAYS", source_department:"Production"});
    expect(state.conflicts[1]).toMatchObject({severity:"CRITICAL", affected_departments:["Rigging", "Stage Management", "Video"]});
  });

  it("rates rigging loads as critical and includes automated LED impacts in Video", () => {
    const state = activeProduction(createWorkspace("Rigging PM", "PM"));
    extractRequirements(state,"tour.txt",["The automated LED section requires a suspended weight allowance of 12000 kg.","Rigging point load requires capacity of 2000 kg per point."]);
    extractRequirements(state,"venue.txt",["The automated LED section has a maximum suspended weight allowance of 8000 kg.","Rigging point load provides maximum capacity of 1000 kg per point."]);
    expect(state.conflicts).toHaveLength(2);
    expect(state.conflicts.every((c) => c.severity === "CRITICAL")).toBe(true);
    expect(state.conflicts.filter((c) => affectsDepartment(c,"Video"))).toHaveLength(1);
    expect(state.conflicts.filter((c) => affectsDepartment(c,"Audio"))).toHaveLength(0);
  });

  it("normalizes formatting without creating a false power conflict", () => {
    const state = activeProduction(createWorkspace("Power PM", "PM"));
    state.requirements = [
      {requirement_id:"a", document_name:"tour", detail:"Show power must provide 400A service at stage right.", department:"Power",category:"POWER_CAPACITY",normalized_value:"400 A"},
      {requirement_id:"b", document_name:"venue", detail:"Show power must provide 400A service at stage right.", department:"Power",category:"POWER_CAPACITY",normalized_value:"400A"},
    ];
    rebuildConflicts(state);
    expect(state.conflicts).toHaveLength(0);
    expect(canonicalizeRequirement({detail:"Audio requires console backup.",department:"Audio",category:"AUDIO_CONSOLE"}).category).toBe("AUDIO_CONSOLE");
  });

  it("recovers an omitted trim sentence as an unreviewed source candidate", () => {
    const state = activeProduction(createWorkspace("Source Reviewer", "PM"));
    state.documents.push({ name: "tour.txt", status: "PROCESSED", source_kind: "TESTER", review_status: "REVIEWED" });
    state.requirements.push({requirement_id:"power", document_name:"tour.txt", department:"Power",category:"POWER_CAPACITY",detail:"Show power must provide 400A service.",excerpt:"Show power must provide 400A service.",status:"CONFIRMED",owner:"Power Lead"});
    state.checkpoints.forEach((c) => {c.status="COMPLETE";});
    const recovered = reconcileSourceRequirements(state,"tour.txt",["Show power must provide 400A service.\nTour rigging requires minimum downstage trim of 42 ft."]);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({category:"RIGGING_TRIM",normalized_value:"42FT",coverage_review_required:true,status:"NEEDS_CONFIRMATION",source_kind:"SOURCE_REVIEW"});
    expect(readiness(state).status).toBe("NEEDS_REVIEW");
    expect(reconcileSourceRequirements(state,"tour.txt",["Tour rigging requires minimum downstage trim of 42 ft."])).toHaveLength(0);
  });

  it("reopens affected checkpoints after a revised source and keeps resolutions until new evidence", () => {
    const state = activeProduction(createWorkspace("Change Reviewer", "PM"));
    extractRequirements(state,"tour.txt",["The automated LED section requires a suspended weight allowance of 12000 kg."]);
    state.checkpoints.forEach((c) => {c.status="COMPLETE";});
    const added = extractRequirements(state,"venue.txt",["The automated LED section has a maximum suspended weight allowance of 8000 kg."]);
    invalidateChangedCheckpoints(state,added);
    expect(state.checkpoints.find((c) => c.department==="Video")?.status).toBe("PENDING");
    expect(state.checkpoints.find((c) => c.department==="Rigging")?.status).toBe("PENDING");
    expect(state.checkpoints.find((c) => c.department==="Audio")?.status).toBe("COMPLETE");
    state.conflicts[0].status="RESOLVED"; state.conflicts[0].resolution="Reduce touring load after review.";
    const id=state.conflicts[0].conflict_id;
    rebuildConflicts(state);
    expect(state.conflicts[0]).toMatchObject({conflict_id:id,status:"RESOLVED"});
    extractRequirements(state,"new-amendment.txt",["The automated LED section has a maximum suspended weight allowance of 6000 kg."]);
    expect(state.conflicts.some((c) => c.status==="OPEN" && [c.left_value,c.right_value].includes("6000KG"))).toBe(true);
  });

  it("isolates department report readiness from other departments' checkpoints and incidents", () => {
    const state = createWorkspace("Report PM", "PM");
    loadSampleProduction(state);
    const production = activeProduction(state);
    const requirements = production.requirements.filter((item) => item.department === "Video");
    const conflicts = production.conflicts.filter((item) => item.department === "Video");
    const checkpoints = production.checkpoints.filter((item) => item.department === "Video");
    requirements.forEach((item) => { item.status = "CONFIRMED"; item.owner = "Video Lead"; });
    checkpoints.forEach((item) => { item.status = "COMPLETE"; });
    expect(conflicts.length).toBeGreaterThan(0);
    expect(readiness(production, requirements, conflicts, checkpoints, []).status).toBe("BLOCKED");
    conflicts.forEach((conflict) => {
      conflict.status = "RESOLVED";
      conflict.resolution = "SAMPLE TEST: Tour supplies four tactical fiber paths.";
      conflict.owner = "Sample Video Lead";
    });
    production.incidents.push({ department: "Power", severity: "CRITICAL", resolution: null });
    expect(readiness(production).status).toBe("BLOCKED");
    expect(readiness(production, requirements, conflicts, checkpoints, [])).toMatchObject({
      status: "SHOW_READY", score: 100, open_incidents: 0,
      completed_checkpoints: checkpoints.length, total_checkpoints: checkpoints.length,
    });
    expect(readiness(production, requirements, conflicts, checkpoints,
      [{ department: "Video", severity: "HIGH", resolution: null }])).toMatchObject({
      status: "BLOCKED", open_incidents: 1, blocking_incidents: 1,
    });
  });

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
    production.documents.push({ name: "show.txt", status: "PROCESSED", source_kind: "TESTER", review_status: "REVIEWED" });

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
    production.documents.push({ name: "production-notes.txt", status: "PROCESSED", source_kind: "TESTER", review_status: "REVIEWED" });

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
    production.documents.push({ name: "large-tour.txt", status: "PROCESSED", source_kind: "TESTER", review_status: "REVIEWED" });

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
  it("AI PM adversarial rehearsal: fictional 25-truck world tour cannot force false green", () => {
    // Synthetic production only. The PM agent is a deterministic policy adversary,
    // not a live language-model connection or authorization to approve show safety.
    const workspace = createWorkspace("AI PM RED TEAM / SYNTHETIC", "PM");
    const production = activeProduction(workspace);
    Object.assign(production.show, {
      show_name: "Celestial Circuit World Tour - FICTIONAL",
      artist: "The Midnight Atlas - FICTIONAL",
      venue: "Mirage Crown Arena - FICTIONAL",
      city: "Las Vegas, NV", show_date: "2026-11-20",
    });
    production.production.sample_demo = true;
    const documents = [
      ["tour-rider.txt", "Tour requires 400A show power service at stage right."],
      ["venue-tech.txt", "Venue show power service is limited to 200A at stage right."],
      ["tour-rigging.txt", "Tour minimum downstage trim height: 42 feet."],
      ["venue-rigging.txt", "Venue maximum downstage trim height: 38 feet."],
      ["tour-video.txt", "Tour must provide two tactical fiber paths from FOH to video world."],
      ["venue-video.txt", "Venue must provide copper tie lines from FOH to video world."],
      ["automation.txt", "Tour must confirm suspended weight allowance of 12000 kg for the automated LED wall."],
      ["stage-plot.txt", "Venue must confirm the B-stage footprint and emergency egress."],
      ["audio.txt", "Venue must provide a DiGiCo console at FOH audio."],
      ["labor.txt", "Venue must provide 24 stagehands for the load-in."],
      ["trucking.txt", "Venue must confirm load-in dock capacity for 25 trucks and 10 buses."],
      ["hospitality.txt", "Venue must provide hot dinner for 40 crew and 12 dancers."],
      ["security.txt", "Venue must provide security barricade at the B-stage."],
      ["schedule.txt", "Venue must confirm show curfew at 22:00."],
    ] as const;
    for (const [name, text] of documents) {
      production.documents.push({
        name, status: "PROCESSED", review_status: "PENDING",
        doc_type: "UPLOADED", analysis_engine: "DEERFLOW", source_kind: "TESTER",
      });
      extractRequirements(production, name, [text]);
    }
    const conflictCategories = new Set(production.conflicts.map(item => item.category));
    expect(conflictCategories).toContain("POWER_CAPACITY");
    expect(conflictCategories).toContain("RIGGING_TRIM");
    expect(conflictCategories).toContain("VIDEO_TRANSPORT");
    expect(production.requirements.length).toBeGreaterThanOrEqual(12);

    // The fictional AI PM tries the unsafe shortcut: all owners, requirements
    // and checkpoints marked complete, while source review and conflicts remain.
    for (const item of production.requirements) {
      item.status = "CONFIRMED";
      item.owner = "FICTIONAL PM - NOT HUMAN APPROVAL";
    }
    for (const checkpoint of production.checkpoints) checkpoint.status = "COMPLETE";
    expect(readiness(production).status).toBe("BLOCKED");
    expect(readiness(production).unreviewed_documents).toBe(documents.length);

    // Even after every document is marked reviewed, contradictory facts block.
    for (const document of production.documents) document.review_status = "REVIEWED";
    expect(readiness(production).status).toBe("BLOCKED");
    const aiPmRecommendations = production.conflicts
      .filter(item => item.status === "OPEN")
      .map(item => ({
        category: item.category,
        action: "ESCALATE_TO_HUMAN_DEPARTMENT_OWNER",
        evidence: [item.left_source, item.right_source],
      }));
    expect(aiPmRecommendations.length).toBeGreaterThanOrEqual(3);
    expect(aiPmRecommendations.every(item => item.evidence.every(Boolean))).toBe(true);

    // On show day, an unresolved critical incident is a second independent blocker.
    production.incidents.push({
      department: "Power", severity: "CRITICAL",
      summary: "Fictional temporary power distribution failure", resolution: null,
    });
    expect(readiness(production).blocking_incidents).toBe(1);
    expect(readiness(production).status).toBe("BLOCKED");

    // A late automation/LED revision invalidates the previously completed
    // Rigging and Video checkpoints, even without a new conflict.
    const added = extractRequirements(production, "late-change.txt", [
      "Tour must confirm suspended weight allowance of 15000 kg for the automated LED wall.",
    ]);
    expect(added.length).toBeGreaterThan(0);
    invalidateChangedCheckpoints(production, added);
    expect(production.checkpoints.find(item => item.department === "Rigging")?.status).toBe("PENDING");
    expect(production.checkpoints.find(item => item.department === "Video")?.status).toBe("PENDING");
    expect(readiness(production).status).toBe("BLOCKED");

    // PM must not contaminate a second show with the first show's findings.
    const other = createProduction(workspace.workspace.workspace_id, {
      show_name: "Independent Second Tour - FICTIONAL",
    }, 2);
    workspace.productions.push(other);
    workspace.workspace.active_production_id = other.production.production_id;
    expect(activeProduction(workspace).requirements).toHaveLength(0);
    expect(activeProduction(workspace).conflicts).toHaveLength(0);
    expect(readiness(workspace).status).toBe("DOCUMENTS_PENDING");
    expect(production.conflicts.length).toBeGreaterThanOrEqual(3);
  });

});
