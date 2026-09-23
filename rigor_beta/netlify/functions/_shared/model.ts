declare const Netlify: { env: { get(key: string): string | undefined } } | undefined;

import { CHECKPOINTS, DEPARTMENTS, DOCUMENTS, KEYWORDS, REQUIREMENTS } from "./seed.js";

export type RecordMap = Record<string, any>;
export type ProductionState = {
  production: RecordMap;
  show: RecordMap;
  documents: RecordMap[];
  requirements: RecordMap[];
  conflicts: RecordMap[];
  checkpoints: RecordMap[];
  incidents: RecordMap[];
  feedback: RecordMap[];
  events: RecordMap[];
};

export type WorkspaceState = {
  tester: RecordMap;
  workspace: RecordMap;
  productions: ProductionState[];
};

export const PRODUCTION_LIMIT = 3;
export const now = () => new Date().toISOString();
export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;

type ProductionDetails = {
  show_name?: string;
  artist?: string;
  venue?: string;
  city?: string;
  show_date?: string;
};

const CATEGORY_RULES: Array<[string, RegExp]> = [
  ["POWER_CAPACITY", /\b(?:\d{2,4}\s*a(?:mps?|mperes?)?|company switch|show power|service)\b/i],
  ["POWER_VOLTAGE", /\b(?:120|208|240|277|480)\s*v(?:olts?)?\b/i],
  ["RIGGING_TRIM", /\b(?:trim|clear height|working height).{0,40}\b\d{1,3}(?:\.\d+)?\s*(?:ft|feet|foot|'|′)\b/i],
  ["RIGGING_LOAD", /\b(?:point load|distributed load|rigging load|lbs?|pounds?|kg)\b/i],
  ["VIDEO_TRANSPORT", /\b(?:fiber|tactical fiber|cat\s*6|copper tie|smpte|video transport)\b/i],
  ["VIDEO_SCREEN", /\b(?:led wall|video wall|projection screen|screen size)\b/i],
  ["CAMERA_SYSTEM", /\b(?:camera|ptz|long lens|camera position|camera platform)\b/i],
  ["AUDIO_CONSOLE", /\b(?:console|foh audio|monitor console|digico|avid|yamaha|midas)\b/i],
  ["AUDIO_PA", /\b(?:pa system|line array|speaker system|spl)\b/i],
  ["LIGHTING_NETWORK", /\b(?:sacn|art-?net|dmx|universe|lighting network)\b/i],
  ["FOLLOWSPOT", /\b(?:follow\s*spots?|spotlight)\b/i],
  ["BACKLINE_RISER", /\b(?:drum riser|rolling riser|riser)\b/i],
  ["LABOR_CALL", /\b(?:stagehands?|labor call|crew call|hands called)\b/i],
  ["DOCK_ACCESS", /\b(?:dock|truck staging|load[- ]?in access)\b/i],
  ["HOSPITALITY_MEAL", /\b(?:crew meal|hot dinner|catering|meal)\b/i],
  ["COMMUNICATIONS_RADIO", /\b(?:radios?|intercom|comms?|channels?)\b/i],
  ["SECURITY_BARRICADE", /\b(?:barricade|bike rack|security barrier)\b/i],
];

function classifyDepartment(text: string) {
  const lowered = ` ${text.toLowerCase()} `;
  return Object.entries(KEYWORDS).find(([, words]) => words.some((word) => lowered.includes(word)))?.[0] ?? "Production";
}

function classifyCategory(text: string, department: string) {
  return CATEGORY_RULES.find(([, pattern]) => pattern.test(text))?.[0] ?? `${department.toUpperCase().replaceAll(" ", "_")}_GENERAL`;
}

function normalizedValue(text: string, category: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  const amp = compact.match(/\b(\d{2,4})\s*a(?:mps?|mperes?)?\b/i);
  if (category === "POWER_CAPACITY" && amp) return `${Number(amp[1])}A`;

  const voltage = compact.match(/\b(120|208|240|277|480)\s*v(?:olts?)?\b/i);
  if (category === "POWER_VOLTAGE" && voltage) return `${voltage[1]}V`;

  const trim = compact.match(/\b(\d{1,3}(?:\.\d+)?)\s*(?:ft|feet|foot|'|′)\b/i);
  if (category === "RIGGING_TRIM" && trim) return `${Number(trim[1])}FT`;

  const dimension = compact.match(/\b(\d{1,3}(?:\.\d+)?)\s*(?:ft|feet|'|′)?\s*[x×]\s*(\d{1,3}(?:\.\d+)?)\s*(?:ft|feet|'|′)?\b/i);
  if (["BACKLINE_RISER", "VIDEO_SCREEN"].includes(category) && dimension) {
    return `${Number(dimension[1])}x${Number(dimension[2])}FT`;
  }

  if (category === "VIDEO_TRANSPORT") {
    if (/tactical\s+fiber|\bfiber\b/i.test(compact)) return "FIBER";
    if (/cat\s*6|copper/i.test(compact)) return "COPPER";
    if (/smpte/i.test(compact)) return "SMPTE";
  }

  const quantity = compact.match(/\b(\d{1,3})\s+(?:production\s+)?(?:radios?|stagehands?|hands|follow\s*spots?|channels?|universes?)\b/i);
  if (quantity) return quantity[1];

  return null;
}

function confidenceFor(text: string, department: string, normalized: string | null) {
  let confidence = 0.68;
  if (department !== "Production") confidence += 0.08;
  if (normalized) confidence += 0.12;
  if (/\b(?:must|required|requires|shall|minimum|maximum|provide|confirm)\b/i.test(text)) confidence += 0.08;
  return Math.min(0.98, Number(confidence.toFixed(2)));
}

export function createProduction(workspaceId: string, details: ProductionDetails = {}, ordinal = 1): ProductionState {
  const createdAt = now();
  const productionId = newId("production");
  const defaults = {
    show_name: ordinal === 1 ? "New RIGOR Production" : `Production ${ordinal}`,
    artist: "Artist / client to confirm",
    venue: "Venue to confirm",
    city: "City to confirm",
    show_date: new Date(Date.now() + (21 + (ordinal - 1) * 7) * 86400000).toISOString().slice(0, 10),
  };
  const show = { ...defaults, ...details };

  return {
    production: { production_id: productionId, workspace_id: workspaceId, current_session: 1, completed_sessions: [], created_at: createdAt, updated_at: createdAt },
    show: { show_id: newId("show"), production_id: productionId, workspace_id: workspaceId, ...show, status: "DOCUMENTS_PENDING" },
    documents: [],
    requirements: [],
    conflicts: [],
    checkpoints: CHECKPOINTS.map(([label, department], sequence) => ({ checkpoint_id: newId("checkpoint"), production_id: productionId, workspace_id: workspaceId, label, department, sequence: sequence + 1, status: "PENDING", completed_at: null })),
    incidents: [],
    feedback: [],
    events: [{ event_id: newId("event"), type: "PRODUCTION_CREATED", created_at: createdAt, payload: { ordinal, seeded: false } }],
  };
}

export function createWorkspace(displayName: string, role: string): WorkspaceState {
  const createdAt = now();
  const testerId = newId("tester");
  const workspaceId = newId("workspace");
  const firstProduction = createProduction(workspaceId, {}, 1);
  return {
    tester: { tester_id: testerId, display_name: displayName.trim(), role },
    workspace: { workspace_id: workspaceId, tester_id: testerId, active_production_id: firstProduction.production.production_id, production_limit: PRODUCTION_LIMIT, created_at: createdAt, updated_at: createdAt },
    productions: [firstProduction],
  };
}

export function loadSampleProduction(input: WorkspaceState | ProductionState) {
  const state = resolveProduction(input);
  const createdAt = now();
  state.production.sample_demo = true;
  state.show = {
    ...state.show,
    show_name: "Neon Horizon World Tour — SAMPLE",
    artist: "Neon Horizon",
    venue: "Desert Crown Arena — SAMPLE",
    city: "Las Vegas, NV",
    show_date: new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10),
    status: "NEEDS_REVIEW",
  };
  state.documents = DOCUMENTS.map((doc) => ({
    document_id: newId("doc"),
    production_id: state.production.production_id,
    workspace_id: state.production.workspace_id,
    name: doc.name,
    doc_type: doc.doc_type,
    status: "PROCESSED",
    page_count: doc.page_count,
    source_kind: "SAMPLE",
    analysis_engine: "SAMPLE_DATA",
    created_at: createdAt,
  }));
  state.requirements = REQUIREMENTS.map(([department, title, detail, status, documentIndex, pageNumber, excerpt]) => {
    const category = classifyCategory(detail, department);
    const normalized = normalizedValue(detail, category);
    return {
      requirement_id: newId("req"),
      production_id: state.production.production_id,
      workspace_id: state.production.workspace_id,
      department,
      category,
      title,
      detail,
      normalized_value: normalized,
      unit: normalized?.match(/[A-Z]+$/)?.[0] || null,
      confidence: 0.98,
      origin_type: "SOURCE_DOCUMENT",
      status,
      owner: null,
      due_at: null,
      document_name: DOCUMENTS[documentIndex].name,
      page_number: pageNumber,
      source_location: `Page ${pageNumber}`,
      excerpt,
      source_kind: "SAMPLE",
      analysis_engine: "SAMPLE_DATA",
    };
  });
  state.conflicts = [];
  rebuildConflicts(state);
  state.incidents = [];
  state.feedback = [];
  state.events.push({
    event_id: newId("event"),
    type: "SAMPLE_PRODUCTION_LOADED",
    created_at: createdAt,
    payload: {
      sample: true,
      documents: state.documents.length,
      requirements: state.requirements.length,
      conflicts: state.conflicts.length,
    },
  });
  return state;
}

function migrateDemoRecords(production: ProductionState) {
  const demoDocumentIds = new Set(
    production.documents.filter((item) => item.source_kind === "DEMO").map((item) => item.document_id),
  );
  const hadDemoRecords = demoDocumentIds.size > 0 || production.requirements.some((item) => item.source_kind === "DEMO");
  if (!hadDemoRecords) return;

  production.documents = production.documents.filter((item) => item.source_kind !== "DEMO");
  production.requirements = production.requirements.filter((item) => item.source_kind !== "DEMO");
  production.conflicts = production.conflicts.filter((item) => Boolean(item.signature));
  rebuildConflicts(production);
  production.events.push({
    event_id: newId("event"),
    type: "DEMO_DATA_REMOVED",
    created_at: now(),
    payload: { preserved_uploaded_documents: production.documents.length, preserved_uploaded_requirements: production.requirements.length },
  });
}

export function normalizeWorkspace(raw: any): WorkspaceState {
  if (Array.isArray(raw.productions)) {
    raw.workspace.production_limit = PRODUCTION_LIMIT;
    if (!raw.workspace.active_production_id && raw.productions[0]) raw.workspace.active_production_id = raw.productions[0].production.production_id;
    const state = raw as WorkspaceState;
    state.productions.forEach(migrateDemoRecords);
    return state;
  }

  const legacyProductionId = raw.show?.show_id || newId("production");
  const production: ProductionState = {
    production: {
      production_id: legacyProductionId,
      workspace_id: raw.workspace.workspace_id,
      current_session: raw.workspace.current_session || 1,
      completed_sessions: raw.workspace.completed_sessions || [],
      created_at: raw.workspace.created_at || now(),
      updated_at: raw.workspace.updated_at || now(),
    },
    show: { ...raw.show, production_id: legacyProductionId },
    documents: raw.documents || [], requirements: raw.requirements || [], conflicts: raw.conflicts || [], checkpoints: raw.checkpoints || [], incidents: raw.incidents || [], feedback: raw.feedback || [], events: raw.events || [],
  };
  raw.workspace.active_production_id = legacyProductionId;
  raw.workspace.production_limit = PRODUCTION_LIMIT;
  delete raw.workspace.current_session;
  delete raw.workspace.completed_sessions;
  return { tester: raw.tester, workspace: raw.workspace, productions: [production] };
}

export function activeProduction(state: WorkspaceState): ProductionState {
  const production = state.productions.find((item) => item.production.production_id === state.workspace.active_production_id) || state.productions[0];
  if (!production) throw new Error("No production exists in this RIGOR workspace");
  state.workspace.active_production_id = production.production.production_id;
  return production;
}

function resolveProduction(state: WorkspaceState | ProductionState): ProductionState {
  return "productions" in state ? activeProduction(state as WorkspaceState) : state as ProductionState;
}

export function progress(input: WorkspaceState | ProductionState) {
  const state = resolveProduction(input);
  const reviewed = state.requirements.filter((item) => ["CONFIRMED", "REJECTED", "RESOLVED"].includes(item.status)).length;
  const actionable = state.requirements.filter((item) => ["CONFIRMED", "RESOLVED"].includes(item.status));
  const owned = actionable.filter((item) => Boolean(item.owner)).length;
  const resolved = state.conflicts.filter((item) => item.status === "RESOLVED").length;
  const checks = state.checkpoints.filter((item) => item.status === "COMPLETE").length;
  const openIncidents = state.incidents.filter((item) => !String(item.resolution || "").trim()).length;
  const reviewTarget = state.requirements.length;
  const ownerTarget = actionable.length;
  const sessionOneComplete = reviewTarget > 0 && reviewed === reviewTarget;
  const sessionTwoComplete = sessionOneComplete && resolved === state.conflicts.length && owned === ownerTarget;
  const showDayComplete = sessionTwoComplete && checks === state.checkpoints.length && openIncidents === 0;
  const sessions: Record<string, RecordMap> = {
    "1": { complete: sessionOneComplete, done: reviewed, total: reviewTarget || 1, label: "Preproduction intake" },
    "2": { complete: sessionTwoComplete, done: Math.min(resolved + owned, state.conflicts.length + ownerTarget), total: Math.max(1, state.conflicts.length + ownerTarget), label: "Technical advance" },
    "3": { complete: showDayComplete, done: checks, total: state.checkpoints.length, open_incidents: openIncidents, label: "Show day" },
  };
  const completed = [1, 2, 3].filter((number) => sessions[String(number)].complete);
  const current = !completed.includes(1) ? 1 : !completed.includes(2) ? 2 : 3;
  state.production.current_session = current;
  state.production.completed_sessions = completed;
  state.production.updated_at = now();
  return { sessions, current_session: current, completed_sessions: completed };
}

export function readiness(input: WorkspaceState | ProductionState, requirements?: RecordMap[], conflicts?: RecordMap[]) {
  const state = resolveProduction(input);
  const scopedRequirements = requirements || state.requirements;
  const scopedConflicts = conflicts || state.conflicts;
  const reviewed = scopedRequirements.filter((item) => ["CONFIRMED", "REJECTED", "RESOLVED"].includes(item.status)).length;
  const actionable = scopedRequirements.filter((item) => ["CONFIRMED", "RESOLVED"].includes(item.status));
  const owned = actionable.filter((item) => Boolean(item.owner)).length;
  const openConflicts = scopedConflicts.filter((item) => item.status !== "RESOLVED").length;
  const checks = state.checkpoints.filter((item) => item.status === "COMPLETE").length;
  const openIncidents = state.incidents.filter((item) => !String(item.resolution || "").trim());
  const blockingIncidents = openIncidents.filter((item) => ["HIGH", "CRITICAL"].includes(String(item.severity || "").toUpperCase()));
  if (!scopedRequirements.length) {
    return {
      score: 0,
      status: "DOCUMENTS_PENDING",
      confirmed_requirements: 0,
      total_requirements: 0,
      open_conflicts: 0,
      open_incidents: openIncidents.length,
      blocking_incidents: blockingIncidents.length,
      completed_checkpoints: checks,
      total_checkpoints: state.checkpoints.length,
    };
  }
  const requirementScore = reviewed / scopedRequirements.length;
  const ownershipScore = actionable.length ? owned / actionable.length : 1;
  const conflictScore = scopedConflicts.length ? 1 - openConflicts / scopedConflicts.length : 1;
  const checkpointScore = checks / Math.max(state.checkpoints.length, 1);
  const incidentScore = state.incidents.length ? 1 - openIncidents.length / state.incidents.length : 1;
  const score = Math.round((requirementScore * 0.35 + ownershipScore * 0.2 + conflictScore * 0.2 + checkpointScore * 0.15 + incidentScore * 0.1) * 100);
  const status = openConflicts || blockingIncidents.length
    ? "BLOCKED"
    : reviewed < scopedRequirements.length || owned < actionable.length || openIncidents.length
      ? "NEEDS_REVIEW"
      : checks === state.checkpoints.length
        ? "SHOW_READY"
        : "ADVANCE_READY";
  return {
    score,
    status,
    confirmed_requirements: reviewed,
    total_requirements: scopedRequirements.length,
    open_conflicts: openConflicts,
    open_incidents: openIncidents.length,
    blocking_incidents: blockingIncidents.length,
    completed_checkpoints: checks,
    total_checkpoints: state.checkpoints.length,
  };
}

export function departmentSummary(input: WorkspaceState | ProductionState) {
  const state = resolveProduction(input);
  return [...new Set(state.requirements.map((item) => item.department))].sort().map((department) => {
    const scoped = state.requirements.filter((item) => item.department === department);
    const open = state.conflicts.filter((item) => item.department === department && item.status !== "RESOLVED").length;
    const openIncidents = state.incidents.filter((item) => item.department === department && !String(item.resolution || "").trim());
    const blockingIncidents = openIncidents.filter((item) => ["HIGH", "CRITICAL"].includes(String(item.severity || "").toUpperCase()));
    const ready = scoped.filter((item) => ["CONFIRMED", "RESOLVED"].includes(item.status)).length;
    const status = open || blockingIncidents.length ? "BLOCKED" : ready === scoped.length && !openIncidents.length ? "READY" : "NEEDS_REVIEW";
    return { department, total: scoped.length, ready, open_conflicts: open, open_incidents: openIncidents.length, status };
  });
}

export function snapshot(state: WorkspaceState) {
  const active = activeProduction(state);
  const currentProgress = progress(active);
  const currentReadiness = readiness(active);
  active.show.status = currentReadiness.status;
  const productions = state.productions.map((item) => {
    const itemProgress = progress(item);
    const itemReadiness = readiness(item);
    item.show.status = itemReadiness.status;
    return { production_id: item.production.production_id, show: item.show, readiness: itemReadiness, progress: itemProgress };
  });
  return {
    tester: state.tester,
    workspace: { ...state.workspace, production_count: state.productions.length, production_limit: PRODUCTION_LIMIT },
    productions,
    ...active,
    progress: currentProgress,
    readiness: currentReadiness,
    departments: departmentSummary(active),
    intelligence: {
      mode: "STRUCTURED_EXTRACTION_V1",
      seeded: false,
      source_of_truth: "UPLOADED_DOCUMENTS",
      deerflow_bridge: (typeof Netlify !== "undefined" && Netlify.env.get("RIGOR_DEERFLOW_URL")) ? "CONFIGURED" : "PENDING_SERVICE_CONNECTION",
    },
  };
}

function conflictSeverity(category: string) {
  if (["POWER_CAPACITY", "RIGGING_TRIM", "RIGGING_LOAD"].includes(category)) return "CRITICAL";
  if (["VIDEO_TRANSPORT", "VIDEO_SCREEN", "BACKLINE_RISER", "AUDIO_PA"].includes(category)) return "HIGH";
  return "MEDIUM";
}

export function rebuildConflicts(input: WorkspaceState | ProductionState) {
  const state = resolveProduction(input);
  const existing = new Map(state.conflicts.map((item) => [item.signature, item]));
  const conflicts: RecordMap[] = [];
  const groups = new Map<string, RecordMap[]>();

  for (const item of state.requirements) {
    if (!item.normalized_value || !item.category) continue;
    const key = `${item.department}|${item.category}`;
    groups.set(key, [...(groups.get(key) || []), item]);
  }

  for (const items of groups.values()) {
    for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
        const left = items[leftIndex];
        const right = items[rightIndex];
        if (left.document_name === right.document_name || left.normalized_value === right.normalized_value) continue;
        const ids = [left.requirement_id, right.requirement_id].sort();
        const signature = `${left.department}|${left.category}|${ids.join("|")}`;
        const prior = existing.get(signature);
        conflicts.push({
          conflict_id: prior?.conflict_id || newId("conflict"),
          production_id: state.production.production_id,
          workspace_id: state.production.workspace_id,
          signature,
          department: left.department,
          category: left.category,
          title: `${left.department}: conflicting ${String(left.category).toLowerCase().replaceAll("_", " ")}`,
          severity: conflictSeverity(left.category),
          left_value: left.normalized_value,
          right_value: right.normalized_value,
          left_source: `${left.document_name} · p${left.page_number || "—"}`,
          right_source: `${right.document_name} · p${right.page_number || "—"}`,
          left_requirement_id: left.requirement_id,
          right_requirement_id: right.requirement_id,
          status: prior?.status || "OPEN",
          resolution: prior?.resolution || null,
          owner: prior?.owner || null,
          resolved_at: prior?.resolved_at || null,
        });
      }
    }
  }

  state.conflicts = conflicts.slice(0, 30);
  return state.conflicts;
}

export function extractRequirements(input: WorkspaceState | ProductionState, documentName: string, pages: string[]) {
  const state = resolveProduction(input);
  const trigger = /\b(must|required|requires|provide|minimum|maximum|shall|confirm|available|limited|rated|load[- ]?in|voltage|amp(?:s|ere)?|capacity|only|opens?|closes?)\b/i;
  const created: RecordMap[] = [];
  const seen = new Set(state.requirements.map((item) => `${item.document_name}|${item.excerpt}`));

  pages.some((page, pageIndex) => page.split(/(?<=[.!?])\s+|[\r\n]+/).some((sentence) => {
    const cleaned = sentence.replace(/\s+/g, " ").replace(/^[\s\-•]+/, "").trim();
    if (cleaned.length < 20 || cleaned.length > 420 || !trigger.test(cleaned)) return false;
    const dedupeKey = `${documentName}|${cleaned}`;
    if (seen.has(dedupeKey)) return false;

    const department = classifyDepartment(cleaned);
    const category = classifyCategory(cleaned, department);
    const normalized = normalizedValue(cleaned, category);
    const item = {
      requirement_id: newId("req"),
      production_id: state.production.production_id,
      workspace_id: state.production.workspace_id,
      department,
      category,
      title: cleaned.slice(0, 82).replace(/[ ,.;:]+$/, ""),
      detail: cleaned,
      normalized_value: normalized,
      unit: normalized?.match(/[A-Z]+$/)?.[0] || null,
      confidence: confidenceFor(cleaned, department, normalized),
      origin_type: "SOURCE_DOCUMENT",
      status: "NEEDS_CONFIRMATION",
      owner: null,
      due_at: null,
      document_name: documentName,
      page_number: pageIndex + 1,
      source_location: `Page ${pageIndex + 1}`,
      excerpt: cleaned,
      source_kind: "TESTER",
    };
    state.requirements.push(item);
    created.push(item);
    seen.add(dedupeKey);
    return created.length >= 60;
  }));

  rebuildConflicts(state);
  return created;
}

export function validateDepartment(value: unknown): value is string {
  return typeof value === "string" && (DEPARTMENTS as readonly string[]).includes(value);
}
