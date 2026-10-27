import { activeProduction, extractRequirements, newId, now, readiness, type ProductionState, type WorkspaceState } from "./model.js";
import type { Context } from "@netlify/functions";

// Deploy context is a build category, not an environment authorization boundary.
export function johnStagingAuthorized(context: Context): boolean {
  return context.site?.id === "96331e39-86a9-45a3-910c-edd321d60bb7"
    && Netlify.env.get("RIGOR_JOHN_STAGING_ENABLED") === "true";
}

/**
 * John is RIGOR's fictional touring Production Manager test persona.
 * This module is the deterministic, read-only safety/briefing layer.
 * An independent LLM planner is NOT connected by this module.
 */
export const JOHN_AI_PM = Object.freeze({
  id: "john-ai-pm",
  name: "John",
  role: "Touring Production Manager",
  tour: "Celestial Circuit World Tour - FICTIONAL",
  mode: "SYNTHETIC_STAGING_ONLY",
  permissions: ["READ_PRODUCTION", "REVIEW_DOCUMENTS", "DRAFT_ADVANCE_ACTIONS", "ESCALATE_CONFLICTS"],
  prohibited: ["APPROVE_SHOW", "RESOLVE_CONFLICT", "MARK_SOURCE_REVIEWED", "SEND_EMAIL", "DEPLOY", "SPEND_FUNDS", "CHANGE_PRODUCTION_DATA"],
});

export const JOHN_SYSTEM_INSTRUCTIONS = `You are John, the fictional touring Production Manager for the Celestial Circuit World Tour.
Act as an experienced, skeptical PM responsible for 25 trucks, 10 buses, 12 dancers, an automated LED wall, a B-stage, and a multi-city arena tour.
You are conducting a synthetic RIGOR stress test, not advancing a real event.
Read all available evidence, challenge ambiguous venue information, find cross-department impacts, ask for missing facts, and produce a prioritized advance plan.
Never invent verified venue facts, source citations, approvals, or report delivery. Treat a model's confident assertion as unverified unless the cited source actually supports it.
Never declare a show safe or ready when RIGOR reports BLOCKED, NEEDS_REVIEW, or DOCUMENTS_PENDING.
Never alter source-review, requirement, conflict, checkpoint, or incident status yourself. Human department owners must validate decisions.
No customer contact, spending, production deploys, or external actions. Draft recommendations only.
When RIGOR misses a contradiction, flag it as a suspected miss for independent review rather than silently correcting records.
Every recommendation must name its evidence or state that the evidence is missing.`;

export type JohnAction = {
  priority: "P0" | "P1" | "P2";
  type: string;
  department: string;
  message: string;
  evidence: string[];
  approval_required: true;
};

export function johnPmBrief(input: WorkspaceState | ProductionState) {
  const state = "productions" in input ? activeProduction(input) : input;
  const result = readiness(state);
  const actions: JohnAction[] = [];
  const add = (priority: JohnAction["priority"], type: string, department: string, message: string, evidence: string[]) =>
    actions.push({ priority, type, department, message, evidence, approval_required: true });

  for (const conflict of state.conflicts.filter(item => item.status !== "RESOLVED")) {
    add(["CRITICAL", "HIGH"].includes(conflict.severity) ? "P0" : "P1", "CONFLICT", conflict.department || "Production",
      `Escalate ${conflict.category || "unclassified"} contradiction to human department owners. Do not approve readiness.`,
      [conflict.left_source, conflict.right_source].filter(Boolean));
  }
  for (const incident of state.incidents.filter(item => !String(item.resolution || "").trim())) {
    add(["CRITICAL", "HIGH"].includes(incident.severity) ? "P0" : "P1", "INCIDENT", incident.department || "Production",
      `Unresolved ${incident.severity || "unknown"} incident: ${incident.summary || "details missing"}.`,
      incident.document_name ? [incident.document_name] : ["Incident record; supporting source not supplied"]);
  }
  for (const document of state.documents.filter(item =>
    item.status !== "PROCESSED" || item.review_status !== "REVIEWED" ||
    (item.doc_type === "UPLOADED" && item.analysis_engine !== "DEERFLOW"))) {
    add("P1", "SOURCE_REVIEW", "Production",
      `Verify full source and analysis status for ${document.name || "unnamed document"}.`,
      [document.name || "Source identity missing"]);
  }
  for (const requirement of state.requirements.filter(item => !["CONFIRMED", "RESOLVED"].includes(item.status) || !item.owner)) {
    add(requirement.status === "REJECTED" ? "P0" : "P1", "REQUIREMENT", requirement.department || "Production",
      `Human review required: ${requirement.detail || requirement.title || "unverified requirement"}.`,
      requirement.document_name ? [`${requirement.document_name}, page ${requirement.page_number || "unknown"}`] : ["Source not supplied"]);
  }
  for (const checkpoint of state.checkpoints.filter(item => item.status !== "COMPLETE")) {
    add("P2", "CHECKPOINT", checkpoint.department || "Production",
      `Department checkpoint pending: ${checkpoint.label || "unnamed"}.`,
      ["RIGOR checkpoint record"]);
  }
  if (!state.documents.length) {
    add("P0", "MISSING_DOCUMENTS", "Production",
      "No source documents. Request the rider, venue technical pack, stage plot, rigging, power, audio, video, schedule and logistics.", ["No documents uploaded"]);
  }

  const rank = { P0: 0, P1: 1, P2: 2 };
  actions.sort((a, b) => rank[a.priority] - rank[b.priority]);
  return {
    agent: JOHN_AI_PM,
    show: state.show.show_name,
    generated_at: new Date().toISOString(),
    mode: "DETERMINISTIC_READ_ONLY_BRIEF",
    readiness: result,
    release_decision: result.status === "SHOW_READY" ? "REQUEST_HUMAN_FINAL_SIGNOFF" : "HOLD_SHOW",
    autonomous_show_approval: false,
    actions,
    action_count: actions.length,
    note: "John is a named PM test persona with a policy-enforced briefing engine; an independent LLM planner has not yet been deployed.",
  };
}

/** Fourteen fictional source records, never actual venue confirmations. */
export const JOHN_FIXTURE_SOURCES = [
  ["01_Tour_Technical_Rider.pdf", "Tour requires 400A show power service at stage right."],
  ["02_Venue_Technical_Specs.pdf", "Venue show power service is limited to 200A at stage right."],
  ["03_Stage_Plot.pdf", "Tour requires a 30ft B-stage footprint and unobstructed egress."],
  ["04_Venue_Stage_Plot.pdf", "Venue must confirm B-stage footprint and emergency egress."],
  ["05_Rigging_Automation.pdf", "Tour minimum downstage trim height is 42 feet."],
  ["06_Venue_Rigging.pdf", "Venue maximum downstage trim height is 38 feet."],
  ["07_Video_LED.pdf", "Tour must provide two fiber paths from FOH to video world."],
  ["08_Audio_Input_List.pdf", "Tour requires a DiGiCo console at FOH audio."],
  ["09_Venue_Audio.pdf", "Venue must confirm FOH audio console availability."],
  ["10_Lighting_Control.pdf", "Venue must provide 12 lighting universes at stage."],
  ["11_Logistics_Manifest.pdf", "Venue must confirm load-in dock access for 25 trucks and 10 buses."],
  ["12_Venue_Logistics.pdf", "Venue loading dock capacity is limited to 8 trucks per hour."],
  ["13_Hospitality_Labor.pdf", "Venue must provide hot dinner for 40 crew and 12 dancers."],
  ["14_Show_Schedule.pdf", "Venue must confirm show curfew at 22:00."],
] as const;

export function loadJohnFixture(state: ProductionState) {
  if (state.documents.length || state.requirements.length || state.incidents.length) {
    throw new Error("John's rehearsal requires a new, empty production");
  }
  state.production.sample_demo = true;
  Object.assign(state.show, {
    show_name: "Celestial Circuit World Tour - FICTIONAL",
    artist: "The Midnight Atlas - FICTIONAL",
    venue: "Mirage Crown Arena - FICTIONAL",
    city: "Las Vegas, NV",
    show_date: "2026-11-20",
    status: "NEEDS_REVIEW",
  });
  for (const [name, content] of JOHN_FIXTURE_SOURCES) {
    state.documents.push({
      document_id: newId("doc"),
      production_id: state.production.production_id,
      workspace_id: state.production.workspace_id,
      name, doc_type: "UPLOADED", status: "PROCESSED",
      review_status: "PENDING", page_count: 1,
      source_kind: "SAMPLE", analysis_engine: "SAMPLE_DATA",
      created_at: now(),
    });
    const items = extractRequirements(state, name, [content]);
    for (const item of items) {
      item.source_kind = "SAMPLE";
      item.analysis_engine = "SAMPLE_DATA";
    }
  }
  state.events.push({ event_id: newId("event"), type: "JOHN_SYNTHETIC_FIXTURE_LOADED",
    created_at: now(), payload: { documents: state.documents.length, synthetic: true } });
  return state;
}
