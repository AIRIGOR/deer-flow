import {describe, expect, it} from 'vitest';
import {invitationToken} from './invitation-link.js';
const origin = 'https://deploy-preview-11--rigor-flow-preview.netlify.app';
describe('invitation link', () => {
  it('accepts the production email link without navigating to production', () => {
    expect(invitationToken(' https://rigor-flow-preview.netlify.app/#invite_token=example%2Btoken ', origin)).toBe('example+token');
  });
  it('accepts the current preview callback', () => {
    expect(invitationToken(`${origin}/founder#invite_token=example`, origin)).toBe('example');
  });
  it.each(['not a link', 'https://example.com/#invite_token=private', 'http://rigor-flow-preview.netlify.app/#invite_token=private', 'https://rigor-flow-preview.netlify.app/', 'https://rigor-flow-preview.netlify.app/#invite_token=', 'https://rigor-flow-preview.netlify.app/#invite_token=a&invite_token=b'])('rejects invalid links without exposing their contents', link => {
    expect(() => invitationToken(link, origin)).toThrow('Paste the full invitation link copied from your RIGOR invitation email.');
  });
});
