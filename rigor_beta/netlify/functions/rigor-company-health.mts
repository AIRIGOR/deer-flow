import { getDeployStore, getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";

type LatestPulse = {
  generated_at?: string;
  source?: string;
  durable_state_records?: number;
  action_queue?: {
    total?: number;
    approved?: number;
    needs_founder_approval?: number;
    executing?: number;
    complete?: number;
  };
};

type ActionQueueRecord = {
  status?: string;
  approval_required?: boolean;
};

function companyStore(context: Context) {
  if (context.deploy.context === "production") {
    return getStore({ name: "rigor-company", consistency: "strong" });
  }
  return getDeployStore("rigor-company");
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

export default async (request: Request, context: Context) => {
  if (request.method !== "GET") {
    return json({ detail: "Method not allowed" }, 405);
  }

  try {
    const store = companyStore(context);
    const [latest, records, actions] = await Promise.all([
      store.get("pulse/latest", { type: "json" }) as Promise<LatestPulse | null>,
      store.get("state/records", { type: "json" }) as Promise<unknown[] | null>,
      store.get("actions/queue", { type: "json" }) as Promise<
        ActionQueueRecord[] | null
      >,
    ]);

    const queue = Array.isArray(actions) ? actions : [];
    const actionQueue = {
      total: queue.length || Number(latest?.action_queue?.total || 0),
      approved:
        queue.filter((item) => item.status === "APPROVED").length ||
        Number(latest?.action_queue?.approved || 0),
      needs_founder_approval:
        queue.filter((item) => item.status === "NEEDS_APPROVAL").length ||
        Number(latest?.action_queue?.needs_founder_approval || 0),
      executing:
        queue.filter((item) => item.status === "EXECUTING").length ||
        Number(latest?.action_queue?.executing || 0),
      complete:
        queue.filter((item) => item.status === "COMPLETE").length ||
        Number(latest?.action_queue?.complete || 0),
    };

    return json({
      status: "ok",
      service: "rigor-company",
      version: "v1",
      company_automation: "v1",
      action_layer: "v1",
      has_latest_pulse: Boolean(latest?.generated_at),
      latest_pulse_at: latest?.generated_at || null,
      durable_state_records: Array.isArray(records)
        ? records.length
        : Number(latest?.durable_state_records || 0),
      action_queue: actionQueue,
      corporate_mailbox_configured: Boolean(
        Netlify.env.get("RIGOR_CORP_FROM_EMAIL")?.trim(),
      ),
      source: latest?.source || null,
    });
  } catch (error) {
    console.error("RIGOR company health failed", error);
    return json(
      {
        status: "degraded",
        service: "rigor-company",
        version: "v1",
        company_automation: "v1",
        action_layer: "v1",
        has_latest_pulse: false,
        latest_pulse_at: null,
        durable_state_records: 0,
        action_queue: {
          total: 0,
          approved: 0,
          needs_founder_approval: 0,
          executing: 0,
          complete: 0,
        },
        corporate_mailbox_configured: Boolean(
          Netlify.env.get("RIGOR_CORP_FROM_EMAIL")?.trim(),
        ),
      },
      503,
    );
  }
};

export const config: Config = {
  path: "/api/company/health",
};
