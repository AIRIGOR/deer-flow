# RIGOR Netlify Beta

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


The repository pins the Netlify build command to `npm run check`, overriding stale dashboard build commands before function bundling.
Department Advance Report readiness counts only that department's requirements, conflicts, checkpoints, and incidents.
Pod 1 security checks require Node.js 24. Netlify Functions 6 and CLI 27 remove the previous vulnerable build dependencies; Vitest 5 and a Netlify CLI-scoped sharp 0.35.5 override clear the development audit. Run `npm audit --audit-level=high` and `npm audit --omit=dev --audit-level=high` before sharing a build.
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
