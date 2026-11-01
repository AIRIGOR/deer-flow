# Core SQL audit history — ASCENSION Mission 04

Local implementation/verification only. No production migration or deployment.
Session 02 overall acceptance and independent certification remain **BLOCKED**.

## Demonstrated defect and supported contract

The three core entities, RigorShowRow, RigorDocumentRow and RigorRequirementRow, had
nine repository create/update/delete methods that committed current rows without
durable before/after history. The initial regression failed because list_history
did not exist. Existing run-event stores are tied to agent runs and are not reused
as a general event-sourcing system. Company operating-state history is a separate
domain and is not newly certified here.

Core IDs remain their existing string IDs (normally UUIDs); no entity-ID migration
or reassignment workflow is introduced. Existing gateway threads:read/write checks,
show-source integrity and Mission 03's document owning-show guard remain. Actor
identity can be recorded from middleware AuthContext.user.id without deciding new
role-based approval authority. Recording a status is not granting approval.

## Implementation and transaction boundary

Additive table rigor_audit_history uses existing SQLAlchemy/Alembic. Each event has
audit ID, entity type/ID, show ID, CREATE/UPDATE/DELETE action, changed business
fields, UTC timestamp, before/after state, actor kind/ID, correlation, source label,
document/page references and status-change context. No source/user foreign key
deletes history. There is no application history update/delete interface.

RigorRepository._commit_with_audit snapshots pending core changes, flushes business
rows, refreshes non-deleted rows, inserts history, then commits the same session
once. The refresh makes after-state match database-normalized values returned by
the repository. Audit-insert failure
rolls back the business flush and deletion effects. It never logs a successful
event in a separate transaction. Session close on an exception uses existing
SQLAlchemy rollback behavior. The transaction boundary remains one repository
mutation, not an atomic sequence of multiple manager calls or remote stores.

Show deletion explicitly includes core child deletion snapshots. Document deletion
includes SET NULL changes to referencing requirements and superseding documents.
Those events share correlation/time with the initiating mutation. History remains
queryable internally after source deletion. Requirement show transfers, where
already permitted by the manager, retain before/after show IDs; internal history
queries include both involved show scopes and exclude unrelated mutations.

No-op business updates retain their timestamp and create no event. Missing/repeated
deletes create no invented history; duplicate creates retain the existing primary-key
failure and rollback. This is not a new exactly-once request protocol: retrying a
create without a stable client-supplied ID may still create another real entity.

## Actor, correlation, privacy and approval boundaries

All nine gateway mutations pass the existing authenticated request to the audit
scope. USER means authenticated subject, which can be a service account; it is not
an independent human-approval attestation. Body/header actor claims are ignored.
Each request gets a server UUID correlation and a route-template source label;
cookies, auth headers and caller-supplied request IDs are not copied into history.

Trusted direct callers default explicitly to SYSTEM:rigor-core, with a fresh
transaction correlation. A scoped AuditContext can identify a specific trusted
process/job. Context resets after the operation; it is attribution metadata, not
an authentication mechanism for arbitrary in-process callers.

Status transitions include previous/new values and verified_approval=false. Existing
permission and Founder approval boundaries remain separate. No actor UUID, status
label or audit event certifies delegated approval ownership.

Source excerpts and storage locators are replaced with redacted SHA-256 markers.
Other snapshots retain relevant business fields, which can still be sensitive and
must remain protected with the application database. No public audit read/export
endpoint is introduced. Before exposing history, specify per-show read authority,
retention/redaction and approval roles; those unresolved decisions stop that portion.

## Migration and compatibility

Source head d94e7a2c6105 follows c8e7d9a1f203. The migration only creates the audit
table/indexes; it does not invent events for existing rows. A later actual mutation
may capture an observed legacy row as its before state, without claiming an earlier
creation event. Existing current-head test pins move forward; prior migration
files are unchanged. Fresh-schema/Alembic parity and old-data upgrade are tested
on temporary SQLite only. Production schema/app rollout requires Founder approval.
Downgrade removes the history table; no production downgrade is authorized.

Existing return shapes and entity IDs are unchanged. The relevant behavior change
is event-free no-op updates with an unchanged updated_at. Normal business updates
retain their existing updated_at behavior. No new package, model service, Blob-to-SQL
adapter, public history endpoint or SENTINEL infrastructure is introduced.

## Actual verification

- Initial missing-history regression: 1 failed, AttributeError for list_history.
- First lifecycle batch: 10 passed before a reserved-email fixture failed validation.
  The fixture was corrected to example.com; the remaining four cases passed.
- Final core/audit/regression suite: 34 passed in 14.73s, one Starlette/httpx warning.
- Impacted migration/bootstrap/head-pin suites: 36 passed.
- Expanded authenticated mutation test: 1 passed, exercising all nine HTTP CRUD
  paths and denying body/header actor forgery. This replaces the earlier narrower
  version of that same test, not an additional unique test case.
- A database-roundtrip snapshot regression failed for an offset-aware timestamp.
  Refreshing non-deleted rows inside the transaction corrected the audit snapshot
  without changing existing timestamp storage semantics; targeted and final runs pass.
- The preservation check caught Unicode comment encoding changes from the five
  head-pin edits. Original bytes were restored except revision literals; test logic
  is unchanged, so the passing migration suite was not repeated for that correction.
- Cases cover all three entity types, stable IDs, archive/status context, redaction,
  no-ops/repeats/duplicate ID, history after deletes, SET NULL/cascade history,
  create/update/delete audit-failure rollback, scoped system attribution, 401/403
  denial with no writes, cross-show history and migration without backfill.

The new module enters the existing focused RIGOR CI command. Hosted CI, PostgreSQL,
production migration, real identity-provider execution and live cross-store behavior
are not verified. No full repository suite or unrelated product tests were run.
Raw logs and source/preservation evidence are in outputs/mission04-evidence.

## Remaining limits and next smallest mission

The repaired guarantee is future core mutations through RigorRepository. Raw SQL,
external ORM/bulk writes, company-state records and Netlify workspace mutations are
not intercepted. Administrator tampering, retention controls and concurrent update
ordering/linearizability are not guaranteed by this table. No signed/immutable
ledger or complete historical backfill is claimed.

Remaining P1 requirements: shared SQL/Blob authority and ID/version handoff,
cross-store consistency, explicit per-show/approval ownership and protected history
read/retention policy. Existing exact-candidate deployment, Windows baseline and
independent trust/enforcement gates remain. Session 02 is BLOCKED overall; the
demonstrated core repository history defect is locally repaired, not independently
certified across every writer/system.

Next smallest recommended mission: agree the SQL history read/retention and actor/
approval-ownership contract using existing principals, then verify denied access.
Do not start a shared-state migration or deploy from this recommendation. Stop
after Mission 04.
