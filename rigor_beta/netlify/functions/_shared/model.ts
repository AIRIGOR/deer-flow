import { CHECKPOINTS, CONFLICTS, DEPARTMENTS, DOCUMENTS, KEYWORDS, REQUIREMENTS } from "./seed.js";

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

export function createProduction(workspaceId: string, details: ProductionDetails = {}, ordinal = 1): ProductionState {
  const createdAt = now();
  const productionId = newId("production");
  const defaults = ordinal === 1
    ? { show_name: "Northstar Arena Tour · Las Vegas", artist: "Northstar", venue: "Desert Crown Arena", city: "Las Vegas, NV", show_date: "2026-10-24" }
    : { show_name: `Demo Production ${ordinal}`, artist: "New production", venue: "Venue to confirm", city: "City to confirm", show_date: "2026-11-01" };
  const show = { ...defaults, ...details };

  return {
    production: { production_id: productionId, workspace_id: workspaceId, current_session: 1, completed_sessions: [], created_at: createdAt, updated_at: createdAt },
    show: { show_id: newId("show"), production_id: productionId, workspace_id: workspaceId, ...show, status: "PREPRODUCTION" },
    documents: DOCUMENTS.map((document) => ({ document_id: newId("doc"), production_id: productionId, workspace_id: workspaceId, ...document, status: "PROCESSED", source_kind: "DEMO", created_at: createdAt })),
    requirements: REQUIREMENTS.map(([department, title, detail, status, documentIndex, pageNumber, excerpt]) => ({ requirement_id: newId("req"), production_id: productionId, workspace_id: workspaceId, department, title, detail, status, owner: null, due_at: null, document_name: DOCUMENTS[documentIndex].name, page_number: pageNumber, excerpt, source_kind: "DEMO" })),
    conflicts: CONFLICTS.map(([department, title, severity, leftValue, rightValue, leftSource, rightSource]) => ({ conflict_id: newId("conflict"), production_id: productionId, workspace_id: workspaceId, department, title, severity, left_value: leftValue, right_value: rightValue, left_source: leftSource, right_source: rightSource, status: "OPEN", resolution: null, owner: null, resolved_at: null })),
    checkpoints: CHECKPOINTS.map(([label, department], sequence) => ({ checkpoint_id: newId("checkpoint"), production_id: productionId, workspace_id: workspaceId, label, department, sequence: sequence + 1, status: "PENDING", completed_at: null })),
    incidents: [],
    feedback: [],
    events: [{ event_id: newId("event"), type: "PRODUCTION_CREATED", created_at: createdAt, payload: { ordinal } }],
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

export function normalizeWorkspace(raw: any): WorkspaceState {
  if (Array.isArray(raw.productions)) {
    raw.workspace.production_limit = PRODUCTION_LIMIT;
    if (!raw.workspace.active_production_id && raw.productions[0]) raw.workspace.active_production_id = raw.productions[0].production.production_id;
    return raw as WorkspaceState;
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
  if (!production) throw new Error("No production exists in this demo workspace");
  state.workspace.active_production_id = production.production.production_id;
  return production;
}

function resolveProduction(state: WorkspaceState | ProductionState): ProductionState {
  return "productions" in state ? activeProduction(state as WorkspaceState) : state as ProductionState;
}

export function progress(input: WorkspaceState | ProductionState) {
  const state = resolveProduction(input);
  const reviewed = state.requirements.filter((item) => ["CONFIRMED", "REJECTED", "RESOLVED"].includes(item.status)).length;
  const owned = state.requirements.filter((item) => Boolean(item.owner)).length;
  const resolved = state.conflicts.filter((item) => item.status === "RESOLVED").length;
  const checks = state.checkpoints.filter((item) => item.status === "COMPLETE").length;
  const sessions: Record<string, RecordMap> = {
    "1": { complete: reviewed >= 6, done: reviewed, total: 6, label: "Preproduction intake" },
    "2": { complete: resolved === state.conflicts.length && owned >= 4, done: Math.min(resolved + owned, state.conflicts.length + 4), total: state.conflicts.length + 4, label: "Technical advance" },
    "3": { complete: checks === state.checkpoints.length, done: checks, total: state.checkpoints.length, label: "Show day" },
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
  const confirmed = scopedRequirements.filter((item) => ["CONFIRMED", "RESOLVED"].includes(item.status)).length;
  const openConflicts = scopedConflicts.filter((item) => item.status !== "RESOLVED").length;
  const checks = state.checkpoints.filter((item) => item.status === "COMPLETE").length;
  const score = Math.round(((confirmed / Math.max(scopedRequirements.length, 1)) * 0.45 + (1 - openConflicts / Math.max(scopedConflicts.length, 1)) * 0.35 + (checks / Math.max(state.checkpoints.length, 1)) * 0.2) * 100);
  const status = openConflicts ? "BLOCKED" : checks === state.checkpoints.length ? "SHOW_READY" : "ADVANCE_READY";
  return { score, status, confirmed_requirements: confirmed, total_requirements: scopedRequirements.length, open_conflicts: openConflicts, completed_checkpoints: checks, total_checkpoints: state.checkpoints.length };
}

export function departmentSummary(input: WorkspaceState | ProductionState) {
  const state = resolveProduction(input);
  return [...new Set(state.requirements.map((item) => item.department))].sort().map((department) => {
    const scoped = state.requirements.filter((item) => item.department === department);
    const open = state.conflicts.filter((item) => item.department === department && item.status !== "RESOLVED").length;
    const ready = scoped.filter((item) => ["CONFIRMED", "RESOLVED"].includes(item.status)).length;
    return { department, total: scoped.length, ready, open_conflicts: open, status: open ? "BLOCKED" : ready === scoped.length ? "READY" : "NEEDS_REVIEW" };
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
  };
}

export function extractRequirements(input: WorkspaceState | ProductionState, documentName: string, pages: string[]) {
  const state = resolveProduction(input);
  const trigger = /\b(must|required|requires|provide|minimum|maximum|shall|confirm|load[- ]?in|voltage|amp(?:s|ere)?)\b/i;
  const created: RecordMap[] = [];
  pages.some((page, pageIndex) => page.split(/(?<=[.!?])\s+|[\r\n]+/).some((sentence) => {
    const cleaned = sentence.replace(/\s+/g, " ").replace(/^[\s\-•]+/, "").trim();
    if (cleaned.length < 24 || cleaned.length > 360 || !trigger.test(cleaned)) return false;
    const lowered = ` ${cleaned.toLowerCase()} `;
    const department = Object.entries(KEYWORDS).find(([, words]) => words.some((word) => lowered.includes(word)))?.[0] ?? "Production";
    const item = { requirement_id: newId("req"), production_id: state.production.production_id, workspace_id: state.production.workspace_id, department, title: cleaned.slice(0, 72).replace(/[ ,.;:]+$/, ""), detail: cleaned, status: "NEEDS_CONFIRMATION", owner: null, due_at: null, document_name: documentName, page_number: pageIndex + 1, excerpt: cleaned, source_kind: "TESTER" };
    state.requirements.push(item); created.push(item);
    return created.length >= 40;
  }));
  return created;
}

export function validateDepartment(value: unknown): value is string {
  return typeof value === "string" && (DEPARTMENTS as readonly string[]).includes(value);
}
