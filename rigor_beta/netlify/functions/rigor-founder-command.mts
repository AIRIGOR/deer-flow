import { randomUUID } from "node:crypto";
import type { Config, Context } from "@netlify/functions";
import { authorized, commandStore, json } from "./_shared/company-command.js";

export default async (request: Request, context: Context) => {
  if (!authorized(request)) return json({ detail: "Unauthorized" }, 401);
  const store = commandStore(context);
  if (request.method === "GET") {
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!/^[0-9a-f-]{36}$/.test(id)) return json({ detail: "Invalid command ID" }, 400);
    const record = await store.get(`commands/${id}`, { type: "json" });
    return record ? json(record) : json({ detail: "Command not found" }, 404);
  }
  if (request.method !== "POST") return json({ detail: "Method not allowed" }, 405);
  let input;
  try { input = await request.json(); } catch { return json({ detail: "Invalid JSON" }, 400); }
  if (input.command !== "VERIFY_PUBLIC_HEALTH") return json({ detail: "Only VERIFY_PUBLIC_HEALTH is supported in the Pod 3 proof lane" }, 400);
  if (!Netlify.env.get("RIGOR_DEERFLOW_TOKEN") || !Netlify.env.get("RIGOR_DEERFLOW_URL")) return json({ detail: "Hosted DeerFlow wiring missing" }, 503);
  const id = randomUUID();
  const record = { command_id: id, objective: "Verify RIGOR and DeerFlow public health, delegate review and create a factual internal verification artifact. Do not perform investor, E3, outreach, spending, feature work, or deployments. Do not claim product release readiness.", status: "QUEUED", created_at: new Date().toISOString() };
  await store.setJSON(`commands/${id}`, record);
  try {
    const response = await fetch(new URL("/.netlify/functions/rigor-founder-work-background", request.url), { method: "POST", headers: { "Content-Type": "application/json", "X-RIGOR-Company-Token": Netlify.env.get("RIGOR_COMPANY_ADMIN_TOKEN")! }, body: JSON.stringify({ command_id: id }), signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Background launch HTTP ${response.status}`);
  } catch {
    await store.setJSON(`commands/${id}`, { ...record, status: "FAILED", failure: "Background launch failed" });
    return json({ command_id: id, status: "FAILED" }, 502);
  }
  return json({ command_id: id, status: "QUEUED", status_path: `/api/company/command?id=${id}` }, 202);
};
export const config: Config = { path: "/api/company/command" };
