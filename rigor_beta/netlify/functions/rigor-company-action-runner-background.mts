import { normalizeExecutionResult, delegationVerified } from "./_shared/founder.js";
import { companyActionContext, deerFlowRequest } from "./_shared/deerflow.js";
import { createHash, timingSafeEqual } from "node:crypto";
import {companyStore} from "./_shared/company-store.js";
import type { Context } from "@netlify/functions";

type ActionStatus =
  | "APPROVED"
  | "NEEDS_APPROVAL"
  | "EXECUTING"
  | "COMPLETE"
  | "FAILED"
  | "REJECTED"
  | "CANCELLED";

type ActionQueueRecord = {
  action_key: string;
  action_type: string;
  scope: string;
  title: string;
  summary?: string | null;
  owner_agent?: string | null;
  target?: string | null;
  reversible?: boolean;
  evidence_refs?: string[];
  payload?: Record<string, unknown>;
  approval_required: boolean;
  status: ActionStatus;
  policy_reason: string;
  created_at: string;
  updated_at: string;
  attempt_count?: number;
  result_ref?: string | null;
  last_error?: string | null;
  completed_at?: string | null;
};

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}


function proposalFor(action: ActionQueueRecord) {
  return {
    action_type: action.action_type,
    scope: action.scope,
    title: action.title,
    summary: action.summary ?? null,
    owner_agent: action.owner_agent ?? null,
    target: action.target ?? null,
    reversible: action.reversible ?? true,
    evidence_refs: action.evidence_refs ?? [],
    payload: action.payload ?? {},
  };
}

const automaticTypes = new Set(['INTERNAL_RESEARCH', 'INTERNAL_TEST', 'INTERNAL_DOCUMENT', 'OUTREACH_DRAFT', 'SUPPORT_DRAFT', 'APPLICATION_DRAFT']);
function eligible(action: ActionQueueRecord) {
  return action.status === 'APPROVED' && action.approval_required === false
    && automaticTypes.has(action.action_type)
    && ['OBSERVE', 'PREPARE', 'INTERNAL_EXECUTE'].includes(action.scope);
}
function claimKey(action: ActionQueueRecord) {
  return 'actions/execution-claims/' + createHash('sha256').update(action.action_key).digest('hex');
}
async function patchQueue(store: Awaited<ReturnType<typeof companyStore>>, action: ActionQueueRecord, patch: Partial<ActionQueueRecord>, expectedStatus: ActionStatus) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const saved = await store.getWithMetadata('actions/queue', {type: 'json'});
    if (!saved?.etag || !Array.isArray(saved.data)) return false;
    const current = saved.data as ActionQueueRecord[];
    const index = current.findIndex(row => row.action_key === action.action_key);
    if (index < 0 || current[index].status !== expectedStatus || JSON.stringify(proposalFor(current[index])) !== JSON.stringify(proposalFor(action))) return false;
    if (expectedStatus === 'APPROVED' && !eligible(current[index])) return false;
    const next = current.map((row, i) => i === index ? {...row, ...patch} : row);
    if ((await store.setJSON('actions/queue', next, {onlyIfMatch: saved.etag})).modified) return true;
  }
  throw new Error('QUEUE_UPDATE_CONFLICT');
}

async function chainNext(
  request: Request,
  token: string,
  depth: number,
) {
  if (depth >= 5) return;
  try {
    const response = await fetch(
      new URL(
        "/.netlify/functions/rigor-company-action-runner-background",
        request.url,
      ),
      {
        method: "POST",
        headers: {
          "X-RIGOR-Automation-Token": token,
          "X-RIGOR-Action-Depth": String(depth + 1),
        },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) {
      console.warn("RIGOR action runner chain rejected", response.status);
    }
  } catch (error) {
    console.warn(
      "RIGOR action runner chain failed",
      error instanceof Error ? error.message : error,
    );
  }
}

export default async (request: Request, context: Context) => {
  const expected = Netlify.env.get("RIGOR_DEERFLOW_TOKEN")?.trim() || "";
  const provided =
    request.headers.get("x-rigor-automation-token")?.trim() || "";
  if (!expected || !provided || !safeEqual(expected, provided)) {
    console.warn("RIGOR company action runner invocation rejected");
    return;
  }

  const baseUrl = Netlify.env.get("RIGOR_DEERFLOW_URL")?.trim();
  if (!baseUrl) {
    console.error("RIGOR company action runner: RIGOR_DEERFLOW_URL missing");
    return;
  }

  const depth = Math.max(
    0,
    Math.min(
      5,
      Number.parseInt(request.headers.get("x-rigor-action-depth") || "0", 10) ||
        0,
    ),
  );
  const store = await companyStore(context);
  const queue =
    ((await store.get("actions/queue", { type: "json" })) as
      | ActionQueueRecord[]
      | null) || [];

  let action: ActionQueueRecord | undefined;
  for (const candidate of queue.filter(eligible)) {
    // Earlier releases recorded results without a claim ledger. Never replay them.
    if (await store.get(`actions/results/${encodeURIComponent(candidate.action_key)}.json`, {type: 'json'})) continue;
    const reserved = await store.setJSON(claimKey(candidate), {
      action_key: candidate.action_key, status: 'RESERVED',
      proposal: proposalFor(candidate), reserved_at: new Date().toISOString(),
    }, {onlyIfNew: true});
    if (reserved.modified) {action = candidate; break;}
  }
  if (!action) {
    console.log('RIGOR action runner: no unclaimed eligible internal action');
    return;
  }
  const selected = action;
  const reservationKey = claimKey(selected);
  let executing = false;

  try {
    const transitioned = await patchQueue(store, selected, {
      status: 'EXECUTING', attempt_count: Number(selected.attempt_count || 0) + 1,
      last_error: null, updated_at: new Date().toISOString(),
    }, 'APPROVED');
    if (!transitioned) {
      await store.setJSON(reservationKey, {action_key: selected.action_key, status: 'CANCELLED', failure_code: 'PROPOSAL_CHANGED_BEFORE_EXECUTION', proposal: proposalFor(selected)});
      return;
    }
    executing = true;
    const latest = await store.get("pulse/latest", { type: "json" });
    const response = await deerFlowRequest(context, "company_action", {
      proposal: proposalFor(action),
      context: companyActionContext(action.action_key, latest),
    });

    const result = normalizeExecutionResult(await response.json());
    if (result.status !== "COMPLETE" || !delegationVerified(result, action.owner_agent || undefined)) {
      throw new Error("DELEGATION_NOT_VERIFIED");
    }
    const resultRef = `actions/results/${encodeURIComponent(action.action_key)}.json`;
    await store.setJSON(resultRef, {
      action_key: action.action_key,
      deerflow_execution_id: response.headers.get("X-RIGOR-Execution-Id"),
      completed_at: new Date().toISOString(),
      proposal: proposalFor(action),
      result,
    });

    await store.setJSON(reservationKey, {action_key: selected.action_key, status: 'COMPLETE', result_ref: resultRef, completed_at: new Date().toISOString(), proposal: proposalFor(selected)});
    await patchQueue(store, selected, {
      status: 'COMPLETE', result_ref: resultRef, completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(), last_error: null,
    }, 'EXECUTING');
    console.log("RIGOR action completed", action.action_key, resultRef);

    const current = await store.get('actions/queue', {type: 'json'}) as ActionQueueRecord[] | null;
    const remaining = Array.isArray(current) && current.some(eligible);
    if (remaining) {
      await chainNext(request, expected, depth);
    }
  } catch (error) {
    const code = error instanceof Error && ['DELEGATION_NOT_VERIFIED', 'QUEUE_UPDATE_CONFLICT'].includes(error.message) ? error.message : 'ACTION_EXECUTION_FAILED';
    // Keep the reservation after failures or uncertain completion; never auto-retry.
    const claim = await store.get(reservationKey, {type: 'json'});
    if (claim?.status !== 'COMPLETE') await store.setJSON(reservationKey, {action_key: selected.action_key, status: 'FAILED', failure_code: code, proposal: proposalFor(selected)});
    if (executing) await patchQueue(store, selected, {status: 'FAILED', last_error: code, updated_at: new Date().toISOString()}, 'EXECUTING').catch(() => {});
    console.error('RIGOR action runner failed', selected.action_key, code);
  }
};
