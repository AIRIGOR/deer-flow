# 3NETRA integration evidence

The company operator/action executor use DeerFlow's existing delegation runtime.
After the final result parses, the backend reads get_thread for the unique thread
used by that invocation and inspects its latest materialized checkpoint ledger.
Models cannot supply execution_evidence: an output containing that field is rejected.
The server adds the validated evidence to the result.

## Completion and reasoning contract

- An internal action requires exactly one completed registered company worker. An
  explicit owner must match that worker.
- A pulse requires six distinct completed company workers: five specialists and
  exactly one Chief of Staff. Task IDs are unique and belong to one recorded run.
- Missing history/checkpoints, mismatched threads/runs, unknown workers, failed or
  capped entries, missing result refs and malformed digests fail completion.
- Pulse findings contain a concise summary and evidence_ids. References may be a
  completed specialist name or actual task call ID; the server resolves names to
  the unique completed delegation ID. Unknown or duplicate references fail.
- Reconciliations contain topic, assessment, at least two distinct evidence IDs,
  status UNRESOLVED or PROPOSED_FOR_REVIEW, and approval_required=true. They are
  evidence comparisons and proposed human decisions, not operational resolutions.

The result's execution_evidence contains source DEERFLOW_CHECKPOINT_LEDGER, thread,
run and checkpoint IDs, model-output SHA-256 and the completed workers' task IDs,
names, status, runtime-reported result digests and result refs. Raw report text is
not copied into this proof. The existing checkpoint retains the original material.

## Durable integration receipts

The shared Netlify boundary validates company proof and pulse references before
saving VERIFIED. Each execution record and latest-operation pointer carry site and
deployment, the exact request JSON digest, emitted response JSON digest, and an
explicit verification_scope. Company scope is CHECKPOINT_DELEGATION_COMPLETION;
document/John scopes retain their narrower citation/advisory meanings.

Existing pulse/history, action-result and Founder-command persistence keeps the
returned result/proof alongside X-RIGOR-Execution-Id. A verified-pointer storage
failure rejects the request and attempts FAILED records; it cannot return success.
Coherent-flow review requires both prerequisite receipts from the current deploy,
with a company checkpoint-completion scope and nonempty execution IDs.

## Verification and release boundary

This is a protocol tightening. Backend and Netlify must be staged together at the
same reviewed change. Legacy company bodies without proof are rejected; there is
no silent metadata fallback. Local tests use fictional/stub checkpoints and also
exercise the real ledger producer's message format. They do not run live agents.

Receipt fields establish recorded completion and reference presence. They do not
verify semantic entailment, source truth, the digest's full underlying report, or
that synthesis began only after every specialist finished. Ledger digest semantics
remain those of the existing runtime producer; some metadata may be bounded/fallback
material. There is no independent signature/attestation or immutable audit ledger.
get_thread materializes history and can add latency or fail when persistence is
unavailable; such failure blocks completion rather than inventing proof.

Execution-record and latest-pointer writes are separate operations, and downstream
company result writes are separate again. This is not an atomic multi-store commit
or exactly-once claim. Historical receipts without deployment scope do not establish
current-deployment proof. Receipt hashes exclude authentication headers; no tokens
or credential-equivalent digests are persisted in these receipts.

Founder/external-action policy, synthetic John gates, human source review and
operational conflict approval remain required. Live synthetic staging, deployment
compatibility, actual runtime receipts and prior release blockers remain open.


## Mission 06 recovery — October 30, 2026

Recovered existing Session 08; no rebuild. Existing backend server-created checkpoint
proof, registered specialist/owner checks, bounded delegation, human-review-only
contradiction assessments and scoped durable bridge receipts remain the integration
foundation. Existing Founder and service authentication are reused; no role grants.
Historical Session 08 105/217/128 test results are historical, not current full-suite
claims. Current focused results below verify the narrowed slice on this dirty source.

New safe slice: authenticated Founder worker redelivery reads command metadata with
strong consistency. A RUNNING command whose valid updated_at is at least 30 minutes
old becomes BLOCKED/INTERRUPTED_REVIEW_REQUIRED through an ETag condition. No automatic
reclaim/replay. The age threshold exceeds existing 10/13-minute gateway budgets but
only denotes uncertain completion, not proof of termination. Fresh RUNNING remains
untouched; missing/invalid timestamps cannot establish age and require manual review.
Claimed RUNNING ETag also binds COMPLETE/FAILED writes, preventing late workers from
overwriting newer state. UI stops polling BLOCKED and displays the review reason.
Recovery happens only on an authenticated worker invocation; no timer/scanner or
new public recovery endpoint was added. Existing Founder GET can read the record.

Interrupted execution may already have produced a result/receipt even while the
command becomes BLOCKED. Inspect actual execution evidence before any new command;
there is no rollback, cancellation, exactly-once or command/receipt atomicity claim.
Initial upload/dispatch acceptance cannot prove later completion. No automatic state
promotion, human approval or production release follows from completion evidence.

Regression before change: three focused recovery tests failed (stale RUNNING remained
RUNNING; late success/failure overwrote BLOCKED). After minimal repair: those three
passed. Final Founder/Founder UI/shared bridge tests: 42 passed, 641ms, three files;
includes five new worker cases and one UI case. Existing tests prove duplicate
claim suppression, unauthorized command rejection, durable proof/receipt linkage,
missing/invalid evidence, contradiction review restrictions, digest binding and
receipt-store failure behavior. Tests use in-memory Blob and stub gateway responses.

Focused backend evidence/operator/action-executor plus two company-auth tests:
52 passed, 5.56s, one existing Starlette/httpx warning. Real runtime ledger message
format is exercised with synthetic messages; no actual agents/models were invoked.
TypeScript and changed Python test Ruff/format pass. No full suite or M04/M05 rerun.
Raw current logs: outputs/mission06-backend.txt, mission06-product.txt,
mission06-typescript.txt outside repo; source/log hashes in mission06-preservation.json.
Source: HEAD 006ea4b87d4a13405248c86dec2bb3087ac19197 on
feat/rigor-session08-intelligence-receipts plus saved uncommitted work.

Windows failure reproduced exactly at blocking_io/test_channel_runtime_config_store.py
::test_runtime_config_store_file_is_owner_only: 0666 != POSIX 0600, 1 failed/7.51s.
Repair is test portability, not a storage security repair: skip two POSIX-only tests
on Windows, retain POSIX assertions elsewhere, retain chmod-failure logging/persistence
checks, add all-platform chmod-intent test. Module now 4 passed, 2 skipped (7.22s).
Windows ACL isolation and Linux execution are NOT VERIFIED. Production storage code
and credentials unchanged. Raw Windows before/after logs accompany Mission 06.

| Session 08 criterion | Current evidence / limit |
| --- | --- |
| Structured intelligence request | Locally verified with stub clients; existing schemas reused. |
| Authorized specialist delegation | Registry/owner/budget/policy/auth tests pass; live effective tool permissions unverified. |
| Evidence-backed output | Checkpoint/ref/digest validation tests pass; no semantic-truth or independent-attestation claim. |
| Consistent task/execution state | Conditional per-command transitions, duplicate/late-worker tests pass; no multi-record atomicity. |
| Durable receipts | Mock storage/proof/digest/failure tests pass; hosted persistence remains unverified. |
| Explicit error/blocked states | FAILED and interrupted-review BLOCKED paths tested. |
| Interrupted recovery | Authenticated redelivery blocks uncertain old RUNNING, preserves newer state, no blind replay; no autonomous recovery. |

Session 08 remains PARTIAL overall and NOT ready for independent certification.
Verified human assignments/approval storage/mandatory gate evidence remain BLOCKED
under Mission 05C; no approval-dependent production action is implemented here.
Paired exact-source staging, live specialist/tool permissions, actual runtime/receipt
correlation, hosted/Linux and Windows ACL evidence, independent review/protected
mandatory checks remain open. Next action: review this slice, then separately
authorize paired synthetic staging preflight on the same reviewed source; inspect
blocked command/receipt evidence manually before reexecution. No staging/deploy,
remote push, synchronization or Session 09 performed. STOP after Mission 06.


## Session 09 vertical slice 01 — local simulation boundary

The Founder command lifecycle now offers a dev/loopback-only LOCAL_DRY_RUN, documented
in RIGOR_SESSION09_VS01_EVIDENCE.md. It reuses the existing token-capability boundary,
command store, conditional worker lifecycle and Founder UI. The QA handoff is explicitly
SIMULATED, with no real specialist/model call or production action. Its receipt scope
LOCAL_SIMULATED_HANDOFF and DRY_RUN_COMPLETE status cannot substitute for Session 08
checkpoint delegation proof, VERIFIED bridge receipts, human approval or certification.
Actual final local tests: 56 pass across Founder/Founder UI/shared bridge modules;
TypeScript passes. Earlier live/staging/identity/ACL blockers remain unchanged.
