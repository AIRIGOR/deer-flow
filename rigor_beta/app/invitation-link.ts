export function invitationToken(link: string, currentOrigin: string): string {
  const message = 'Paste the full invitation link copied from your RIGOR invitation email.';
  let url: URL;
  try { url = new URL(link.trim()); } catch { throw new Error(message); }
  const allowedHost = new URL(currentOrigin).host;
  if (url.protocol !== 'https:' || ![allowedHost, 'rigor-flow-preview.netlify.app'].includes(url.host) || url.username || url.password) throw new Error(message);
  const tokens = new URLSearchParams(url.hash.slice(1)).getAll('invite_token');
  if (tokens.length !== 1 || !tokens[0].trim()) throw new Error(message);
  return tokens[0];
}
