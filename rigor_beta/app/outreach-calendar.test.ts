import {describe, expect, it} from 'vitest';
import {businessDaySending} from './outreach-calendar.js';
describe('Pacific weekday sending', () => {
  it.each([['2026-10-10T06:59:00Z', true], ['2026-10-10T07:00:00Z', false], ['2026-10-12T06:59:00Z', false], ['2026-10-12T07:00:00Z', true], ['2026-12-05T07:59:00Z', true], ['2026-12-05T08:00:00Z', false]])('uses the Pacific date across DST: %s', (date, allowed) => {
    expect(businessDaySending(new Date(date))).toBe(allowed);
  });
});
