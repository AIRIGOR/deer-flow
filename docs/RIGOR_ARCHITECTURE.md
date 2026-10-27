# RIGOR architecture and ownership

Directive session 02 checkpoint, October 26, 2026. Status: PARTIAL. This is the ownership map for the inspected system, not an assertion that every intended boundary is deployed or certified.

| Boundary | Current implementation | Authority and canonical state |
|---|---|---|
| AKHASHA authority | Founder-authenticated Netlify endpoints plus policy gates; separate `AIRIGOR/akhasha-ai` foundation | Founder decisions remain authoritative. The separate foundation is not an active RIGOR identity provider or synchronized database. |
| 3NETRA orchestration | Existing DeerFlow company pulse/action path, registered specialists and chief synthesis | Produces proposals and execution evidence; cannot replace source facts or grant Founder approval. No separate competing production state. |
| RIGOR production operations | `rigor_beta/netlify/functions/rigor-api.mts`, shared model and authenticated product sessions | Workspace/production state in site-scoped Netlify Blobs owns the deployed evaluator workflow, requirement IDs, human reviews and readiness. |
| DeerFlow intelligence | `backend/app/rigor_service.py` or gateway RIGOR router; runtime harness | Returns candidate analysis and runtime-correlated receipts. No permission to set a product show ready or approve external effects. |
| Backend RIGOR persistence | Existing SQL models/repository/manager | Separate implementation, not an automatically synchronized mirror of the Netlify product workspace. Do not dual-write a show through both stacks. |
| Reports | Existing Master/department PDFs from product state | Derived views, never a source of approvals or a second editable requirements database. |

Dependency path: authenticated product intake -> saved source bytes and metadata -> capability-protected background worker -> authenticated DeerFlow analysis -> validated candidate provenance -> product requirements -> human confirmation/ownership/source review -> conflict and checkpoint gates -> derived reports. Company operations use a separate company store and execution queue. Source facts, model assessments, approvals and execution receipts have distinct meanings.

Existing company queue code uses conditional claims and revisions. Product workspace saves now use the ETag read by loadWorkspace, committing state and embedded events together or rejecting stale interactive requests with 409. Upload jobs reserve a durable per-job claim before parsing/model execution; an uncertain claim is not a completion receipt and prevents automatic replay. Local concurrent-write and overlapping-worker tests pass. Strong reads alone would not provide this protection. Cross-key upload/job/claim/receipt persistence, crash recovery and externally verified concurrency remain critical consistency gaps. No storage engine was replaced or migrated by this checkpoint.

New source identity v1 is additive: a document ID, workspace/production scope, raw-byte hash, length and capture basis accompany new requirements. Requirement IDs are not rewritten. Filenames are labels. Legacy records remain readable and unverified legacy history is not upgraded to verified original-upload provenance. The hash detects mismatch against the stored application binding; it is not a tamper-proof ledger against a privileged store owner.

Runtime deployment target is the SSO-protected `rigor-staging` site. The latest previously verified platform deploy is `6adfeeb2bfc468bb5cb6b4b1` at commit `7371b4c944081bf83cef3160fc2e8f62981874c8`. This checkpoint's source changes are local until its evidence log records publication. Staging gateway URL/token were absent in the last connected configuration inspection. Secrets belong to runtime-scoped secure platform configuration, never these documents or client bundles.

Role-based invited collaboration, an append-only audit ledger, cross-store transactions, complete change-impact edges and Akhasha identity integration are not established by the current code. See release gates before advancing or claiming commercial readiness.

## Session 02 acceptance decision, October 27

Retain the existing canonical workspace aggregate and protect its commit with the read ETag; do not create a second writer in backend SQL. Domain facts and embedded event history commit together or not at all. Raw uploads, capabilities, claims and receipts are artifact/journal records, not alternative approved show state. A partially saved artifact cannot make a show ready. Unknown execution is retained, privately source/attempt-correlated and never automatically replayed; explicit user retry creates a new fenced attempt. This is fail-closed aggregate consistency, not a distributed ACID transaction.

The accepted Session 02 recovery boundaries are specified in RIGOR_INTEGRATION_CONTRACTS.md and tested with 224 application regressions, two actual Docker process kills, and three actual Netlify-store worker scenarios including a racing show edit. The cloud tests use synthetic model responses and host processes, not deployed function invocation. This closes the previously unverified bounded recovery gate without claiming every distributed failure is solved.

Blobs is not a transactional relational database. Preserve this legacy implementation while planning any future SQL ownership/cutover with compatibility and migration evidence. Do not add cross-workspace financial transactions, counters/balances or multi-aggregate atomic business effects to this pattern. Broad disaster recovery, audit tamper resistance, retention/orphan cleanup and real operating cycles remain launch gates; they have not been waived by this architecture acceptance.
