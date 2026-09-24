import { timingSafeEqual } from "node:crypto";
import { getDeployStore, getStore } from "@netlify/blobs";
import type { Context } from "@netlify/functions";

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

type PulsePayload = {
  current_state: string;
  top_priorities: string[];
  blockers_risks: string[];
  founder_approvals: string[];
  next_actions: string[];
  state_updates: StateUpdate[];
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

async function buildCompanyContext(
  request: Request,
  priorState: CompanyStateRecord[],
) {
  const branch = "feat/rigor-netlify-beta-v1";
  const [commit, runs, previewHealth, deerflowHealth] = await Promise.all([
    publicJson(
      `https://api.github.com/repos/AIRIGOR/deer-flow/commits/${encodeURIComponent(branch)}`,
    ),
    publicJson(
      `https://api.github.com/repos/AIRIGOR/deer-flow/actions/runs?branch=${encodeURIComponent(branch)}&per_page=10`,
    ),
    publicJson(new URL("/api/health", request.url).toString()),
    (() => {
      const base = Netlify.env.get("RIGOR_DEERFLOW_URL")?.trim();
      return base
        ? publicJson(`${base.replace(/\/$/, "")}/health`)
        : Promise.resolve({ error: "RIGOR_DEERFLOW_URL missing" });
    })(),
  ]);

  const recentRuns = Array.isArray((runs as any)?.workflow_runs)
    ? (runs as any).workflow_runs.slice(0, 10).map((run: any) => ({
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
    branch_head:
      typeof (commit as any)?.sha === "string"
        ? (commit as any).sha
        : commit,
    recent_workflow_runs: recentRuns,
    preview_health: previewHealth,
    deerflow_health: deerflowHealth,
    netlify_deploy_id: contextDeployId(request),
    durable_company_state: priorState.slice(0, 250),
  };
}

function recordKey(update: StateUpdate) {
  const title = String(update.title || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 180);
  return `${update.record_type}:${title}`;
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

function contextDeployId(request: Request) {
  return request.headers.get("x-nf-deploy-id") || null;
}

async function trimHistory(store: ReturnType<typeof getStore>) {
  const listed = await store.list({ prefix: "pulse/history/" });
  const keys = listed.blobs.map((item) => item.key).sort();
  const excess = keys.slice(0, Math.max(0, keys.length - 30));
  await Promise.all(excess.map((key) => store.delete(key)));
}

export default async (request: Request, context: Context) => {
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

  const store = companyStore(context);
  const priorState =
    ((await store.get("state/records", { type: "json" })) as
      | CompanyStateRecord[]
      | null) || [];
  const companyContext = await buildCompanyContext(request, priorState);
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
          "Run the RIGOR founder business operating review. Identify the highest-leverage growth/sales, customer-success, finance/operations, market-intelligence, partnership, and capital actions while preserving the human approval boundary. Treat product and release health as operating constraints and create precise product-team handoffs when needed.",
        context: JSON.stringify(companyContext),
      }),
      signal: AbortSignal.timeout(13 * 60 * 1000),
    },
  );

  if (!response.ok) {
    console.error(
      "RIGOR company pulse failed",
      response.status,
      (await response.text()).slice(0, 1000),
    );
    return;
  }

  const pulse = (await response.json()) as PulsePayload;
  const envelope = {
    generated_at: new Date().toISOString(),
    source: "RIGOR_AI_COMPANY_V2_BUSINESS",
    context: companyContext,
    pulse,
  };

  const timestamp = envelope.generated_at.replace(/[:.]/g, "-");
  const nextState = mergeState(priorState, pulse.state_updates || []);
  await store.setJSON("state/records", nextState);
  await store.setJSON("pulse/latest", {
    ...envelope,
    durable_state_records: nextState.length,
  });
  await store.setJSON(`pulse/history/${timestamp}.json`, {
    ...envelope,
    durable_state_records: nextState.length,
  });
  await trimHistory(store);
  console.log(
    "RIGOR company pulse stored",
    envelope.generated_at,
    pulse.top_priorities?.length ?? 0,
  );
};
