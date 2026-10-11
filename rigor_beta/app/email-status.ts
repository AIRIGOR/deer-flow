export function emailOutcome(execution: Record<string, any>) {
  const descriptions: Record<string, string> = {
    STARTED: 'Dispatch started; outcome not yet confirmed. Do not resend.',
    QUEUED: 'Provider queued the email. Delivery and inbox placement are unconfirmed. Do not resend.',
    PROVIDER_DELIVERED: 'Provider reported delivery. Inbox placement is unconfirmed. Do not resend.',
    DELIVERY_UNKNOWN: 'Delivery outcome is unknown. Check provider records before further outreach; no automatic retry.',
    BOUNCED: 'Provider reported a bounce. This address was not delivered.',
    SUPPRESSED: 'Provider suppressed this recipient. This email was not delivered.',
    PROVIDER_REJECTED: 'Provider rejected the request. Review the saved diagnostic.',
    DUPLICATE_BLOCKED: 'Duplicate dispatch was blocked. Check the prior email record.',
    DAILY_LIMIT: 'Daily limit reached. No provider request was made; send separately after the next UTC day begins.',
  };
  return descriptions[execution.status] || 'Read the saved provider outcome before taking further action.';
}
export function canRetryUnsent(execution: Record<string, any>, now = new Date()) {
  return execution.status === 'DAILY_LIMIT' && execution.provider_request_started === false && typeof execution.created_at === 'string'
    && execution.created_at.slice(0, 10) < now.toISOString().slice(0, 10);
}
