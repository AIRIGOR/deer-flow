import {renderApprovals} from './founder-approvals.js';
import {acceptInvite, getUser, handleAuthCallback, login, logout, updateUser} from '@netlify/identity';
import {invitationToken} from './invitation-link.js';
import {renderCommands, renderPulse, renderState} from './founder-report.js';
import {commandNotice, createStatusPoller} from './founder-progress.js';
import {objectiveError} from './founder-objective.js';
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const queueSummary = document.createElement('div');
element('overview-summary').append(queueSummary);
let savedActions: any[] = [];
function showView(view: string) {
  const allowed = ['overview', 'commands', 'outreach', 'approvals', 'activity', 'settings'];
  if (!allowed.includes(view)) view = 'overview';
  document.querySelectorAll<HTMLElement>('[data-page]').forEach(page => page.hidden = page.dataset.page !== view);
  document.querySelectorAll<HTMLButtonElement>('.workspace-nav [data-view]').forEach(button => {
    button.classList.toggle('active', button.dataset.view === view);
    button.setAttribute('aria-current', button.dataset.view === view ? 'page' : 'false');
  });
  element('view-title').textContent = view.charAt(0).toUpperCase() + view.slice(1);
  history.replaceState(null, '', '#' + view);
  window.scrollTo({top: 0, behavior: 'instant'});
}
document.querySelectorAll<HTMLElement>('[data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view || 'overview')));
document.querySelector('.brand')?.addEventListener('click', event => {event.preventDefault(); showView('overview');});
showView(location.hash.slice(1) || 'overview');
function filterApprovals() {
  const selected = element<HTMLSelectElement>('approval-filter').value;
  let shown = 0;
  element('approvals').querySelectorAll<HTMLElement>('article.approval-card').forEach(card => {
    const row = savedActions.find(a => a.action_key === card.dataset.actionKey);
    const submitted = !!row?.email_execution?.status;
    const approved = row?.review?.decision === 'APPROVE' && !submitted;
    const pending = !row?.review?.decision && !submitted;
    const visible = selected === 'all' || selected === 'submitted' && submitted || selected === 'approved' && approved || selected === 'pending' && pending;
    card.hidden = !visible; if (visible) shown++;
  });
  element('approval-empty').hidden = shown > 0;
}
element('approval-filter').addEventListener('change', filterApprovals);
function renderPipeline() {
  const search = element<HTMLInputElement>('outreach-search').value.toLowerCase();
  const emails = savedActions.filter(a => a.action_type === 'EMAIL_SEND' && (a.target + ' ' + a.payload?.to + ' ' + (a.email_execution?.status || (a.review?.decision === 'APPROVE' ? 'approved' : a.payload?.to ? 'needs review' : 'contact needed'))).toLowerCase().includes(search));
  const table = document.createElement('table'); table.className = 'pipeline-table';
  const head = document.createElement('thead'), heading = document.createElement('tr');
  for (const title of ['Company', 'Recipient', 'Status', '']) {const th = document.createElement('th'); th.textContent = title; heading.append(th);}
  head.append(heading); table.append(head); const body = document.createElement('tbody');
  for (const action of emails) {
    const tr = document.createElement('tr');
    const execution = action.email_execution?.status;
    const state = execution === 'QUEUED' ? 'Queued' : execution === 'PROVIDER_DELIVERED' ? 'Provider delivered' : execution ? execution.replaceAll('_',' ').toLowerCase() : !action.payload?.to ? 'Contact needed' : action.review?.decision === 'APPROVE' ? 'Approved' : action.review?.decision ? action.review.decision.replaceAll('_',' ').toLowerCase() : 'Needs review';
    const company = document.createElement('td'); company.className = 'company'; company.textContent = action.target || action.title;
    const recipient = document.createElement('td'); recipient.className = 'recipient'; recipient.textContent = action.payload?.to || 'Not verified';
    const status = document.createElement('td'), badge = document.createElement('span'); badge.textContent = state;
    badge.className = 'status-badge ' + (execution === 'QUEUED' ? 'queued' : execution && execution !== 'PROVIDER_DELIVERED' ? 'failed' : action.review?.decision === 'APPROVE' ? 'ready' : 'pending'); status.append(badge);
    const control = document.createElement('td'), open = document.createElement('button'); open.textContent = execution ? 'Receipt ↗' : 'Review ↗';
    open.addEventListener('click', () => {
      element<HTMLSelectElement>('approval-filter').value = 'all'; filterApprovals(); showView('approvals');
      const card = Array.from(element('approvals').querySelectorAll<HTMLElement>('article')).find(c => c.dataset.actionKey === action.action_key);
      card?.scrollIntoView({behavior:'smooth',block:'start'});
    }); control.append(open); tr.append(company, recipient, status, control); body.append(tr);
  }
  table.append(body); element('outreach-table').replaceChildren(table);
  if (!emails.length) {const empty = document.createElement('p'); empty.className='empty-state'; empty.textContent='No matching outreach.'; element('outreach-table').append(empty);}
}
element('outreach-search').addEventListener('input', renderPipeline);
element('refresh-state').addEventListener('click', () => {refresh().catch(() => say('access', 'Unable to refresh.'));});
const senderDiagnostics = document.createElement('details'); senderDiagnostics.className = 'sender-diagnostics';
const diagnosticsTitle = document.createElement('summary'); diagnosticsTitle.textContent = 'Connection tests and diagnostics';
senderDiagnostics.append(diagnosticsTitle);
for (const id of ['sender-check', 'sender-check-status', 'sender-test', 'sender-test-status']) senderDiagnostics.append(element(id));
element('sender-confirm').before(senderDiagnostics);
const importForm = document.createElement('form');
const importLabel = document.createElement('label');
importLabel.textContent = 'Import exact outreach drafts (JSON)';
const importInput = document.createElement('textarea');
importInput.id = 'email-import'; importInput.setAttribute('aria-label', 'Exact outreach draft packet');
importInput.placeholder = 'Paste a saved draft packet. Import saves drafts only; approvals and sending are separate.';
importLabel.append(importInput);
const importButton = document.createElement('button');
importButton.textContent = 'Import drafts'; importButton.disabled = true;
importForm.append(importLabel, importButton);
const importDetails = document.createElement('details'); importDetails.className = 'packet-import';
const importTitle = document.createElement('summary'); importTitle.textContent = 'Import a saved draft packet';
importDetails.append(importTitle, importForm); element('draft-tools').append(importDetails);
importForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentUserId) return;
  importButton.disabled = true;
  try {
    JSON.parse(importInput.value);
    const result = await api('/api/founder/email-import', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: importInput.value});
    importInput.value = '';
    await refresh(); say('approval-notice', `${result.action_keys.length} drafts imported. Review each exact proposal. Nothing sent.`);
  } catch (error) {say('approval-notice', error instanceof Error ? error.message : 'Unable to import drafts.');}
  finally {importButton.disabled = !currentUserId;}
});
const say = (id: string, value: unknown) => { element(id).textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2); };
let activeCommandId: string | undefined;
let currentUserId: string | undefined;
const poller = createStatusPoller(refresh, retrying => say('notice', retrying
  ? 'Status connection interrupted. Retrying; this does not mean the command failed.'
  : 'Unable to read the saved status. Refresh this page to reconnect; do not submit a duplicate command.'));
let invitation: string | undefined;
let recovery = false;
const objectiveInput = element<HTMLTextAreaElement>('objective');
objectiveInput.addEventListener('input', () => {
  const error = objectiveError(objectiveInput.value);
  say('objective-count', error || ''); element('objective-count').hidden = !error;
});
async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, {...init, credentials: 'same-origin', cache: 'no-store'});
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || `Request failed (${response.status})`);
  return data;
}
async function refresh() {
  const viewer = currentUserId;
  const state = await api('/api/founder');
  if (!viewer || viewer !== currentUserId) return false;
  const sender = state.sender;
  savedActions = state.actions;
  element('workspace-loading').hidden = true;
  const emails = state.actions.filter((a: any) => a.action_type === 'EMAIL_SEND');
  const queued = emails.filter((a: any) => a.email_execution?.status === 'QUEUED').length;
  const delivered = emails.filter((a: any) => a.email_execution?.status === 'PROVIDER_DELIVERED').length;
  const ready = emails.filter((a: any) => a.review?.decision === 'APPROVE' && !a.email_execution?.status).length;
  const pending = emails.filter((a: any) => !a.review?.decision && !a.email_execution?.status && a.payload?.to).length;
  queueSummary.replaceChildren();
  const metrics = document.createElement('div'); metrics.className = 'metric-grid';
  for (const [name, value, note] of [['Needs review', pending, 'Exact proposals awaiting you'], ['Ready to send', ready, 'Approved, not submitted'], ['Provider queued', queued, 'Accepted for processing'], ['Provider delivered', delivered, 'Confirmed by the provider']]) {
    const metric = document.createElement('article'); metric.className = 'metric';
    for (const [cls, text] of [['metric-label',name], ['metric-value',value], ['metric-note',note]]) {const line=document.createElement('div');line.className=String(cls);line.textContent=String(text);metric.append(line);}
    metrics.append(metric);
  }
  const capacity=document.createElement('div');capacity.className='campaign-strip';
  const status=document.createElement('span');status.textContent=sender.sending_enabled ? '● Sender connection verified' : '○ Sender needs attention';
  const remaining=document.createElement('strong');remaining.textContent=state.email_limits.remaining + ' attempts available today';
  const policy=document.createElement('span');policy.textContent='Weekdays · Pacific time';
  capacity.append(status,remaining,policy);queueSummary.append(metrics,capacity);
  say('sender-state', `${sender.address} · ${sender.sending_enabled ? 'Ready to send exact approved proposals. Mailbox connection confirmed.' : sender.blocked_reason ? 'Sending paused: latest test failed.' : sender.configured ? 'Awaiting confirmation that the test reached your mailbox.' : 'Connection setup required.'}`);
  senderDiagnostics.open = !sender.sending_enabled;
  say('sender-steps', sender.delivery_verified ? 'Review a concrete draft, approve that exact proposal, then use Send approved email. Sending is Monday–Friday, Pacific time. No automatic follow-ups. Limit: ten individual attempts per UTC day.' : sender.setup_steps.join('\n'));
  if (sender.blocked_reason) say('sender-steps', sender.blocked_reason);
  say('sender-test-status', sender.test ? `Delivery test: ${sender.test.status.replaceAll('_', ' ').toLowerCase()} · ${sender.test.created_at}. Provider delivery does not prove inbox placement.` : 'No delivery test recorded.');
  say('sender-check-status', sender.check ? sender.check.explanation : 'Connection check sends no email.');
  element<HTMLButtonElement>('sender-check').disabled = !sender.configured;
  element<HTMLButtonElement>('sender-check').onclick = async () => {
    element<HTMLButtonElement>('sender-check').disabled = true;
    try {await api('/api/founder/sender-check', {method: 'POST'}); await refresh();}
    catch (error) {say('sender-check-status', error instanceof Error ? error.message : 'Connection check unavailable.');}
  };
  if (sender.test?.diagnostic) say('sender-test-status', `${sender.test.diagnostic.explanation} Saved provider status: ${sender.test.diagnostic.http_status}.`);
  element<HTMLButtonElement>('sender-test').disabled = !sender.configured || sender.test?.created_at?.slice(0, 10) === new Date().toISOString().slice(0, 10);
  element<HTMLButtonElement>('sender-test').textContent = sender.confirmation ? 'Send optional diagnostic test to my mailbox' : 'Send connection test to ausar_bey@icloud.com';
  element<HTMLButtonElement>('sender-test').onclick = async () => {
    element<HTMLButtonElement>('sender-test').disabled = true;
    try {await api('/api/founder/sender-test', {method: 'POST'}); await refresh();}
    catch (error) {await refresh().catch(() => say('sender-test-status', error instanceof Error ? error.message : 'Unable to read the saved test result.'));}
  };
  const confirm = element<HTMLButtonElement>('sender-confirm');
  confirm.hidden = !!sender.latest_test_confirmed;
  confirm.disabled = !sender.test || !['QUEUED', 'PROVIDER_DELIVERED'].includes(sender.test.status);
  confirm.onclick = async () => {
    confirm.disabled = true;
    try {await api('/api/founder/sender-confirm', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({test_created_at: sender.test.created_at})}); await refresh();}
    catch (error) {say('sender-test-status', error instanceof Error ? error.message : 'Unable to save mailbox confirmation.');}
  };
  element<HTMLButtonElement>('prepare-funding').disabled = false;
  importButton.disabled = false;
  element<HTMLButtonElement>('prepare-funding').onclick = async () => {
    element<HTMLButtonElement>('prepare-funding').disabled = true;
    try {await api('/api/founder/funding-draft', {method: 'POST'}); await refresh(); say('approval-notice', 'First Round draft saved. Review the exact recipient and message before approving. Nothing sent.');}
    catch (error) {say('approval-notice', error instanceof Error ? error.message : 'Unable to prepare funding draft.');}
  };
  const outreach = state.commands.find((c: {kind: string; status: string}) => c.kind === 'PREPARE_OUTREACH' && c.status === 'COMPLETE');
  element<HTMLButtonElement>('prepare-review').disabled = !outreach;
  element<HTMLButtonElement>('prepare-review').onclick = async () => {
    element<HTMLButtonElement>('prepare-review').disabled = true;
    try {
      await api('/api/founder/outreach-proposals', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({command_id: outreach.command_id})});
      say('approval-notice', 'Three exact drafts saved for review. Recipient addresses remain unverified; nothing was sent.');
      await refresh();
    } catch (error) {say('approval-notice', error instanceof Error ? error.message : 'Unable to prepare proposals.'); element<HTMLButtonElement>('prepare-review').disabled = false;}
  };
  renderPulse(element('pulse'), state.pulse);
  renderState(element('state'), state.records, state.actions);
  renderCommands(element('commands'), state.commands);
  renderApprovals(element('approvals'), state.actions, async body => {
    if (viewer !== currentUserId) throw new Error('Founder session changed. Refresh before deciding.');
    await api('/api/founder/action-reviews', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    say('approval-notice', 'Decision saved. No action was executed or sent.');
    try {await refresh();} catch {say('approval-notice', 'Decision saved. Refresh to reconnect and read its status.');}
  }, {enabled: sender.sending_enabled, revise: async body => {
    if (viewer !== currentUserId) throw new Error('Founder session changed. Refresh before saving a revision.');
    await api('/api/founder/email-draft', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    say('approval-notice', 'Revised draft saved. Review and approve this exact revision; nothing was sent.');
    try {await refresh();} catch {say('approval-notice', 'Draft saved. Refresh to read its new revision before approving.');}
  }, send: async body => {
    if (viewer !== currentUserId) throw new Error('Founder session changed. Refresh before sending.');
    const receipt = await api('/api/founder/email-send', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    say('approval-notice', `Email result saved: ${receipt.status.replaceAll('_', ' ').toLowerCase()}. Read the receipt; do not submit a duplicate.`);
    await refresh();
  }});
  filterApprovals(); renderPipeline();
  const active = state.commands.find((c: {command_id: string; issued_by: string}) => activeCommandId ? c.command_id === activeCommandId : c.issued_by === viewer);
  if (active) {activeCommandId = active.command_id; say('notice', commandNotice(active));}
  return state.commands.some((c: {status: string}) => ['QUEUED', 'RUNNING'].includes(c.status));
}
async function session() {
  poller.stop();
  const user = await getUser();
  currentUserId = user?.id;
  element('login').hidden = !!user;
  element('invitation-setup').hidden = !!user;
  element('logout').hidden = !user;
  const founder = !!user?.roles?.includes('founder');
  element<HTMLButtonElement>('submit').disabled = !founder || recovery || !!invitation;
  say('access', user ? (founder ? 'Founder connected' : 'Founder role required') : 'Sign-in required');
  if (!founder) {showView('settings'); element('workspace-loading').hidden = true;}
  say('notice', founder ? 'Ready for your next command.' : 'Sign in to issue a command.');
  if (founder && !recovery && await refresh()) poller.start();
}
element<HTMLFormElement>('accept-invitation').addEventListener('submit', event => {
  event.preventDefault();
  const input = element<HTMLInputElement>('invite-link');
  const link = input.value;
  input.value = '';
  try {
    invitation = invitationToken(link, window.location.origin);
    recovery = false;
    element('invitation-setup').hidden = true;
    element('login').hidden = true;
    element('set-password').hidden = false;
    say('access', 'Set your password to complete access.');
    element<HTMLInputElement>('new-password').focus();
  } catch { say('access', 'Paste the full invitation link copied from your RIGOR invitation email.'); }
});
element<HTMLFormElement>('login').addEventListener('submit', async event => {
  event.preventDefault();
  try { await login(element<HTMLInputElement>('email').value, element<HTMLInputElement>('password').value); element<HTMLInputElement>('password').value = ''; await session(); }
  catch (error) { say('access', error instanceof Error ? error.message : 'Sign-in failed.'); }
});
element('logout').addEventListener('click', async () => {
  try { await logout(); poller.stop(); activeCommandId = undefined; currentUserId = undefined; savedActions = []; queueSummary.replaceChildren(); renderPipeline(); say('pulse', 'Sign in to view company state.'); say('state', 'Sign in to view company state.'); say('commands', 'Sign in to view command receipts.'); say('approvals', 'Sign in to review actions.'); say('approval-notice', ''); say('sender-state', 'Sign in to view sender setup.'); say('sender-steps', ''); say('sender-test-status', ''); element<HTMLButtonElement>('sender-test').disabled = true; element<HTMLButtonElement>('sender-confirm').disabled = true; element<HTMLButtonElement>('sender-check').disabled = true; element<HTMLButtonElement>('prepare-funding').disabled = true; element<HTMLButtonElement>('prepare-review').disabled = true; await session(); }
  catch { say('access', 'Sign-out failed.'); }
});
element<HTMLFormElement>('set-password').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const password = element<HTMLInputElement>('new-password').value;
    if (invitation) await acceptInvite(invitation, password); else await updateUser({password});
    invitation = undefined; recovery = false; element<HTMLInputElement>('new-password').value = ''; element('set-password').hidden = true; await session();
  } catch (error) { say('access', error instanceof Error ? error.message : 'Password setup failed.'); }
});
element<HTMLFormElement>('command').addEventListener('submit', async event => {
  event.preventDefault(); element<HTMLButtonElement>('submit').disabled = true;
  try {
    const invalid = objectiveError(objectiveInput.value);
    if (invalid) throw new Error(invalid);
    const command = await api('/api/founder/commands', {method: 'POST', headers: {'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID()}, body: JSON.stringify({kind: element<HTMLSelectElement>('kind').value, objective: element<HTMLTextAreaElement>('objective').value})});
    activeCommandId = command.command_id; say('notice', commandNotice(command)); poller.stop();
    try {if (await refresh()) poller.start();}
    catch {say('notice', 'Command saved. Reconnecting to its execution status; do not submit it again.'); poller.start();}
  } catch (error) { say('notice', error instanceof Error ? error.message : 'Command failed.'); }
  finally { element<HTMLButtonElement>('submit').disabled = false; }
});
try {
  const callback = await handleAuthCallback(); invitation = callback?.type === 'invite' ? callback.token : undefined; recovery = callback?.type === 'recovery';
  element('set-password').hidden = !invitation && !recovery;
  if (invitation || recovery) { element('invitation-setup').hidden = true; element('login').hidden = true; say('access', 'Set your password to complete access.'); } else await session();
} catch (error) { say('access', error instanceof Error ? error.message : 'Founder access unavailable.'); }
