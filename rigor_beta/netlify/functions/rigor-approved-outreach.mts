import { timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";

type ApprovedEmail = {
  id: string;
  to: string;
  subject: string;
  text: string;
  send_on: string;
};

type ApprovedBatch = {
  batch_id: string;
  emails: ApprovedEmail[];
};

type SendRecord = {
  id: string;
  to: string;
  subject: string;
  send_on: string;
  status: "SENT" | "FAILED";
  sent_at?: string | null;
  provider_message_id?: string | null;
  delivered?: string[];
  queued?: string[];
  permanent_bounces?: string[];
  error?: string | null;
};

type BatchState = {
  batch_id: string;
  created_at: string;
  updated_at: string;
  results: Record<string, SendRecord>;
};

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function pacificDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function storeFor(context: Context) {
  return getStore({
    name: context.deploy.context === "production"
      ? "rigor-approved-outreach"
      : "rigor-approved-outreach-preview",
    consistency: "strong",
  });
}

async function sendViaCloudflare(email: ApprovedEmail) {
  const accountId = Netlify.env.get("RIGOR_CLOUDFLARE_ACCOUNT_ID")?.trim() || "";
  const token = Netlify.env.get("RIGOR_CLOUDFLARE_EMAIL_TOKEN")?.trim() || "";
  const from = Netlify.env.get("RIGOR_CORP_FROM_EMAIL")?.trim() || "";

  if (!accountId || !token || !from) {
    throw new Error("AKHASHA Cloudflare Email Sending is not fully configured");
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/email/sending/send`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email.to],
        subject: email.subject,
        text: email.text,
      }),
      signal: AbortSignal.timeout(30000),
    },
  );

  const payload = await response.json().catch(() => null) as any;
  if (!response.ok || payload?.success !== true) {
    const detail = payload?.errors?.map((item: any) => item?.message).filter(Boolean).join("; ")
      || `HTTP ${response.status}`;
    throw new Error(detail.slice(0, 1000));
  }

  const result = payload?.result || {};
  const delivered = Array.isArray(result.delivered) ? result.delivered : [];
  const queued = Array.isArray(result.queued) ? result.queued : [];
  const permanentBounces = Array.isArray(result.permanent_bounces)
    ? result.permanent_bounces
    : [];

  if (!delivered.includes(email.to) && !queued.includes(email.to)) {
    const reason = permanentBounces.includes(email.to)
      ? "Cloudflare reported a permanent bounce"
      : "Cloudflare did not report the recipient as delivered or queued";
    throw new Error(reason);
  }

  return {
    provider_message_id: typeof result.message_id === "string" ? result.message_id : null,
    delivered,
    queued,
    permanent_bounces: permanentBounces,
  };
}

export default async (request: Request, context: Context) => {
  if (request.method !== "GET") {
    return json({ detail: "Method not allowed" }, 405);
  }

  const url = new URL(request.url);
  const providedBatchId = url.searchParams.get("batch")?.trim() || "";
  const expectedBatchId = Netlify.env.get("RIGOR_APPROVED_OUTREACH_BATCH_ID")?.trim() || "";
  if (!providedBatchId || !expectedBatchId || !safeEqual(providedBatchId, expectedBatchId)) {
    return json({ detail: "Not found" }, 404);
  }

  const rawBatch = Netlify.env.get("RIGOR_APPROVED_OUTREACH_BATCH")?.trim() || "";
  if (!rawBatch) {
    return json({ detail: "Approved outreach batch is not configured" }, 503);
  }

  let batch: ApprovedBatch;
  try {
    batch = JSON.parse(rawBatch) as ApprovedBatch;
  } catch {
    return json({ detail: "Approved outreach batch is invalid" }, 500);
  }

  if (batch.batch_id !== expectedBatchId || !Array.isArray(batch.emails)) {
    return json({ detail: "Approved outreach batch identity mismatch" }, 409);
  }

  const today = pacificDate();
  const store = storeFor(context);
  const stateKey = `approved-outreach/${batch.batch_id}`;
  const existing = await store.get(stateKey, { type: "json" }) as BatchState | null;
  const state: BatchState = existing || {
    batch_id: batch.batch_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    results: {},
  };

  const sentToday = Object.values(state.results).filter(
    (item) => item.status === "SENT" && item.sent_at?.slice(0, 10) === today,
  ).length;
  let remainingCapacity = Math.max(0, 3 - sentToday);

  const due = batch.emails.filter(
    (email) => email.send_on <= today && state.results[email.id]?.status !== "SENT",
  );

  const attempted: SendRecord[] = [];
  for (const email of due) {
    if (remainingCapacity <= 0) break;

    const attemptedAt = new Date().toISOString();
    try {
      const provider = await sendViaCloudflare(email);
      const record: SendRecord = {
        id: email.id,
        to: email.to,
        subject: email.subject,
        send_on: email.send_on,
        status: "SENT",
        sent_at: attemptedAt,
        ...provider,
      };
      state.results[email.id] = record;
      attempted.push(record);
      remainingCapacity -= 1;
    } catch (error) {
      const record: SendRecord = {
        id: email.id,
        to: email.to,
        subject: email.subject,
        send_on: email.send_on,
        status: "FAILED",
        sent_at: null,
        error: error instanceof Error ? error.message : "Email send failed",
      };
      state.results[email.id] = record;
      attempted.push(record);
    }

    state.updated_at = new Date().toISOString();
    await store.setJSON(stateKey, state);
  }

  const sent = Object.values(state.results).filter((item) => item.status === "SENT").length;
  const failed = Object.values(state.results).filter((item) => item.status === "FAILED").length;
  const complete = sent === batch.emails.length;

  return json({
    status: complete ? "COMPLETE" : "ACTIVE",
    batch_id: batch.batch_id,
    sender: Netlify.env.get("RIGOR_CORP_FROM_EMAIL")?.trim() || null,
    pacific_date: today,
    total: batch.emails.length,
    sent,
    failed,
    remaining: batch.emails.length - sent,
    attempted,
    results: Object.values(state.results),
  });
};

export const config: Config = {
  path: "/api/company/approved-outreach",
};
