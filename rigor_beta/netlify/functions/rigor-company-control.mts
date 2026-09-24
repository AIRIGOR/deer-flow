import { randomUUID, timingSafeEqual } from "node:crypto";
import { getDeployStore, getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";
import {
  createMission,
  decideApproval,
  openMissions,
  updateMission,
  type CompanyApproval,
  type CompanyMission,
} from "./_shared/company.js";

type JsonRecord = Record<string, unknown>;

function companyStore(context: Context) {
  if (context.deploy.context === "production") {
    return getStore({ name: "rigor-company", consistency: "strong" });
  }
  return getDeployStore("rigor-company");
}

function commonHeaders() {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: commonHeaders() });
}

function fail(detail: string, status = 422) {
  return json({ detail }, status);
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorized(request: Request) {
  const expected =
    Netlify.env.get("RIGOR_COMPANY_ADMIN_TOKEN")?.trim() ||
    Netlify.env.get("RIGOR_DEERFLOW_TOKEN")?.trim() ||
    "";
  const provided = request.headers.get("x-rigor-company-token")?.trim() || "";
  return Boolean(expected && provided && safeEqual(expected, provided));
}

async function requestBody(request: Request) {
  try {
    return (await request.json()) as JsonRecord;
  } catch {
    throw new Error("Invalid JSON request");
  }
}

async function readArray<T>(store: any, key: string): Promise<T[]> {
  return ((await store.get(key, { type: "json" })) as T[] | null) || [];
}

async function writeAudit(
  store: any,
  eventType: string,
  payload: JsonRecord,
) {
  const createdAt = new Date().toISOString();
  const key = `audit/${createdAt.replace(/[:.]/g, "-")}-${randomUUID()}.json`;
  const event = {
    audit_id: key.split("/").pop()?.replace(/\.json$/, ""),
    event_type: eventType,
    created_at: createdAt,
    payload,
  };
  await store.setJSON(key, event);
  return event;
}

async function readAudit(store: any, limit = 50) {
  const listed = await store.list({ prefix: "audit/" });
  const keys = listed.blobs
    .map((item: { key: string }) => item.key)
    .sort()
    .reverse()
    .slice(0, Math.max(1, Math.min(limit, 100)));
  const items = await Promise.all(
    keys.map((key: string) => store.get(key, { type: "json" })),
  );
  return items.filter(Boolean);
}

export default async (request: Request, context: Context) => {
  try {
    const url = new URL(request.url);
    const path = url.pathname;

    if (!authorized(request)) {
      return fail("Invalid RIGOR company token", 401);
    }

    const store = companyStore(context);

    if (path === "/api/company/state" && request.method === "GET") {
      const [latestPulse, records, missions, approvals, audit] = await Promise.all([
        store.get("pulse/latest", { type: "json" }),
        readArray<JsonRecord>(store, "state/records"),
        readArray<CompanyMission>(store, "missions/records"),
        readArray<CompanyApproval>(store, "approvals/records"),
        readAudit(store, 30),
      ]);
      return json({
        company_os: "v0.1-business",
        latest_pulse: latestPulse,
        durable_state: records,
        missions,
        open_missions: openMissions(missions),
        approvals,
        pending_approvals: approvals.filter((item) => item.status === "PENDING"),
        audit,
      });
    }

    if (path === "/api/company/missions" && request.method === "GET") {
      const missions = await readArray<CompanyMission>(store, "missions/records");
      return json({ missions });
    }

    if (path === "/api/company/missions" && request.method === "POST") {
      const data = await requestBody(request);
      const timestamp = new Date().toISOString();
      const missions = await readArray<CompanyMission>(store, "missions/records");
      const mission = createMission(data, `mission_${randomUUID().replaceAll("-", "")}`, timestamp);
      const next = [mission, ...missions].slice(0, 250);
      await store.setJSON("missions/records", next);
      await writeAudit(store, "MISSION_CREATED", {
        mission_id: mission.mission_id,
        title: mission.title,
        priority: mission.priority,
      });
      return json({ mission }, 201);
    }

    let match = path.match(/^\/api\/company\/missions\/([^/]+)$/);
    if (match && request.method === "PATCH") {
      const data = await requestBody(request);
      const timestamp = new Date().toISOString();
      const missions = await readArray<CompanyMission>(store, "missions/records");
      const next = updateMission(missions, decodeURIComponent(match[1]), data, timestamp);
      const mission = next.find((item) => item.mission_id === decodeURIComponent(match![1]));
      await store.setJSON("missions/records", next);
      await writeAudit(store, "MISSION_UPDATED", {
        mission_id: mission?.mission_id,
        status: mission?.status,
        priority: mission?.priority,
      });
      return json({ mission });
    }

    if (path === "/api/company/approvals" && request.method === "GET") {
      const approvals = await readArray<CompanyApproval>(store, "approvals/records");
      return json({
        approvals,
        pending: approvals.filter((item) => item.status === "PENDING"),
      });
    }

    match = path.match(/^\/api\/company\/approvals\/([^/]+)$/);
    if (match && request.method === "POST") {
      const data = await requestBody(request);
      const rawDecision = String(data.decision || "").trim().toUpperCase();
      if (rawDecision !== "APPROVED" && rawDecision !== "REJECTED") {
        return fail("Decision must be APPROVED or REJECTED");
      }
      const timestamp = new Date().toISOString();
      const approvals = await readArray<CompanyApproval>(store, "approvals/records");
      const next = decideApproval(
        approvals,
        decodeURIComponent(match[1]),
        rawDecision,
        String(data.note || ""),
        timestamp,
      );
      const approval = next.find(
        (item) => item.approval_id === decodeURIComponent(match![1]),
      );
      await store.setJSON("approvals/records", next);
      await writeAudit(store, "FOUNDER_APPROVAL_DECIDED", {
        approval_id: approval?.approval_id,
        decision: approval?.status,
        title: approval?.title,
      });
      return json({ approval });
    }

    if (path === "/api/company/audit" && request.method === "GET") {
      const limit = Number(url.searchParams.get("limit") || 50);
      return json({ audit: await readAudit(store, limit) });
    }

    if (path === "/api/company/pulse/run" && request.method === "POST") {
      const automationToken = Netlify.env.get("RIGOR_DEERFLOW_TOKEN")?.trim() || "";
      if (!automationToken) return fail("RIGOR automation token is not configured", 503);
      const target = new URL(
        "/.netlify/functions/rigor-company-pulse-background",
        request.url,
      ).toString();
      const response = await fetch(target, {
        method: "POST",
        headers: { "X-RIGOR-Automation-Token": automationToken },
        signal: AbortSignal.timeout(20000),
      });
      await writeAudit(store, "COMPANY_PULSE_TRIGGERED", {
        invocation_status: response.status,
      });
      if (!response.ok && response.status !== 202) {
        return fail(`Company pulse trigger failed with status ${response.status}`, 502);
      }
      return json({ accepted: true, status: response.status }, 202);
    }

    return fail("Not found", 404);
  } catch (error) {
    console.error("RIGOR company control error", error);
    return fail(error instanceof Error ? error.message : "Unexpected server error", 500);
  }
};

export const config: Config = {
  path: [
    "/api/company/state",
    "/api/company/missions",
    "/api/company/missions/:id",
    "/api/company/approvals",
    "/api/company/approvals/:id",
    "/api/company/audit",
    "/api/company/pulse/run",
  ],
};
