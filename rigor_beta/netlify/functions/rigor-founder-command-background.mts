import type { Context } from "@netlify/functions";
import {outreachContract, parseOutreachPackage} from '../../app/outreach-package.js';
import { runCompanyPulse } from "./rigor-company-pulse-background.mjs";
import { normalizeExecutionResult, delegationVerified, founderStore, serviceAuthorized, validCommandId, type FounderCommand } from "./_shared/founder.js";

export default async (request: Request, context: Context) => {
  if (request.method !== "POST" || !serviceAuthorized(request)) return;
  let id: unknown;
  try { id = (await request.json()).command_id; } catch { return; }
  if (!validCommandId(id)) return;
  const store = await founderStore(context), key = "founder/commands/" + id;
  const stored = await store.getWithMetadata(key, {type: "json"});
  if (!stored || !stored.etag || stored.data.status !== "QUEUED") return;
  const command = stored.data as FounderCommand;
  const startedAt = new Date().toISOString();
  const running = {...command, status: "RUNNING" as const, started_at: startedAt};
  const claim = await store.setJSON(key, running, {onlyIfMatch: stored.etag});
  if (!claim.modified) return;
  const base = Netlify.env.get("RIGOR_DEERFLOW_URL")?.trim();
  const token = Netlify.env.get("RIGOR_DEERFLOW_TOKEN")?.trim();
  let partialResult: Record<string, unknown> | undefined;
  try {
    if (!base || !token) throw new Error("SERVICE_NOT_CONFIGURED");
    let result: Record<string, unknown>;
    if (command.kind === "RUN_COMPANY_PULSE") {
      const latest = await runCompanyPulse(new Request(request.url, {method: "POST", headers: {"X-RIGOR-Automation-Token": token}}), context, command.objective);
      if (!latest) throw new Error("PULSE_DID_NOT_COMPLETE");
      result = {...latest.pulse, status: "COMPLETE", generated_at: latest.generated_at, durable_state_records: latest.durable_state_records};
    } else {
      const [latest, deployResponse, healthResponse] = await Promise.all([
        store.get("pulse/latest", {type: "json"}),
        fetch(new URL("/deploy-meta.json", request.url), {signal: AbortSignal.timeout(10000)}),
        fetch(new URL("/api/health", request.url), {signal: AbortSignal.timeout(10000)}),
      ]);
      const observed = {
        deployment: deployResponse.ok ? await deployResponse.json() : {status: deployResponse.status},
        product_health: healthResponse.ok ? await healthResponse.json() : {status: healthResponse.status},
        latest_company_pulse: latest ? {generated_at: latest.generated_at, pulse: latest.pulse} : null,
        priorities: ["P0: RIGOR product and AI-company reliability", "P1: production handshake and change-impact moat", "E3 is medium priority"],
      };
      const outreach = command.kind === 'PREPARE_OUTREACH';
      const outreachContext = {deployment: observed.deployment,
        product_description: 'RIGOR is a live-production workflow product for document requirements, department review, conflicts, readiness and Advance Reports. Public product claims require source/test evidence; no customer traction or real-show deployment is verified here.',
        execution_rules: outreachContract};
      const response = await fetch(`${base.replace(/\/$/, "")}/api/rigor/company/action/execute`, {
        method: "POST", headers: {"Content-Type": "application/json", "X-RIGOR-Service-Token": token},
        body: JSON.stringify({proposal: {action_type: outreach ? 'OUTREACH_DRAFT' : "INTERNAL_DOCUMENT", scope: "PREPARE", title: `${command.kind}: ${id}`,
          summary: command.objective, owner_agent: command.owner_agent, reversible: true,
          payload: {founder_command_id: id, objective: command.objective, ...(outreach ? {output_contract: outreachContract} : {})}}, context: JSON.stringify(outreach ? outreachContext : observed).slice(0, 18000)}),
        signal: AbortSignal.timeout(12 * 60 * 1000),
      });
      if (!response.ok) throw new Error(`UPSTREAM_HTTP_${response.status}`);
      result = normalizeExecutionResult(await response.json() as Record<string, unknown>);
      partialResult = result;
      if (result.status !== "COMPLETE" || typeof result.result_summary !== "string" || !result.result_summary.trim()) throw new Error("INVALID_EXECUTION_RESULT");
    }
    const verified = delegationVerified(result, command.kind === "RUN_COMPANY_PULSE" ? undefined : command.owner_agent, command.kind === "RUN_COMPANY_PULSE");
    if (!verified) throw new Error("DELEGATION_NOT_VERIFIED");
    if (command.kind === 'PREPARE_OUTREACH') {
      const packet = parseOutreachPackage(result.artifact_markdown);
      result = {...result, outreach_package: packet,
        result_summary: 'Saved five partner prospects, five investor prospects, ten introductory drafts and ten follow-ups. All outreach remains unsent; source claims require review.'};
    }
    const completedAt = new Date().toISOString();
    await store.setJSON(key, {...running, status: "COMPLETE", completed_at: completedAt, result,
      execution_receipt: {command_id: id, owner_agent: command.owner_agent, started_at: startedAt, completed_at: completedAt,
        delegation_verified: true, execution_receipts: result.execution_receipts, external_action_performed: false}});
  } catch (error) {
    const message = error instanceof Error ? error.message : "EXECUTION_FAILED";
    const safeCode = /^(UPSTREAM_HTTP_\d{3}|SERVICE_NOT_CONFIGURED|PULSE_DID_NOT_COMPLETE|PULSE_EXECUTION_FAILED|INVALID_EXECUTION_RESULT|DELEGATION_NOT_VERIFIED|OUTREACH_DELIVERABLES_MISSING)$/.test(message)
      ? message : "EXECUTION_FAILED";
    await store.setJSON(key, {...running, status: "FAILED", failure_code: safeCode, ...(partialResult ? {result: partialResult} : {}), completed_at: new Date().toISOString()});
  }
};
