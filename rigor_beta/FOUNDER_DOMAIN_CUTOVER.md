# Founder domain cutover — October 12, 2026

## Current deployment
The redesigned working Founder app remains at https://deploy-preview-11--rigor-flow-preview.netlify.app/founder on Netlify project rigor-flow-preview (017e4a4d-7db9-4e61-88fd-56dd2b2be844). Product production stays on feat/rigor-netlify-beta-v1. Do not publish PR 11 wholesale to product production.

## Completed
Premium six-view Founder redesign, searchable exact-recipient outreach table, approval filters, collapsed email/research/evidence, hidden normal character count with existing backend validation. 148 tests and offline production-context bundle pass. Existing eight provider-queued receipts and mailbox confirmation remain visible. No messages resent for this redesign.

## Domain blocker
Netlify requires ownership verification before attaching founder.akhasha.com. On its Add existing domain screen, it supplied this root-zone TXT record:

- Type: TXT
- Name: subdomain-owner-verification
- Value: 23ddd4cf21368b42d596e603b163a650

Cloudflare sign-in from the current cloud browser failed with API Request Failed / login 403. This is a sign-in failure, not proof the service is unavailable globally. No domain was attached and no DNS record was changed.

## Remaining cutover
1. Add the ownership TXT in the existing Cloudflare akhasha.com zone; keep mail-related DNS records.
2. Revisit Netlify existing-domain verification and attach founder.akhasha.com only after a dedicated authenticated deployment route is ready.
3. Promote only the tested Founder frontend and its endpoint dependency closure, or set up a dedicated project with verified Identity and secret configuration. A landing page redirect to the preview is not a completed application migration.
4. Preserve the site-scoped rigor-company-preview-11 state. This includes approval fingerprints, proposal originals/revisions, sender confirmation, execution receipts, envelope deduplication and UTC-day reservations. Do not merge preview history indiscriminately into production product state, reset caps or retry queued emails.
5. Validate same-origin Founder writes and login on the custom hostname. Do not weaken verifyRequestOrigin or copy browser credentials. Verify existing records read exactly, sender remains confirmed, queued proposals cannot resend and new approved sends reserve the intended shared ledger.
6. Configure the Netlify-supplied DNS CNAME only after deployment route validation; verify TLS and both authenticated/unauthenticated behavior. Retain the former entry as a controlled redirect after final verification.

Domain migration is pending. No claim of completed custom-domain hosting should be made before these checks pass.
