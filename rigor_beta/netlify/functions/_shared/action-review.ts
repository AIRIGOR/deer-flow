import {reviewableActions} from './outreach-review.js';
import {createHash} from 'node:crypto';
import {founderJson, type founderStore} from './founder.js';
type Data = Record<string, any>;
type Store = Awaited<ReturnType<typeof founderStore>>;
// Bind the decision to every proposal field except worker lifecycle metadata.
export function actionSnapshot(action: Data) {
  return Object.fromEntries(Object.entries(action).filter(([key]) => !['status', 'created_at', 'updated_at', 'execution_started_at', 'completed_at', 'review', 'review_fingerprint'].includes(key)));
}
function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export const actionFingerprint = (action: Data) => createHash('sha256').update(JSON.stringify(canonical(actionSnapshot(action)))).digest('hex');
const keyFor = (fingerprint: string) => 'founder/action-reviews/' + fingerprint;
export async function actionsForReview(store: Store, actions: unknown) {
  if (!Array.isArray(actions)) return [];
  return Promise.all(actions.map(async (action: Data) => {
    const fingerprint = actionFingerprint(action);
    return {...action, review_fingerprint: fingerprint, review: await store.get(keyFor(fingerprint), {type: 'json'})};
  }));
}
export async function reviewAction(request: Request, store: Store, actor: string) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 12000) return founderJson({detail: 'Decision too large'}, 413);
  let body: Data;
  try {body = JSON.parse(raw);} catch {return founderJson({detail: 'Invalid decision JSON'}, 400);}
  if (!body || Array.isArray(body) || typeof body !== 'object') return founderJson({detail: 'Invalid decision'}, 400);
  if (!['APPROVE', 'REJECT', 'REQUEST_CHANGES'].includes(body.decision)) return founderJson({detail: 'Choose Approve, Reject or Request changes'}, 422);
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > 3900 || (body.decision === 'REQUEST_CHANGES' && note.length < 8)) return founderJson({detail: 'Requested changes need a note of 8–3,900 characters'}, 422);
  const actions = await reviewableActions(store);
  const action = Array.isArray(actions) ? actions.find((row: Data) => row.action_key === body.action_key) : null;
  if (!action) return founderJson({detail: 'Action not found'}, 404);
  const fingerprint = actionFingerprint(action);
  if (fingerprint !== body.fingerprint) return founderJson({detail: 'Proposal changed. Refresh and review the current action.'}, 409);
  const key = keyFor(fingerprint);
  const previous = await store.get(key, {type: 'json'});
  if (previous) return previous.decision === body.decision && previous.note === note && previous.decided_by === actor
    ? founderJson(previous) : founderJson({detail: 'A decision is already saved for this proposal. Revised proposals require a new review.'}, 409);
  if (action.status !== 'NEEDS_APPROVAL') return founderJson({detail: 'This action is not awaiting Founder approval'}, 409);
  const payload = action.payload;
  if (body.decision === 'APPROVE') {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Object.keys(payload).length) return founderJson({detail: 'A concrete action payload is required before approval. Request changes to supply it.'}, 422);
    if (action.action_type === 'EMAIL_SEND' && (!/^\S+@\S+\.\S+$/.test(payload.to || '') || !/^\S+@\S+\.\S+$/.test(payload.from || '') || (typeof payload.subject !== 'string' || !payload.subject.trim()) || typeof payload.body !== 'string' || !payload.body.trim())) return founderJson({detail: 'Email approval requires exact from, to, subject and body fields. Request changes to supply them.'}, 422);
  }
  const review = {action_key: action.action_key, fingerprint, decision: body.decision, note,
    decided_by: actor, decided_at: new Date().toISOString(), proposal: actionSnapshot(action),
    execution_status: 'NOT_EXECUTED', external_action_performed: false};
  // Immutable per revision, conditional creation handles competing/replayed clicks.
  const saved = await store.setJSON(key, review, {onlyIfNew: true});
  if (!saved.modified) return founderJson({detail: 'Another decision was saved. Refresh to read it.'}, 409);
  // The automatic runner is deliberately untouched: it cannot consume human approval
  // as automatic permission, nor dispatch an external operation without an executor.
  return founderJson(review, 201);
}
