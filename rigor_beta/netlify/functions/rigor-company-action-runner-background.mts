import { timingSafeEqual } from "node:crypto";
import { getDeployStore, getStore } from "@netlify/blobs";
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

function companyStore(context: Context) {
  if (context.deploy.context === "production") {
    return getStore({ name: "rigor-company", consistency: "strong" });
  }
  return getDeployStore("rigor-company");
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

async function persistQueue(
  store: ReturnType<typeof getStore>,
  queue: ActionQueueRecord[],
) {
  await store.setJSON("actions/queue", queue);
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
  const store = companyStore(context);
  const queue =
    ((await store.get("actions/queue", { type: "json" })) as
      | ActionQueueRecord[]
      | null) || [];

  const index = queue.findIndex(
    (item) => item.status === "APPROVED" && item.approval_required === false,
  );
  if (index < 0) {
    console.log("RIGOR action runner: no approved internal action");
    return;
  }

  const action = queue[index];
  const now = new Date().toISOString();
  queue[index] = {
    ...action,
    status: "EXECUTING",
    attempt_count: Number(action.attempt_count || 0) + 1,
    last_error: null,
    updated_at: now,
  };
  await persistQueue(store, queue);

  try {
    const latest = await store.get("pulse/latest", { type: "json" });
    const response = await fetch(
      `${baseUrl.replace(/\/$/, "")}/api/rigor/company/action/execute`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RIGOR-Service-Token": expected,
        },
        body: JSON.stringify({
          proposal: proposalFor(action),
          context: JSON.stringify({
            latest_company_pulse: latest,
            action_key: action.action_key,
          }),
        }),
        signal: AbortSignal.timeout(10 * 60 * 1000),
      },
    );

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 2000);
      queue[index] = {
        ...queue[index],
        status: "FAILED",
        last_error: `HTTP ${response.status}: ${detail}`,
        updated_at: new Date().toISOString(),
      };
      await persistQueue(store, queue);
      console.error(
        "RIGOR action execution failed",
        action.action_key,
        response.status,
        detail,
      );
      return;
    }

    const result = await response.json();
    const resultRef = `actions/results/${encodeURIComponent(action.action_key)}.json`;
    await store.setJSON(resultRef, {
      action_key: action.action_key,
      completed_at: new Date().toISOString(),
      proposal: proposalFor(action),
      result,
    });

    queue[index] = {
      ...queue[index],
      status: "COMPLETE",
      result_ref: resultRef,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_error: null,
    };
    await persistQueue(store, queue);
    console.log("RIGOR action completed", action.action_key, resultRef);

    const remaining = queue.some(
      (item) => item.status === "APPROVED" && item.approval_required === false,
    );
    if (remaining) {
      await chainNext(request, expected, depth);
    }
  } catch (error) {
    queue[index] = {
      ...queue[index],
      status: "FAILED",
      last_error: error instanceof Error ? error.message : "execution failed",
      updated_at: new Date().toISOString(),
    };
    await persistQueue(store, queue);
    console.error("RIGOR action runner exception", action.action_key, error);
  }
};
