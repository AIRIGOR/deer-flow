"use strict";

const app = document.getElementById("app");
const toastNode = document.getElementById("toast");
let state = null;
let selectedSession = Number(sessionStorage.getItem("rigorSelectedSession") || 1);
let toastTimer = null;
let showAllRequirements = sessionStorage.getItem("rigorShowAllRequirements") === "1";

const departments = ["Audio", "Backline", "Communications", "Hospitality", "Labor", "Lighting", "Medical", "Merchandise", "Power", "Production", "Rigging", "Security", "Stage Management", "Video"];

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
  toastTimer = setTimeout(() => { toastNode.className = "toast"; }, 2800);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: options.body instanceof FormData ? {} : { "Content-Type": "application/json" },
    ...options,
  });
  if (response.status === 401) {
    state = null;
    renderStart();
    throw new Error("Your RIGOR session needs to be restarted.");
  }
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try { message = (await response.json()).detail || message; } catch (_) { /* no-op */ }
    throw new Error(message);
  }
  return response.headers.get("content-type")?.includes("application/json") ? response.json() : response;
}

function badge(status) {
  const color = ["CONFIRMED", "RESOLVED", "COMPLETE", "READY", "SHOW_READY", "ADVANCE_READY", "PROCESSED"].includes(status)
    ? "green"
    : ["CRITICAL", "BLOCKED", "REJECTED"].includes(status)
      ? "red"
      : ["HIGH", "NEEDS_CONFIRMATION", "NEEDS_REVIEW", "PENDING"].includes(status)
        ? "amber"
        : "blue";
  return `<span class="badge ${color}">${escapeHtml(status.replaceAll("_", " "))}</span>`;
}

function sessionCard(number, info) {
  const unlocked = number === 1 || state.progress.sessions[String(number - 1)].complete;
  const active = selectedSession === number;
  const classes = ["flow-step", active ? "active" : "", info.complete ? "complete" : "", unlocked ? "" : "locked"].join(" ");
  const stateCopy = info.complete ? "Complete" : active ? "Now" : unlocked ? "Next" : "Locked";
  return `<button class="${classes}" ${unlocked ? "" : "disabled"} onclick="selectSession(${number})">
    <span class="flow-dot">${info.complete ? "✓" : number}</span>
    <span class="flow-copy"><strong>${escapeHtml(info.label)}</strong><small>${stateCopy}</small></span>
  </button>`;
}

function productionCard(item, index) {
  const active = item.production_id === state.workspace.active_production_id;
  return `<button class="production-pill ${active ? "active" : ""}" onclick="selectProduction('${item.production_id}')">
    <span class="production-pill-kicker">${active ? "Active" : `Show ${index + 1}`}</span>
    <strong>${escapeHtml(item.show.show_name)}</strong>
    <span>${escapeHtml(item.show.venue)}</span>
  </button>`;
}

function renderProductionSwitcher() {
  const pills = state.productions.map(productionCard);
  if (state.productions.length < state.workspace.production_limit) {
    pills.push(`<button class="production-pill add" onclick="openProductionDialog()"><span class="production-pill-kicker">New</span><strong>+ Add production</strong><span>Separate show workspace</span></button>`);
  }
  return `<section class="wrap production-switcher">
    <div class="production-switcher-label">Productions</div>
    <div class="production-pills">${pills.join("")}</div>
  </section>`;
}

function renderStart() {
  app.innerHTML = `<main class="start-page">
    <div class="wrap start-layout">
      <section class="start-copy">
        <div class="brand"><div class="brand-mark">R</div><div>RIGOR</div></div>
        <div style="height:42px"></div>
        <div class="eyebrow">Readiness Intelligence for Global Operations &amp; Requirements</div>
        <h1>Know the show before show day.</h1>
        <p class="lead">Build and run up to three separate productions from raw advance documents to a show-ready operating picture.</p>
        <div class="journey">
          <div class="journey-item"><span>1</span><div><strong>Preproduction intake</strong><div class="muted small">Review extracted requirements with page-level source evidence.</div></div></div>
          <div class="journey-item"><span>2</span><div><strong>Technical advance</strong><div class="muted small">Resolve contradictions, assign ownership, and drive department readiness.</div></div></div>
          <div class="journey-item"><span>3</span><div><strong>Show day</strong><div class="muted small">Run checkpoints, log incidents, and export the final Advance Report.</div></div></div>
        </div>
      </section>
      <section class="card start-card">
        <div class="eyebrow">Create your RIGOR workspace</div>
        <h2 style="margin:8px 0 6px">Start your first production</h2>
        <p class="muted">Your decisions and progress are saved in this browser.</p>
        <form id="start-form" class="start-form">
          <div class="field"><label for="display-name">Your name</label><input id="display-name" name="display_name" minlength="2" maxlength="60" required autocomplete="name" placeholder="First and last name" /></div>
          <div class="field"><label for="role">Your production role</label><select id="role" name="role" required><option value="">Select role</option><option>TM</option><option>PM</option><option>Video</option><option>Audio</option><option>Lighting</option><option>Rigging</option><option>Backline</option><option>Other</option></select></div>
          <button class="btn primary" type="submit">Enter RIGOR →</button>
          <div class="privacy-note">Each evaluator receives three isolated production slots. Progress is saved automatically for 45 days.</div>
        </form>
      </section>
    </div>
  </main>`;
  document.getElementById("start-form").addEventListener("submit", startDemo);
}

async function startDemo(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  button.textContent = "Building your show…";
  try {
    state = await api("/api/start", { method: "POST", body: JSON.stringify({ display_name: event.currentTarget.display_name.value, role: event.currentTarget.role.value }) });
    selectedSession = 1;
    renderWorkspace();
  } catch (error) {
    button.disabled = false;
    button.textContent = "Enter RIGOR →";
    showToast(error.message, true);
  }
}

function renderWorkspace() {
  const r = state.readiness;
  const s = state.show;
  app.innerHTML = `<div class="shell">
    <header class="topbar"><div class="wrap topbar-inner">
      <div class="brand"><div class="brand-mark">R</div><div>RIGOR</div></div>
      <div class="user-chip"><span><strong>${escapeHtml(state.tester.display_name)}</strong> <span class="user-role">· ${escapeHtml(state.tester.role)}</span></span><button class="link-button" onclick="logout()">Exit</button></div>
    </div></header>
    <main>
      ${renderProductionSwitcher()}
      <section class="hero"><div class="wrap hero-grid">
        <div class="show-identity"><div class="eyebrow">${escapeHtml(s.artist)} · ${escapeHtml(s.show_date)}</div><h1>${escapeHtml(s.venue)}</h1><p class="lead">${escapeHtml(s.city)} · ${escapeHtml(s.show_name)}</p></div>
        <div class="readiness-card">
          <div><div class="readiness-label">Show readiness</div><div class="readiness-number">${r.score}%</div></div>
          <div class="readiness-copy"><strong>${escapeHtml(r.status.replaceAll("_", " "))}</strong><span>${r.open_conflicts} open conflict${r.open_conflicts === 1 ? "" : "s"} · ${r.confirmed_requirements}/${r.total_requirements} requirements ready</span></div>
        </div>
      </div></section>
      <nav class="wrap flow-path" aria-label="RIGOR production path">${Object.entries(state.progress.sessions).map(([number, info]) => sessionCard(Number(number), info)).join("")}</nav>
      <section class="wrap stage">${renderSession()}</section>
    </main>
    <footer class="footer"><div class="wrap">RIGOR · Operational intelligence for live production.</div></footer>
  </div>`;
  bindSessionEvents();
}

function renderSession() {
  if (selectedSession === 2) return renderSessionTwo();
  if (selectedSession === 3) return renderSessionThree();
  return renderSessionOne();
}

function renderSessionOne() {
  const info = state.progress.sessions["1"];
  const openRequirements = state.requirements.filter(item => !["CONFIRMED", "REJECTED", "RESOLVED"].includes(item.status));
  const nextRequirement = openRequirements[0];
  const reviewItems = showAllRequirements ? state.requirements : (nextRequirement ? [nextRequirement] : []);
  return `<div class="stage-head focused-head"><div><div class="eyebrow">Session 1 · Preproduction intake</div><h2>Turn the production packet into operational truth.</h2><p>Verify what matters, resolve one decision, then move to the next.</p></div></div>
    ${info.complete ? `<div class="callout success" style="margin-bottom:16px"><strong>Session 1 complete.</strong> Technical Advance is now unlocked.</div>` : `<div class="callout" style="margin-bottom:16px">${state.requirements.length ? "Work one requirement at a time. Open source evidence only when you need to verify what RIGOR saw." : "Upload a production document to begin extraction and source-backed review."}</div>`}
    <div class="grid two source-grid">
      <div class="card source-card"><div class="card-header"><div><h3>Production packet</h3><div class="muted small">${state.documents.length} documents · ${state.documents.reduce((sum, doc) => sum + doc.page_count, 0)} pages</div></div>${badge(state.documents.length ? "PROCESSED" : "DOCUMENTS_PENDING")}</div><div class="stack" style="margin-top:14px">${state.documents.map(doc => `<div class="document-row"><div><strong>${escapeHtml(doc.name)}</strong><div class="muted small">${escapeHtml(doc.doc_type.replaceAll("_", " "))} · ${doc.page_count} pages${doc.analysis_engine ? ` · ${escapeHtml(doc.analysis_engine.replaceAll("_", " "))}` : ""}</div></div>${badge(doc.status)}</div>`).join("")}</div></div>
      <div class="card source-card"><h3>Additional source</h3><p class="muted small">Add another PDF or TXT when the advance changes. RIGOR will compare it against the current production truth.</p><label id="upload-zone" class="upload-zone"><input id="document-upload" type="file" accept=".pdf,.txt,application/pdf,text/plain" /><strong>Drop or choose a production document</strong><div class="muted small">5 MB maximum · private to this workspace</div></label></div>
    </div>
    <div class="card requirement-focus" style="margin-top:16px">
      <div class="card-header requirement-focus-head">
        <div><div class="eyebrow">Now</div><h3>Requirement review</h3><div class="muted small">${info.done} of ${state.requirements.length} verified${openRequirements.length ? ` · ${openRequirements.length} remaining` : ""}</div></div>
        ${state.requirements.length > 1 ? `<button class="btn ghost small-button" onclick="toggleRequirementsView()">${showAllRequirements ? "Focus next" : "View all"}</button>` : ""}
      </div>
      ${showAllRequirements ? `<div class="requirement-tools"><select id="requirement-filter" aria-label="Filter department"><option value="ALL">All departments</option>${departments.map(d => `<option>${escapeHtml(d)}</option>`).join("")}</select></div>` : ""}
      <div id="requirements-list" class="stack requirement-stack">${state.requirements.length ? (reviewItems.length ? renderRequirements(reviewItems) : `<div class="callout success"><strong>All requirements reviewed.</strong> Technical Advance is ready when the remaining session conditions are complete.</div>`) : `<div class="callout">No extracted requirements yet. Upload the venue pack, rider, schedule, labor call, or other production source documents.</div>`}</div>
    </div>
    ${renderFeedback(1)}`;
}

function toggleRequirementsView() {
  showAllRequirements = !showAllRequirements;
  sessionStorage.setItem("rigorShowAllRequirements", showAllRequirements ? "1" : "0");
  renderWorkspace();
}

function renderRequirements(items) {
  return items.map(item => `<article class="requirement-row" data-department="${escapeHtml(item.department)}">
    <div><div class="meta"><span>${escapeHtml(item.department)}</span>${badge(item.status)}</div><h3>${escapeHtml(item.title)}</h3><p class="muted small">${escapeHtml(item.detail)}</p><button class="btn ghost small-button" onclick='showEvidence(${JSON.stringify(item).replaceAll("'", "&#39;")})'>Source evidence ↗</button></div>
    <div class="actions">${!["CONFIRMED", "REJECTED", "RESOLVED"].includes(item.status) ? `<button class="btn primary small-button" onclick="setRequirement('${item.requirement_id}','CONFIRMED')">Confirm</button><button class="btn danger small-button" onclick="setRequirement('${item.requirement_id}','REJECTED')">Reject</button>` : `<button class="btn small-button" onclick="setRequirement('${item.requirement_id}','NEEDS_CONFIRMATION')">Reopen</button>`}</div>
  </article>`).join("");
}

function renderSessionTwo() {
  const info = state.progress.sessions["2"];
  const unlocked = state.progress.sessions["1"].complete;
  if (!unlocked) return lockedSession(2, "Complete the preproduction review to unlock Technical Advance.");
  const ownerTarget = state.requirements.filter(item => ["CONFIRMED", "RESOLVED"].includes(item.status)).length;
  return `<div class="stage-head"><div><div class="eyebrow">Session 2 · Technical advance</div><h2>Resolve the contradictions before they reach the dock.</h2><p>Make an operational decision for every conflict, assign ownership, and watch the readiness picture recalculate across departments.</p></div><div class="stage-badge">${state.conflicts.length} detected conflict${state.conflicts.length === 1 ? "" : "s"} · ${ownerTarget} owner target</div></div>
    ${info.complete ? `<div class="callout success" style="margin-bottom:16px"><strong>Session 2 complete.</strong> Show Day is now unlocked.</div>` : `<div class="callout warning" style="margin-bottom:16px">RIGOR found ${state.readiness.open_conflicts} unresolved conflicts. A report can be generated now, but the show remains blocked.</div>`}
    <div class="metric-row" style="margin-bottom:16px"><div class="metric"><div class="n">${state.conflicts.filter(c => c.status === "RESOLVED").length}/${state.conflicts.length}</div><div class="l">Conflicts resolved</div></div><div class="metric"><div class="n">${state.requirements.filter(r => r.owner).length}</div><div class="l">Owners assigned</div></div><div class="metric"><div class="n">${state.departments.filter(d => d.status === "READY").length}</div><div class="l">Departments ready</div></div><div class="metric"><div class="n">${state.readiness.score}%</div><div class="l">Readiness</div></div></div>
    <div class="card"><div class="card-header"><div><h3>Conflict desk</h3><div class="muted small">Evidence from multiple sources, one recorded decision.</div></div></div><div class="stack" style="margin-top:14px">${state.conflicts.length ? state.conflicts.map(renderConflict).join("") : `<div class="callout success">No incompatible normalized requirements have been detected across the uploaded source documents.</div>`}</div></div>
    <div class="grid two" style="margin-top:16px">
      <div class="card"><h3>Assign operational owners</h3><p class="muted small">Assign an owner to every confirmed requirement. Rejected candidates are closed and do not require an owner.</p><div>${state.requirements.filter(item => ["CONFIRMED", "RESOLVED"].includes(item.status)).map(item => `<div class="owner-row"><div><strong>${escapeHtml(item.department)} · ${escapeHtml(item.title)}</strong><div class="muted small">${escapeHtml(item.status.replaceAll("_", " "))}</div></div><input id="owner-${item.requirement_id}" value="${escapeHtml(item.owner || "")}" placeholder="Owner name / role" /><button class="btn small-button" onclick="saveOwner('${item.requirement_id}')">Save</button></div>`).join("")}</div></div>
      <div class="card"><h3>Department readiness</h3><div class="stack">${state.departments.map(item => `<div class="department-row"><strong>${escapeHtml(item.department)}</strong><div class="department-bar"><span style="width:${Math.round(item.ready / Math.max(item.total, 1) * 100)}%"></span></div>${badge(item.status)}</div>`).join("")}</div></div>
    </div>
    ${renderFeedback(2)}`;
}

function renderConflict(item) {
  return `<article class="conflict-row"><div class="card-header"><div><div class="meta"><span>${escapeHtml(item.department)}</span>${badge(item.severity)}${badge(item.status)}</div><h3>${escapeHtml(item.title)}</h3></div></div><div class="compare"><div><div class="muted small">${escapeHtml(item.left_source)}</div><strong>${escapeHtml(item.left_value)}</strong></div><div><div class="muted small">${escapeHtml(item.right_source)}</div><strong>${escapeHtml(item.right_value)}</strong></div></div>${item.status === "RESOLVED" ? `<div class="callout success"><strong>Decision:</strong> ${escapeHtml(item.resolution)}<br><span class="small">Owner: ${escapeHtml(item.owner)}</span></div>` : `<form class="resolution-form" data-conflict="${item.conflict_id}"><div class="field"><label>Operational decision</label><textarea name="resolution" required minlength="8" placeholder="Record what will happen, what changes, and what is being supplied."></textarea></div><div class="field"><label>Decision owner</label><input name="owner" required minlength="2" placeholder="PM / department lead" /></div><button class="btn primary" type="submit">Resolve</button></form>`}</article>`;
}

function renderSessionThree() {
  const unlocked = state.progress.sessions["2"].complete;
  if (!unlocked) return lockedSession(3, "Resolve the advance conflicts and assign owners to unlock Show Day.");
  const info = state.progress.sessions["3"];
  return `<div class="stage-head"><div><div class="eyebrow">Session 3 · Show day</div><h2>Carry the advance into live execution.</h2><p>Run the critical checkpoints in sequence, capture day-of changes, and finish with one source-backed operational record.</p></div><div class="stage-badge">Goal: complete 8 checkpoints</div></div>
    ${info.complete ? `<div class="callout success" style="margin-bottom:16px"><strong>The production is SHOW READY.</strong> Export the Master or a department-specific Advance Report below.</div>` : `<div class="callout" style="margin-bottom:16px">Advance decisions are complete. Verify each show-day checkpoint to move the show to SHOW READY.</div>`}
    <div class="grid two">
      <div class="card"><div class="card-header"><div><h3>Show-day checkpoints</h3><div class="muted small">${info.done}/${info.total} complete</div></div>${badge(state.readiness.status)}</div><div class="stack" style="margin-top:14px">${state.checkpoints.map(item => `<label class="checkpoint-row ${item.status === "COMPLETE" ? "complete" : ""}"><input type="checkbox" data-checkpoint="${item.checkpoint_id}" ${item.status === "COMPLETE" ? "checked" : ""} /><span class="checkpoint-copy"><strong>${escapeHtml(item.label)}</strong><span class="muted small">${escapeHtml(item.department)}</span></span>${badge(item.status)}</label>`).join("")}</div></div>
      <div class="grid">
        <div class="card"><h3>Log a day-of change</h3><p class="muted small">Capture a problem or field adjustment without losing the final operational record.</p><form id="incident-form" class="stack"><div class="grid two"><div class="field"><label>Department</label><select name="department" required>${departments.map(d => `<option>${escapeHtml(d)}</option>`).join("")}</select></div><div class="field"><label>Severity</label><select name="severity" required><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></div></div><div class="field"><label>What changed?</label><textarea name="summary" required minlength="5" placeholder="Example: House followspot 2 failed during focus."></textarea></div><div class="field"><label>Resolution / handoff</label><textarea name="resolution" placeholder="Example: Vendor swapped fixture; tested at 15:42."></textarea></div><button class="btn" type="submit">Add to show record</button></form></div>
        <div class="card"><h3>Advance Reports</h3><p class="muted small">Master and department reports share one production record. On iPhone, open the PDF and use Share to save it to Files.</p><div class="report-actions"><a id="master-report-button" class="btn primary" href="/api/reports/advance.pdf" target="_blank" rel="noopener">Open Master PDF</a><select id="report-department" aria-label="Report department"><option value="">Choose department</option>${departments.map(d => `<option>${escapeHtml(d)}</option>`).join("")}</select><a id="department-report-button" class="btn disabled" aria-disabled="true" tabindex="-1" target="_blank" rel="noopener">Open department PDF</a></div></div>
      </div>
    </div>
    ${state.incidents.length ? `<div class="card" style="margin-top:16px"><h3>Day-of incident log</h3><div class="stack">${state.incidents.map(item => `<div class="incident-row" style="padding:14px"><div class="meta"><span>${escapeHtml(item.department)}</span>${badge(item.severity)}</div><strong>${escapeHtml(item.summary)}</strong>${item.resolution ? `<div class="muted small">Resolution: ${escapeHtml(item.resolution)}</div>` : ""}</div>`).join("")}</div></div>` : ""}
    ${renderFeedback(3)}`;
}

function lockedSession(number, message) {
  return `<div class="stage-head"><div><div class="eyebrow">Session ${number} · Locked</div><h2>This stage opens when the prior work is complete.</h2><p>${escapeHtml(message)}</p></div></div><div class="card"><div class="callout warning">RIGOR carries verified decisions forward. Finish the prior session so this stage opens with the correct show state.</div></div>`;
}

function renderFeedback(sessionNumber) {
  return `<div class="card feedback"><div class="card-header"><div><h3>Session feedback</h3><div class="muted small">Help RIGOR learn what production professionals actually need.</div></div></div><form class="feedback-form" data-feedback="${sessionNumber}" style="margin-top:12px"><div class="field"><label>Usefulness</label><select name="useful_score"><option value="5">5 · High</option><option value="4">4</option><option value="3">3</option><option value="2">2</option><option value="1">1 · Low</option></select></div><div class="field"><label>Trust</label><select name="trust_score"><option value="5">5 · High</option><option value="4">4</option><option value="3">3</option><option value="2">2</option><option value="1">1 · Low</option></select></div><div class="field"><label>What is wrong, missing, or essential?</label><input name="comments" maxlength="2000" placeholder="Your field judgment matters here." /></div><button class="btn" type="submit">Save feedback</button></form></div>`;
}

function bindSessionEvents() {
  document.querySelectorAll("form[data-conflict]").forEach(form => form.addEventListener("submit", resolveConflict));
  document.querySelectorAll("form[data-feedback]").forEach(form => form.addEventListener("submit", saveFeedback));
  document.querySelectorAll("input[data-checkpoint]").forEach(input => input.addEventListener("change", toggleCheckpoint));
  const upload = document.getElementById("document-upload");
  if (upload) upload.addEventListener("change", uploadDocument);
  const filter = document.getElementById("requirement-filter");
  if (filter) filter.addEventListener("change", event => {
    document.querySelectorAll(".requirement-row").forEach(row => { row.classList.toggle("hidden", event.target.value !== "ALL" && row.dataset.department !== event.target.value); });
  });
  const incident = document.getElementById("incident-form");
  if (incident) incident.addEventListener("submit", addIncident);
  const reportDepartment = document.getElementById("report-department");
  const reportButton = document.getElementById("department-report-button");
  if (reportDepartment && reportButton) {
    reportDepartment.addEventListener("change", () => {
      if (reportDepartment.value) {
        reportButton.href = `/api/reports/advance.pdf?department=${encodeURIComponent(reportDepartment.value)}`;
        reportButton.removeAttribute("aria-disabled");
        reportButton.removeAttribute("tabindex");
        reportButton.classList.remove("disabled");
      } else {
        reportButton.removeAttribute("href");
        reportButton.setAttribute("aria-disabled", "true");
        reportButton.setAttribute("tabindex", "-1");
        reportButton.classList.add("disabled");
      }
    });
  }
}

function selectSession(number) {
  selectedSession = number;
  sessionStorage.setItem("rigorSelectedSession", String(number));
  renderWorkspace();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openProductionDialog() {
  if (state.workspace.production_count >= state.workspace.production_limit) return showToast("All three production slots are in use.", true);
  const dialog = document.getElementById("production-dialog");
  const form = document.getElementById("production-form");
  form.reset();
  const nextDate = new Date(Date.now() + (21 + state.workspace.production_count * 7) * 86400000).toISOString().slice(0, 10);
  form.show_date.value = nextDate;
  dialog.showModal();
}

async function createProduction(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  button.textContent = "Building production…";
  try {
    state = await api("/api/productions", { method: "POST", body: JSON.stringify({ show_name: form.show_name.value, artist: form.artist.value, venue: form.venue.value, city: form.city.value, show_date: form.show_date.value }) });
    selectedSession = 1;
    sessionStorage.setItem("rigorSelectedSession", "1");
    document.getElementById("production-dialog").close();
    showToast("Production created — its end-to-end workflow is ready.");
    renderWorkspace();
  } catch (error) {
    button.disabled = false;
    button.textContent = "Create production →";
    showToast(error.message, true);
  }
}

async function selectProduction(productionId) {
  if (productionId === state.workspace.active_production_id) return;
  try {
    state = await api(`/api/productions/${productionId}/select`, { method: "POST", body: "{}" });
    const unlocked = state.progress.sessions["1"].complete ? (state.progress.sessions["2"].complete ? 3 : 2) : 1;
    selectedSession = Math.min(selectedSession, unlocked);
    sessionStorage.setItem("rigorSelectedSession", String(selectedSession));
    showToast(`${state.show.show_name} opened.`);
    renderWorkspace();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) { showToast(error.message, true); }
}

async function setRequirement(requirementId, status) {
  try {
    const beforeComplete = state.progress.sessions["1"].complete;
    state = await api(`/api/requirements/${requirementId}`, { method: "PATCH", body: JSON.stringify({ status }) });
    if (!beforeComplete && state.progress.sessions["1"].complete) showToast("Session 1 complete — Technical Advance unlocked.");
    renderWorkspace();
  } catch (error) { showToast(error.message, true); }
}

async function saveOwner(requirementId) {
  const owner = document.getElementById(`owner-${requirementId}`).value.trim();
  if (!owner) return showToast("Enter an owner before saving.", true);
  try {
    const beforeComplete = state.progress.sessions["2"].complete;
    state = await api(`/api/requirements/${requirementId}`, { method: "PATCH", body: JSON.stringify({ owner }) });
    if (!beforeComplete && state.progress.sessions["2"].complete) showToast("Session 2 complete — Show Day unlocked.");
    renderWorkspace();
  } catch (error) { showToast(error.message, true); }
}

async function resolveConflict(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    const beforeComplete = state.progress.sessions["2"].complete;
    state = await api(`/api/conflicts/${form.dataset.conflict}/resolve`, { method: "POST", body: JSON.stringify({ resolution: form.resolution.value, owner: form.owner.value }) });
    if (!beforeComplete && state.progress.sessions["2"].complete) showToast("Session 2 complete — Show Day unlocked.");
    else showToast("Conflict resolved. Readiness recalculated.");
    renderWorkspace();
  } catch (error) { button.disabled = false; showToast(error.message, true); }
}

async function toggleCheckpoint(event) {
  try {
    const beforeComplete = state.progress.sessions["3"].complete;
    state = await api(`/api/checkpoints/${event.target.dataset.checkpoint}`, { method: "PATCH", body: JSON.stringify({ complete: event.target.checked }) });
    if (!beforeComplete && state.progress.sessions["3"].complete) showToast("All checkpoints complete — show is SHOW READY.");
    renderWorkspace();
  } catch (error) { showToast(error.message, true); }
}

async function uploadDocument(event) {
  const file = event.target.files[0];
  if (!file) return;
  const zone = document.getElementById("upload-zone");
  zone.classList.add("busy");
  const form = new FormData();
  form.append("file", file);
  try {
    const result = await api("/api/documents", { method: "POST", body: form });
    state = result.workspace;
    showToast(`${result.result.name}: ${result.result.requirements_added} requirement candidates extracted.`);
    renderWorkspace();
  } catch (error) { zone.classList.remove("busy"); showToast(error.message, true); }
}

async function addIncident(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    state = await api("/api/incidents", { method: "POST", body: JSON.stringify({ department: form.department.value, severity: form.severity.value, summary: form.summary.value, resolution: form.resolution.value || null }) });
    showToast("Day-of change added to the show record.");
    renderWorkspace();
  } catch (error) { showToast(error.message, true); }
}

async function saveFeedback(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await api("/api/feedback", { method: "POST", body: JSON.stringify({ session_number: Number(form.dataset.feedback), useful_score: Number(form.useful_score.value), trust_score: Number(form.trust_score.value), comments: form.comments.value }) });
    form.querySelector("button").textContent = "Feedback saved";
    form.querySelector("button").disabled = true;
    showToast("Thank you — feedback saved.");
  } catch (error) { showToast(error.message, true); }
}

function showEvidence(item) {
  document.getElementById("evidence-content").innerHTML = `<div class="eyebrow">Source provenance</div><h2 style="margin:8px 0">${escapeHtml(item.title)}</h2><p><strong>${escapeHtml(item.document_name)}</strong> · Page ${escapeHtml(item.page_number || "—")}</p><div class="quote">“${escapeHtml(item.excerpt)}”</div><p class="muted small" style="margin-top:14px">Department: ${escapeHtml(item.department)} · Source: ${escapeHtml(item.source_kind)}</p>`;
  document.getElementById("evidence-dialog").showModal();
}

async function logout() {
  await api("/api/logout", { method: "POST", body: "{}" }).catch(() => null);
  state = null;
  sessionStorage.removeItem("rigorSelectedSession");
  renderStart();
}

async function boot() {
  try {
    state = await api("/api/workspace");
    const unlocked = state.progress.sessions["1"].complete ? (state.progress.sessions["2"].complete ? 3 : 2) : 1;
    if (selectedSession > unlocked) selectedSession = unlocked;
    renderWorkspace();
  } catch (error) {
    if (!state) renderStart();
  }
}

document.getElementById("production-form").addEventListener("submit", createProduction);
boot();
