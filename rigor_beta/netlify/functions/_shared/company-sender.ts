import {createHash} from 'node:crypto';
import {founderJson, type founderStore} from './founder.js';
type Store = Awaited<ReturnType<typeof founderStore>>;
const from = 'ausar@akhasha.com';
const to = 'ausar_bey@icloud.com';
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
  return {...connection, test: current ? test : null,
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
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/email/sending/send`, {
      method: 'POST', headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({from, to, subject: 'RIGOR sender connection test', text: 'Ausar, this is a delivery test from your RIGOR Founder Command Center. No prospect messages have been sent. This test checks the ausar@akhasha.com sending connection.'}),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) status = 'PROVIDER_REJECTED';
    else {
      const data = await response.json();
      if (data.success === true && data.result?.delivered?.includes(to)) status = 'PROVIDER_DELIVERED';
      else if (data.success === true && data.result?.queued?.includes(to)) status = 'QUEUED';
      else if (data.result?.permanent_bounces?.includes(to)) status = 'BOUNCED';
      else if (data.success === false) status = 'PROVIDER_REJECTED';
    }
  } catch { /* A timeout is uncertain delivery, never automatically retried. */ }
  const result = {...started, status, completed_at: new Date().toISOString(), prospect_messages_sent: 0};
  await store.setJSON(key, result); await store.setJSON('founder/mail-test/latest', result);
  return founderJson(result, status === 'PROVIDER_REJECTED' || status === 'BOUNCED' ? 502 : 200);
}
