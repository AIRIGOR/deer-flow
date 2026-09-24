# RIGOR Action Layer v1

## Purpose

Move RIGOR from an AI company that only recommends work toward an AI company
that maintains a policy-enforced queue of executable company actions.

## Operating rule

The model may propose actions. The model does **not** decide its own authority.
A deterministic policy layer classifies every action after generation.

## Automatic lane

Eligible bounded internal actions:
- INTERNAL_RESEARCH
- INTERNAL_TEST
- INTERNAL_DOCUMENT
- OUTREACH_DRAFT
- SUPPORT_DRAFT
- APPLICATION_DRAFT

These may be marked APPROVED when scoped to OBSERVE, PREPARE, or
INTERNAL_EXECUTE.

## Founder approval lane

These are always held:
- EMAIL_SEND
- PUBLIC_POST
- AD_SPEND
- CONTRACT
- CAPITAL_ACCEPT
- PAYMENT
- PRODUCTION_PROMOTE
- CREDENTIAL_CHANGE
- DATA_DELETE

INTERNAL_CODE_CHANGE is also held for review before execution.

Any action explicitly scoped EXTERNAL_EXECUTE or FOUNDER_RESERVED is held even
if its type would otherwise be eligible for the automatic lane.

## Durable queue

Each company pulse now carries action proposals into a Netlify Blobs queue at
`actions/queue`. The next operating cycle receives that queue as part of
company context, so outstanding work survives across cycles.

The public company health response exposes only counts:
- total
- approved
- needs_founder_approval
- executing
- complete

It does not expose sensitive action details.

## What v1 does not claim

v1 creates the authority model and durable action queue. It does not yet wire
email, ad purchasing, payments, contracts, social posting, or other external
connectors. Those executors must consume the queue and enforce the same policy
boundary rather than bypass it.
