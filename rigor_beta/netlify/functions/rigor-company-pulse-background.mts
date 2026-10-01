import { timingSafeEqual } from "node:crypto";
import {companyStore} from "./_shared/company-store.js";
import {boundedCompanyContext} from "./_shared/company-context.js";
import type { Context } from "@netlify/functions";
import { normalizeExecutionResult, delegationVerified } from "./_shared/founder.js";

type StateUpdate = {
  record_type: "OBJECTIVE" | "MILESTONE" | "RELATIONSHIP" | "FEEDBACK" | "RISK" | "EXPERIMENT" | "RUNWAY";
  title: string;
  summary?: string | null;
  status?: "OPEN" | "ACTIVE" | "BLOCKED" | "NEEDS_APPROVAL" | "COMPLETE" | "ARCHIVED";
  priority?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  owner_agent?: string | null;
  approval_required?: boolean;
  source_ref?: string | null;
  payload?: Record<string, unknown>;
};

type CompanyStateRecord = StateUpdate & {
  record_key: string;
  created_at: string;
  updated_at: string;
};

type ActionType =
  | "INTERNAL_RESEARCH"
  | "INTERNAL_TEST"
  | "INTERNAL_DOCUMENT"
  | "INTERNAL_CODE_CHANGE"
  | "OUTREACH_DRAFT"
  | "SUPPORT_DRAFT"
  | "APPLICATION_DRAFT"
  | "EMAIL_SEND"
  | "PUBLIC_POST"
  | "AD_SPEND"
  | "CONTRACT"
  | "CAPITAL_ACCEPT"
  | "PAYMENT"
  | "PRODUCTION_PROMOTE"
  | "CREDENTIAL_CHANGE"
  | "DATA_DELETE";

type ActionScope =
  | "OBSERVE"
  | "PREPARE"
  | "INTERNAL_EXECUTE"
  | "EXTERNAL_EXECUTE"
  | "FOUNDER_RESERVED";

type ActionStatus =
  | "APPROVED"
  | "NEEDS_APPROVAL"
  | "EXECUTING"
  | "COMPLETE"
  | "FAILED"
  | "REJECTED"
  | "CANCELLED";

type ActionProposal = {
  action_type: ActionType;
  scope: ActionScope;
  title: string;
  summary?: string | null;
  owner_agent?: string | null;
  target?: string | null;
  reversible?: boolean;
  evidence_refs?: string[];
  payload?: Record<string, unknown>;
};

type ActionQueueRecord = ActionProposal & {
  action_key: string;
  approval_required: boolean;
  status: ActionStatus;
  policy_reason: string;
  created_at: string;
  updated_at: string;
};

type PulsePayload = {
  execution_receipts?: unknown[];
  current_state: string;
  top_priorities: string[];
  blockers_risks: string[];
  founder_approvals: string[];
  next_actions: string[];
  state_updates: StateUpdate[];
  action_proposals?: ActionProposal[];
};

const FOUNDER_RESERVED_ACTIONS = new Set<ActionType>([
  "EMAIL_SEND",
  "PUBLIC_POST",
  "AD_SPEND",
  "CONTRACT",
  "CAPITAL_ACCEPT",
  "PAYMENT",
  "PRODUCTION_PROMOTE",
  "CREDENTIAL_CHANGE",
  "DATA_DELETE",
]);

const AUTO_ALLOWED_ACTIONS = new Set<ActionType>([
  "INTERNAL_RESEARCH",
  "INTERNAL_TEST",
  "INTERNAL_DOCUMENT",
  "OUTREACH_DRAFT",
  "SUPPORT_DRAFT",
  "APPLICATION_DRAFT",
]);

const TERMINAL_ACTION_STATUSES = new Set<ActionStatus>([
  "COMPLETE",
  "REJECTED",
  "CANCELLED",
]);

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}


async function publicJson(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json, application/json",
        "User-Agent": "RIGOR-company-operator",
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return { status: response.status };
    return await response.json();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "fetch failed" };
  }
}

export async function buildCompanyContext(
  request: Request,
  priorState: CompanyStateRecord[],
  priorActions: ActionQueueRecord[],
) {
  const deployment = await publicJson(new URL("/deploy-meta.json", request.url).toString()) as Record<string, unknown>;
  const commitRef = typeof deployment?.commit === "string" && /^[a-f0-9]{40}$/i.test(deployment.commit) ? deployment.commit : null;
  const branch = typeof deployment?.branch === "string" ? deployment.branch : null;
  const [commit, runs, previewHealth, deerflowHealth] = await Promise.all([
    commitRef ? publicJson(`https://api.github.com/repos/AIRIGOR/deer-flow/commits/${commitRef}`) : Promise.resolve({error: "Deployed commit unavailable"}),
    commitRef ? publicJson(`https://api.github.com/repos/AIRIGOR/deer-flow/actions/runs?head_sha=${commitRef}&per_page=10`) : Promise.resolve({error: "CI evidence unavailable without deployed commit"}),
    publicJson(new URL("/api/health", request.url).toString()),
    (() => {
      const base = Netlify.env.get("RIGOR_DEERFLOW_URL")?.trim();
      return base ? publicJson(`${base.replace(/\/$/, "")}/health`) : Promise.resolve({error: "RIGOR_DEERFLOW_URL missing"});
    })(),
  ]);

  const recentRuns = Array.isArray((runs as any)?.workflow_runs)
    ? (runs as any).workflow_runs.filter((run: any) => run.head_sha === commitRef).slice(0, 10).map((run: any) => ({
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        head_sha: run.head_sha,
        created_at: run.created_at,
      }))
    : runs;

  return {
    generated_at: new Date().toISOString(),
    branch,
    deployed_commit: commitRef,
    deployment,
    evidence_rules: [
      "CI results apply only to their exact head_sha. No test or audit failure is verified without a specific failing result and source.",
      "Prior company state contains assessments, not independently verified facts; recheck claims against current evidence.",
      "Current build completion excludes external tester participation and repeated real-world production validation. Those are later validation gates.",
      "Capital pipeline and partnerships are business work, not product build-completion gates.",
      "Review completion proves execution only, not release readiness. Unknown evidence remains unknown.",
    ],
    branch_head:
      typeof (commit as any)?.sha === "string"
        ? (commit as any).sha
        : commit,
    recent_workflow_runs: recentRuns,
    preview_health: previewHealth,
    deerflow_health: deerflowHealth,
    netlify_deploy_id: contextDeployId(request),
    corporate_mailbox: (() => {
      const address = Netlify.env.get("RIGOR_CORP_FROM_EMAIL")?.trim() || "";
      return {
        configured: Boolean(address),
        address: address || null,
        mode: address ? "temporary-founder-mailbox" : "not-configured",
      };
    })(),
    durable_company_state: priorState.slice(0, 250),
    durable_action_queue: priorActions.slice(0, 100),
  };
}

function slug(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 180);
}

function recordKey(update: StateUpdate) {
  return `${update.record_type}:${slug(update.title)}`;
}

function actionKey(action: ActionProposal) {
  return `${action.action_type}:${slug(action.title)}`;
}

function actionPolicy(action: ActionProposal) {
  if (FOUNDER_RESERVED_ACTIONS.has(action.action_type)) {
    return {
      approval_required: true,
      status: "NEEDS_APPROVAL" as ActionStatus,
      policy_reason: `${action.action_type} is Founder-reserved`,
    };
  }
  if (
    action.scope === "EXTERNAL_EXECUTE" ||
    action.scope === "FOUNDER_RESERVED"
  ) {
    return {
      approval_required: true,
      status: "NEEDS_APPROVAL" as ActionStatus,
      policy_reason: `${action.scope} requires Founder approval`,
    };
  }
  if (action.action_type === "INTERNAL_CODE_CHANGE") {
    return {
      approval_required: true,
      status: "NEEDS_APPROVAL" as ActionStatus,
      policy_reason: "code changes require review before execution",
    };
  }
  if (
    AUTO_ALLOWED_ACTIONS.has(action.action_type) &&
    ["OBSERVE", "PREPARE", "INTERNAL_EXECUTE"].includes(action.scope)
  ) {
    return {
      approval_required: false,
      status: "APPROVED" as ActionStatus,
      policy_reason:
        "bounded internal action is eligible for automatic execution",
    };
  }
  return {
    approval_required: true,
    status: "NEEDS_APPROVAL" as ActionStatus,
    policy_reason: "action is not on the automatic allowlist",
  };
}

function mergeState(
  current: CompanyStateRecord[],
  updates: StateUpdate[],
): CompanyStateRecord[] {
  const now = new Date().toISOString();
  const byKey = new Map(
    current.map((record) => [record.record_key, { ...record }]),
  );

  for (const update of updates || []) {
    if (!update?.record_type || !update?.title) continue;
    const key = recordKey(update);
    const previous = byKey.get(key);
    byKey.set(key, {
      ...(previous || {
        record_key: key,
        record_type: update.record_type,
        title: update.title,
        created_at: now,
      }),
      ...update,
      record_key: key,
      created_at: previous?.created_at || now,
      updated_at: now,
    });
  }

  return Array.from(byKey.values())
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 500);
}

function mergeActions(
  current: ActionQueueRecord[],
  proposals: ActionProposal[],
): ActionQueueRecord[] {
  const now = new Date().toISOString();
  const byKey = new Map(
    current.map((action) => [action.action_key, { ...action }]),
  );

  for (const proposal of proposals || []) {
    if (!proposal?.action_type || !proposal?.scope || !proposal?.title) continue;
    const key = actionKey(proposal);
    const previous = byKey.get(key);
    if (previous && TERMINAL_ACTION_STATUSES.has(previous.status)) {
      continue;
    }
    const policy = actionPolicy(proposal);
    byKey.set(key, {
      ...(previous || {
        action_key: key,
        created_at: now,
      }),
      ...proposal,
      ...policy,
      action_key: key,
      status: previous?.status === "EXECUTING" ? "EXECUTING" : policy.status,
      created_at: previous?.created_at || now,
      updated_at: now,
    });
  }

  return Array.from(byKey.values())
    .sort((a, b) => {
      if (a.approval_required !== b.approval_required) {
        return a.approval_required ? -1 : 1;
      }
      return b.updated_at.localeCompare(a.updated_at);
    })
    .slice(0, 250);
}

function actionCounts(queue: ActionQueueRecord[]) {
  return {
    total: queue.length,
    approved: queue.filter((item) => item.status === "APPROVED").length,
    needs_founder_approval: queue.filter(
      (item) => item.status === "NEEDS_APPROVAL",
    ).length,
    executing: queue.filter((item) => item.status === "EXECUTING").length,
    complete: queue.filter((item) => item.status === "COMPLETE").length,
  };
}

function contextDeployId(request: Request) {
  return request.headers.get("x-nf-deploy-id") || null;
}

async function trimHistory(store: Awaited<ReturnType<typeof companyStore>>) {
  const listed = await store.list({ prefix: "pulse/history/" });
  const keys = listed.blobs.map((item) => item.key).sort();
  const excess = keys.slice(0, Math.max(0, keys.length - 30));
  await Promise.all(excess.map((key) => store.delete(key)));
}

export async function runCompanyPulse(request: Request, context: Context, founderObjective?: string) {
  const expected = Netlify.env.get("RIGOR_DEERFLOW_TOKEN")?.trim() || "";
  const provided =
    request.headers.get("x-rigor-automation-token")?.trim() || "";
  if (!expected || !provided || !safeEqual(expected, provided)) {
    console.warn("RIGOR company pulse background invocation rejected");
    return;
  }

  const baseUrl = Netlify.env.get("RIGOR_DEERFLOW_URL")?.trim();
  if (!baseUrl) {
    console.error("RIGOR company pulse: RIGOR_DEERFLOW_URL missing");
    return;
  }

  const store = await companyStore(context);
  const startedAt = new Date().toISOString();
  await store.setJSON("pulse/last-attempt", { started_at: startedAt, status: "RUNNING" });
  try {
    const [priorState, priorActions] = await Promise.all([
      store.get("state/records", { type: "json" }) as Promise<
        CompanyStateRecord[] | null
      >,
      store.get("actions/queue", { type: "json" }) as Promise<
        ActionQueueRecord[] | null
      >,
    ]);
    const companyState = priorState || [];
    const actionQueue = priorActions || [];
    const companyContext = await buildCompanyContext(
      request,
      companyState,
      actionQueue,
    );

    const response = await fetch(
      `${baseUrl.replace(/\/$/, "")}/api/rigor/company/pulse`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RIGOR-Service-Token": expected,
        },
        body: JSON.stringify({
          objective:
            founderObjective?.trim().slice(0, 2000) || "Run the RIGOR founder operating review. Advance product proof, revenue readiness, customer value, capital readiness, and the safe AI-operated company action queue while preserving Founder authority.",
          context: boundedCompanyContext(companyContext),
        }),
        signal: AbortSignal.timeout(13 * 60 * 1000),
      },
    );

    if (!response.ok) {
      await store.setJSON("pulse/last-attempt", {
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        status: "FAILED",
        failure_code: `UPSTREAM_HTTP_${response.status}`,
      });
      console.error(
        "RIGOR company pulse failed",
        response.status,
        "Upstream execution rejected",
      );
      if (founderObjective) throw new Error(`UPSTREAM_HTTP_${response.status}`);
      return;
    }

    const pulse = normalizeExecutionResult(await response.json()) as PulsePayload;
    if (!delegationVerified(pulse as unknown as Record<string, unknown>, undefined, true)) {
      await store.setJSON("pulse/last-attempt", {started_at: startedAt, completed_at: new Date().toISOString(), status: "FAILED", failure_code: "DELEGATION_NOT_VERIFIED"});
      if (founderObjective) throw new Error("DELEGATION_NOT_VERIFIED");
      return;
    }
    const nextState = mergeState(companyState, pulse.state_updates || []);
    const nextActions = mergeActions(actionQueue, pulse.action_proposals || []);
    const counts = actionCounts(nextActions);
    const envelope = {
      generated_at: new Date().toISOString(),
      source: "RIGOR_AI_COMPANY_V1",
      context: companyContext,
      pulse,
    };

    const timestamp = envelope.generated_at.replace(/[:.]/g, "-");
    await store.setJSON("state/records", nextState);
    await store.setJSON("actions/queue", nextActions);
    await store.setJSON("pulse/latest", {
      ...envelope,
      durable_state_records: nextState.length,
      action_queue: counts,
    });
    await store.setJSON(`pulse/history/${timestamp}.json`, {
      ...envelope,
      durable_state_records: nextState.length,
      action_queue: counts,
    });
    await trimHistory(store);
    await store.setJSON("pulse/last-attempt", {
      started_at: startedAt,
      completed_at: envelope.generated_at,
      status: "COMPLETE",
    });
    console.log(
      "RIGOR company pulse stored",
      envelope.generated_at,
      pulse.top_priorities?.length ?? 0,
      "actions",
      counts,
    );

    if (counts.approved > 0) {
      try {
        const runnerResponse = await fetch(
          new URL(
            "/.netlify/functions/rigor-company-action-runner-background",
            request.url,
          ),
          {
            method: "POST",
            headers: {
              "X-RIGOR-Automation-Token": expected,
              "X-RIGOR-Action-Depth": "0",
            },
            signal: AbortSignal.timeout(10000),
          },
        );
        if (!runnerResponse.ok) {
          console.warn(
            "RIGOR action runner launch rejected",
            runnerResponse.status,
          );
        }
      } catch (error) {
        console.warn(
          "RIGOR action runner launch failed",
          error instanceof Error ? error.message : error,
        );
      }
    }
    return {...envelope, durable_state_records: nextState.length, action_queue: counts};
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const failureCode = /^(UPSTREAM_HTTP_\d{3}|DELEGATION_NOT_VERIFIED|COMPANY_CONTEXT_TOO_LARGE)$/.test(message) ? message : "PULSE_EXECUTION_FAILED";
    await store.setJSON("pulse/last-attempt", {
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      status: "FAILED",
      failure_code: failureCode,
    });
    console.error("RIGOR company pulse execution failed", error instanceof Error ? error.name : "UnknownError");
    if (founderObjective) throw new Error(failureCode);
  }
}

export default async (request: Request, context: Context) => {
  await runCompanyPulse(request, context);
};
