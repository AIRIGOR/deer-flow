# RIGOR beta checks

Session 08 receipt boundary: company_pulse/company_action require server-created
checkpoint delegation evidence before VERIFIED. Preserve source/thread/run/checkpoint,
worker completion/digest/ref, explicit-owner matching, pulse finding citation and
human-review-only reconciliation checks. Receipts bind request/response SHA-256,
site/deployment and verification scope; never persist tokens, headers or raw checkpoint
report text. coherentFlowCheck requires both receipts from the current deployment and
a company checkpoint-completion scope. A failed receipt write must fail the request.
Run deerflow.test.ts and founder.test.ts plus backend company-evidence tests. Existing
pulse/action/Founder envelopes persist the returned proof with receipt IDs. Coordinate
backend/Netlify staging versions; do not add a legacy fallback or infer readiness from
VERIFIED. Receipts are not signatures, atomic multi-store transactions or semantic proof.

Session 06 change impact: recordChangeImpact owns curated before/after fields,
actor labels, affected department/requirement IDs, reopened checkpoint IDs and
readiness transitions. Use it on operational mutations; source review and explicit
checkpoint signoff use invalidate_checkpoints=false. No-op updates must preserve
approvals and avoid duplicate impact records. Department reassignment must rebuild
conflict comparisons before tracing readiness. Require boolean checkpoint approval.
PDF impact events are scoped by affected_departments as well as direct entity links.
Keep worker replay idempotent and test cross-department and production isolation in
rigor-upload.test.ts. The trace is a workspace record, not an immutable approval
ledger, exhaustive dependency graph or proof that older downloaded reports are current.

Session 05 handshake: use hasOperationalOwner and missingSourceRequirements for
readiness, department summaries, briefs and report open items. Compare comparable
normalized facts within a document as well as across sources. A resolution applies
only while its normalized values and displayed source locations remain unchanged;
reordering must not invalidate it. Changed facts reopen affected checkpoints and
retain the previous decision snapshot for review. Keep the session05-handshake-v1
workspace migration idempotent. Run handshake.test.ts, model.test.ts and
rigor-upload.test.ts. These checks do not establish an operational dependency graph
or engineering compatibility; never infer readiness or approve a conflict from them.

Session 04 document intelligence: document-type suggestions require a content cue;
filenames alone cannot classify a source. Suggestions remain NEEDS_REVIEW, including
ADVANCE documents. Preserve PDF.js hasEOL boundaries and empty physical pages.
The shared DeerFlow boundary must validate each excerpt against its cited page
before saving a VERIFIED receipt; retain worker-level validation as defense in depth.
Run document-classification.test.ts, real-pdf-packet.test.ts, deerflow.test.ts and
rigor-upload.test.ts when changing this path. A verified excerpt proves source
presence, not semantic correctness, completeness, engineering approval or readiness.

Source provenance comparisons must collapse actual whitespace (`/\s+/g`), not literal backslash-s sequences. Keep the wrapped-source citation regression alongside fabricated-citation rejection in rigor-upload.test.ts.

PDF.js and its direct native canvas dependency must remain external in the Netlify bundle. Import PDF.js inside readPdfPages so parser startup cannot crash all API routes. Verify the packaged function on staging; local PDF tests alone do not prove native modules ship correctly.

This module publishes `app/static` and bundles `netlify/functions/rigor-api.mts`.
`netlify.toml` explicitly runs `npm run check` before function bundling.

Run `npm run check`, `npm test`, and `npx netlify build --context production`
after reliability changes. Run the focused backend RIGOR tests listed in
`.github/workflows/rigor-beta-ci.yml` when verifying the DeerFlow bridge.

Department PDF callers must pass scoped requirements, conflicts, checkpoints,
and incidents to `readiness`. Master reports and workspace readiness use the
complete production. Keep department isolation covered by regression tests.

Never print environment values or session cookies. Verify configuration by
presence and an authenticated ingestion result. Building does not authorize
deployment.
Dependency security gate: Node.js 24, Netlify Functions 6, CLI 27, and Vitest 5. The CLI-scoped sharp 0.35.5 override patches its image-tool dependency. Full and production-only npm audits must pass; CI must fail on a production audit failure.

Pod 2 rules: canonicalize source facts before building conflicts. Keep original model labels for audit; never compare unlike physical constraints as the same category. Include affected departments in report scope and readiness. New contradictions must reopen affected checkpoints, and source review must remain a separate gate from requirement confirmation. Source reconciliation is a rule-assisted candidate pass, not an exhaustive extraction guarantee. Uploaded documents require explicit full-source review; only labeled sample documents bypass that gate. Exercise the eight-constraint scenario and recorded DeerFlow omission regression before releasing these rules.

Document intake must save raw bytes and PROCESSING metadata before parsing/model calls. Run rigor-upload.test.ts for persistence, worker failure/retry, page count, authorization, production selection, and readiness regressions. GET workspace is read-only; worker results rebase on current state after slow analysis. Never treat upload 202 as completed analysis.

Integration contract: `_shared/deerflow.ts` owns the gateway URL/token, operation routes, deadlines, sanitized errors, and durable receipts for RIGOR and 3NETRA. Uploaded documents must not silently fall back from DeerFlow or complete source review without verified analysis. Preserve pending/failed readiness gates, page provenance, and human approvals. Run deerflow.test.ts and rigor-upload.test.ts; verify the real 90-page upload against production before claiming live integration.

Coherent-flow proof: `coherentFlowCheck` may propose only an INTERNAL_TEST/OBSERVE evidence review after both analysis and pulse verify. Preserve the per-deployment action key, terminal-action deduplication, and Founder-reserved gates.

Company action execution uses a bounded pulse context excerpt to satisfy DeerFlow’s 20,000-character request limit while preserving the full proposal evidence.

Founder commands: `rigor-founder.mts` requires the separate `RIGOR_FOUNDER_TOKEN`; do not reuse tester sessions as Founder authority. Persist each command before dispatch; internal modes only, max 3900 characters. `rigor-founder-command-background.mts` uses an ETag-conditional QUEUED → RUNNING transition and per-command records, saves results/receipt IDs, and fails closed on invalid gateway output. Run `founder.test.ts` for auth, reserved-mode rejection, persistence order, dispatch failure, and duplicate worker coverage. A command receipt is not proof of specialist delegation or release clearance. Do not create or change credentials as part of code installation.

RIGOR CI runs both full and production-only dependency audits. A clean runtime audit must not mask vulnerable development tooling. Full audit is expected to block until upstream braces/node-forge remediation is verified.

John authorization: use johnStagingAuthorized(context), never context.deploy.context as an environment boundary. Allow only the exact isolated staging site ID plus an exact true flag. Test production-context staging, Founder/unknown preview sites and missing/malformed flags. Preserve session and synthetic-evidence checks. Current repair must not overwrite the separately staged recovery implementation or live Founder/backend history.

Keep X-RIGOR-Service-Token-SHA256 generation aligned with backend _authorize: lowercase SHA-256 of trimmed UTF-8 bytes. Do not log this credential-equivalent digest. Retain synthetic Unicode transport and wrong-digest rejection regressions.


Mission 05B workspace writes: _shared/workspace-store.ts owns strong metadata reads,
ETag-bound updates and conditional creation. Never write workspace keys directly or
clone a loaded state before saving: missing version context fails closed. HTTP
mutations require the observed If-Match; responses containing workspace snapshots
(and feedback) return ETag. No wildcard/legacy fallback, blind retry or unconditional
save after conflicts. Preserve worker conflict handling before failure bookkeeping.
Run rigor-upload.test.ts and upload-ui.test.ts plus npm run check for this path.
This protects one workspace record, not uploads/jobs/sessions as a transaction.


Mission 05C: snapshot authority explicitly identifies WORKSPACE_DRAFT, no
production-release authorization, no authoritative approval and no SQL sync.
Workspace readiness/review/checkpoint decisions remain drafts even for PM labels.
Do not treat tester roles, shared service tokens or receipts as verified human
assignments. See docs/RIGOR_AUTHORITY_CONTRACT.md; formal signoff remains BLOCKED.


Mission 06 command recovery: Founder worker redelivery of RUNNING older than 30
minutes conditionally records BLOCKED/INTERRUPTED_REVIEW_REQUIRED, never requeues
or reexecutes. Age is uncertainty, not proof of failure. Fresh RUNNING is untouched.
Terminal command writes require the claimed RUNNING ETag; missing claim versions
fail closed. Preserve newer command state on late success/failure. Founder UI treats
BLOCKED as terminal review state. Test founder, founder-ui and deerflow modules;
these are mocked receipts, not independent/live authorization or release proof.


Session 09 VS01: LOCAL_DRY_RUN requires existing Founder-token capability plus
platform dev context and loopback request host. This is not named human Founder
verification or production authority. Use REVIEW_EVIDENCE only; never trust client
role/approval claims. Reuse worker CAS/recovery and UUID submission idempotency.
Persist dry-run receipt conditionally before DRY_RUN_COMPLETE; never emit VERIFIED
or Session 08 checkpoint proof for simulation. Keep gateway/model calls unreachable
from this branch, and preserve pending UI IDs on response loss. Test founder,
founder-ui and deerflow modules plus npm run check. No new credential or assignment.


Train01 candidate override: exact staging site + explicit RIGOR_STAGING_DRY_RUN_ENABLED
true permits simulation without loopback; all hosted real Founder modes stay blocked.
Staging bridge, pulse/action workers, schedule and outreach are guarded before live
fetch/state actions. Never infer human authority. Live John is intentionally403;
fixture/brief/draft workflows remain. PDF consumers explicitly include native canvas
files because NFT cannot infer PDF.js dynamic loading. Cloud/Linux rebuild mandatory;
do not upload Windows validation ZIPs. No protected settings/deploy without approval.
