import {renderApprovals} from './founder-approvals.js';
import {acceptInvite, getUser, handleAuthCallback, login, logout, updateUser} from '@netlify/identity';
import {invitationToken} from './invitation-link.js';
import {renderCommands, renderPulse, renderState} from './founder-report.js';
import {commandNotice, createStatusPoller} from './founder-progress.js';
import {objectiveError} from './founder-objective.js';
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
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
  say('objective-count', objectiveError(objectiveInput.value) || `${objectiveInput.value.trim().length.toLocaleString('en-US')} characters · Up to 4,000. Your full pasted text is kept.`);
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
  say('sender-state', `${sender.address} · ${sender.provider} · ${sender.configured ? 'Credentials configured; delivery not verified.' : 'Account connection required.'} Sending is disabled.`);
  say('sender-steps', sender.setup_steps.join('\n'));
  say('sender-test-status', sender.test ? `Delivery test: ${sender.test.status.replaceAll('_', ' ').toLowerCase()} · ${sender.test.created_at}. Provider delivery does not prove inbox placement.` : 'No delivery test recorded.');
  element<HTMLButtonElement>('sender-test').disabled = !sender.configured;
  element<HTMLButtonElement>('sender-test').onclick = async () => {
    element<HTMLButtonElement>('sender-test').disabled = true;
    try {await api('/api/founder/sender-test', {method: 'POST'}); await refresh();}
    catch (error) {say('sender-test-status', error instanceof Error ? error.message : 'Unable to read test result. Refresh before retrying.');}
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
  });
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
  say('access', user ? `${user.email} · ${founder ? 'Founder' : 'Founder role required'}` : 'Founder sign-in required.');
  say('notice', founder ? 'Founder access verified. Choose a command and describe the internal work.' : 'Sign in with the founder role to execute commands.');
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
  try { await logout(); poller.stop(); activeCommandId = undefined; currentUserId = undefined; say('pulse', 'Sign in to view company state.'); say('state', 'Sign in to view company state.'); say('commands', 'Sign in to view command receipts.'); say('approvals', 'Sign in to review actions.'); say('approval-notice', ''); say('sender-state', 'Sign in to view sender setup.'); say('sender-steps', ''); say('sender-test-status', ''); element<HTMLButtonElement>('sender-test').disabled = true; element<HTMLButtonElement>('prepare-review').disabled = true; await session(); }
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
