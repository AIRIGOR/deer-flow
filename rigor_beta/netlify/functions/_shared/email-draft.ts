import {createHash} from 'node:crypto';
import {actionFingerprint, actionSnapshot} from './action-review.js';
import {validEmailPayload} from './approved-email.js';
import {emailOperation} from './email-operation.js';
import {reviewableActions} from './outreach-review.js';
import {founderJson, type founderStore} from './founder.js';
type Store = Awaited<ReturnType<typeof founderStore>>;

export async function reviseEmailDraft(request: Request, store: Store, actor: string) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 100000) return founderJson({detail: 'Draft too large'}, 413);
  let body: any; try {body = JSON.parse(raw);} catch {return founderJson({detail: 'Invalid draft JSON'}, 400);}
  const fields = ['action_key', 'fingerprint', 'to', 'recipient_source', 'subject', 'body'];
  if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(key => !fields.includes(key)) || fields.some(key => typeof body[key] !== 'string')) return founderJson({detail: 'Supply the exact draft and recipient source'}, 422);
  const payload = {from: 'ausar@akhasha.com', to: body.to.trim(), subject: body.subject, body: body.body};
  let source: URL;
  try {source = new URL(body.recipient_source.trim());} catch {return founderJson({detail: 'Supply a public HTTPS source listing this recipient'}, 422);}
  if (!validEmailPayload(payload) || source.protocol !== 'https:' || source.username || source.password || source.href.length > 2000) return founderJson({detail: 'A single valid recipient, HTTPS source, subject and body are required'}, 422);
  return emailOperation(store, body.action_key, async () => {
    const action = (await reviewableActions(store)).find(row => row.action_key === body.action_key);
    if (!action) return founderJson({detail: 'Email proposal not found'}, 404);
    if (action.action_type !== 'EMAIL_SEND' || action.scope !== 'EXTERNAL_EXECUTE' || action.status !== 'NEEDS_APPROVAL') return founderJson({detail: 'Only an unsent outreach email can be revised'}, 409);
    const fingerprint = actionFingerprint(action);
    if (body.fingerprint !== fingerprint) return founderJson({detail: 'Draft changed. Refresh and review its current revision.'}, 409);
    const receipts = await store.list({prefix: 'founder/email-executions/'});
    for (const row of receipts.blobs) {
      const receipt = await store.get(row.key, {type: 'json'});
      if (receipt?.action_key === action.action_key) return founderJson({detail: 'This proposal already has a send record. Preserve it; review the outcome before any further outreach.'}, 409);
    }
    const date = new Date().toISOString();
    const revised = {...actionSnapshot(action), status: 'NEEDS_APPROVAL', created_at: action.created_at, updated_at: date,
      revision: Number(action.revision || 0) + 1, revised_by: actor, previous_fingerprint: fingerprint,
      policy_reason: 'Review this exact revision, then send separately after approval.',
      payload: {...action.payload, ...payload, sending_status: 'UNSENT',
        recipient_evidence: {email: payload.to, url: source.href, checked_at: date, kind: 'FOUNDER_SUPPLIED_PUBLIC_SOURCE'},
        verification_gaps: (action.payload.verification_gaps || []).filter((gap: unknown) => typeof gap !== 'string' || !gap.startsWith('Email recipient has not been verified.'))}};
    const nextFingerprint = actionFingerprint(revised);
    await store.setJSON('founder/email-revision-history/' + nextFingerprint, {proposal: revised, previous_fingerprint: fingerprint, saved_by: actor, saved_at: date}, {onlyIfNew: true});
    const key = 'founder/email-draft-revisions/' + createHash('sha256').update(action.action_key).digest('hex');
    await store.setJSON(key, revised);
    return founderJson({status: 'DRAFT_SAVED', action_key: action.action_key, fingerprint: nextFingerprint, approval_required: true, sending_status: 'UNSENT'}, 201);
  });
}
