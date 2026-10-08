import { randomUUID } from "node:crypto";
import type { Config, Context } from "@netlify/functions";
import { authorized, companyStore, json, type FounderCommand } from "./_shared/founder.js";
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
