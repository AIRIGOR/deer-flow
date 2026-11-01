import { randomUUID } from "node:crypto";
import type { Config, Context } from "@netlify/functions";
import { authorized, companyStore, json, type FounderCommand } from "./_shared/founder.js";
import { localSimulationContext, prepareDryRun } from "./_shared/founder-dry-run.js";
import { processFounderCommand } from "./rigor-founder-command-background.mjs";
import { hostedFounderBlocked, stagingSimulationEnabled } from "./_shared/staging-policy.js";
export default async (request: Request, context: Context) => {
  const auth = authorized(request, "RIGOR_FOUNDER_TOKEN", "X-RIGOR-Founder-Token");
  if (auth !== "AUTHORIZED") return json({ detail: auth === "NOT_CONFIGURED" ? "Founder authentication is not configured" : "Founder authentication required" }, auth === "NOT_CONFIGURED" ? 503 : 401);
  const store = companyStore(context);
  if (request.method === "GET") {
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!/^[a-f0-9-]{36}$/.test(id)) return json({ detail: "Invalid command id" }, 422);
    const record = await store.get(`commands/${id}`, { type: "json" });
    return record ? json(record) : json({ detail: "Command not found" }, 404);
  }
  if (request.method !== "POST") return json({ detail: "Method not allowed" }, 405);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ detail: "Origin rejected" }, 403);
  let body: any;
  try { body = await request.json(); } catch { return json({ detail: "Invalid JSON" }, 422); }
  if (!body || typeof body.command !== "string" || !body.command.trim() || body.command.length > 3900) return json({ detail: "Command must contain 1–3900 characters" }, 422);
  const mode = body.mode ?? "INTERNAL_RESEARCH";
  if (mode === "LOCAL_DRY_RUN") {
    if (!localSimulationContext(context) || (!stagingSimulationEnabled(context) && !["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname))) {
      return json({ detail: "Local simulation requires loopback access and the platform dev context" }, 403);
    }
    const id = request.headers.get("Idempotency-Key")?.toLowerCase() || "";
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)) return json({ detail: "A UUID Idempotency-Key is required" }, 422);
    let prepared;
    try { prepared = prepareDryRun(body, body.command.trim()); }
    catch { return json({ detail: "Explicit intent and 1–6 distinct bounded evidence sources are required" }, 422); }
    const timestamp = new Date().toISOString();
    const blocked = prepared.plan.authority_check === "BLOCKED";
    const record: FounderCommand = {
      command_id: id, command: body.command.trim(), mode, status: blocked ? "BLOCKED" : "QUEUED", created_at: timestamp, updated_at: timestamp,
      ...prepared,
      authentication: { mechanism: "FOUNDER_TOKEN", capability: "LOCAL_SIMULATION_ONLY", human_identity_verified: false, production_authority_verified: false },
      ...(blocked ? { error_code: "AUTHORITY_NOT_VERIFIED" } : {}),
      proposal: { action_type: "INTERNAL_RESEARCH", scope: "INTERNAL_EXECUTE", title: body.command.trim().slice(0, 255), summary: body.command.trim(), reversible: true },
    };
    try {
      const created = await store.setJSON(`commands/${id}`, record, { onlyIfNew: true });
      if (!created.modified) {
        const existing = await store.get(`commands/${id}`, { type: "json", consistency: "strong" }) as FounderCommand | null;
        if (!existing || existing.mode !== mode || existing.request_sha256 !== record.request_sha256) return json({ detail: "Idempotency key already belongs to different command content" }, 409);
      }
      await processFounderCommand(context, id);
      const current = await store.get(`commands/${id}`, { type: "json", consistency: "strong" }) as FounderCommand | null;
      if (!current) return json({ detail: "Command persistence could not be confirmed" }, 500);
      return json(current, current.status === "BLOCKED" ? 403 : current.status === "FAILED" ? 500 : current.status === "DRY_RUN_COMPLETE" ? 200 : 202);
    } catch { return json({ detail: "Local dry-run persistence unavailable; inspect this command ID before retrying" }, 500); }
  }
  if (hostedFounderBlocked(context)) return json({ detail: "LIVE_EXECUTION_DISABLED: hosted Founder commands are dry-run only" }, 403);
  if (!["INTERNAL_RESEARCH", "RUN_COMPANY_PULSE"].includes(mode)) return json({ detail: "Only internal research and company pulse are supported" }, 422);
  const token = Netlify.env.get("RIGOR_DEERFLOW_TOKEN")?.trim();
  if (!token || !Netlify.env.get("RIGOR_DEERFLOW_URL")?.trim()) return json({ detail: "Company execution is not configured" }, 503);
  const command = body.command.trim(), timestamp = new Date().toISOString();
  const record: FounderCommand = { command_id: randomUUID(), command, mode, status: "QUEUED", created_at: timestamp, updated_at: timestamp,
    proposal: { action_type: "INTERNAL_RESEARCH", scope: "INTERNAL_EXECUTE", title: command.slice(0, 255), summary: command, reversible: true } };
  const saved = await store.setJSON(`commands/${record.command_id}`, record);
  try {
    const url = new URL("/.netlify/functions/rigor-founder-command-background", request.url); url.searchParams.set("id", record.command_id);
    const response = await fetch(url, { method: "POST", headers: { "X-RIGOR-Automation-Token": token }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("Dispatch rejected");
    // A 202 receipt means accepted, never completed. The worker owns subsequent state.
    return json(record, 202);
  } catch {
    const latest = await store.get(`commands/${record.command_id}`, { type: "json" }) as FounderCommand | null;
    if (latest && latest.status !== "QUEUED") return json(latest, 202);
    const failed: FounderCommand = { ...record, status: "FAILED", updated_at: new Date().toISOString(), error_code: "DISPATCH_FAILED" };
    const updated = await store.setJSON(`commands/${record.command_id}`, failed, { onlyIfMatch: saved.etag });
    if (!updated.modified) return json(await store.get(`commands/${record.command_id}`, { type: "json" }), 202);
    return json(failed, 502);
  }
};
export const config: Config = { path: "/api/founder/commands" };
