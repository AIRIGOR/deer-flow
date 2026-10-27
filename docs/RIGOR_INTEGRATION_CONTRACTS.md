# RIGOR integration contracts

Active directive session: 02, Architecture & Shared Truth. Current runtime baseline is staged commit `7371b4c944081bf83cef3160fc2e8f62981874c8`. Existing domain schema remains `docs/rigor/core-schema-v0.1.md`; this file documents boundaries and additive wire/storage contracts, not a competing domain database.

## Feature specification: source identity v1

Every newly uploaded document must bind its workspace, production and immutable document ID to the SHA-256 and byte length of its saved bytes. Background parsing must verify this binding before model execution and preserve it through retries. Every newly accepted or locally reconciled requirement must retain this exact source binding plus its existing requirement ID, page and quotation. Equal filenames are display labels and must not collapse distinct uploads.

Acceptance criteria:

1. Upload acceptance persists a `rigor.source.v1` typed source envelope and raw bytes before returning 202.
2. A byte/hash/identity mismatch fails the document before any gateway request, preserves evidence, and leaves readiness blocked.
3. New model and reconciliation requirements carry the matching document source envelope. Existing requirement IDs and human decisions survive retries.
4. Two uploads with the same display filename keep separate source identities and candidate records.
5. Old records remain readable without a destructive migration. Legacy records are not retroactively relabeled as hash-verified evidence.

6. Workspace mutations commit only if the read ETag still matches; stale interactive mutations return 409 and preserve the winner's state and events.
7. An upload job reserves one durable execution claim before parsing/model execution. Overlapping deliveries and uncertain reservations cannot redispatch it. Explicit retry creates a new job capability.

Machine schema: `contracts/rigor/source-provenance.v1.schema.json`. Runtime type and verifier: `rigor_beta/netlify/functions/_shared/source-provenance.ts`. A legacy pending job without a binding can capture currently saved bytes with basis LEGACY_PROCESSING; this does not verify its original upload. Existing processed history is not migrated.

Workspace records and their embedded events now share a revision-checked single-object commit. This does not establish a transaction across raw upload, capability/job, claim, integration receipt and workspace keys, immutable event storage, a complete revision/dependency graph, or authenticated multi-user collaboration. Those remain explicit Session 02 exit gaps.

## Canonical aggregate and recovery contract (October 27 checkpoint)

The canonical transaction boundary is one workspace aggregate: show state, requirement decisions, conflicts, checkpoints and their embedded events commit together against the read ETag. Upload objects, job capabilities, execution claims and integration receipts are evidence/dispatch artifacts; they are not competing authoritative show records. There is no global ACID transaction across these keys, and none is claimed. Blobs suitability for future transactional scale remains an architectural limitation; do not introduce financial state, counters or a silent database migration into this pattern.

The fail-closed recovery contract is measurable:

| Failure boundary | Required behavior / executable evidence |
|---|---|
| Raw write fails | No upload accepted, no document committed, no dispatch, sanitized 500. Unit regression. |
| Raw saved but workspace CAS loses | 409; winning canonical state/event history preserved; no job dispatch. Orphan raw bytes are retained as noncanonical evidence, never a ready document. Unit regression. |
| Workspace intent saved but job write fails | Document remains PROCESSING and blocks readiness; no gateway request. Explicit retry after the existing processing timeout creates a new fenced attempt. Unit regression. |
| Process dies after a request starts | Original claim/receipt/source remain; same-job resume cannot repeat the request or claim completion. Docker and real-cloud-store process-kill proof. |
| Verified analysis saved, canonical commit not reached | Verified receipt is correlated privately to exact attempt/source; document remains PROCESSING. No automatic application or redispatch; explicit retry can apply one result. Docker and real-cloud-store proof. |
| Canonical state changes before worker commit | Stale CAS rejected; new edit/selection survive; worker records FAILED and WORKSPACE_CONFLICT on a fresh snapshot. Real-cloud-store concurrent-edit proof. |
| Old callback arrives after a new retry | Saved attempt ID fences both success and failure; old dispatcher failure cannot mark the new attempt failed. Unit regressions. |

Each new upload/retry commits a public non-capability `analysis_attempt_id` (hash of the private job capability) with its canonical PROCESSING intent. `rigor.analysis-context.v1` binds that attempt to `rigor.source.v1` in private integration receipts and a per-attempt index. The context is not sent to the model as authority and is excluded from public health projection. Private capability values are not written to workspace events. Legacy processing records use their captured processing_started_at as a compatibility fence.

Reconciliation is conservative: a receipt proving analysis is not proof of a committed show update. Unknown work is never automatically replayed; operator-authorized retry creates a new attempt while prior evidence remains. Source requirements become authoritative only through the canonical commit and existing human gates. These guarantees do not certify live model accuracy, every possible distributed failure, a tamper-proof ledger against privileged storage owners, deployed-platform invocation/recovery, retention cleanup or disaster recovery. Those remain explicit release/security/operational gates rather than invented transaction guarantees.

## Existing service boundary

RIGOR Netlify functions own product workspace mutations and show readiness. The DeerFlow analyze endpoint accepts `document_name` and `pages`, returns candidate requirements with source pages/excerpts, and has no authority to mark the product show ready. The company pulse/action endpoints return separately verified execution records and proposals. Runtime authentication uses an environment-owned service credential. Credentials and provider configuration are not part of stored requirement envelopes.

AKHASHA is the authority/application boundary; the separately discovered Akhasha foundation is not wired into this product by assumption. 3NETRA is the governed orchestration/company-operator layer in the current adapter, not a second writer of production facts. Backend RIGOR SQL entities are an existing separate implementation; no bidirectional synchronization or cross-store atomicity is claimed. Until an explicit migration/ownership contract exists, do not write the same show simultaneously through both persistence implementations.
