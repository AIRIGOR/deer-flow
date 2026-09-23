import { timingSafeEqual } from "node:crypto";
import { getDeployStore, getStore } from "@netlify/blobs";
import type { Context } from "@netlify/functions";

type PulsePayload = {
  current_state: string;
  top_priorities: string[];
  blockers_risks: string[];
  founder_approvals: string[];
  next_actions: string[];
  state_updates: unknown[];
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

async function buildCompanyContext(request: Request) {
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
  };
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

  const companyContext = await buildCompanyContext(request);
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
          "Run the RIGOR founder operating review. Identify the highest-leverage product, engineering, reliability, market, partnership, and capital actions while preserving the human approval boundary.",
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
    source: "RIGOR_AI_COMPANY_V1",
    context: companyContext,
    pulse,
  };

  const store = companyStore(context);
  const timestamp = envelope.generated_at.replace(/[:.]/g, "-");
  await store.setJSON("pulse/latest", envelope);
  await store.setJSON(`pulse/history/${timestamp}.json`, envelope);
  await trimHistory(store);
  console.log(
    "RIGOR company pulse stored",
    envelope.generated_at,
    pulse.top_priorities?.length ?? 0,
  );
};
