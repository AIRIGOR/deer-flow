"use strict";

const endpoint = "/api/company/founder";
const loginView = document.getElementById("login-view");
const officeView = document.getElementById("office-view");
const refreshButton = document.getElementById("refresh-button");
const logoutButton = document.getElementById("logout-button");
const toastNode = document.getElementById("toast");
let dashboard = null;
let toastTimer = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message, error = false) {
  clearTimeout(toastTimer);
  toastNode.textContent = message;
  toastNode.className = `toast show${error ? " error" : ""}`;
  toastTimer = setTimeout(() => { toastNode.className = "toast"; }, 3200);
}

async function request(method = "GET", payload = null) {
  const response = await fetch(endpoint, {
    method,
    credentials: "same-origin",
    headers: payload ? { "Content-Type": "application/json" } : {},
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.detail || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function showLogin(message = "") {
  dashboard = null;
  officeView.classList.add("hidden");
  loginView.classList.remove("hidden");
  refreshButton.classList.add("hidden");
  logoutButton.classList.add("hidden");
  document.getElementById("login-error").textContent = message;
}

function showOffice() {
  loginView.classList.add("hidden");
  officeView.classList.remove("hidden");
  refreshButton.classList.remove("hidden");
  logoutButton.classList.remove("hidden");
}

function formatTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
  }).format(date);
}

function tag(value, tone = "") {
  return `<span class="tag ${tone}">${escapeHtml(String(value || "").replaceAll("_", " "))}</span>`;
}

function renderMetrics(data) {
  const q = data.action_queue || {};
  const records = data.records || [];
  const activeObjectives = records.filter(item => item.record_type === "OBJECTIVE" && !["COMPLETE", "ARCHIVED"].includes(item.status)).length;
  const blockers = records.filter(item => item.status === "BLOCKED" || item.record_type === "RISK").length;
  document.getElementById("metrics").innerHTML = [
    ["Company pulse", data.has_latest_pulse ? "LIVE" : "—"],
    ["Founder approvals", q.needs_founder_approval || 0],
    ["Active objectives", activeObjectives],
    ["AI actions", q.total || 0],
    ["Risks / blockers", blockers],
  ].map(([label, value]) => `<div class="metric"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`).join("");
}

function renderApprovals(data) {
  const approvals = (data.actions || []).filter(item => item.status === "NEEDS_APPROVAL");
  document.getElementById("approval-count").textContent = approvals.length;
  document.getElementById("approvals").innerHTML = approvals.length ? approvals.map(item => `
    <article class="row-card">
      <div class="row-card-top">
        <div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.summary || item.policy_reason || "Founder decision required.")}</p></div>
        ${tag(item.action_type, "warn")}
      </div>
      <div class="meta">${tag(item.scope)}${item.owner_agent ? tag(item.owner_agent) : ""}${tag(item.reversible === false ? "IRREVERSIBLE" : "REVERSIBLE", item.reversible === false ? "danger" : "good")}</div>
      <div class="approval-actions">
        <button class="approve" data-action="approve" data-key="${escapeHtml(item.action_key)}">Approve</button>
        <button class="reject" data-action="reject" data-key="${escapeHtml(item.action_key)}">Reject</button>
      </div>
    </article>
  `).join("") : `<div class="empty">No consequential action is waiting on you.</div>`;

  document.querySelectorAll("[data-action][data-key]").forEach(button => {
    button.addEventListener("click", () => decideAction(button.dataset.key, button.dataset.action, button));
  });
}

function renderAgents(data) {
  const map = new Map();
  for (const record of data.records || []) {
    if (!record.owner_agent) continue;
    const entry = map.get(record.owner_agent) || { name: record.owner_agent, active: 0, total: 0, latest: "" };
    entry.total += 1;
    if (!["COMPLETE", "ARCHIVED"].includes(record.status)) entry.active += 1;
    if ((record.updated_at || "") > entry.latest) entry.latest = record.updated_at || "";
    map.set(record.owner_agent, entry);
  }
  for (const action of data.actions || []) {
    if (!action.owner_agent) continue;
    const entry = map.get(action.owner_agent) || { name: action.owner_agent, active: 0, total: 0, latest: "" };
    entry.total += 1;
    if (["APPROVED", "NEEDS_APPROVAL", "EXECUTING"].includes(action.status)) entry.active += 1;
    if ((action.updated_at || "") > entry.latest) entry.latest = action.updated_at || "";
    map.set(action.owner_agent, entry);
  }
  if (!map.size) {
    ["CEO Agent", "CTO Agent", "CFO Agent", "Growth Agent", "Fundraising Agent", "Production Intelligence Agent"].forEach(name => map.set(name, { name, active: 0, total: 0, latest: "" }));
  }
  const agents = [...map.values()].sort((a, b) => b.active - a.active || a.name.localeCompare(b.name));
  document.getElementById("agents").innerHTML = agents.map(agent => `
    <div class="agent-row">
      <span class="agent-dot"></span>
      <div><strong>${escapeHtml(agent.name)}</strong><small>${agent.active ? `${agent.active} active assignment${agent.active === 1 ? "" : "s"}` : "Monitoring"}</small></div>
      ${tag(agent.active ? "WORKING" : "MONITORING", agent.active ? "good" : "")}
    </div>
  `).join("");
}

function recordCard(item) {
  const tone = item.status === "BLOCKED" ? "danger" : item.status === "NEEDS_APPROVAL" ? "warn" : item.status === "COMPLETE" ? "good" : "";
  return `<article class="row-card"><div class="row-card-top"><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.summary || "")}</p></div>${tag(item.status || "OPEN", tone)}</div><div class="meta">${tag(item.record_type)}${item.priority ? tag(item.priority, item.priority === "CRITICAL" ? "danger" : item.priority === "HIGH" ? "warn" : "") : ""}${item.owner_agent ? tag(item.owner_agent) : ""}</div></article>`;
}

function renderObjectives(data) {
  const objectives = (data.records || []).filter(item => ["OBJECTIVE", "MILESTONE", "EXPERIMENT"].includes(item.record_type) && item.status !== "ARCHIVED").slice(0, 8);
  const pulsePriorities = data.latest?.pulse?.top_priorities || [];
  const content = objectives.length
    ? objectives.map(recordCard).join("")
    : pulsePriorities.length
      ? pulsePriorities.map(item => `<div class="row-card"><strong>${escapeHtml(item)}</strong></div>`).join("")
      : `<div class="empty">The next company pulse will populate active objectives.</div>`;
  document.getElementById("objectives").innerHTML = content;
}

function renderRisks(data) {
  const risks = (data.records || []).filter(item => item.record_type === "RISK" || item.status === "BLOCKED").slice(0, 8);
  const pulseRisks = data.latest?.pulse?.blockers_risks || [];
  document.getElementById("risks").innerHTML = risks.length
    ? risks.map(recordCard).join("")
    : pulseRisks.length
      ? pulseRisks.map(item => `<div class="row-card"><strong>${escapeHtml(item)}</strong></div>`).join("")
      : `<div class="empty">No blocker is currently recorded.</div>`;
}

function renderFeed(data) {
  const rows = [];
  for (const command of data.command_log || []) {
    rows.push({
      at: command.submitted_at,
      copy: `Founder directive: ${command.command}`,
      meta: command.status || "QUEUED",
      tone: command.status === "PROCESSED" ? "good" : "warn",
    });
  }
  for (const action of data.actions || []) {
    rows.push({
      at: action.updated_at,
      copy: action.title,
      meta: `${action.owner_agent || "AI Company"} · ${action.status}`,
      tone: action.status === "COMPLETE" ? "good" : action.status === "FAILED" ? "danger" : action.status === "NEEDS_APPROVAL" ? "warn" : "",
    });
  }
  for (const record of data.records || []) {
    rows.push({
      at: record.updated_at,
      copy: record.title,
      meta: `${record.owner_agent || record.record_type} · ${record.status || "OPEN"}`,
      tone: record.status === "COMPLETE" ? "good" : record.status === "BLOCKED" ? "danger" : "",
    });
  }
  rows.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  document.getElementById("feed").innerHTML = rows.length ? rows.slice(0, 30).map(row => `
    <div class="feed-row">
      <div class="feed-time">${escapeHtml(formatTime(row.at))}</div>
      <div class="feed-copy">${escapeHtml(row.copy)}<small>${escapeHtml(row.meta)}</small></div>
      ${tag(row.meta.split(" · ").at(-1), row.tone)}
    </div>
  `).join("") : `<div class="empty">No company activity has been recorded yet.</div>`;
}

function render(data) {
  dashboard = data;
  showOffice();
  const health = document.getElementById("company-health");
  health.textContent = data.status === "ok" ? "Company online" : "Degraded";
  health.className = `health-pill ${data.status === "ok" ? "good" : "warn"}`;
  document.getElementById("pulse-time").textContent = data.latest_pulse_at ? `Last operating pulse · ${formatTime(data.latest_pulse_at)}` : "No completed operating pulse yet.";
  renderMetrics(data);
  renderApprovals(data);
  renderAgents(data);
  renderObjectives(data);
  renderRisks(data);
  renderFeed(data);
}

async function refresh(silent = false) {
  if (!silent) refreshButton.disabled = true;
  try {
    render(await request());
  } catch (error) {
    if (error.status === 401) showLogin();
    else showToast(error.message, true);
  } finally {
    refreshButton.disabled = false;
  }
}

async function decideAction(actionKey, decision, button) {
  const verb = decision === "approve" ? "Approve" : "Reject";
  if (!window.confirm(`${verb} this company action?`)) return;
  button.disabled = true;
  try {
    await request("POST", { op: decision, action_key: actionKey });
    showToast(`Action ${decision === "approve" ? "approved" : "rejected"}.`);
    await refresh(true);
  } catch (error) {
    button.disabled = false;
    showToast(error.message, true);
  }
}

document.getElementById("login-form").addEventListener("submit", async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  const errorNode = document.getElementById("login-error");
  button.disabled = true;
  errorNode.textContent = "";
  try {
    const result = await request("POST", { op: "login", key: event.currentTarget.key.value });
    event.currentTarget.reset();
    render(result.dashboard);
  } catch (error) {
    errorNode.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.getElementById("command-form").addEventListener("submit", async event => {
  event.preventDefault();
  const input = document.getElementById("command-input");
  const button = document.getElementById("command-submit");
  const status = document.getElementById("command-status");
  const command = input.value.trim();
  if (!command) return;
  button.disabled = true;
  status.textContent = "Directive entering the company operating queue…";
  try {
    const result = await request("POST", { op: "command", command });
    input.value = "";
    status.textContent = "Directive accepted. The AI company pulse is running under Founder policy.";
    showToast("Founder directive accepted.");
    if (result.dashboard) render(result.dashboard);
  } catch (error) {
    status.textContent = "";
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
});

document.querySelectorAll("[data-command]").forEach(button => {
  button.addEventListener("click", () => {
    document.getElementById("command-input").value = button.dataset.command;
    document.getElementById("command-input").focus();
  });
});

refreshButton.addEventListener("click", () => refresh());
logoutButton.addEventListener("click", async () => {
  try { await request("POST", { op: "logout" }); } catch (_) {}
  showLogin();
});

(async function boot() {
  try { render(await request()); }
  catch (error) {
    if (error.status === 401) showLogin();
    else showLogin(error.message);
  }
})();
