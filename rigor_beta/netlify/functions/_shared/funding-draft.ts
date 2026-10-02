import {createHash} from 'node:crypto';
import {founderJson, type founderStore} from './founder.js';
type Store = Awaited<ReturnType<typeof founderStore>>;
// Primary sources checked 2026-10-02. A public pitch route is not investor interest.
export const firstFundingDraft = {
  action_type: 'EMAIL_SEND', scope: 'EXTERNAL_EXECUTE', status: 'NEEDS_APPROVAL', approval_required: true,
  title: 'Funding introduction to Liz Wessel · First Round', target: 'First Round Capital', owner_agent: 'rigor-partnerships-capital',
  summary: 'Early-stage funding introduction. Liz publishes this address for startup approaches; investment fit and interest are unconfirmed.',
  evidence_refs: ['https://www.lizwessel.com/contact', 'https://www.firstround.com/team/investing/liz-wessel'],
  payload: {from: 'ausar@akhasha.com', to: 'liz.wessel@firstround.com', subject: 'RIGOR — operational intelligence for live-production teams',
    body: 'Hi Liz,\n\nI’m Ausar Bey, building RIGOR for live-production teams. Your interest in companies modernizing established industries makes this a relevant early conversation.\n\nWhen a rider changes, production teams need to know which department reviews and readiness decisions must change with it. RIGOR’s beta brings production documents, requirements, department review, conflicts and Advance Reports into one workflow.\n\nWe are seeking early-stage funding and design-partner validation. I can show a synthetic rider-amendment walkthrough; we are still validating the product with real production workflows and are not claiming customer traction or proven show outcomes.\n\nWould you be open to a 15-minute introduction to see whether this fits First Round’s focus?\n\nBest,\nAusar Bey\nausar@akhasha.com',
    recipient_evidence: {email: 'liz.wessel@firstround.com', url: 'https://www.lizwessel.com/contact', checked_at: '2026-10-02', kind: 'PUBLIC_STARTUP_PITCH_ADDRESS'},
    sources: [{url: 'https://www.lizwessel.com/contact', claim: 'Liz explicitly publishes this address for startup approaches.'}, {url: 'https://www.firstround.com/team/investing/liz-wessel', claim: 'First Round identifies Liz as Partner with interest in modernizing established industries.'}],
    verification_gaps: ['Investment fit and interest are unconfirmed.', 'Company geography, raise amount, financial runway and pilot traction are not supplied.', 'A synthetic demonstration is not proof of real-show outcomes.'], sending_status: 'UNSENT'},
};
export async function prepareFundingDraft(request: Request, store: Store, actor: string) {
  if ((await request.text()).trim()) return founderJson({detail: 'This preparation accepts no custom payload'}, 422);
  const digest = createHash('sha256').update(JSON.stringify(firstFundingDraft)).digest('hex');
  const date = new Date().toISOString();
  await store.setJSON('founder/outreach-proposals/' + digest, {...firstFundingDraft, action_key: 'EMAIL_SEND:' + digest, prepared_by: actor, created_at: date, updated_at: date}, {onlyIfNew: true});
  return founderJson({status: 'PREPARED', count: 1, sending_status: 'UNSENT'}, 201);
}
