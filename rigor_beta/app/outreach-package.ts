export type OutreachProspect = {
  category: 'PARTNER' | 'INVESTOR'; organization: string; geography: string;
  decision_maker: string | null; decision_maker_role: string | null;
  contact_route: string; sources: {url: string; supports: string}[];
  fit: string; operational_problem: string; priority: string;
  verification_gaps: string[]; subject: string; introduction: string; follow_up: string;
};
export type OutreachPackage = {
  version: 'RIGOR_OUTREACH_V1'; sender: 'ausar@akhasha.com'; sending_status: 'UNSENT';
  prospects: OutreachProspect[]; top_three: string[]; missing_evidence: string[];
};
const isText = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(isText);
const publicUrl = (value: unknown) => {
  if (!isText(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      && url.hostname.includes('.') && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/i.test(url.hostname);
  } catch { return false; }
};
export function parseOutreachPackage(markdown: unknown): OutreachPackage {
  const fail = () => {throw new Error('OUTREACH_DELIVERABLES_MISSING');};
  if (!isText(markdown)) return fail();
  let packet: any;
  try {packet = JSON.parse(markdown.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));}
  catch {return fail();}
  if (packet?.version !== 'RIGOR_OUTREACH_V1' || packet.sender !== 'ausar@akhasha.com'
    || packet.sending_status !== 'UNSENT' || !Array.isArray(packet.prospects) || packet.prospects.length !== 10) return fail();
  const names = new Set<string>();
  for (const p of packet.prospects) {
    if (!p || !['PARTNER', 'INVESTOR'].includes(p.category)
      || !['organization', 'geography', 'fit', 'operational_problem', 'subject', 'introduction', 'follow_up'].every(key => isText(p[key]))
      || !['HIGH', 'MEDIUM', 'LOW'].includes(p.priority)
      || !publicUrl(p.contact_route) || !Array.isArray(p.sources) || !p.sources.length
      || !p.sources.every((source: any) => publicUrl(source?.url) && isText(source?.supports))
      || !strings(p.verification_gaps)
      || ![p.decision_maker, p.decision_maker_role].every(v => v === null || isText(v))) return fail();
    const key = p.organization.trim().toLowerCase();
    if (names.has(key)) return fail();
    names.add(key);
  }
  if (packet.prospects.filter((p: OutreachProspect) => p.category === 'PARTNER').length !== 5
    || !strings(packet.top_three) || packet.top_three.length !== 3
    || new Set(packet.top_three.map((s: string) => s.trim().toLowerCase())).size !== 3
    || !packet.top_three.every((s: string) => names.has(s.trim().toLowerCase()))
    || !strings(packet.missing_evidence)) return fail();
  return packet as OutreachPackage;
}

export function requestsOutreachPackage(objective: string) {
  return /first outreach|outreach (?:wave|package)|prospect table|five strategic partners/i.test(objective);
}

export const outreachContract = `Produce the actual outreach deliverables, not a company-readiness review. Research current primary sources with the available web tools. Use null for unknown decision-makers and list verification gaps; never invent personal email addresses, relationships, traction or product proof. Do not send anything.
Return artifact_markdown as a JSON STRING containing exactly this structure (actual values, not placeholders):
{"version":"RIGOR_OUTREACH_V1","sender":"ausar@akhasha.com","sending_status":"UNSENT","prospects":[{"category":"PARTNER or INVESTOR","organization":"organization","geography":"location","decision_maker":null,"decision_maker_role":null,"contact_route":"https://official public contact page","sources":[{"url":"https://primary source","supports":"specific supported fact"}],"fit":"why it fits RIGOR","operational_problem":"concrete problem","priority":"HIGH or MEDIUM or LOW","verification_gaps":["unknowns"],"subject":"personalized subject","introduction":"actual email, at most 120 words","follow_up":"actual follow-up with new value, at most 50 words"}],"top_three":["three distinct organizations from prospects"],"missing_evidence":["missing evidence"]}
Include exactly FIVE distinct PARTNER entries and FIVE distinct INVESTOR entries, ten actual introductory emails and ten actual follow-ups. Provide public professional contact/source HTTPS links. Keep total artifact under 29,000 characters. The ten complete entries must be in artifact_markdown, not a claimed external filename. Do not replace the structured artifact with a narrative summary. Research/draft preparation is not Founder approval or permission to send.`;
