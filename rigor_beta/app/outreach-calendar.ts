export const outreachTimeZone = 'America/Los_Angeles';
export function businessDaySending(now = new Date()) {
  const weekday = new Intl.DateTimeFormat('en-US', {timeZone: outreachTimeZone, weekday: 'short'}).format(now);
  return !['Sat', 'Sun'].includes(weekday);
}
export const businessDayMessage = 'Email sending is available Monday–Friday, Pacific time. Weekend attempts are blocked; drafts and approvals remain available.';
