import {describe, expect, it} from 'vitest';
import {boundedCompanyContext} from './company-context.js';

describe('backend company context contract', () => {
  it('preserves context exactly when it fits', () => {
    const context = {deployed_commit: 'a'.repeat(40), durable_company_state: [{payload: {artifact: 'complete'}}]};
    expect(boundedCompanyContext(context)).toBe(JSON.stringify(context));
  });
  it('bounds growing history without changing saved records or losing evidence rules', () => {
    const context = {deployed_commit: 'b'.repeat(40), evidence_rules: ['Claims require evidence'],
      durable_company_state: [{record_key: 'latest', source_ref: 'artifact:report', summary: 'Read saved artifact', payload: {artifact: 'x'.repeat(40000)}}],
      durable_action_queue: Array.from({length: 100}, (_, i) => ({action_key: String(i), summary: 'y'.repeat(500), payload: {draft: 'z'.repeat(500)}}))};
    const before = JSON.stringify(context), serialized = boundedCompanyContext(context);
    const result = JSON.parse(serialized);
    expect(serialized.length).toBeLessThanOrEqual(30000);
    expect(result.deployed_commit).toBe(context.deployed_commit);
    expect(result.evidence_rules).toEqual(context.evidence_rules);
    expect(result.durable_company_state[0].source_ref).toBe('artifact:report');
    expect(result.context_budget).toMatchObject({partial_context: true, record_payloads_omitted: true});
    expect(result.context_budget.omitted_actions).toBeGreaterThan(0);
    expect(JSON.stringify(context)).toBe(before);
  });
  it('rejects oversized fixed evidence locally rather than submitting an invalid request', () => {
    expect(() => boundedCompanyContext({evidence_rules: ['x'.repeat(30001)]})).toThrow('COMPANY_CONTEXT_TOO_LARGE');
  });
});
