# RIGOR Netlify Beta

Upload recovery now tracks the current analysis attempt so late results or errors cannot overwrite a newer retry. Private receipts retain source/attempt correlation across interruption; public health hides that private context. To exercise real process interruption locally, run `node scripts/recovery-proof/run.mjs deer-flow-dev-frontend:latest` with Docker running and the image already built. The test uses only new network-isolated containers and synthetic data, preserves its evidence under `.artifacts/recovery-proof`, and does not start or modify your DeerFlow stack. It is not a live intelligence test.

Workspace edits now reject stale concurrent changes with HTTP 409; reload the current workspace before retrying. Background upload analysis reserves one execution per job and does not automatically replay uncertain work. Source bytes remain saved and the show stays blocked until analysis is resolved. These safeguards do not establish a cross-object database transaction or complete disaster recovery.

New uploads retain a versioned source binding with document identity, saved-byte hash and byte length. Analysis checks that binding before using the file, and derived requirements retain it. Equal filenames remain separate documents. Existing records remain readable; pending legacy jobs are labeled as bindings of currently saved bytes, without claiming original-upload integrity. See `docs/RIGOR_INTEGRATION_CONTRACTS.md` and the release gates for remaining consistency limitations.

Live acceptance uses `python scripts/live-pod-proof.py --url TARGET --expected-commit EXACT_SHA` only on an authorized environment. Upload acceptance (202) is followed by bounded read-only polling of the saved document; failed, missing, mismatched-production or unreceipted analysis never passes. The deployed commit must match before mutations and after the scenario. Run `python -m unittest discover -s scripts -p 'test_live_pod_proof.py' -v` for synthetic loopback contract tests; these do not certify real intelligence or PDF layout.

Company execution verification accepts only the nine registered RIGOR runtime roles. A company cycle requires five distinct registered specialists and one Chief of Staff; unknown, empty, or altered names fail verification. This checks role identity in authenticated gateway receipts, not the accuracy of agent conclusions.

This package is the standalone, hands-on RIGOR evaluator experience. Each tester receives an isolated workspace with capacity for three productions. New productions start without canned requirements or conflicts; uploaded source documents drive the operational record.

Every production advances independently through three end-to-end stages:

1. Preproduction intake and source-backed requirement review.
2. Technical advance, conflict resolution, ownership, and department readiness.
3. Show-day checkpoints, incident logging, and Master/department Advance Reports.

Production gates are fail-closed: every extracted requirement must be confirmed or rejected, every confirmed requirement must have an owner, every detected conflict must be resolved, and every show-day checkpoint must be complete before RIGOR can declare `SHOW_READY`. Reports download through the authenticated session without navigating away from the workspace.

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

RIGOR, DeerFlow, and the 3NETRA company operator share one authenticated gateway contract. Uploaded documents require verified DeerFlow analysis; missing configuration, timeout, HTTP failure, or invalid provenance leaves the saved document FAILED and retryable, with readiness blocked. Background analysis has a bounded ten-minute budget. Previously fallback-processed documents offer Retry with DeerFlow and cannot complete source review until verified. Analysis does not replace full-source human review.

The operating motto is **Flow like water**. `/api/health` and `/api/company/health` expose separate durable execution receipts for document analysis, company pulse, and internal company actions. Configured is not verified; receipt IDs connect documents and company results to the shared execution path. External communications and Founder-reserved approvals retain their existing gates.

The DeerFlow endpoint treats uploaded document text as untrusted source material, returns structured production requirements with page provenance and confidence, and does not resolve contradictions on its own.

## Local checks

```bash
npm ci
npm run check
npm test
npm run dev
```

The Netlify project publishes `app/static` and bundles the functions configured in `netlify.toml`. The feature branch also includes `.github/workflows/rigor-beta-ci.yml`, which runs focused TypeScript and Python RIGOR checks for relevant changes.


The repository pins the Netlify build command to `npm run check`, overriding stale dashboard build commands before function bundling.
Department Advance Report readiness counts only that department's requirements, conflicts, checkpoints, and incidents.
Project builds require Node.js 24, Netlify Functions 6 and Vitest 5. Netlify CLI is operator tooling, invoked separately by `npm run dev`, and is not a project dependency or part of the application lockfile. Netlify supplies its own managed deployment tooling. Audit the project with `npm audit --audit-level=high` and `npm audit --omit=dev --audit-level=high`; these checks do not assess separately installed operator or platform tooling.
## Pod 2 source review and change impact

Source-backed dock capacity, B-stage footprint, suspended load, point load, trim, power, curfew and labor constraints use stable identities across model labels. Model-provided categories and departments remain available for audit. Suspended load, point load and B-stage footprint conflicts receive critical severity. Automated LED load affects Rigging and Video; B-stage footprint affects Rigging, Stage Management and Video. Those related requirements and conflicts appear in each affected department PDF and readiness summary.

After ingestion, review each requirement candidate and the full original document. A rule-assisted source pass adds obvious statements omitted by the model as explicitly marked source review candidates. It does not guarantee complete semantic extraction. Use **Complete source review** only after accounting for every relevant requirement in the original document. Full source review records the session reviewer and time and is required before intake completion or show readiness. Guided sample documents remain explicitly exempt from this production-document gate.

New source contradictions reopen affected department checkpoints. Record the operational resolution, complete source review, and reapprove the affected checkpoints before show readiness can return. Existing workspaces rebuild conflicts once under the new rules; previously unrecorded document reviews must be completed, and affected checkpoints can reopen. This is a conservative review gate, not engineering certification or a claim that every dependency is modeled.

Run `python scripts/live-pod-proof.py --url https://rigor-flow-preview.netlify.app` to exercise eight synthetic contradictions, independent full-source review, revised LED load, affected checkpoint reopening, persisted workspace state and Master/department PDF downloads in a new isolated session. This creates synthetic data only. The strict run requires DeerFlow for every upload; `--allow-fallback` exercises product gates while recording the bridge failure explicitly. Evidence is written under `.artifacts/live-pod-proof` and must be inspected before declaring release readiness.

Company health tracks the latest authorized pulse attempt separately from the last successful pulse. A newer failed attempt returns degraded health with HTTP 503 and a sanitized failure code; an abandoned attempt times out after 15 minutes. A previously successful pulse cannot mask a recent execution failure. A 202 response from a background function is acceptance only, not proof of a successful cycle.

Founder Command Center is available at `/founder`. It uses `@netlify/identity` and requires the server-assigned `founder` role. Enable Netlify Identity in invite-only mode, invite the founder, and assign that role in the admin console. Do not grant the role through user-editable metadata. Invite and password recovery callbacks are handled on this page. Commands are bounded internal reviews; external actions remain outside this command API.

Founder commands persist in the company store, use UUID idempotency keys and an atomic background claim, and report QUEUED/RUNNING/COMPLETE/FAILED or an elapsed timeout. Completion requires runtime-correlated specialist receipts from DeerFlow. A company cycle requires five distinct specialists followed by Chief of Staff synthesis; action execution requires the assigned specialist. The page renders persisted state and reports without scripted progress percentages.

To verify the complete live execution path, set the protected service credential in `RIGOR_AUTOMATION_TOKEN` and run `python scripts/live-company-proof.py --url <deployed-url>`. This issues two internal company cycles and a moat review, requires fresh completion and delegation receipts, and verifies their persistence. It does not prove browser sign-in; verify founder login separately. The GitHub release workflow requires the repository secret of the same name. Netlify `RIGOR_DEERFLOW_TOKEN` and Render `RIGOR_SERVICE_TOKEN` must match in the deployed contexts being tested. Keep all credential values out of commits, chat, logs and evidence artifacts.

If an invitation opens the production workspace without password setup, open the preview `/founder` page. Copy the entire invitation link from the email (right-click → Copy link address), paste it into **Invitation link**, and select **Continue invitation**. Set a password of at least 12 characters. The link is treated as a secret, cleared from the input immediately, and parsed locally; only the invitation token is passed to Netlify Identity. Do not share invitation links in chat.

Founder command failures preserve sanitized upstream HTTP or delegation failure codes rather than collapsing every cycle failure into PULSE_DID_NOT_COMPLETE. Raw upstream diagnostics are not exposed. Signed-in Founders see a ready-to-command message.

Founder reports use plain-language summaries, priorities, risks to verify, decisions, proposed next actions, and named specialist receipts. Full JSON remains under **View technical evidence**. “Review completed” describes command execution, not release readiness; only a correlated server receipt displays verified delegation. Company records may contain unverified assessments.

Company-cycle evidence is scoped to `/deploy-meta.json`'s exact deployed commit, with GitHub workflow results filtered to that SHA. Missing deployment metadata stays unknown; it never falls back to a stale feature branch. External tester and repeated real-show validation belong to the later validation phase, outside current build-completion scoring. Capital and partnership work are tracked business objectives.

Company preview history now uses an isolated, branch-scoped site store with strong consistency, distinct from production. All company readers/workers share `_shared/company-store.ts`. PR 11 history is conditionally recovered from its prior deploy once; migration never overwrites newer data, reruns completed commands, or automatically resumes recovered actions. Unknown branch contexts retain deploy isolation.

Founder command status above the form now follows the persisted command through waiting, execution and completion. Refresh restores the latest Founder-issued status. Temporary polling failures retry twice; repeated failure asks for a page refresh rather than implying execution failed or inviting a duplicate submission.

Company cycles keep their model request within the backend's 30,000-character context limit as history grows. Oversized requests omit record payloads and then oldest context entries, with explicit omission counts. Full saved records remain unchanged; a partial context must not be treated as proof that omitted work was completed.

The Founder objective field keeps the full pasted text and displays its character count. Commands accept 8–4,000 characters, matching the execution service; longer text stays in the field with a clear validation message. Both company cycles and assigned reviews receive the complete accepted objective.

Use **Prepare outreach** for prospect research and email drafting. It delegates to Partnerships and Capital and requires a saved structured package containing five partners, five investors, source/contact routes, ten introductions and ten follow-ups. Generic readiness reports fail this command's deliverable check even with valid execution receipts; partial output remains visible. A table and expandable drafts render the saved package. All outreach remains unsent, and source claims still require review. Review commands reject requests for an outreach package instead of routing them to QA or a general synthesis.

### Founder decisions

The Founder Command Center shows queued proposals with Approve proposal, Reject, and Request changes controls. Decisions store the authenticated Founder, time, note and exact proposal revision. Changed proposal content requires a fresh decision. Email approval requires explicit from, to, subject and body fields; broad outreach objectives cannot be approved as messages. Decisions are saved separately from the automatic queue and do not automatically send email or execute external actions. Approved email proposals have a separate manual send action; other external execution remains disconnected.

### Cloudflare sender and outreach proposals

The Company email panel reports configuration separately from provider delivery. Add `RIGOR_CLOUDFLARE_ACCOUNT_ID` and `RIGOR_CLOUDFLARE_EMAIL_TOKEN` as server-only Functions variables in deploy-preview context; never paste credentials into chat. The signed-in Founder can send only a fixed connection test from ausar@akhasha.com to ausar_bey@icloud.com, at most once per UTC day. The result distinguishes delivered, queued, bounced, rejected and unknown; timeouts never retry. Provider delivery does not prove inbox placement. The Founder can confirm actual mailbox receipt for the saved accepted test; this is distinct from provider delivery. Only then can exact approved proposals be sent individually.

Prepare first three drafts for review creates immutable unsent proposals from a verified saved outreach package. Unverified recipients remain null and cannot be approved. Repeating preparation preserves decisions.

Sender troubleshooting: Founder Company email includes a no-email token verification check. It checks the user endpoint, then the configured account endpoint when the first check cannot verify the token. HTTP status and allowlisted numeric codes distinguish endpoint rejection from incomplete verification; raw messages and token IDs remain private. Throttling, server failure or a recognized token status stop further checks. An active token is not proof of account permission, sending entitlement or delivery. Provider send failures retain only allowlisted numeric codes and fixed explanations, never upstream messages. One self-test per UTC day remains enforced; uncertain sends are not retried.

Credential-format diagnostics report only the presence of a Bearer prefix, internal whitespace or quotation marks. They never expose the credential. Cloudflare nested authorization errors retain only allowlisted codes.

Controlled outreach: Prepare First Round funding draft creates one sourced Liz Wessel introduction for review. `/api/founder/email-send` accepts only a proposal reference, checks the immutable exact approval, bounded sender/recipient/message and recipient source, then claims an execution and message digest before calling Cloudflare. Service callers cannot approve, confirm receipt or send. Limit: ten individual attempts per UTC day; queued, rejected, bounced, suppressed and unknown outcomes remain distinct. No automatic retry or follow-up; repeating a send reads its saved receipt. A timeout or crash after reservation must be investigated rather than retried. Approval alone never sends.


### Revise one outreach email

Use **Edit email draft** on an unsent email card to apply a saved change request. Supply one recipient email, an HTTPS public page listing that address, subject and message, then select **Save revised draft**. The server saves an exact new revision without calling the model, approving it or sending it. Existing proposal and decision history remain intact. Review and approve the new revision before using **Send approved email**. A recorded request for changes is a decision, not an automatic rewrite. **Prepare outreach** remains the ten-prospect research workflow; it is not a single-email editor.

The signed-in Founder-only `/api/founder/email-draft` route validates the draft and source, rejects stale edits, and serializes editing with sending. Current revisions overlay original proposals without modifying the original queue. Every send record, including legacy queued or unknown outcomes, prevents editing that action into a resend. A crashed edit/send lock remains blocked for investigation. A daily-limit receipt explicitly recording that no provider request started can be sent on a later UTC day; it does not claim delivery or permanently consume the message digest. Queue labels display saved approval and provider outcomes separately.

October 11 outreach repair validation: TypeScript, 134 regression tests and offline production-context function bundling passed. The production dependency audit reports zero vulnerabilities. The full build-tool dependency audit retains 15 high findings in CLI dependencies (`braces` and `node-forge`); their latest registry versions remain affected. Do not force-downgrade Netlify CLI or represent this preview repair as full production release clearance.

Exact draft import: the signed-in, same-origin Founder may import one to ten recipient/subject/body/source pairs at `/api/founder/email-import`. Validate every row before writes; preserve exact copy and conditional identities on replay. Import never approves or sends. Separate immutable approval and dispatch remain required.

Verified sender connections retain Founder mailbox proof across accepted diagnostic tests. A rejected/bounced test pauses sending and an account change invalidates proof. GET Founder state reports aggregate UTC-day slot usage without credentials. The interface separates queue totals, send outcomes and connection diagnostics; full email text remains available for exact review.

## Durable document intake

PDF/TXT uploads persist the file and a PROCESSING document before returning HTTP 202. A capability-protected background job parses page text and performs analysis. The production packet shows processing, failure, and retry states; file picker and drag/drop use the same upload path. Status polling is read-only. Failed and processing sources block readiness and cannot be source-reviewed. A worker reloads current workspace state after analysis to retain decisions and production selection. Retry is available after failure or a 16-minute processing timeout. Structured fallback is labeled separately from DeerFlow and still requires full-source review.

After document analysis and company pulse both have verified receipts, the next pulse proposes one bounded INTERNAL_TEST / OBSERVE evidence review per deployment to `rigor-qa-security`. The existing action-policy gate and action runner execute it; terminal action keys prevent repeated execution for the same deployment. The check cannot authorize external actions or replace human source review.

Company action execution uses a bounded pulse context excerpt to satisfy DeerFlow’s 20,000-character request limit while preserving the full proposal evidence.

Founder command recovery also runs hourly on published deployments while the dashboard is closed. Each pass claims at most two stale launches and retains the five-attempt cap. Single-command status polls recover their own queued launch. Recovery never dispatches outreach or consumes saved approvals; running and terminal commands are not relaunched.

Company pulses use the shared DeerFlow integration adapter with bounded context. Company integration receipts require normalized runtime specialist receipts; model-only response fields never establish verified execution. PR 11 runs a protected live internal-command proof against the exact preview commit, verifies persistence and service authority boundaries, and saves only redacted proof flags. This does not authorize product promotion or prove browser login. Netlify CLI is updated to 27.12.1; its full tooling audit still reports 15 high findings.

Approval cards explain missing concrete payloads and incomplete email details before review. Incomplete approvals remain disabled after a failed Reject or Request changes attempt; the server remains the authority for immutable decisions.

Report provenance: completed task receipts verify execution only. The server stamps model-authored assessments UNVERIFIED, overriding model-provided verification labels while retaining original text. Command cards, pulse summaries and saved state show this boundary before assessment content, including legacy reports. Security findings require commit-specific code/configuration evidence plus a reproducer or authoritative log; MFA cannot be inferred from task completion.

Automatic action dispatch rechecks its internal action/scope allowlist and reserves a durable per-action execution claim before calling DeerFlow. Overlapping workers and stale queue replays cannot dispatch the same action twice. Claims remain after failure or uncertain completion; no automatic retry is allowed. Queue lifecycle updates use bounded compare-and-swap on freshly loaded state and preserve unrelated changes. A changed proposal cannot be dispatched under its earlier reservation. Legacy saved results also prevent replay.

## October 22 Founder publication

The canonical Founder workspace is https://founder.akhasha.com/founder. Production commands use the existing production company store. Prior preview commands, drafts, approvals and send receipts stay in their original isolated preview store, linked from Founder settings. No history or send permissions are automatically copied across environments. The RIGOR product link opens the separately deployed https://rigor-beta.netlify.app/ so publishing Founder operations cannot overwrite its newer document-intake fixes. Publication does not establish product readiness or verified unattended execution.

## October 26 certification repair

The shared DeerFlow adapter rejects quotations absent from their cited source page and binds new execution receipts to their deployment. Coherence reviews require current-deployment receipts. This verifies citation location, not extraction completeness or assessment accuracy. Human source review and all existing approval gates remain required.

Verify with `npm ci`, `npm run check`, `npm test`, both full and production `npm audit --audit-level=high`, and `npx --yes netlify-cli@27.12.1 build --context production --offline`. These commands do not deploy. Hosted CI records the actual tested commit/tree; a pull-request merge-tree result is not a post-merge release certification.
