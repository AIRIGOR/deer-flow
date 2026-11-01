# Session 09 — Founder Command Center, vertical slice 01

October 30, 2026. Locally verified **simulation only**. No hosted verification, real agent/model execution, production action or approval is claimed.

## Implemented lifecycle

Existing Founder UI → `/api/founder/commands` → existing token authentication → bounded intent/evidence validation → persisted execution plan → simulation-only authority check → existing worker claim/recovery boundary → simulated handoff to registered `rigor-qa-security` → conditional dry-run receipt → `DRY_RUN_COMPLETE` displayed to the operator.

The existing Founder token verifies possession of an internal command capability. It does **not** establish a named human Founder identity, assignment, company scope or production-release authority. Records explicitly retain `human_identity_verified=false` and `production_authority_verified=false`. The positive path authorizes only a local deterministic simulation; missing token/configuration and unverified stored simulation capability fail closed. Privileged intents remain BLOCKED even if the caller supplies `approved=true` or a role claim. No accounts, assignments, approvals, credentials, agents or services are created.

The simulator records an intended QA handoff and submitted evidence IDs/hashes. It performs no specialist tools or reasoning and sets `real_agent_executed=false`, `production_action_executed=false`, `human_review_required=true`. It does not emit a Session 08 checkpoint proof or VERIFIED bridge receipt. A plan mentioning an agent does not prove that agent ran.

## Local API contract

- Use existing token header `X-RIGOR-Founder-Token`; no credential is installed by this change. Only platform `dev` context plus loopback request host (`localhost`, `127.0.0.1`, `[::1]`) accepts `LOCAL_DRY_RUN`. Hosted/preview contexts are denied. The worker independently rejects hosted or missing-authority simulation records before any gateway call.
- POST body: `command` (existing 1–3900-character bound), `mode="LOCAL_DRY_RUN"`, explicit `intent="REVIEW_EVIDENCE"`, and 1–6 distinct `{source_id, text}` references. Source IDs are bounded alphanumeric/underscore/hyphen strings; text is nonempty and at most 2000 characters. Other well-formed intents create a BLOCKED record and return 403; malformed inputs return 422.
- A UUID `Idempotency-Key` is required and becomes the command ID. Conditional creation prevents replacement. The same key/content returns existing state; changed content or a collision with a different command returns 409. The UI retains the pending key before submission so an explicit retry after response loss does not create another simulation. No automatic submission retry is added.
- Plans describe validation, authority check, a simulated QA handoff and receipt persistence. The UI uses command text as a draft input reference, not as verified production evidence. It preserves the existing real-work mode defaults and adds an explicitly selected local option.
- QUEUED → RUNNING uses the existing ETag claim. Recent RUNNING is not replayed; an old RUNNING command becomes BLOCKED on explicit redelivery using Mission 06's review-only recovery. COMPLETE/FAILED/BLOCKED worker protection is retained; local completion is specifically `DRY_RUN_COMPLETE`.

## Receipt and state consistency

The existing company Blob store owns `commands/{id}` and `dry-run-receipts/{execution_id}`; simulation execution ID equals command ID. No new store/service is introduced. Conditional receipt creation preserves an existing receipt and fails closed on collision or storage failure. Only after receipt persistence may the worker conditionally finalize `DRY_RUN_COMPLETE` with that ID. Stale finalization cannot overwrite a newer command state. Receipt and command are separate writes: after interruption a receipt may exist while the command remains BLOCKED; inspect both before taking further action. No multi-record atomicity or exactly-once guarantee is claimed.

Receipt fields include command/execution IDs, `source=LOCAL_SIMULATION`, `verification_scope=LOCAL_SIMULATED_HANDOFF`, request/result/plan JSON SHA-256 digests, timestamp and both false real-execution flags. The request digest covers normalized command/mode/intent/evidence JSON; the response digest covers the exact JSON result. Plan evidence text hashes use JSON-encoded text. Authentication headers, tokens and credential-equivalent digests are excluded. Raw evidence text is not copied into the receipt or plan.

Existing Session 08 gateway receipt validation, specialist checkpoint completion and human-review gates are unchanged. Real internal research/pulse modes retain their prior authenticated path. A dry-run receipt cannot satisfy those completion or certification gates.

## Actual verification

Source: AIRIGOR/deer-flow, branch `feat/rigor-session08-intelligence-receipts`, HEAD `006ea4b87d4a13405248c86dec2bb3087ac19197` plus preserved dirty work. No Git commit/push, remote settings, staging diagnostics, deployment, model request, SQL migration or synchronization performed.

Initial missing-feature regression: valid local simulation returned 422 instead of 200 (1 failed, 21 skipped). After implementation: 22 Founder tests passed. The first browser/handler integration fixture failed because lazy mock DOM nodes were not initialized (51 passed, 1 failed); initializing those fixture nodes corrected it and the isolated browser/handler test passed. No production repair was required for that fixture failure.

Final command from `rigor_beta`:

```text
node_modules/.bin/vitest.cmd run netlify/functions/_shared/founder.test.ts netlify/functions/_shared/founder-ui.test.ts netlify/functions/_shared/deerflow.test.ts
56 passed, 3 files, 613ms
npm run check
PASS (tsc --noEmit)
```

Fourteen new cases plus 42 existing relevant cases. The browser integration test runs the actual UI script through the actual HTTP handler and worker functions using a VM DOM and in-memory Blob adapter; it is not a browser deployment or live provider test.

| Required check | Actual local evidence |
| --- | --- |
| Authorized local command | Token-authorized loopback/dev simulation completes without gateway/model credentials or fetch. Human identity explicitly remains unverified. |
| Unauthorized command | Missing/wrong token and missing configuration fail; hosted context and unsafe persisted simulation authority are rejected. |
| Missing approval | Privileged intent plus client approval/role claims remains BLOCKED; no simulation receipt is created. |
| Receipt creation/integrity | Correlated IDs, exact request/result digests, no credential fields, conditional creation; storage failure/collision cannot report completion. |
| Duplicate command | Concurrent same-key submissions make one receipt; changed content under the key is rejected; duplicate worker regression retained. |
| Interrupted execution | Old RUNNING becomes review-only BLOCKED without replay; recent RUNNING unchanged; lost HTTP reply can be explicitly retried with one receipt. |
| Stale state | A newer BLOCKED state survives receipt completion/late worker writes. |
| Founder status | UI displays DRY_RUN_COMPLETE and no-real-execution text, plan/authority limits and errors; no automatic polling after terminal simulation. |

Raw logs outside repo: `outputs/session09-vs01-tests.txt`, `session09-vs01-typescript.txt`. Entry backups/delta and preservation/source/log hashes are in `outputs/session09-vs01-entry`, `session09-vs01-delta.patch`, `session09-vs01-preservation.json`. Documentation/whitespace and Git/index/candidate preservation checks pass. Backend, Mission 04/05 suites, Windows tests and staging diagnostics were not repeated because their implementations were unchanged.

## Remaining blockers and next smallest step

This slice is COMPLETE as a token-capability-authenticated local simulation. Named human Founder verification, revocable scope/assignments, durable approval records and mandatory release-gate enforcement remain BLOCKED. No positive formal approval or privileged execution is implemented. Provider disk/restart durability, actual specialist delegation/tool permissions and hosted receipt correlation remain unverified; Session 08/Mission 07 staging blockers and Windows ACL limits remain open. Independent certification remains BLOCKED.

Next smallest development step: specify how existing authenticated human users will be explicitly linked to Founder scope, then implement one verified, fail-closed identity binding under a separate instruction. Do not infer it from this token or dry-run receipt. Do not expand this slice, deploy, execute staging or begin additional Session 09 work automatically.


## Recovery finalization — October 30, 2026

SESSION 09 VERTICAL SLICE 01: COMPLETE for the defined local simulation. The saved
13-file source/document hash set and both raw test/typecheck log hashes were verified
before this documentation-only finalization. Runtime code, tests and dependencies
were not changed. The recorded 56 passes (14 new + 42 existing) and TypeScript PASS
are reused; no suite was rerun. Source remains HEAD
006ea4b87d4a13405248c86dec2bb3087ac19197 plus preserved dirty work.

Missing final checks completed: node --check app/static/founder.js PASS; HTML unique
IDs, one local mode, preserved INTERNAL_RESEARCH default, input bound and script
reference PASS; git diff --check PASS. No separate JS/TS lint/formatter script is
configured beyond tsc; no package was added to manufacture such a check.

The original review delta had CRLF serialization and failed a check-only reverse
validation. A separate LF-normalized copy, outputs/session09-vs01-review-lf.patch,
passed git apply --reverse --check against the unchanged pre-finalization snapshot.
The original artifact and its recorded hash were retained. Neither patch was applied.
The checked patch excludes these final documentation addenda; do not apply it over
the existing work or describe it as a patch for the final documentation snapshot.
Current finalization hashes are in outputs/session09-vs01-finalization.json.

Only docs/RIGOR_BUILD_STATE.md and this evidence document changed during recovery.
All runtime/test files, prior missions, SQL audit/history, workspace concurrency,
authority controls and Session 08 work remain unchanged. Original index/HEAD/branch
and clean candidate e73228843209dd0d417adb3a1d38d4b1dc5613d0 are preserved.

FOUNDER DRY-RUN: PASS within the VM/in-memory-Blob local scope. This is not a live
browser/provider durability or restart test. LIVE EXECUTION: BLOCKED for this slice;
legacy internal paths were not invoked. Named Founder identity, production approval
authority, live agents, hosted authentication, staging receipt correlation,
independent certification and production deployment remain BLOCKED or UNVERIFIED.

NEXT MISSION: separately specify the explicit link between an existing authenticated
human subject and Founder scope; do not infer it from bearer-token access. No new
feature, agent, approval, staging diagnostic, deployment or further slice begun.
STOP after recovery finalization.
