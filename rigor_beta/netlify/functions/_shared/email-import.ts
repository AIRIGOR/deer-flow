import {createHash} from 'node:crypto';
import {validEmailPayload} from './approved-email.js';
import {founderJson, type founderStore} from './founder.js';
type Store = Awaited<ReturnType<typeof founderStore>>;
export async function importEmailDrafts(request: Request, store: Store, actor: string) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 250000) return founderJson({detail: 'Draft packet too large'}, 413);
  let packet: any; try {packet = JSON.parse(raw);} catch {return founderJson({detail: 'Invalid draft packet JSON'}, 400);}
  if (!packet || Object.keys(packet).some(k => k !== 'drafts') || !Array.isArray(packet.drafts) || packet.drafts.length < 1 || packet.drafts.length > 10) return founderJson({detail: 'Supply one to ten exact drafts'}, 422);
  const drafts: any[] = [];
  for (const draft of packet.drafts) {
    if (!draft || typeof draft !== 'object' || Array.isArray(draft) || Object.keys(draft).some(k => !['target', 'to', 'subject', 'body', 'recipient_source'].includes(k)) || typeof draft.target !== 'string' || !draft.target.trim() || draft.target.length > 200) return founderJson({detail: 'Invalid draft fields'}, 422);
    const payload = {from: 'ausar@akhasha.com', to: draft.to, subject: draft.subject, body: draft.body};
    let url: URL; try {url = new URL(draft.recipient_source);} catch {return founderJson({detail: 'A public HTTPS recipient source is required'}, 422);}
    if (!validEmailPayload(payload) || url.protocol !== 'https:' || url.username || url.password || url.href.length > 2000) return founderJson({detail: 'Each draft requires one recipient, subject, body and public HTTPS source'}, 422);
    drafts.push({target: draft.target, payload, source: url.href});
  }
  // Validate the complete packet before any write. Import never approves or dispatches.
  const date = new Date().toISOString();
  const keys: string[] = [];
  for (const draft of drafts) {
    const digest = createHash('sha256').update(JSON.stringify(draft)).digest('hex');
    const key = 'founder/outreach-proposals/' + digest;
    const action_key = 'EMAIL_SEND:' + digest;
    await store.setJSON(key, {action_key, action_type: 'EMAIL_SEND', scope: 'EXTERNAL_EXECUTE', status: 'NEEDS_APPROVAL', approval_required: true,
      title: 'Funding introduction · ' + draft.target, target: draft.target, owner_agent: 'rigor-partnerships-capital',
      summary: 'Imported exact outreach draft. Review the public contact source and message before sending.',
      evidence_refs: [draft.source], prepared_by: actor, created_at: date, updated_at: date,
      payload: {...draft.payload, sending_status: 'UNSENT', recipient_evidence: {email: draft.payload.to, url: draft.source, checked_at: date, kind: 'FOUNDER_SUPPLIED_PUBLIC_SOURCE'}}}, {onlyIfNew: true});
    keys.push(action_key);
  }
  return founderJson({status: 'DRAFTS_IMPORTED', action_keys: keys, approval_required: true, sending_status: 'UNSENT'}, 201);
}
