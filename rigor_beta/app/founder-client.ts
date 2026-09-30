import {acceptInvite, getUser, handleAuthCallback, login, logout, updateUser} from '@netlify/identity';
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const say = (id: string, value: unknown) => { element(id).textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2); };
let timer: ReturnType<typeof setTimeout> | undefined;
let invitation: string | undefined;
let recovery = false;
async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, {...init, credentials: 'same-origin', cache: 'no-store'});
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || `Request failed (${response.status})`);
  return data;
}
async function refresh() {
  const state = await api('/api/founder');
  say('pulse', state.pulse || 'No completed cycle recorded.');
  say('state', {records: state.records, actions: state.actions});
  const list = element('commands'); list.replaceChildren();
  for (const command of state.commands) {
    const article = document.createElement('article');
    const title = document.createElement('h3'); title.textContent = `${command.kind} · ${command.status}`;
    const body = document.createElement('pre'); body.textContent = JSON.stringify(command, null, 2);
    article.append(title, body); list.append(article);
  }
  if (!state.commands.length) list.textContent = 'No commands recorded.';
  if (state.commands.some((c: {status: string}) => ['QUEUED', 'RUNNING'].includes(c.status))) timer = setTimeout(() => refresh().catch(error => say('notice', error.message)), 5000);
}
async function session() {
  clearTimeout(timer);
  const user = await getUser();
  element('login').hidden = !!user;
  element('logout').hidden = !user;
  const founder = !!user?.roles?.includes('founder');
  element<HTMLButtonElement>('submit').disabled = !founder || recovery || !!invitation;
  say('access', user ? `${user.email} · ${founder ? 'Founder' : 'Founder role required'}` : 'Founder sign-in required.');
  if (founder && !recovery) await refresh();
}
element<HTMLFormElement>('login').addEventListener('submit', async event => {
  event.preventDefault();
  try { await login(element<HTMLInputElement>('email').value, element<HTMLInputElement>('password').value); element<HTMLInputElement>('password').value = ''; await session(); }
  catch (error) { say('access', error instanceof Error ? error.message : 'Sign-in failed.'); }
});
element('logout').addEventListener('click', async () => {
  try { await logout(); clearTimeout(timer); say('pulse', 'Sign in to view company state.'); say('state', 'Sign in to view company state.'); say('commands', 'Sign in to view command receipts.'); await session(); }
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
    const command = await api('/api/founder/commands', {method: 'POST', headers: {'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID()}, body: JSON.stringify({kind: element<HTMLSelectElement>('kind').value, objective: element<HTMLTextAreaElement>('objective').value})});
    say('notice', `${command.command_id} · ${command.status}${command.launch_status === 'UNCONFIRMED' ? ' · launch unconfirmed' : ''}`); clearTimeout(timer); await refresh();
  } catch (error) { say('notice', error instanceof Error ? error.message : 'Command failed.'); }
  finally { element<HTMLButtonElement>('submit').disabled = false; }
});
try {
  const callback = await handleAuthCallback(); invitation = callback?.type === 'invite' ? callback.token : undefined; recovery = callback?.type === 'recovery';
  element('set-password').hidden = !invitation && !recovery;
  if (invitation || recovery) { element('login').hidden = true; say('access', 'Set your password to complete access.'); } else await session();
} catch (error) { say('access', error instanceof Error ? error.message : 'Founder access unavailable.'); }
