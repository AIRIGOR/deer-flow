# RIGOR Netlify Beta

This package is the standalone, hands-on RIGOR evaluator experience. Each tester receives an isolated workspace with capacity for three productions. New productions start without canned requirements or conflicts; uploaded source documents drive the operational record.

Every production advances independently through three end-to-end stages:

1. Preproduction intake and source-backed requirement review.
2. Technical advance, conflict resolution, ownership, and department readiness.
3. Show-day checkpoints, incident logging, and Master/department Advance Reports.

Production gates are fail-closed: every extracted requirement must be confirmed or resolved (rejected requirements block readiness), every confirmed requirement must have an owner, every detected conflict must be resolved, and every show-day checkpoint must be complete before RIGOR can declare `SHOW_READY`. Reports download through the authenticated session without navigating away from the workspace.

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
- `RIGOR_DEERFLOW_TOKEN` — required secret token used by the beta service to call the protected RIGOR analysis endpoint.

RIGOR, DeerFlow, and the 3NETRA company operator share one authenticated gateway contract. Uploaded documents require verified DeerFlow analysis; missing configuration, timeout, HTTP failure, or invalid provenance leaves the saved document FAILED and retryable, with readiness blocked. Background analysis has a bounded ten-minute budget. Previously fallback-processed documents offer Retry with DeerFlow and cannot complete source review until verified. Analysis does not replace full-source human review.

The operating motto is **Flow like water**. `/api/health` and `/api/company/health` expose separate durable execution receipts for document analysis, company pulse, and internal company actions. Configured is not verified; receipt IDs connect documents and company results to the shared execution path. External communications and Founder-reserved approvals retain their existing gates.

The DeerFlow endpoint treats uploaded document text as untrusted source material, returns structured production requirements with page provenance and confidence, and does not resolve contradictions on its own.

## Local checks

```bash
npm ci
npm run check
npm test
npm run dev # requires a separately installed, trusted Netlify CLI
```

The Netlify project publishes `app/static` and bundles the functions configured in `netlify.toml`. The feature branch also includes `.github/workflows/rigor-beta-ci.yml`, which runs focused TypeScript and Python RIGOR checks for relevant changes.


The repository pins the Netlify build command to `npm run check`, overriding stale dashboard build commands before function bundling.
Department Advance Report readiness counts only that department's requirements, conflicts, checkpoints, and incidents.
Pod 1 security checks require Node.js 24. The optional Netlify CLI is not installed as an application dependency because its transitive toolchain included unpatched high-severity advisories (braces and node-forge). For local development, use a separately managed, security-reviewed Netlify CLI installation; production builds use the Netlify platform and do not need a project-local CLI. CI enforces both full and production-only dependency audits. Run `npm audit --audit-level=high` and `npm audit --omit=dev --audit-level=high` before sharing a build.
## Pod 2 source review and change impact

Source-backed dock capacity, B-stage footprint, suspended load, point load, trim, power, curfew and labor constraints use stable identities across model labels. Model-provided categories and departments remain available for audit. Suspended load, point load and B-stage footprint conflicts receive critical severity. Automated LED load affects Rigging and Video; B-stage footprint affects Rigging, Stage Management and Video. Those related requirements and conflicts appear in each affected department PDF and readiness summary.

After ingestion, review each requirement candidate and the full original document. A rule-assisted source pass adds obvious statements omitted by the model as explicitly marked source review candidates. It does not guarantee complete semantic extraction. Use **Complete source review** only after accounting for every relevant requirement in the original document. Full source review records the session reviewer and time and is required before intake completion or show readiness. Guided sample documents remain explicitly exempt from this production-document gate.

New source contradictions reopen affected department checkpoints. Record the operational resolution, complete source review, and reapprove the affected checkpoints before show readiness can return. Existing workspaces rebuild conflicts once under the new rules; previously unrecorded document reviews must be completed, and affected checkpoints can reopen. This is a conservative review gate, not engineering certification or a claim that every dependency is modeled.

## Durable document intake

PDF/TXT uploads persist the file and a PROCESSING document before returning HTTP 202. A capability-protected background job parses page text and performs analysis. The production packet shows processing, failure, and retry states; file picker and drag/drop use the same upload path. Status polling is read-only. Failed and processing sources block readiness and cannot be source-reviewed. A worker reloads current workspace state after analysis to retain decisions and production selection. Retry is available after failure or a 16-minute processing timeout. Structured fallback is labeled separately from DeerFlow and still requires full-source review.

After document analysis and company pulse both have verified receipts, the next pulse proposes one bounded INTERNAL_TEST / OBSERVE evidence review per deployment to `rigor-qa-security`. The existing action-policy gate and action runner execute it; terminal action keys prevent repeated execution for the same deployment. The check cannot authorize external actions or replace human source review.

Company action execution uses a bounded pulse context excerpt to satisfy DeerFlow’s 20,000-character request limit while preserving the full proposal evidence.

## Founder command execution

`/founder.html` now submits authenticated internal commands to `/api/founder/commands`. It no longer presents canned agent activity, invented completion percentages, or browser-only approvals. Commands are capped at 3900 characters. Supported modes are internal research/evidence review and company pulse. They are not an approval route for external actions or code changes.

An operator must separately configure `RIGOR_FOUNDER_TOKEN` before activation. Keep it distinct from the gateway token; never expose the gateway token to the browser. The Founder token is held only in page memory. The latest command ID is retained in session storage so its status can be recovered after reload by re-entering access. Missing authentication or gateway configuration fails closed. No credential is created by this change.

Each command is saved before background dispatch, then moves QUEUED → RUNNING → COMPLETE/FAILED with its result and gateway execution receipt. An atomic, conditional state transition prevents duplicate invocation from executing the same command twice. Failed dispatch is recorded rather than reported as completion. Preview command records use a deployment store; production uses the company store. Commands do not advance production readiness, approve proposals, or establish that specialist delegation occurred; live delegation and release proof remain separate checks. A crashed worker can require operator investigation; overdue commands show completion unverified after 16 minutes and stop polling. No automatic replay is attempted.

Security status: the October 8 dependency refresh removes the reported proxy-addr and source-map-js findings. The remaining braces and node-forge advisories have no published patched versions at review time. Full-audit failure remains a release blocker even when the production-only audit and build pass.

## Revenue-readiness repair branch (October 2026)

Source citation comparison normalizes PDF line breaks and repeated whitespace before matching an excerpt to its cited page. This accepts faithful wrapped excerpts while preserving rejection of fabricated text and out-of-range pages.

The deployed PDF parser retains its native canvas dependency and loads only when parsing a PDF. A parser dependency failure must not prevent session creation, health checks or TXT uploads from starting.

The UI accepts up to 20 PDF/TXT files per selection (5 MB each), saves them sequentially, and reports partial failures without automatic duplicate retries. Document-type suggestions are based on extracted text, are explicitly advisory, and always require human review. Model-extracted page citations and excerpts are validated against supplied source text. Rejected requirements block both show and department readiness and appear in Master and Department PDFs. These changes require end-to-end production validation before deployment.
