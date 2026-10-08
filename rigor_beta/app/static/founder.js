"use strict";
let founderToken = "", activeCommand = sessionStorage.getItem("rigorFounderCommandId"), pollTimer = null;
const element = id => document.getElementById(id);
const status = text => { element("command-result").textContent = text; };
async function call(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", "X-RIGOR-Founder-Token": founderToken } });
  const body = await response.json();
  if (!response.ok && !body.command_id) throw new Error(body.detail || body.error_code || `Request failed (${response.status})`);
  return body;
}
function show(record) {
  activeCommand = record.command_id; sessionStorage.setItem("rigorFounderCommandId", activeCommand);
  status(`${record.status}: ${record.command}`);
  element("command-receipt").textContent = `Command ${record.command_id} · Updated ${record.updated_at}${record.execution_id ? " · Execution " + record.execution_id : ""}`;
  element("command-evidence").textContent = record.result ? JSON.stringify(record.result, null, 2) : record.error_code || "Awaiting execution evidence.";
  const terminal = ["COMPLETE", "FAILED"].includes(record.status);
  pollTimer = null;
  element("submit-command").disabled = !terminal;
  const updatedAt = Date.parse(record.updated_at);
  if (!terminal && Number.isFinite(updatedAt) && Date.now() - updatedAt > 16 * 60 * 1000) {
    status(`Completion unverified: command ${record.command_id} is overdue. Inspect execution before resubmitting.`);
  } else if (!terminal) pollTimer = setTimeout(poll, 3000);
}
async function poll() {
  try { show(await call(`/api/founder/commands?id=${encodeURIComponent(activeCommand)}`)); }
  catch (error) { status(`Status unavailable: ${error.message}. Command ${activeCommand} may still be running.`); element("submit-command").disabled = true; pollTimer = setTimeout(poll, 10000); }
}
element("access-form").addEventListener("submit", event => {
  event.preventDefault(); founderToken = element("founder-token").value.trim(); element("founder-token").value = "";
  element("connection-status").textContent = "Access entered · verification on request";
  element("submit-command").disabled = !founderToken || Boolean(activeCommand);
  clearTimeout(pollTimer); pollTimer = null;
  if (founderToken && activeCommand) poll();
});
element("command-form").addEventListener("submit", async event => {
  event.preventDefault(); if (!founderToken || element("submit-command").disabled) return;
  element("submit-command").disabled = true; clearTimeout(pollTimer); pollTimer = null; status("Submitting command…");
  try { show(await call("/api/founder/commands", { method: "POST", body: JSON.stringify({ command: element("command-input").value.trim(), mode: element("command-mode").value }) })); element("connection-status").textContent = "Founder authenticated"; }
  catch (error) { status(`Submission not confirmed: ${error.message}`); element("submit-command").disabled = false; }
});
