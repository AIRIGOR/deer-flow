import {createHash} from 'node:crypto';
import {actionFingerprint} from './action-review.js';
import {reviewableActions} from './outreach-review.js';
import {senderStatus, providerDiagnostic} from './company-sender.js';
import {founderJson, type founderStore} from './founder.js';
import {emailOperation} from './email-operation.js';
type Store = Awaited<ReturnType<typeof founderStore>>;
export const emailReceiptKey = (fingerprint: string) => 'founder/email-executions/' + fingerprint;
export function validEmailPayload(payload: any) {
  return payload?.from === 'ausar@akhasha.com' && typeof payload.to === 'string' && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(payload.to)
    && payload.to.length <= 254 && typeof payload.subject === 'string' && payload.subject.trim().length > 0 && payload.subject.length <= 200 && !/[\r\n]/.test(payload.subject)
    && typeof payload.body === 'string' && payload.body.trim().length > 0 && payload.body.length <= 20000;
}
export async function sendApprovedEmail(request: Request, store: Store, actor: string) {
  const raw = await request.clone().text();
  if (raw.length > 1000) return founderJson({detail: 'Send request too large'}, 413);
  let body: any; try {body = JSON.parse(raw);} catch {return founderJson({detail: 'Invalid send request'}, 400);}
  if (typeof body?.action_key !== 'string') return founderJson({detail: 'Choose an approved email proposal'}, 422);
  return emailOperation(store, body.action_key, () => dispatchApprovedEmail(request, store, actor));
}
async function dispatchApprovedEmail(request: Request, store: Store, actor: string) {
  const raw = await request.text(); if (raw.length > 1000) return founderJson({detail: 'Send request too large'}, 413);
  let body: any; try {body = JSON.parse(raw);} catch {return founderJson({detail: 'Invalid send request'}, 400);}
  if (!body || Object.keys(body).some(key => !['action_key', 'fingerprint'].includes(key))) return founderJson({detail: 'Send only the approved proposal reference'}, 422);
  const actions = await reviewableActions(store);
  const action = actions.find(row => row.action_key === body.action_key);
  if (!action) return founderJson({detail: 'Proposal not found'}, 404);
  const fingerprint = actionFingerprint(action);
  if (fingerprint !== body.fingerprint) return founderJson({detail: 'Proposal changed. Review it again before sending.'}, 409);
  const review = await store.get('founder/action-reviews/' + fingerprint, {type: 'json'});
  if (review?.decision !== 'APPROVE' || review.fingerprint !== fingerprint || actionFingerprint(review.proposal) !== fingerprint) return founderJson({detail: 'Exact proposal approval is required before sending'}, 409);
  if (action.action_type !== 'EMAIL_SEND' || action.scope !== 'EXTERNAL_EXECUTE' || action.status !== 'NEEDS_APPROVAL' || !validEmailPayload(action.payload)) return founderJson({detail: 'This proposal is not a bounded outreach email'}, 422);
  if (!action.payload.recipient_evidence?.url || action.payload.recipient_evidence.email !== action.payload.to || !/^https:\/\//.test(action.payload.recipient_evidence.url)) return founderJson({detail: 'A public source for this exact recipient is required'}, 422);
  if (!(await senderStatus(store)).sending_enabled) return founderJson({detail: 'Confirm receipt of the sender connection test before sending outreach'}, 409);
  const key = emailReceiptKey(fingerprint);
  const stored = await store.getWithMetadata(key, {type: 'json'});
  const existing = stored?.data;
  const retryUnsent = existing?.status === 'DAILY_LIMIT' && existing.provider_request_started === false;
  if (existing && !retryUnsent) return founderJson(existing); // Never resend uncertain/provider outcomes.
  const envelope = {from: action.payload.from, to: action.payload.to, subject: action.payload.subject, text: action.payload.body};
  const digest = createHash('sha256').update(JSON.stringify(envelope)).digest('hex');
  const started = {status: 'STARTED', action_key: action.action_key, fingerprint, issued_by: actor,
    approved_by: review.decided_by, created_at: new Date().toISOString(), envelope};
  const reserved = await store.setJSON(key, started, retryUnsent && stored?.etag ? {onlyIfMatch: stored.etag} : {onlyIfNew: true});
  if (!reserved.modified) return founderJson(await store.get(key, {type: 'json'}));
  const envelopeKey = 'founder/email-envelopes/' + digest;
  const previousEnvelope = await store.get(envelopeKey, {type: 'json'});
  // Legacy daily-limit receipts may have reserved an envelope without dispatch.
  let status = previousEnvelope && !(retryUnsent && previousEnvelope.fingerprint === fingerprint) ? 'DUPLICATE_BLOCKED' : 'DELIVERY_UNKNOWN';
  let diagnostic; let providerRequestStarted = false;
  if (status !== 'DUPLICATE_BLOCKED') {
    let slot = false;
    for (let n = 0; n < 3; n++) {
      if ((await store.setJSON('founder/email-limits/' + started.created_at.slice(0, 10) + '/' + n, {fingerprint}, {onlyIfNew: true})).modified) {slot = true; break;}
    }
    if (!slot) status = 'DAILY_LIMIT';
    else {
      const unique = previousEnvelope ? {modified: true} : await store.setJSON(envelopeKey, {fingerprint}, {onlyIfNew: true});
      if (!unique.modified) status = 'DUPLICATE_BLOCKED';
      else {
        try {
          providerRequestStarted = true;
          const account = Netlify.env.get('RIGOR_CLOUDFLARE_ACCOUNT_ID')!.trim();
          const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/email/sending/send`, {
            method: 'POST', headers: {Authorization: `Bearer ${Netlify.env.get('RIGOR_CLOUDFLARE_EMAIL_TOKEN')!.trim()}`, 'Content-Type': 'application/json'},
            body: JSON.stringify(envelope), signal: AbortSignal.timeout(15000),
          });
          const data = await response.json().catch(() => null);
          if (!response.ok || data?.success === false) {status = 'PROVIDER_REJECTED'; diagnostic = providerDiagnostic(response.status, data);}
          else if (data?.result?.permanent_bounces?.includes(envelope.to)) status = 'BOUNCED';
          else if (data?.result?.suppressed_recipients?.includes(envelope.to)) status = 'SUPPRESSED';
          else if (data?.success === true && data.result?.delivered?.includes(envelope.to)) status = 'PROVIDER_DELIVERED';
          else if (data?.success === true && data.result?.queued?.includes(envelope.to)) status = 'QUEUED';
        } catch { /* Unknown means never automatically retry. */ }
      }
    }
  }
  const receipt = {...started, status, provider_request_started: providerRequestStarted, ...(diagnostic ? {diagnostic} : {}), completed_at: new Date().toISOString()};
  await store.setJSON(key, receipt);
  return founderJson(receipt);
}
