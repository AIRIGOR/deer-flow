export type MissionPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type MissionStatus =
  | "QUEUED"
  | "ACTIVE"
  | "REVIEWED"
  | "BLOCKED"
  | "NEEDS_APPROVAL"
  | "COMPLETE"
  | "CANCELLED";

export type CompanyMission = {
  mission_id: string;
  title: string;
  objective: string;
  priority: MissionPriority;
  status: MissionStatus;
  created_at: string;
  updated_at: string;
  last_pulse_at?: string | null;
  last_summary?: string | null;
};

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export type CompanyApproval = {
  approval_id: string;
  fingerprint: string;
  title: string;
  status: ApprovalStatus;
  source_ref?: string | null;
  decision_note?: string | null;
  created_at: string;
  updated_at: string;
  decided_at?: string | null;
};

const PRIORITY_WEIGHT: Record<MissionPriority, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

const OPEN_MISSION_STATUSES = new Set<MissionStatus>([
  "ACTIVE",
  "QUEUED",
  "REVIEWED",
  "BLOCKED",
  "NEEDS_APPROVAL",
]);

export function normalizePriority(value: unknown): MissionPriority {
  const candidate = String(value || "MEDIUM").trim().toUpperCase();
  return candidate === "CRITICAL" ||
    candidate === "HIGH" ||
    candidate === "LOW"
    ? candidate
    : "MEDIUM";
}

export function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function createMission(
  input: Record<string, unknown>,
  missionId: string,
  timestamp: string,
): CompanyMission {
  const title = cleanText(input.title, 180);
  const objective = cleanText(input.objective, 4000);
  if (title.length < 3) throw new Error("Mission title must be at least 3 characters");
  if (objective.length < 8) throw new Error("Mission objective must be at least 8 characters");
  return {
    mission_id: missionId,
    title,
    objective,
    priority: normalizePriority(input.priority),
    status: "QUEUED",
    created_at: timestamp,
    updated_at: timestamp,
    last_pulse_at: null,
    last_summary: null,
  };
}

export function selectNextMission(missions: CompanyMission[]) {
  const active = missions.filter((mission) => mission.status === "ACTIVE");
  if (active.length) {
    return [...active].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  }
  const queued = missions.filter((mission) => mission.status === "QUEUED");
  if (!queued.length) return null;
  return [...queued].sort((a, b) => {
    const priorityDelta = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    return priorityDelta || a.created_at.localeCompare(b.created_at);
  })[0];
}

export function setMissionActive(
  missions: CompanyMission[],
  missionId: string,
  timestamp: string,
) {
  return missions.map((mission) =>
    mission.mission_id === missionId
      ? { ...mission, status: "ACTIVE" as const, updated_at: timestamp }
      : mission,
  );
}

export function reviewMission(
  missions: CompanyMission[],
  missionId: string,
  timestamp: string,
  summary: string,
  requiresApproval: boolean,
) {
  return missions.map((mission) =>
    mission.mission_id === missionId
      ? {
          ...mission,
          status: requiresApproval ? ("NEEDS_APPROVAL" as const) : ("REVIEWED" as const),
          last_pulse_at: timestamp,
          last_summary: cleanText(summary, 4000),
          updated_at: timestamp,
        }
      : mission,
  );
}

export function updateMission(
  missions: CompanyMission[],
  missionId: string,
  input: Record<string, unknown>,
  timestamp: string,
) {
  const allowedStatuses = new Set<MissionStatus>([
    "QUEUED",
    "ACTIVE",
    "REVIEWED",
    "BLOCKED",
    "NEEDS_APPROVAL",
    "COMPLETE",
    "CANCELLED",
  ]);
  let found = false;
  const next = missions.map((mission) => {
    if (mission.mission_id !== missionId) return mission;
    found = true;
    const statusCandidate = String(input.status ?? mission.status).trim().toUpperCase() as MissionStatus;
    if (!allowedStatuses.has(statusCandidate)) throw new Error("Invalid mission status");
    const title = input.title === undefined ? mission.title : cleanText(input.title, 180);
    const objective = input.objective === undefined ? mission.objective : cleanText(input.objective, 4000);
    if (title.length < 3) throw new Error("Mission title must be at least 3 characters");
    if (objective.length < 8) throw new Error("Mission objective must be at least 8 characters");
    return {
      ...mission,
      title,
      objective,
      priority: input.priority === undefined ? mission.priority : normalizePriority(input.priority),
      status: statusCandidate,
      updated_at: timestamp,
    };
  });
  if (!found) throw new Error("Mission not found");
  return next;
}

function approvalFingerprint(title: string) {
  return cleanText(title, 1000).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function mergeApprovals(
  current: CompanyApproval[],
  titles: string[],
  sourceRef: string,
  timestamp: string,
  idFactory: () => string,
) {
  const next = current.map((item) => ({ ...item }));
  for (const raw of titles) {
    const title = cleanText(raw, 1000);
    if (!title) continue;
    const fingerprint = approvalFingerprint(title);
    const existing = next.find(
      (item) => item.fingerprint === fingerprint && item.status === "PENDING",
    );
    if (existing) {
      existing.updated_at = timestamp;
      existing.source_ref = sourceRef;
      continue;
    }
    next.push({
      approval_id: idFactory(),
      fingerprint,
      title,
      status: "PENDING",
      source_ref: sourceRef,
      decision_note: null,
      created_at: timestamp,
      updated_at: timestamp,
      decided_at: null,
    });
  }
  return next
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 250);
}

export function decideApproval(
  approvals: CompanyApproval[],
  approvalId: string,
  decision: "APPROVED" | "REJECTED",
  note: string,
  timestamp: string,
) {
  let found = false;
  const next = approvals.map((approval) => {
    if (approval.approval_id !== approvalId) return approval;
    found = true;
    if (approval.status !== "PENDING") throw new Error("Approval has already been decided");
    return {
      ...approval,
      status: decision,
      decision_note: cleanText(note, 2000) || null,
      decided_at: timestamp,
      updated_at: timestamp,
    };
  });
  if (!found) throw new Error("Approval not found");
  return next;
}

export function openMissions(missions: CompanyMission[]) {
  return missions.filter((mission) => OPEN_MISSION_STATUSES.has(mission.status));
}
