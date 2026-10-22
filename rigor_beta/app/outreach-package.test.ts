import {describe, expect, it} from 'vitest';
import {parseOutreachPackage} from './outreach-package.js';
import {outreachFixture} from '../netlify/functions/_shared/outreach-fixture.js';
describe('outreach saved-deliverable contract', () => {
  it('accepts the actual complete structured draft, including fenced JSON', () => {
    const packet = outreachFixture();
    expect(parseOutreachPackage('```json\n' + JSON.stringify(packet) + '\n```')).toEqual(packet);
  });
  it('rejects a completed review narrative instead of accepting claimed draft preparation', () => {
    expect(() => parseOutreachPackage('QA passed; outreach drafts have been archived.')).toThrow('OUTREACH_DELIVERABLES_MISSING');
  });
  it.each(['missing_prospect', 'wrong_mix', 'duplicate', 'missing_email', 'missing_source', 'sent', 'unknown_top'])('rejects incomplete or unsafe packet: %s', kind => {
    const p = outreachFixture();
    if (kind === 'missing_prospect') p.prospects.pop();
    if (kind === 'wrong_mix') p.prospects[5].category = 'PARTNER';
    if (kind === 'duplicate') p.prospects[1].organization = p.prospects[0].organization;
    if (kind === 'missing_email') p.prospects[0].introduction = '';
    if (kind === 'missing_source') p.prospects[0].sources = [];
    if (kind === 'sent') p.sending_status = 'SENT';
    if (kind === 'unknown_top') p.top_three[0] = 'Not in the package';
    expect(() => parseOutreachPackage(JSON.stringify(p))).toThrow('OUTREACH_DELIVERABLES_MISSING');
  });
});
