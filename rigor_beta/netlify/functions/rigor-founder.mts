import { createHash, randomUUID } from "node:crypto";
import { getUser, verifyRequestOrigin } from "@netlify/identity";
import type { Config, Context } from "@netlify/functions";
import { commandOwners, commandView, founderJson, founderStore, serviceAuthorized, validCommandId, type CommandKind, type FounderCommand } from "./_shared/founder.js";

export default async (request: Request, context: Context) => {
  try {
    const service = serviceAuthorized(request);
    const user = service ? null : await getUser();
    if (!service && !user) return founderJson({detail: "Founder sign-in required"}, 401);
    if (!service && !user?.roles?.includes("founder")) return founderJson({detail: "Founder role required"}, 403);
    if (!["GET", "POST"].includes(request.method)) return founderJson({detail: "Method not allowed"}, 405);
    if (request.method === "POST" && !service) {
      try { verifyRequestOrigin(request); } catch { return founderJson({detail: "Same-origin founder request required"}, 403); }
    }
    const store = await founderStore(context);
    const path = new URL(request.url).pathname;
    const prefix = "founder/commands/";
    if (path === "/api/founder" && request.method === "GET") {
      const [latest, records, actions, listed] = await Promise.all([
        store.get("pulse/latest", {type: "json"}), store.get("state/records", {type: "json"}),
        store.get("actions/queue", {type: "json"}), store.list({prefix}),
      ]);
      const recentKeys = listed.blobs.map((item) => item.key);
      const commands = (await Promise.all(recentKeys.map((key) => store.get(key, {type: "json"}))))
        .filter(Boolean).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50).map((command) => commandView(command));
      return founderJson({pulse: latest ? {generated_at: latest.generated_at, pulse: latest.pulse} : null,
        records: Array.isArray(records) ? records : [], actions: Array.isArray(actions) ? actions : [], commands});
    }
    if (path.startsWith("/api/founder/commands/") && request.method === "GET") {
      const id = path.slice("/api/founder/commands/".length);
      if (!validCommandId(id)) return founderJson({detail: "Invalid command ID"}, 400);
      const command = await store.get(prefix + id, {type: "json"}) as FounderCommand | null;
      return command ? founderJson(commandView(command)) : founderJson({detail: "Command not found"}, 404);
    }
    if (path !== "/api/founder/commands" || request.method !== "POST") return founderJson({detail: "Not found"}, 404);
    if ((Number(request.headers.get("content-length")) || 0) > 12000) return founderJson({detail: "Command too large"}, 413);
    let body: Record<string, unknown>;
    try { const text = await request.text(); if (text.length > 12000) return founderJson({detail: "Command too large"}, 413); body = JSON.parse(text); }
    catch { return founderJson({detail: "Invalid command JSON"}, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return founderJson({detail: "Invalid command"}, 400);
    const owners = commandOwners();
    const kind = body.kind;
    if (typeof kind !== "string" || !Object.hasOwn(owners, kind)) return founderJson({detail: "Choose a bounded internal command"}, 422);
    const objective = typeof body.objective === "string" ? body.objective.trim() : "";
    if (objective.length < 8 || objective.length > 2000) return founderJson({detail: "Objective must be 8–2000 characters"}, 422);
    const id = request.headers.get("Idempotency-Key") || randomUUID();
    if (!validCommandId(id)) return founderJson({detail: "Invalid idempotency key"}, 400);
    const actor = service ? "authenticated-company-service" : user!.id;
    const requestHash = createHash("sha256").update(JSON.stringify({kind, objective, actor})).digest("hex");
    const command: FounderCommand = {command_id: id, kind: kind as CommandKind, objective, issued_by: actor,
      request_hash: requestHash, status: "QUEUED", created_at: new Date().toISOString(), owner_agent: owners[kind as CommandKind]};
    const created = await store.setJSON(prefix + id, command, {onlyIfNew: true});
    if (!created.modified) {
      const existing = await store.get(prefix + id, {type: "json"}) as FounderCommand;
      if (existing?.request_hash !== requestHash) return founderJson({detail: "Idempotency key already used for another command"}, 409);
      return founderJson(commandView(existing), existing.status === "COMPLETE" ? 200 : 202);
    }
    const token = Netlify.env.get("RIGOR_DEERFLOW_TOKEN")?.trim();
    if (!token || !Netlify.env.get("RIGOR_DEERFLOW_URL")?.trim()) {
      await store.setJSON(prefix + id, {...command, status: "FAILED", failure_code: "SERVICE_NOT_CONFIGURED", completed_at: new Date().toISOString()});
      return founderJson({detail: "Company execution service is not configured", command_id: id}, 503);
    }
    try {
      const response = await fetch(new URL("/.netlify/functions/rigor-founder-command-background", request.url), {
        method: "POST", headers: {"X-RIGOR-Automation-Token": token, "Content-Type": "application/json"},
        body: JSON.stringify({command_id: id}), signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("LAUNCH_REJECTED");
    } catch {
      // A network timeout can occur after acceptance. Preserve QUEUED rather than
      // overwriting a background worker that may already have claimed the command.
      return founderJson({...commandView(command), launch_status: "UNCONFIRMED"}, 202);
    }
    return founderJson({...commandView(command), launch_status: "ACCEPTED"}, 202);
  } catch {
    return founderJson({detail: "Founder state is unavailable"}, 503);
  }
};

export const config: Config = {path: ["/api/founder", "/api/founder/commands", "/api/founder/commands/:id"]};
