// Synthetic test fixture only; never used by the live execution path.
export const outreachFixture = () => ({
  version: 'RIGOR_OUTREACH_V1', sender: 'ausar@akhasha.com', sending_status: 'UNSENT',
  prospects: Array.from({length: 10}, (_, i) => ({category: i < 5 ? 'PARTNER' : 'INVESTOR',
    organization: `Synthetic organization ${i}`, geography: 'Test location', decision_maker: null, decision_maker_role: null,
    contact_route: `https://example.test/contact/${i}`, sources: [{url: 'https://example.test/source', supports: 'Synthetic test evidence'}],
    fit: 'Synthetic fit', operational_problem: 'Synthetic problem', priority: 'HIGH', verification_gaps: ['Test fixture, not real research'],
    subject: 'Synthetic introduction', introduction: 'Synthetic introductory draft', follow_up: 'Synthetic follow-up'})),
  top_three: ['Synthetic organization 0', 'Synthetic organization 1', 'Synthetic organization 5'], missing_evidence: ['Real research required'],
});
