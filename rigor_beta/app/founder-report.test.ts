import {describe, expect, it} from 'vitest';
import {report} from './founder-report.js';
describe('Founder report evidence boundaries', () => {
  const command = {command_id: 'one', kind: 'RUN_COMPANY_PULSE', status: 'COMPLETE', started_at: '2026-10-01T04:00:00Z', completed_at: '2026-10-01T04:00:44Z', result: {current_state: 'Assessment, not release proof'}, execution_receipt: {command_id: 'one', delegation_verified: true, execution_receipts: [{agent: 'rigor-product-ops', status: 'COMPLETE'}]}};
  it('labels review completion separately from release readiness and names specialists', () => {
    expect(report(command)).toMatchObject({title: 'Company cycle', status: 'Review completed', duration: '44 seconds', verified: true, delegates: [{name: 'Product operations', status: 'Completed'}]});
  });
  it('does not turn a model-only completion into verified evidence', () => {
    expect(report({...command, execution_receipt: undefined}).verified).toBe(false);
    expect(report({...command, execution_receipt: {...command.execution_receipt, command_id: 'other'}}).verified).toBe(false);
  });
  it('never shows verified completion for failed or running work', () => {
    expect(report({...command, status: 'FAILED'})).toMatchObject({status: 'Review failed', verified: false});
    expect(report({...command, status: 'RUNNING'})).toMatchObject({status: 'Review in progress', verified: false});
  });
  it('handles absent reports and invalid timestamps without invented results', () => {
    expect(report(null)).toMatchObject({status: 'Status unavailable', summary: '', duration: '', verified: false});
    expect(report({...command, completed_at: 'bad'}).duration).toBe('');
  });
});
