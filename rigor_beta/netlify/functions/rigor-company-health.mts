import { getDeployStore, getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";

type LatestPulse = {
  generated_at?: string;
  source?: string;
  durable_state_records?: number;
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
    const [latest, records] = await Promise.all([
      store.get("pulse/latest", { type: "json" }) as Promise<LatestPulse | null>,
      store.get("state/records", { type: "json" }) as Promise<unknown[] | null>,
    ]);

    return json({
      status: "ok",
      service: "rigor-company",
      version: "v1",
      company_automation: "v1",
      has_latest_pulse: Boolean(latest?.generated_at),
      latest_pulse_at: latest?.generated_at || null,
      durable_state_records: Array.isArray(records)
        ? records.length
        : Number(latest?.durable_state_records || 0),
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
        has_latest_pulse: false,
        latest_pulse_at: null,
        durable_state_records: 0,
      },
      503,
    );
  }
};

export const config: Config = {
  path: "/api/company/health",
};
