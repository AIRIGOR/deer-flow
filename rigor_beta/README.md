# RIGOR Netlify Beta

This package is the standalone, hands-on RIGOR evaluator experience. Each tester receives an isolated workspace with capacity for three productions. New productions start without canned requirements or conflicts; uploaded source documents drive the operational record.

Every production advances independently through three end-to-end stages:

1. Preproduction intake and source-backed requirement review.
2. Technical advance, conflict resolution, ownership, and department readiness.
3. Show-day checkpoints, incident logging, and Master/department Advance Reports.

Production gates are fail-closed: every extracted requirement must be confirmed or rejected, every confirmed requirement must have an owner, every detected conflict must be resolved, and every show-day checkpoint must be complete before RIGOR can declare `SHOW_READY`. Report links open directly from the authenticated workspace in a browser tab, using the same session cookie. On iPhone, the PDF viewer's Share action can save the report to Files. A report URL opened in a different browser or without a RIGOR session returns 401.

## Architecture

- Static responsive frontend in `app/static`.
- Netlify Function API in `netlify/functions/rigor-api.mts`.
- Netlify Blobs for tester sessions, workspace state, feedback, and uploads.
- Three independently persisted productions per workspace, with active-show switching and no cross-show progress leakage.
- Preview and production data use different stores.
- PDF and TXT ingestion with source provenance.
- DeerFlow model analysis extracts requirements; local comparison detects cross-document contradictions.
- Master and department-specific PDF exports share the same underlying state. They include source documents, requirements and excerpts, owners, open actions, conflict decisions, checkpoints, incidents, and the recorded action chronology. Department exports filter each section to the selected department.

## DeerFlow intelligence bridge

Set these Netlify environment variables for the DeerFlow RIGOR gateway:

- `RIGOR_DEERFLOW_URL` — base URL of the deployed DeerFlow gateway.
- `RIGOR_DEERFLOW_TOKEN` — service token matching the gateway's `RIGOR_SERVICE_TOKEN`.

Document analysis requires DeerFlow. If either setting is missing, the service is unreachable, or analysis fails, the upload returns a clear error without recording the document as processed. `GET /api/health` checks the gateway's `/health` endpoint and returns `REACHABLE`, `UNAVAILABLE`, or `NOT_CONFIGURED`; reachability does not prove that the model provider is ready. Configure the model credentials on the gateway and test a real document before releasing the bridge.

The DeerFlow endpoint treats uploaded document text as untrusted source material, returns structured production requirements with page provenance and confidence, and does not resolve contradictions on its own.

## Local checks

```bash
npm ci
npm run check
npm test
npm run dev
```

The Netlify project publishes `app/static` and bundles the functions configured in `netlify.toml`. The feature branch also includes `.github/workflows/rigor-beta-ci.yml`, which runs focused TypeScript and Python RIGOR checks for relevant changes.
