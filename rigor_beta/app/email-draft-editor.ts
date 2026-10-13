import {object, text} from './founder-report.js';

export function appendEmailDraftEditor(card: HTMLElement, action: Record<string, unknown>, save: (body: Record<string, unknown>) => Promise<void>) {
  const payload = object(action.payload);
  const editor = document.createElement('details'); editor.className = 'email-draft-editor';
  const title = document.createElement('summary'); title.textContent = 'Edit email draft'; editor.append(title);
  const explanation = document.createElement('p'); explanation.textContent = 'Save the exact recipient and message here. Saving creates a revision for fresh approval and sends nothing. The source must publicly list this recipient.'; editor.append(explanation);
  const inputs: Record<string, HTMLInputElement | HTMLTextAreaElement> = {};
  for (const [key, label, value] of [
    ['to', 'Recipient email', text(payload.to)],
    ['recipient_source', 'Public source listing this email', text(object(payload.recipient_evidence).url)],
    ['subject', 'Subject', text(payload.subject)], ['body', 'Message', text(payload.body)],
  ]) {
    const field = document.createElement('label'); field.textContent = label;
    const input = key === 'body' ? document.createElement('textarea') : document.createElement('input');
    input.value = value; input.setAttribute('aria-label', `${label} for ${text(action.title)}`);
    input.required = true;
    if (input instanceof HTMLInputElement) {input.type = key === 'to' ? 'email' : key === 'recipient_source' ? 'url' : 'text'; input.maxLength = key === 'subject' ? 200 : key === 'to' ? 254 : 2000;}
    else {input.rows = 10; input.maxLength = 20000;}
    inputs[key] = input; field.append(input); editor.append(field);
  }
  const feedback = document.createElement('p'); feedback.setAttribute('role', 'status');
  const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Save revised draft';
  button.addEventListener('click', async () => {
    if (Object.values(inputs).some(input => !input.reportValidity())) return;
    button.disabled = true;
    try {await save({action_key: action.action_key, fingerprint: action.review_fingerprint, ...Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value]))});}
    catch (error) {feedback.textContent = error instanceof Error ? error.message : 'Unable to confirm the saved revision. Refresh before retrying.'; button.disabled = false;}
  });
  editor.append(button, feedback); card.append(editor);
}
