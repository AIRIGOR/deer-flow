import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { getDeployStore, getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";

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
};

type CompanyStateRecord = {
  record_key: string;
  record_type: string;
  title: string;
  summary?: string | null;
  status?: string;
  priority?: string;
  owner_agent?: string | null;
  approval_required?: boolean;
  source_ref?: string | null;
  payload?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type CommandRecord = {
  command_id: string;
  command: string;
  submitted_at: string;
};

const COOKIE = "rigor_founder";

function companyStore(context: Context) {
  if (context.deploy.context === "production") {
    return getStore({ name: "rigor-company", consistency: "strong" });
  }
  return getDeployStore("rigor-company");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cookieValue(secret: string) {
  return createHash("sha256")
    .update(`rigor-founder-v1:${secret}`)
    .digest("hex");
}

function readCookie(request: Request, name: string) {
  const raw = request.headers.get("cookie") || "";
  for (const pair of raw.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function founderSecret() {
  return Netlify.env.get("RIGOR_FOUNDER_KEY")?.trim() || "";
}

function isFounder(request: Request) {
  const secret = founderSecret();
  const provided = readCookie(request, COOKIE);
  return Boolean(secret && provided && safeEqual(cookieValue(secret), provided));
}

async function dashboard(context: Context) {
  const store = companyStore(context);
  const [latest, records, actions, commands] = await Promise.all([
    store.get("pulse/latest", { type: "json" }) as Promise<any | null>,
    store.get("state/records", { type: "json" }) as Promise<CompanyStateRecord[] | null>,
    store.get("actions/queue", { type: "json" }) as Promise<ActionQueueRecord[] | null>,
    store.get("founder/command-log", { type: "json" }) as Promise<CommandRecord[] | null>,
  ]);

  const queue = Array.isArray(actions) ? actions : [];
  const latestAt = typeof latest?.generated_at === "string" ? latest.generated_at : "";
  const commandLog = (Array.isArray(commands) ? commands : []).map(item => ({
    ...item,
    status: latestAt && latestAt > item.submitted_at ? "PROCESSED" : "QUEUED",
  }));

  return {
    status: "ok",
    service: "rigor-founder-command",
    version: "v1",
    has_latest_pulse: Boolean(latestAt),
    latest_pulse_at: latestAt || null,
    latest: latest || null,
    records: Array.isArray(records) ? records : [],
    actions: queue,
    command_log: commandLog,
    action_queue: {
      total: queue.length,
      approved: queue.filter(item => item.status === "APPROVED").length,
      needs_founder_approval: queue.filter(item => item.status === "NEEDS_APPROVAL").length,
      executing: queue.filter(item => item.status === "EXECUTING").length,
      complete: queue.filter(item => item.status === "COMPLETE").length,
      failed: queue.filter(item => item.status === "FAILED").length,
    },
  };
}

async function triggerPulse(request: Request, command: string) {
  const token = Netlify.env.get("RIGOR_DEERFLOW_TOKEN")?.trim() || "";
  if (!token) throw new Error("RIGOR_DEERFLOW_TOKEN is not configured");
  const response = await fetch(
    new URL("/.netlify/functions/rigor-company-pulse-background", request.url),
    {
      method: "POST",
      headers: {
        "X-RIGOR-Automation-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "founder-command",
        founder_command: command,
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) {
    throw new Error(`Company pulse launch failed with HTTP ${response.status}`);
  }
}

async function triggerRunner(request: Request) {
  const token = Netlify.env.get("RIGOR_DEERFLOW_TOKEN")?.trim() || "";
  if (!token) throw new Error("RIGOR_DEERFLOW_TOKEN is not configured");
  const response = await fetch(
    new URL("/.netlify/functions/rigor-company-action-runner-background", request.url),
    {
      method: "POST",
      headers: {
        "X-RIGOR-Automation-Token": token,
        "X-RIGOR-Action-Depth": "0",
      },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) {
    throw new Error(`Action runner launch failed with HTTP ${response.status}`);
  }
}

export default async (request: Request, context: Context) => {
  if (!["GET", "POST"].includes(request.method)) {
    return json({ detail: "Method not allowed" }, 405);
  }

  if (request.method === "GET") {
    if (!isFounder(request)) return json({ detail: "Founder authentication required" }, 401);
    return json(await dashboard(context));
  }

  if (!sameOrigin(request)) {
    return json({ detail: "Cross-origin Founder requests are blocked" }, 403);
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ detail: "Invalid JSON body" }, 400);
  }

  const op = String(body?.op || "").trim();

  if (op === "login") {
    const expected = founderSecret();
    const provided = String(body?.key || "").trim();
    if (!expected) return json({ detail: "Founder access is not configured" }, 503);
    if (!provided || !safeEqual(expected, provided)) {
      return json({ detail: "Founder key not accepted" }, 401);
    }
    const secureCookie = `${COOKIE}=${encodeURIComponent(cookieValue(expected))}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`;
    return json(
      { status: "ok", dashboard: await dashboard(context) },
      200,
      { "Set-Cookie": secureCookie },
    );
  }

  if (op === "logout") {
    return json(
      { status: "ok" },
      200,
      { "Set-Cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` },
    );
  }

  if (!isFounder(request)) {
    return json({ detail: "Founder authentication required" }, 401);
  }

  if (op === "command") {
    const command = String(body?.command || "").trim();
    if (command.length < 2) return json({ detail: "Enter a Founder directive" }, 400);
    if (command.length > 2000) return json({ detail: "Founder directive is too long" }, 400);

    const store = companyStore(context);
    const existing =
      ((await store.get("founder/command-log", { type: "json" })) as CommandRecord[] | null) || [];
    const entry: CommandRecord = {
      command_id: randomUUID(),
      command,
      submitted_at: new Date().toISOString(),
    };
    await store.setJSON("founder/command-log", [entry, ...existing].slice(0, 100));
    await triggerPulse(request, command);
    return json({ status: "accepted", command: entry, dashboard: await dashboard(context) }, 202);
  }

  if (op === "approve" || op === "reject") {
    const actionKey = String(body?.action_key || "").trim();
    if (!actionKey) return json({ detail: "Action key is required" }, 400);

    const store = companyStore(context);
    const queue =
      ((await store.get("actions/queue", { type: "json" })) as ActionQueueRecord[] | null) || [];
    const index = queue.findIndex(item => item.action_key === actionKey);
    if (index < 0) return json({ detail: "Company action not found" }, 404);
    if (queue[index].status !== "NEEDS_APPROVAL") {
      return json({ detail: `Action is already ${queue[index].status}` }, 409);
    }

    const now = new Date().toISOString();
    queue[index] = {
      ...queue[index],
      status: op === "approve" ? "APPROVED" : "REJECTED",
      approval_required: op === "approve" ? false : queue[index].approval_required,
      policy_reason:
        op === "approve"
          ? `${queue[index].policy_reason}; approved by Founder ${now}`
          : `${queue[index].policy_reason}; rejected by Founder ${now}`,
      updated_at: now,
    };
    await store.setJSON("actions/queue", queue);

    if (op === "approve") await triggerRunner(request);
    return json({ status: "ok", decision: op, dashboard: await dashboard(context) });
  }

  return json({ detail: "Unknown Founder operation" }, 400);
};

export const config: Config = {
  path: "/api/company/founder",
};
