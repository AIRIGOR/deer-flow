import {describe, expect, it} from 'vitest';
import {canRetryUnsent, emailOutcome} from './email-status.js';
describe('Email outcome truthfulness', () => {
  it('separates queued delivery from an unsent daily limit', () => {
    expect(emailOutcome({status: 'QUEUED'})).toContain('Delivery and inbox placement are unconfirmed');
    expect(emailOutcome({status: 'DAILY_LIMIT'})).toContain('No provider request');
  });
  it('allows only a proved unsent daily-limit attempt on a later UTC day', () => {
    const now = new Date('2026-10-12T00:00:00Z');
    expect(canRetryUnsent({status: 'DAILY_LIMIT', provider_request_started: false, created_at: '2026-10-11T14:00:00Z'}, now)).toBe(true);
    for (const status of ['QUEUED', 'DELIVERY_UNKNOWN', 'STARTED', 'PROVIDER_REJECTED']) expect(canRetryUnsent({status, provider_request_started: false, created_at: '2026-10-11T14:00:00Z'}, now)).toBe(false);
    expect(canRetryUnsent({status: 'DAILY_LIMIT', created_at: '2026-10-11T14:00:00Z'}, now)).toBe(false);
    expect(canRetryUnsent({status: 'DAILY_LIMIT', provider_request_started: false, created_at: '2026-10-12T00:00:00Z'}, now)).toBe(false);
  });
});
