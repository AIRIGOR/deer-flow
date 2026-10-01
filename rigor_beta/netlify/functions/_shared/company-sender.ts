import {createHash} from 'node:crypto';
import {founderJson, type founderStore} from './founder.js';
type Store = Awaited<ReturnType<typeof founderStore>>;
const from = 'ausar@akhasha.com';
const to = 'ausar_bey@icloud.com';
const errorReasons: Record<number, string> = {
  10001: 'Cloudflare rejected the email request format.',
  10101: 'Cloudflare rejected the API token. Replace the preview token with its full secret value.',
  10103: 'Cloudflare rejected the token type. Use an Email Sending API token.',
  10102: 'The token does not have permission to send from this account.',
  10105: 'This Cloudflare account is not entitled to Email Sending. Check account activation and plan.',
  10203: 'Cloudflare Email Sending is disabled for the domain or account.',
  10000: 'Cloudflare could not find the sending account or resource.',
  10004: 'Cloudflare rate limited this request. Do not repeatedly retry.',
};
function providerDiagnostic(http_status: number, data: any) {
  const codes = Array.isArray(data?.errors) ? data.errors.map((e: any) => e?.code).filter((c: any) => Number.isInteger(c) && Object.hasOwn(errorReasons, c)) : [];
  return {http_status, provider_codes: [...new Set<number>(codes)],
    explanation: codes.length ? errorReasons[codes[0]] : 'Cloudflare rejected the request. Check token permissions, account access and Email Sending activation.'};
}
export async function checkSender(request: Request, store: Store, actor: string) {
  if ((await request.text()).trim()) return founderJson({detail: 'The connection check accepts no custom payload'}, 422);
  if (!senderConnection().configured) return founderJson({detail: 'Cloudflare credentials are required'}, 503);
  const attempts: {endpoint: string; http_status: number; provider_codes: number[]; token_status: string | null}[] = [];
  let result: Record<string, unknown> = {status: 'CHECK_UNAVAILABLE', explanation: 'Token verification could not complete. This does not prove delivery.'};
  try {
    const account = Netlify.env.get('RIGOR_CLOUDFLARE_ACCOUNT_ID')!.trim();
    const signal = AbortSignal.timeout(10000);
    for (const endpoint of ['user/tokens/verify', `accounts/${account}/tokens/verify`]) {
      const response = await fetch(`https://api.cloudflare.com/client/v4/${endpoint}`, {
        headers: {Authorization: `Bearer ${Netlify.env.get('RIGOR_CLOUDFLARE_EMAIL_TOKEN')!.trim()}`}, signal,
      });
      const data = await response.json().catch(() => null);
      const tokenStatus = ['active', 'disabled', 'expired'].includes(data?.result?.status) ? data.result.status : null;
      const codes = Array.isArray(data?.errors) ? data.errors.map((item: {code?: number}) => item?.code).filter((code: number) => [1000, 10000, 6003, 6111, 9109].includes(code)) : [];
      attempts.push({endpoint: endpoint.startsWith('user') ? 'user' : 'account', http_status: response.status, provider_codes: [...new Set<number>(codes)], token_status: tokenStatus});
      if (response.ok && data?.success === true && tokenStatus === 'active') {
        result = {status: 'TOKEN_ACTIVE', explanation: `Cloudflare confirms the ${endpoint.startsWith('user') ? 'user' : 'account'} API token is active. Email Sending permissions, activation and delivery remain unverified.`};
        break;
      }
      result = {status: 'TOKEN_NOT_VERIFIED', explanation: 'Cloudflare has not verified this token. This result does not establish that it was entered incorrectly.'};
      if (tokenStatus || response.status === 429 || response.status >= 500) break;
    }
  } catch { result = {status: 'CHECK_UNAVAILABLE', explanation: 'Token verification could not complete. This does not prove an invalid token or delivery.'}; }
  const summary = attempts.map(item => `${item.endpoint} check: HTTP ${item.http_status}${item.token_status ? `, ${item.token_status}` : ''}${item.provider_codes.length ? `, code ${item.provider_codes.join(', ')}` : ''}`).join('; ');
  const saved = {...result, explanation: `${result.explanation}${summary ? ` ${summary}.` : ''}`, attempts, checked_at: new Date().toISOString(), issued_by: actor, emails_sent: 0};
  await store.setJSON('founder/mail-check/latest', saved);
  return founderJson(saved);
}
export function senderConnection() {
  const account = Netlify.env.get('RIGOR_CLOUDFLARE_ACCOUNT_ID')?.trim() || '';
  const token = Netlify.env.get('RIGOR_CLOUDFLARE_EMAIL_TOKEN')?.trim() || '';
  const missing = [!/^[a-f0-9]{32}$/i.test(account) && 'RIGOR_CLOUDFLARE_ACCOUNT_ID', !token && 'RIGOR_CLOUDFLARE_EMAIL_TOKEN'].filter(Boolean);
  return {provider: 'Cloudflare Email Sending', address: from, test_recipient: to,
    configured: !missing.length, missing, status: missing.length ? 'CONNECTION_REQUIRED' : 'NOT_VERIFIED',
    delivery_verified: false, sending_enabled: false,
    explanation: 'Credentials do not prove delivery. Prospect sending remains disabled. A delivery test can only send the fixed test message to the Founder mailbox.',
    setup_steps: ['In Cloudflare, open Compute → Email Service → Email Sending and confirm akhasha.com is onboarded.',
      'Add the account ID and a restricted Email Sending token as server-side Netlify environment variables for this preview. Never paste the token into chat.',
      'Send the fixed delivery test to your own iCloud mailbox. This does not enable prospect sends.']};
}
export async function senderStatus(store: Store) {
  const connection = senderConnection();
  const test = await store.get('founder/mail-test/latest', {type: 'json'});
  const account = Netlify.env.get('RIGOR_CLOUDFLARE_ACCOUNT_ID')?.trim() || '';
  const current = test?.connection_digest === createHash('sha256').update(account + ':' + from + ':' + to).digest('hex');
  return {...connection, check: await store.get('founder/mail-check/latest', {type: 'json'}), test: current ? test : null,
    delivery_verified: connection.configured && current && test?.status === 'PROVIDER_DELIVERED'};
}
export async function testSender(request: Request, store: Store, actor: string) {
  if ((await request.text()).trim()) return founderJson({detail: 'The delivery test accepts no custom recipients or messages'}, 422);
  const connection = senderConnection();
  if (!connection.configured) return founderJson({detail: 'Cloudflare account connection is required before a delivery test'}, 503);
  const account = Netlify.env.get('RIGOR_CLOUDFLARE_ACCOUNT_ID')!.trim();
  const token = Netlify.env.get('RIGOR_CLOUDFLARE_EMAIL_TOKEN')!.trim();
  const digest = createHash('sha256').update(account + ':' + from + ':' + to).digest('hex');
  const date = new Date().toISOString(); const key = 'founder/mail-test/' + date.slice(0, 10);
  const started = {status: 'STARTED', from, to, created_at: date, issued_by: actor, connection_digest: digest};
  const claimed = await store.setJSON(key, started, {onlyIfNew: true});
  if (!claimed.modified) return founderJson({detail: 'A delivery test was already attempted today. Check its saved result; do not send a duplicate.'}, 409);
  await store.setJSON('founder/mail-test/latest', started);
  let status = 'DELIVERY_UNKNOWN';
  let diagnostic: ReturnType<typeof providerDiagnostic> | undefined;
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/email/sending/send`, {
      method: 'POST', headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({from, to, subject: 'RIGOR sender connection test', text: 'Ausar, this is a delivery test from your RIGOR Founder Command Center. No prospect messages have been sent. This test checks the ausar@akhasha.com sending connection.'}),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {status = 'PROVIDER_REJECTED'; diagnostic = providerDiagnostic(response.status, data);}
    else {
      if (data?.success === true && data.result?.delivered?.includes(to)) status = 'PROVIDER_DELIVERED';
      else if (data?.success === true && data.result?.queued?.includes(to)) status = 'QUEUED';
      else if (data?.result?.permanent_bounces?.includes(to)) status = 'BOUNCED';
      else if (data?.success === false) {status = 'PROVIDER_REJECTED'; diagnostic = providerDiagnostic(response.status, data);}
    }
  } catch { /* A timeout is uncertain delivery, never automatically retried. */ }
  const result = {...started, status, ...(diagnostic ? {diagnostic, detail: diagnostic.explanation} : {}), completed_at: new Date().toISOString(), prospect_messages_sent: 0};
  await store.setJSON(key, result); await store.setJSON('founder/mail-test/latest', result);
  return founderJson(result, status === 'PROVIDER_REJECTED' || status === 'BOUNCED' ? 502 : 200);
}
