import {object, items, text, label} from './founder-report.js';
const node = (tag: string, value: string) => {const el = document.createElement(tag); el.textContent = value; return el;};
export function renderApprovals(parent: HTMLElement, values: unknown, decide: (body: Record<string, unknown>) => Promise<void>, sender?: {enabled: boolean; send: (body: Record<string, unknown>) => Promise<void>}) {
  parent.replaceChildren();
  const actions = items(values).map(object).filter(action => action.status === 'NEEDS_APPROVAL' || object(action.review).decision);
  if (!actions.length) {parent.append(node('p', 'No actions awaiting your decision. Outreach drafts remain unsent.')); return;}
  for (const action of actions) {
    const card = node('article', ''); card.className = 'approval-card';
    card.append(node('h3', text(action.title)), node('p', `${label(action.action_type)} · ${label(action.scope)} · ${label(action.owner_agent)}`), node('p', text(action.summary)), node('p', `Target: ${text(action.target) || 'Not specified'}`));
    const payload = object(action.payload);
    if (action.action_type === 'EMAIL_SEND') {
      for (const key of ['from', 'to', 'subject', 'body']) card.append(node('p', `${key}: ${text(payload[key]) || 'Not supplied — request changes before approval'}`));
    }
    if (action.source_command_id || payload.recipient_evidence) {
      card.append(node('p', `Public contact route: ${text(payload.contact_route)}`), node('h4', 'Follow-up draft'), node('p', text(payload.follow_up)), node('h4', 'Verification gaps'));
      const list = node('ul', ''); items(payload.verification_gaps).forEach(value => list.append(node('li', text(value)))); card.append(list);
    }
    const details = document.createElement('details');
    details.append(node('summary', 'Exact proposal and evidence'), node('pre', JSON.stringify(Object.fromEntries(Object.entries(action).filter(([key]) => !['review', 'review_fingerprint'].includes(key))), null, 2))); card.append(details);
    const review = object(action.review);
    if (review.decision) {
      card.append(node('p', `${label(review.decision)} · Saved ${text(review.decided_at)} · Saved by Founder`), node('p', text(review.note)));
      const execution = object(action.email_execution);
      if (execution.status) card.append(node('p', `Email: ${label(execution.status)} · ${text(execution.created_at)}. A queued or unknown result is not delivery proof. This email will not be sent again.`));
      else if (action.action_type === 'EMAIL_SEND' && review.decision === 'APPROVE' && sender) {
        const send = node('button', 'Send approved email') as HTMLButtonElement; send.type = 'button'; send.disabled = !sender.enabled || !payload.recipient_evidence;
        const feedback = node('p', sender.enabled ? 'Sending requires this separate click. Only the exact approved message is sent.' : 'Confirm receipt of the connection test before sending.'); feedback.setAttribute('role', 'status');
        send.addEventListener('click', async () => {send.disabled = true; try {await sender.send({action_key: action.action_key, fingerprint: action.review_fingerprint});} catch (error) {feedback.textContent = error instanceof Error ? error.message : 'Read the saved send status before retrying.';}});
        card.append(feedback, send);
      } else card.append(node('p', 'Not executed. This decision does not automatically execute an action.'));
    } else {
      const note = document.createElement('textarea'); note.setAttribute('aria-label', `Decision note for ${text(action.title)}`); note.placeholder = 'Describe requested changes or explain your decision'; card.append(note);
      const feedback = node('p', ''); feedback.setAttribute('role', 'status');
      const buttons: HTMLButtonElement[] = [];
      for (const [decision, title] of [['APPROVE', 'Approve proposal'], ['REJECT', 'Reject'], ['REQUEST_CHANGES', 'Request changes']]) {
        const button = document.createElement('button'); button.textContent = title; button.type = 'button'; buttons.push(button);
        button.addEventListener('click', async () => {
          buttons.forEach(b => b.disabled = true);
          try {await decide({action_key: action.action_key, fingerprint: action.review_fingerprint, decision, note: note.value});}
          catch (error) {feedback.textContent = error instanceof Error ? error.message : 'Unable to save decision. Refresh to check saved status before retrying.'; buttons.forEach(b => b.disabled = false);}
        }); card.append(button);
      }
      card.append(feedback);
    }
    parent.append(card);
  }
}
