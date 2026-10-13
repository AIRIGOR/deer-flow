# RIGOR beta checks

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

Company pulse attempts must persist RUNNING/COMPLETE/FAILED independently of pulse/latest; health must degrade after a newer failed or timed-out attempt. Never use a background 202 response or configured=true as execution proof. Run scripts/live-pod-proof.py for live product gates; a fallback result does not pass the DeerFlow bridge gate. Keep synthetic evidence and cookies out of commits.

Founder invitation workaround: `/founder` accepts a pasted HTTPS invitation link from the current deployment host or the project production host. Parse locally, clear the input immediately, and keep the token only in memory until `@netlify/identity` accepts it. Never navigate to a pasted URL, log it, or persist it in browser storage. Cover rejected hosts, protocols, and missing/duplicate tokens.

For Founder-triggered company cycles, propagate sanitized execution failure codes to the command receipt while maintaining last-attempt health. Scheduled/background invocations retain their durable failure behavior. Never publish raw upstream response bodies.

Founder presentation uses text-only DOM rendering in `app/founder-report.ts`; never insert model HTML into the page. Raw evidence belongs in collapsed details. Keep review completion distinct from release readiness and only show verified delegation from a correlated server execution receipt. Company context must use the deployed commit from build metadata and filter CI to that exact SHA; missing metadata is unknown, never a feature-branch fallback. Prior saved model assessments must not be promoted to verified test failures.

Company preview history now uses an isolated, branch-scoped site store with strong consistency, distinct from production. All company readers/workers share `_shared/company-store.ts`. PR 11 history is conditionally recovered from its prior deploy once; migration never overwrites newer data, reruns completed commands, or automatically resumes recovered actions. Unknown branch contexts retain deploy isolation.

Founder status polling is implemented in `app/founder-progress.ts`. Keep the notice synchronized with the active persisted command; stop polling at terminal status or sign-out, bound transport-error retries, and never use a POST acceptance response as completion proof. Ignore stale loads after the authenticated viewer changes.

Company pulse requests use `_shared/company-context.ts` to enforce the backend's 30,000-character context contract. Keep valid JSON and fixed deployment/evidence rules; disclose omitted payloads and history entries. Never mutate persisted records to satisfy the request budget or silently truncate serialized JSON.

Founder objective validation is shared by UI and API in `app/founder-objective.ts` and matches the backend's 4,000-character contract. Do not apply textarea maxlength or slice accepted objectives; retain oversized pasted text and explain validation errors. Allow multibyte JSON request bodies within the separate byte budget.

`PREPARE_OUTREACH` is an explicit internal draft command owned by `rigor-partnerships-capital`. Validate `RIGOR_OUTREACH_V1` with `app/outreach-package.ts` before COMPLETE, independently of runtime delegation verification. A narrative claiming drafts exist does not pass. Retain partial results on failure; never treat structural checks as independent verification of source facts or sending approval. Keep the general readiness context out of this focused mission.

Founder proposal decisions use immutable conditional writes under `founder/action-reviews/<sha256>` and bind every proposal field except worker lifecycle metadata. Only a signed-in Founder with same-origin verification can decide; service tokens cannot approve. GET overlays a decision only for the matching current fingerprint. Never translate a decision to automatic runner eligibility. Approved email sending is a separate authenticated Founder endpoint; other external execution stays disconnected. Reject vague EMAIL_SEND approvals without explicit from/to/subject/body. Keep rejection and requested changes available for incomplete proposals.

Outreach proposals live separately under `founder/outreach-proposals/`; review reads both these and the automatic queue. Preparation requires a validated server-verified completed packet and conditional creation. Never infer email addresses from URLs. Sender configuration exposes presence only. `/api/founder/sender-test` accepts no custom payload, requires a real same-origin Founder, reserves one attempt per UTC day before any provider request and sends only the fixed Founder self-test. Retain uncertain delivery without automatic retry. Never expose tokens/upstream errors or turn self-test success into prospect sending permission.

`/api/founder/sender-check` is an empty-payload, same-origin, real-Founder POST that performs the documented user-token verification GET and, if unverified, the configured account verification GET within one shared timeout. Stop on recognized token status, 429 or 5xx. It sends no email and saves no token IDs or values. Retain only endpoint type, HTTP status, allowlisted numeric codes and token status. Incomplete checks do not establish invalid credentials. Keep activation distinct from sending permissions/entitlement/delivery. Send diagnostics must allowlist codes and use fixed messages, never expose provider text.

Credential-format diagnostics expose only wrapper/whitespace/quote flags, never the token or its length. Bound nested provider error-code parsing and discard all messages.

Controlled email execution: `/api/founder/sender-confirm` saves authenticated Founder mailbox-receipt confirmation bound to the current accepted self-test. Do not change a queued provider outcome to delivered. `/api/founder/email-send` sends only an immutable exact approved proposal with a public source for its recipient, the fixed authorized sender and bounded subject/body. Reserve both execution and envelope digest plus one of ten UTC-day slots before the provider call. Replayed/parallel clicks and uncertain outcomes never resend. GET overlays execution receipts separately from approval and never changes automatic queue eligibility. The funding draft seed is sourced research, not an investor-interest or product-readiness claim.

Outreach revisions: individual draft changes use `/api/founder/email-draft`, not the ten-prospect PREPARE_OUTREACH model contract. Preserve originals and immutable approval history. Editing and sending share a conditional per-action lock; reject any action with a prior send receipt when revising. Only DAILY_LIMIT with explicit provider_request_started=false may be retried after capacity returns. Unknown/provider outcomes remain non-retryable. Keep fingerprint, origin, Founder-role, stale-edit and concurrent-send regressions.

Business-day sending: all outreach paths and the fixed sender self-test must block Saturday/Sunday in America/Los_Angeles before reserving a send receipt, envelope or daily slot. Preserve existing receipts and permit draft editing/approval on weekends. UI gating supplements server enforcement; weekday checks must cover Pacific midnight and daylight saving offsets.

Exact draft import: the signed-in, same-origin Founder may import one to ten recipient/subject/body/source pairs at `/api/founder/email-import`. Validate every row before writes; preserve exact copy and conditional identities on replay. Import never approves or sends. Separate immutable approval and dispatch remain required.

Verified sender connections retain Founder mailbox proof across accepted diagnostic tests. A rejected/bounced test pauses sending and an account change invalidates proof. GET Founder state reports aggregate UTC-day slot usage without credentials. The interface separates queue totals, send outcomes and connection diagnostics; full email text remains available for exact review.

Founder workspace navigation: Overview, Commands, Outreach, Approvals, Activity, Settings use hidden sections with explicit focus/view state. Outreach tables show exact recipients and saved execution status; queued is not delivered. Keep optional research and technical evidence collapsed. Remove normal character counters while preserving shared objective validation and full pasted text. Navigation returns to the top, and recipient links open the corresponding proposal. Preserve authentication, exact proposal approval, conditional send reservations and existing receipt history when changing domains.

Document intake must save raw bytes and PROCESSING metadata before parsing/model calls. Run rigor-upload.test.ts for persistence, worker failure/retry, page count, authorization, production selection, and readiness regressions. GET workspace is read-only; worker results rebase on current state after slow analysis. Never treat upload 202 as completed analysis.

Integration contract: `_shared/deerflow.ts` owns the gateway URL/token, operation routes, deadlines, sanitized errors, and durable receipts for RIGOR and 3NETRA. Uploaded documents must not silently fall back from DeerFlow or complete source review without verified analysis. Preserve pending/failed readiness gates, page provenance, and human approvals. Run deerflow.test.ts and rigor-upload.test.ts; verify the real 90-page upload against production before claiming live integration.

Coherent-flow proof: `coherentFlowCheck` may propose only an INTERNAL_TEST/OBSERVE evidence review after both analysis and pulse verify. Preserve the per-deployment action key, terminal-action deduplication, and Founder-reserved gates.

Company action execution uses a bounded pulse context excerpt to satisfy DeerFlow’s 20,000-character request limit while preserving the full proposal evidence.

Founder command recovery also runs hourly on published deployments while the dashboard is closed. Each pass claims at most two stale launches and retains the five-attempt cap. Single-command status polls recover their own queued launch. Recovery never dispatches outreach or consumes saved approvals; running and terminal commands are not relaunched.

Company pulses use the shared DeerFlow integration adapter with bounded context. Company integration receipts require normalized runtime specialist receipts; model-only response fields never establish verified execution. PR 11 runs a protected live internal-command proof against the exact preview commit, verifies persistence and service authority boundaries, and saves only redacted proof flags. This does not authorize product promotion or prove browser login. Netlify CLI is updated to 27.12.1; its full tooling audit still reports 15 high findings.
