# RIGOR Netlify Beta

This package is the standalone, hands-on RIGOR evaluator experience. Each tester receives an isolated workspace with capacity for three productions. New productions start without canned requirements or conflicts; uploaded source documents drive the operational record.

Every production advances independently through three end-to-end stages:

1. Preproduction intake and source-backed requirement review.
2. Technical advance, conflict resolution, ownership, and department readiness.
3. Show-day checkpoints, incident logging, and Master/department Advance Reports.

## Architecture

- Static responsive frontend in `app/static`.
- Netlify Function API in `netlify/functions/rigor-api.mts`.
- Netlify Blobs for tester sessions, workspace state, feedback, and uploads.
- Three independently persisted productions per workspace, with active-show switching and no cross-show progress leakage.
- Preview and production data use different stores.
- PDF and TXT ingestion with source provenance.
- Structured local extraction normalizes comparable production values and detects cross-document contradictions.
- Optional DeerFlow analysis bridge uses the model-backed `POST /api/rigor/analyze` service when configured.
- Master and department-specific PDF exports share the same underlying state.

## DeerFlow intelligence bridge

Set these Netlify environment variables when the DeerFlow RIGOR gateway is reachable:

- `RIGOR_DEERFLOW_URL` — base URL of the deployed DeerFlow gateway.
- `RIGOR_DEERFLOW_TOKEN` — optional bearer token used by the beta service to call the protected RIGOR analysis endpoint.

When `RIGOR_DEERFLOW_URL` is configured, document uploads prefer DeerFlow model analysis. If the service is unavailable or returns a non-success response, the beta falls back to the local structured extractor so the evaluator workflow remains usable.

The DeerFlow endpoint treats uploaded document text as untrusted source material, returns structured production requirements with page provenance and confidence, and does not resolve contradictions on its own.

## Local checks

```bash
npm ci
npm run check
npm test
npm run dev
```

The Netlify project publishes `app/static` and bundles the functions configured in `netlify.toml`. The feature branch also includes `.github/workflows/rigor-beta-ci.yml`, which runs focused TypeScript and Python RIGOR checks for relevant changes.
