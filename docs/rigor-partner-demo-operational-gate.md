# RIGOR Partner / Investor Demo — Operational Gate

## Purpose

RIGOR may be shared with potential investors or strategic partners when the product can demonstrate a coherent production workflow without requiring the viewer to understand DeerFlow, ChatGPT, or internal infrastructure.

The experience should communicate:

**Fragmented production documents → operational requirements → conflicts → ownership → readiness → show-day execution → source-backed Advance Report.**

## Required shareable path

1. Visitor enters name and role.
2. Visitor may choose **Partner / Investor**.
3. Visitor can launch **Explore sample production** without supplying files.
4. Sample production is visibly labeled **SAMPLE** and must never be represented as a real show.
5. RIGOR presents one requirement decision at a time by default.
6. Source evidence remains available on demand.
7. Technical Advance requires every extracted requirement to be reviewed.
8. Conflicts must be resolved and actionable requirements must have owners before Show Day unlocks.
9. Show Day requires all checkpoints and all field incidents to be resolved before SHOW READY.
10. Master and department Advance Reports come from the same source of truth.

## Operational safeguards

- High or critical unresolved incidents block readiness.
- Any unresolved incident prevents completion of the Show Day session.
- DeerFlow model analysis fails safely to structured local extraction rather than breaking the workflow.
- The UI must not expose DeerFlow connection badges or development plumbing.
- The health endpoint may report only whether the DeerFlow bridge is configured; it must never expose credentials.
- Sample data must use explicit SAMPLE provenance.
- Uploaded tester documents remain isolated from sample/demo records.

## Advance Report minimum

Master and department PDFs should include, as applicable:

- show / venue / date
- readiness status and score
- open-item summary
- requirements and ownership
- source evidence / provenance
- conflict decisions
- show-day checkpoints
- incidents and resolutions
- analysis engine provenance
- decision chronology / audit trail

## Release checks before sharing externally

- [ ] RIGOR CI passes frontend type-check/tests and focused backend tests.
- [ ] Automated virtual production passes conflict detection and incident-readiness gates.
- [ ] Latest partner-demo branch is deployed to the intended Netlify share URL.
- [ ] Desktop visual inspection at 100% browser zoom.
- [ ] Mobile visual inspection.
- [ ] Guided sample path completes from landing page to report generation.
- [ ] PDF downloads successfully.
- [ ] No beta/development/engine-language visual noise.
- [ ] Sample production is unmistakably labeled SAMPLE.
- [ ] Health check confirms expected DeerFlow configuration for the environment.
- [ ] Final external link is tested in a logged-out/private browser.

## Current deployment note

The feature branch is the source of truth for partner-demo hardening. Do not assume an older Netlify deployment contains the latest branch until its deploy ID has been verified after publication.
