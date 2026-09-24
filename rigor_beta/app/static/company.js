const TOKEN_KEY = "rigorCompanyAdminToken";
let state = null;

const app = document.getElementById("company-app");
const toast = document.getElementById("company-toast");

function token() {
  return sessionStorage.getItem(TOKEN_KEY) || "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message, error = false) {
  toast.textContent = message;
  toast.classList.toggle("error", error);
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3200);
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (token()) headers.set("X-RIGOR-Company-Token", token());
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload.detail || `Request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

function badge(value) {
  const normalized = String(value || "UNKNOWN").toUpperCase();
  const tone = ["COMPLETE", "APPROVED", "REVIEWED"].includes(normalized)
    ? "green"
    : ["BLOCKED", "REJECTED", "CRITICAL"].includes(normalized)
      ? "red"
      : ["NEEDS_APPROVAL", "PENDING", "HIGH"].includes(normalized)
        ? "amber"
        : "blue";
  return `<span class="badge ${tone}">${escapeHtml(normalized.replaceAll("_", " "))}</span>`;
}

function fmt(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? escapeHtml(value) : date.toLocaleString();
}

function renderLogin(message = "") {
  app.innerHTML = `
    <main class="login-shell">
      <section class="login-panel">
        <div class="mark large">R1</div>
        <div class="eyebrow">Founder control plane</div>
        <h1>RIGOR ONE<br />Company OS</h1>
        <p class="lead">Business missions, AI operating briefs, founder approvals, and company audit history.</p>
        ${message ? `<div class="callout danger">${escapeHtml(message)}</div>` : ""}
        <form id="company-login" class="stack">
          <label>
            <span>Company access token</span>
            <input name="token" type="password" autocomplete="current-password" required />
          </label>
          <button class="btn primary" type="submit">Open Company OS</button>
        </form>
        <p class="privacy">The token is stored only in this browser tab session.</p>
      </section>
    </main>`;
  document.getElementById("company-login").addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = event.currentTarget.token.value.trim();
    if (!value) return;
    sessionStorage.setItem(TOKEN_KEY, value);
    await loadState();
  });
}

function teamCards() {
  const team = [
    ["Chief of Staff", "Synthesizes the company and surfaces only founder decisions."],
    ["Growth / Sales", "ICP, qualified pipeline, demos, objections, and sales experiments."],
    ["Customer Success", "Onboarding, adoption, feedback, account health, and retention risk."],
    ["Finance / Ops", "Runway, costs, revenue tracking, forecasts, KPIs, and operating cadence."],
    ["Market Intelligence", "Competitors, market movement, customers, and white-space signals."],
    ["Partnerships / Capital", "Partners, accelerators, strategic capital, and opportunity briefs."],
  ];
  return team.map(([name, description]) => `
    <article class="team-card">
      <div class="team-dot"></div>
      <div><strong>${name}</strong><p>${description}</p></div>
    </article>`).join("");
}

function renderMission(mission) {
  return `
    <article class="mission-card">
      <div class="row between">
        <div>
          <div class="meta">FOUNDER MISSION · ${escapeHtml(mission.priority)}</div>
          <h3>${escapeHtml(mission.title)}</h3>
        </div>
        ${badge(mission.status)}
      </div>
      <p>${escapeHtml(mission.objective)}</p>
      ${mission.last_summary ? `<div class="summary"><strong>Last AI review</strong><p>${escapeHtml(mission.last_summary)}</p></div>` : ""}
      <div class="row mission-actions">
        <select data-mission-status="${escapeHtml(mission.mission_id)}">
          ${["QUEUED","ACTIVE","REVIEWED","BLOCKED","NEEDS_APPROVAL","COMPLETE","CANCELLED"]
            .map((status) => `<option ${mission.status === status ? "selected" : ""}>${status}</option>`).join("")}
        </select>
        <button class="btn small" data-save-mission="${escapeHtml(mission.mission_id)}">Save status</button>
      </div>
    </article>`;
}

function renderApproval(approval) {
  return `
    <article class="approval-card">
      <div class="row between">
        <div class="meta">FOUNDER DECISION</div>
        ${badge(approval.status)}
      </div>
      <h3>${escapeHtml(approval.title)}</h3>
      <div class="small muted">Raised ${fmt(approval.created_at)}${approval.source_ref ? ` · ${escapeHtml(approval.source_ref)}` : ""}</div>
      ${approval.status === "PENDING" ? `
        <textarea data-approval-note="${escapeHtml(approval.approval_id)}" placeholder="Decision note (optional)"></textarea>
        <div class="row">
          <button class="btn approve" data-approval="${escapeHtml(approval.approval_id)}" data-decision="APPROVED">Approve</button>
          <button class="btn reject" data-approval="${escapeHtml(approval.approval_id)}" data-decision="REJECTED">Reject</button>
        </div>` : `
        <div class="summary"><strong>${escapeHtml(approval.status)}</strong><p>${escapeHtml(approval.decision_note || "No note recorded.")}</p></div>`}
    </article>`;
}

function renderAudit(item) {
  return `
    <div class="audit-row">
      <div>
        <strong>${escapeHtml(String(item.event_type || "").replaceAll("_", " "))}</strong>
        <div class="small muted">${fmt(item.created_at)}</div>
      </div>
      <code>${escapeHtml(JSON.stringify(item.payload || {}))}</code>
    </div>`;
}

function renderDashboard() {
  const pulse = state.latest_pulse?.pulse || null;
  const openMissions = state.open_missions || [];
  const approvals = state.approvals || [];
  const pending = state.pending_approvals || [];
  const currentMission = openMissions.find((item) => item.status === "ACTIVE")
    || openMissions.find((item) => item.status === "NEEDS_APPROVAL")
    || openMissions[0]
    || null;

  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="wrap topbar-inner">
          <div class="brand"><div class="mark">R1</div><div><strong>RIGOR ONE</strong><span>Company OS</span></div></div>
          <div class="row">
            <button class="btn ghost" id="refresh-company">Refresh</button>
            <button class="btn ghost" id="lock-company">Lock</button>
          </div>
        </div>
      </header>

      <main class="wrap main">
        <section class="hero">
          <div>
            <div class="eyebrow">Founder cockpit · Business operating system</div>
            <h1>Direct the company.<br />Let the system run the work.</h1>
            <p class="lead">The recurring business team advances founder missions, records durable company state, and escalates only decisions that require your authority.</p>
          </div>
          <div class="hero-actions">
            <button class="btn primary" id="run-pulse">Run company pulse</button>
            <button class="btn" id="new-mission-toggle">New founder mission</button>
          </div>
        </section>

        <section id="mission-form-wrap" class="card hidden">
          <div class="eyebrow">New founder mission</div>
          <form id="mission-form" class="mission-form">
            <label><span>Mission title</span><input name="title" minlength="3" maxlength="180" required placeholder="Example: Build 20 qualified production-company opportunities" /></label>
            <label><span>Priority</span><select name="priority"><option>HIGH</option><option>CRITICAL</option><option>MEDIUM</option><option>LOW</option></select></label>
            <label class="wide"><span>Objective</span><textarea name="objective" minlength="8" maxlength="4000" required placeholder="Define the outcome. The AI company will use this as the primary objective for the next operating pulse."></textarea></label>
            <div class="row"><button class="btn primary" type="submit">Queue mission</button><button class="btn ghost" type="button" id="cancel-mission">Cancel</button></div>
          </form>
        </section>

        <section class="metrics">
          <div class="metric"><span>Open missions</span><strong>${openMissions.length}</strong></div>
          <div class="metric"><span>Founder approvals</span><strong>${pending.length}</strong></div>
          <div class="metric"><span>Durable records</span><strong>${state.durable_state?.length || 0}</strong></div>
          <div class="metric"><span>Last pulse</span><strong class="date">${fmt(state.latest_pulse?.generated_at)}</strong></div>
        </section>

        <section class="grid two">
          <div class="card">
            <div class="section-head"><div><div class="eyebrow">Now</div><h2>Founder mission</h2></div>${currentMission ? badge(currentMission.status) : ""}</div>
            ${currentMission ? renderMission(currentMission) : `<div class="empty">No open mission. Queue one when you want the AI company to advance a specific objective.</div>`}
          </div>
          <div class="card">
            <div class="section-head"><div><div class="eyebrow">AI executive office</div><h2>Latest founder brief</h2></div></div>
            ${pulse ? `
              <p class="brief-state">${escapeHtml(pulse.current_state)}</p>
              <div class="brief-columns">
                <div><h3>Top priorities</h3><ol>${(pulse.top_priorities || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ol></div>
                <div><h3>Next actions</h3><ol>${(pulse.next_actions || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ol></div>
              </div>
              ${pulse.blockers_risks?.length ? `<div class="callout warning"><strong>Blockers / risks</strong><ul>${pulse.blockers_risks.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></div>` : ""}
            ` : `<div class="empty">No company pulse has been stored in this environment yet.</div>`}
          </div>
        </section>

        <section class="card">
          <div class="section-head"><div><div class="eyebrow">Operating team</div><h2>AI business office</h2></div><span class="small muted">Product / Engineering / QA remain a separate execution organization.</span></div>
          <div class="team-grid">${teamCards()}</div>
        </section>

        <section class="grid two">
          <div class="card">
            <div class="section-head"><div><div class="eyebrow">Human authority</div><h2>Approval queue</h2></div><span class="count">${pending.length}</span></div>
            <div class="stack">${approvals.length ? approvals.slice(0, 20).map(renderApproval).join("") : `<div class="empty">No founder approvals recorded.</div>`}</div>
          </div>
          <div class="card">
            <div class="section-head"><div><div class="eyebrow">Mission control</div><h2>Mission queue</h2></div><span class="count">${state.missions?.length || 0}</span></div>
            <div class="stack">${state.missions?.length ? state.missions.slice(0, 20).map(renderMission).join("") : `<div class="empty">No missions queued yet.</div>`}</div>
          </div>
        </section>

        <section class="card">
          <div class="section-head"><div><div class="eyebrow">Accountability</div><h2>Audit trail</h2></div></div>
          <div class="audit">${state.audit?.length ? state.audit.map(renderAudit).join("") : `<div class="empty">No company-control events recorded.</div>`}</div>
        </section>

        <footer>RIGOR ONE Company OS · Founder authority remains human · Product environment remains separate.</footer>
      </main>
    </div>`;

  bindDashboard();
}

function bindDashboard() {
  document.getElementById("refresh-company").addEventListener("click", loadState);
  document.getElementById("lock-company").addEventListener("click", () => {
    sessionStorage.removeItem(TOKEN_KEY);
    state = null;
    renderLogin();
  });
  document.getElementById("run-pulse").addEventListener("click", runPulse);
  document.getElementById("new-mission-toggle").addEventListener("click", () => {
    document.getElementById("mission-form-wrap").classList.remove("hidden");
    document.querySelector("#mission-form input").focus();
  });
  document.getElementById("cancel-mission").addEventListener("click", () => {
    document.getElementById("mission-form-wrap").classList.add("hidden");
  });
  document.getElementById("mission-form").addEventListener("submit", createMission);

  document.querySelectorAll("[data-save-mission]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.saveMission;
      const select = document.querySelector(`[data-mission-status="${CSS.escape(id)}"]`);
      await updateMission(id, { status: select.value });
    });
  });

  document.querySelectorAll("[data-approval]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.approval;
      const note = document.querySelector(`[data-approval-note="${CSS.escape(id)}"]`)?.value || "";
      await decideApproval(id, button.dataset.decision, note);
    });
  });
}

async function loadState() {
  if (!token()) return renderLogin();
  app.innerHTML = `<div class="boot"><div class="mark">R1</div><div>Loading company state…</div></div>`;
  try {
    state = await api("/api/company/state");
    renderDashboard();
  } catch (error) {
    if (error.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY);
      renderLogin("That company access token was not accepted.");
    } else {
      renderLogin(error.message);
    }
  }
}

async function createMission(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    await api("/api/company/missions", {
      method: "POST",
      body: JSON.stringify({
        title: form.title.value,
        objective: form.objective.value,
        priority: form.priority.value,
      }),
    });
    showToast("Founder mission queued.");
    await loadState();
  } catch (error) {
    button.disabled = false;
    showToast(error.message, true);
  }
}

async function updateMission(id, updates) {
  try {
    await api(`/api/company/missions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    showToast("Mission updated.");
    await loadState();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function decideApproval(id, decision, note) {
  try {
    await api(`/api/company/approvals/${encodeURIComponent(id)}`, {
      method: "POST",
      body: JSON.stringify({ decision, note }),
    });
    showToast(`Founder decision recorded: ${decision.toLowerCase()}.`);
    await loadState();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function runPulse() {
  const button = document.getElementById("run-pulse");
  button.disabled = true;
  button.textContent = "Starting pulse…";
  try {
    await api("/api/company/pulse/run", { method: "POST", body: "{}" });
    showToast("Company pulse accepted. Refresh after the AI team finishes.");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "Run company pulse";
  }
}

loadState();
