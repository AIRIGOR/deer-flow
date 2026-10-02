import {createHash} from 'node:crypto';
import {parseOutreachPackage} from '../../../app/outreach-package.js';
import {founderJson, validCommandId, type founderStore, type FounderCommand} from './founder.js';
type Store = Awaited<ReturnType<typeof founderStore>>;
export async function reviewableActions(store: Store) {
  const [queue, listed] = await Promise.all([store.get('actions/queue', {type: 'json'}), store.list({prefix: 'founder/outreach-proposals/'})]);
  const drafts = await Promise.all(listed.blobs.map(row => store.get(row.key, {type: 'json'})));
  return [...drafts.filter(Boolean), ...(Array.isArray(queue) ? queue : [])];
}
export async function prepareOutreachReview(request: Request, store: Store, actor: string) {
  const raw = await request.text(); if (raw.length > 1000) return founderJson({detail: 'Request too large'}, 413);
  let body: any; try {body = JSON.parse(raw);} catch {return founderJson({detail: 'Invalid request'}, 400);}
  if (!validCommandId(body?.command_id)) return founderJson({detail: 'Choose a completed outreach command'}, 422);
  const command = await store.get('founder/commands/' + body.command_id, {type: 'json'}) as FounderCommand | null;
  if (!command || command.kind !== 'PREPARE_OUTREACH' || command.status !== 'COMPLETE' || command.execution_receipt?.delegation_verified !== true || command.execution_receipt.command_id !== command.command_id) return founderJson({detail: 'Verified completed outreach package required'}, 409);
  let packet; try {packet = parseOutreachPackage(JSON.stringify(command.result?.outreach_package));} catch {return founderJson({detail: 'Saved outreach package is incomplete'}, 422);}
  for (const name of packet.top_three) {
    const prospect = packet.prospects.find(p => p.organization.trim().toLowerCase() === name.trim().toLowerCase())!;
    const digest = createHash('sha256').update(command.command_id + ':' + prospect.organization).digest('hex');
    const date = new Date().toISOString();
    const proposal = {action_key: 'EMAIL_SEND:' + digest, action_type: 'EMAIL_SEND', scope: 'EXTERNAL_EXECUTE',
      title: `Outreach to ${prospect.organization}`, summary: prospect.fit, owner_agent: 'rigor-partnerships-capital',
      target: prospect.organization, status: 'NEEDS_APPROVAL', approval_required: true,
      policy_reason: 'Exact recipient and source verification required. No sending executor is enabled.',
      created_at: date, updated_at: date, prepared_by: actor, source_command_id: command.command_id,
      evidence_refs: prospect.sources.map(source => source.url),
      payload: {from: packet.sender, to: null, subject: prospect.subject, body: prospect.introduction,
        follow_up: prospect.follow_up, contact_route: prospect.contact_route, sources: prospect.sources,
        verification_gaps: ['Email recipient has not been verified. Public contact pages are not email addresses.', ...prospect.verification_gaps, ...packet.missing_evidence],
        sending_status: 'UNSENT'}};
    await store.setJSON('founder/outreach-proposals/' + digest, proposal, {onlyIfNew: true});
  }
  return founderJson({status: 'PREPARED', count: 3, sending_status: 'UNSENT'}, 201);
}
