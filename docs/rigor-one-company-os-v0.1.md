# RIGOR ONE Company OS v0.1 — Preview Release Checkpoint

Date: 2026-09-24  
Branch: `feat/rigor-company-business-os-v0.1`  
Draft PR: #6 into `feat/rigor-netlify-beta-v1`

## Purpose

RIGOR ONE Company OS is the business operating layer around the RIGOR product.
The recurring AI company team runs the business side; Product/Ops, Engineering,
and QA/Security remain a separate execution organization.

## Business team

- `rigor-chief-of-staff`
- `rigor-growth-sales`
- `rigor-customer-success`
- `rigor-finance-ops`
- `rigor-market-intel`
- `rigor-partnerships-capital`

## Product organization

- `rigor-product-ops`
- `rigor-engineering`
- `rigor-qa-security`

## Control plane completed

- Founder mission queue with priority and lifecycle.
- AI company pulse selects and advances the active/highest-priority mission.
- Founder approval queue for actions outside AI authority.
- Founder decisions are persisted.
- Company audit trail records control-plane actions and pulse outcomes.
- Consolidated company-state API.
- Manual company-pulse trigger.
- Separate founder cockpit at `/company.html`.
- Company access token lives only in browser session storage.
- Preview/production Netlify Blob state remains isolated.

## Authority boundary

The AI company does not autonomously:
- spend money or create a financial commitment;
- accept contracts, equity, or binding terms;
- send external outreach or public statements;
- rotate or disclose credentials;
- promote a production deployment;
- delete customer/production data or take irreversible action.

Those actions become founder approvals.

## Validation

RIGOR CI must be green for both:
- `rigor-core`
- `rigor-beta` (dependency install, audit, TypeScript check, Vitest)

After isolated Netlify preview deployment, run the
`RIGOR Company Preview Smoke` workflow and require:
- product health PASS;
- `/company.html` present;
- unauthenticated `/api/company/state` returns 401.

Then run one founder mission end to end:
1. create mission;
2. trigger company pulse;
3. confirm business-team founder brief;
4. confirm mission state changes;
5. confirm approval materialization when required;
6. record founder decision;
7. confirm audit entries;
8. rerun pulse and confirm durable state survives.

Do not merge/promote production until the complete loop passes cleanly.
