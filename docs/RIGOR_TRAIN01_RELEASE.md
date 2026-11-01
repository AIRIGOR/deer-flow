# Deployment Train 01 — staging review candidate

October 31, 2026. Local application candidate prepared; remote deployment/production certification remain unapproved. Status: PARTIAL pending access/configuration, cloud/Linux build and hosted acceptance.

## Included and held capabilities

The candidate consolidates Session 08 checkpoint/delegation validation, Mission 04 SQL history, workspace conditional writes, approval-denial contracts, human-binding adapter and Session 09 Founder simulation. It starts at Session 07 revision `006ea4b87d4a13405248c86dec2bb3087ac19197`. Only application changes and Guardian guidance were copied. No SENTINEL implementation, machine contracts, scripts or CI jobs were imported from the separate certification candidate. Its independent review/enforcement remains a mandatory production blocker.

On exact staging site `96331e39-86a9-45a3-910c-edd321d60bb7`, Founder simulation requires `RIGOR_STAGING_DRY_RUN_ENABLED=true` in Functions scope and the existing separate Founder token. Unknown sites, missing flag/token and privileged intents fail closed. Token possession remains simulation capability, not a verified human Founder assignment. Hosted real Founder research/pulse modes are denied; staged legacy worker records become BLOCKED. The staging gateway, scheduled dispatch, company pulse/action workers and external outreach return before live execution. This gate does not rely on a browser-provided environment claim.

The static Founder interface offers only enabled simulation, with disabled live choices. Product entry links it and states the actual scope. Health reports draft operations and blocked live intelligence. Existing sample/show selection, documents, requirement/conflict review, change-impact, department summaries, reports and calculated readiness remain draft workflows. Upload bytes can be saved, but model-backed analysis is blocked and cannot establish readiness/source approval. Deterministic John briefs/fixtures remain; live John requests are explicitly rejected. This is the safe degraded mode, not fabricated agent output.

The backend source is included for review/tests; **do not deploy or enable live backend execution in this train**. Existing evidence-backed 3NETRA contracts remain locally tested, but actual delegated execution and paired deployment are held. No SQL/Blob sync, migrations on production, automatic approval or real external action occurs.

## Verification and defects repaired

- Final relevant frontend command `npm run netlify:build`: TypeScript PASS; 165 tests PASS in 12 files (1.67s). This runs the complete app set once after policy integration.
- Candidate-source backend CI set plus five directly affected bootstrap/migration modules and the Windows permission module: 207 PASS, 2 POSIX-only skips, existing Starlette/httpx warning (19.74s). Import probe confirms candidate harness path, not the primary editable checkout.
- New staging policy suite: 6 PASS. Earlier focused check exposed two obsolete live-John expectations; updated tests now require 403 and unchanged draft state. Existing production logic was not rebuilt.
- Fresh locked physical install from offline cache: 98 packages, no new package/dependency or lifecycle scripts. Rechecked affected policy tests (6 PASS/401ms) and real PDF packet tests (2 PASS/833ms). The primary dependency directory is preserved.
- Both complete and production-only npm audits: zero vulnerabilities. Targeted 12-file Python Ruff lint/format PASS. CI YAML, TOML and reference checks PASS.
- Existing cached CLI27.15.0 failed on a global configuration write restriction. No auth/config was altered. Used existing Netlify zip-it-and-ship-it16.6.0 directly for local package validation. All ten functions bundle. Initial shared dependency junction produced a nonportable link; replaced candidate-only junction with a locked physical install. Inspection then exposed absent dynamically loaded canvas files; added explicit included_files for three PDF consumers and verified native/module presence. Do not upload the Windows ZIPs; require a fresh cloud/Linux build.

Logs, source selection and final evidence are under the parent task's outputs directory (`train01-*`). The exact committed branch/revision and artifact hashes are recorded in `TRAIN01_DEPLOYMENT_MANIFEST.json` / `TRAIN01_RELEASE_REPORT.md` there after local commit. Local deploy-meta is regenerated with that commit; null pre-commit metadata is not deployment provenance.

## Target, configuration and blockers

Only Netlify `rigor-staging` / `96331e39-86a9-45a3-910c-edd321d60bb7` is proposed. Its production deploy context means the published deployment **of the staging site**, not the live production application. Base `rigor_beta`, build `npm run netlify:build`, publish `app/static`, functions `netlify/functions`, Node24. The static output and all ten function entrypoints form one frontend release; no partial function upload.

Current provider metadata confirms SSO on all deploys. Unauthenticated staging health returned401 in0.6s; this is an access gate, not proof of application health or successful auth. Published deploy `6ae21f1d3d075a6c5aa280d3` is still older source `24d7630f59e316fe5f1d5fdac7cee5e8733e16a1`. Staging backend health timed out after35s; cause remains unknown without authorized Render diagnostics. No backend credentials/model/persistence or effective tool isolation are verified. The default source database is memory; no restart durability is claimed. Windows ACL/Linux permission evidence remains open.

Required for the proposed frontend-only simulation: existing `RIGOR_FOUNDER_TOKEN` and new nonsecret `RIGOR_STAGING_DRY_RUN_ENABLED=true`, Functions scope, selected staging context. Neither value is created/changed here. Gateway/model tokens are **not required for the simulation**, and configured gateway credentials must not bypass the staging block. Existing gateway URL/token/John flag remain unchanged. SSO/operator access and scoped receipt reads must be supplied securely. No privilege assignment is implied.

Existing application CI jobs are `RIGOR CI` → `rigor-beta`, `rigor-core`; candidate branch/PR filters cover required changes. Hosted runs are unverified. Existing `RIGOR Company Release Gate` targets other live URLs and includes execution-related checks; it was not run or repurposed to approve this dry-run candidate. Independent/SENTINEL/Founder production release gates remain BLOCKED and are not waived.

## Controlled acceptance plan — not executed

1. After explicit approval, publish/review the exact candidate and cloud-build it for the staging site with SSO retained. Verify deploy-meta commit, platform site ID/context, dry-run flag and runtime dependency packaging. Configure token/flag securely only under separate approval.
2. With synthetic input only, enter the Founder token through the existing page. Select dry run and submit a fictional evidence review. Expect an idempotent command, server-created bounded plan, SIMULATED QA handoff, DRY_RUN_COMPLETE, human-identity/production-authority false and no real agent/action.
3. Read the exact command and `rigor-company:dry-run-receipts/{execution_id}` through authorized scoped access. Match command/execution ID, request/result/plan digests and local-simulation scope. Do not use a mutable latest pointer or treat the receipt as approval. Verify no staging gateway/model/outreach/schedule execution.
4. Negative paths: missing/wrong token→401/503; absent flag/unknown site/privileged intent→403; duplicate same key→one receipt; changed content/same key→409; missing evidence→422. In a synthetic draft workspace, stale ETag→409 and missing ETag→428 with newer state preserved.
5. Interrupted/late-write and receipt-failure cases use existing controlled local fixtures; do not kill a shared service or inject false remote evidence. Hosted fault injection requires a separately approved fixture plan. No remote scenario executed in this train.

## Rollback and approval boundary

If an approved staging deployment fails, stop new synthetic submissions and preserve
records/receipts. The safe fallback is an authorized cloud rebuild of this same
reviewed source with RIGOR_STAGING_DRY_RUN_ENABLED absent/false, then republish only
the staging site; Founder simulation is denied while live-execution guards remain.
Environment changes are frozen per deploy, so a settings edit alone is insufficient.
Keep SSO. No prior deployed revision has been verified dry-run-safe: do not blindly
restore older deploy 6ae21f1d3d075a6c5aa280d3, which lacks these guards. A code rollback
requires a separately reviewed safe revision and explicit approval. Blob records
are not rolled back; never delete/replay them automatically. No backend rollback is
needed because no backend deployment is proposed.

Founder approval is required for: publishing the exact branch/commit (Git CD may trigger builds); configuring the staging-only flag/token through secure settings; and building/deploying that exact source to the identified staging site. These actions are distinct from production promotion. None is performed here. Do not advance automatically.
