# Retrospective Sessions 01–02 verification — ASCENSION Mission 03

## Mission 04 current status — core SQL history locally repaired

The specific SQL repository gap below is repaired for future show/document/
requirement mutations using one transaction for data and durable audit rows.
Creation/update/deletion effects, authenticated actor attribution, no-op/retry
behavior, redaction and rollback are locally verified (34 core/audit plus 36
migration regressions; expanded nine-route actor test passes). See
RIGOR_SQL_AUDIT_HISTORY.md. Earlier FAILED history findings below retain their
historical scope; no historical event backfill or all-writer guarantee is claimed.

Session 02 overall is BLOCKED, not certified: shared SQL/Blob authority and
consistency, approval ownership and history read/retention policy remain open.
Independent certification remains BLOCKED. Session 01's build/deployment limits
are unchanged. No next mission, production migration or deployment begins here.

## Recovery finalization

Mission 03 review/checkpoint work is COMPLETE; acceptance remains incomplete.
Session 01: BLOCKED (clean-build reproducibility NOT TESTED, deployment provenance
unverified). Session 02: FAILED full change-history acceptance, with authority,
cross-store consistency and approval ownership still BLOCKED. Independent
certification remains BLOCKED.

Reused results: 21 backend tests passed (the nine new foundation checks are a
subset), and nine selected product tests passed with 56 unselected. No tests were
rerun during recovery because product/test source is unchanged. The finalization
script checks preservation and rewrites only external evidence/patch files.
Separate local checks pass: YAML parsing, regression module present in rigor-core,
Ruff lint, Ruff formatting and git diff --check. Hosted CI remains NOT TESTED.
No clean build, full suite, live/staging proof or independent review was performed.

The prior compound command did not execute: automatic approval review could not
complete due to a usage limit, not an unsafe-action determination. This recovery
uses separately authorized simple checks and does not repeat that command.

Priority: separately authorize a shared-authority/ID and attributable-history
contract before related implementation; retain approval-ownership and deployment
gates. No next repair or session begins. See the supplemental failure register.

Local verification only. **Independent certification remains BLOCKED.** These are
the user's retrospective roadmap criteria; this document does not assert that
formal Session 01–02 artifacts or completion records existed historically.
No Session 03 review/development or later session is begun.

## Scope and provenance

Primary AIRIGOR/deer-flow worktree remains on
feat/rigor-session08-intelligence-receipts at
006ea4b87d4a13405248c86dec2bb3087ac19197 plus preserved dirty work and this repair.
Clean certification candidate remains e73228843209dd0d417adb3a1d38d4b1dc5613d0 on
feat/rigor-guardian-sentinel-candidate in its separate worktree. Neither branch is
published, merged or deployed by this mission. Candidate source/contract/tests and
the SENTINEL implementation are unchanged; no independent reviewer is invented.

Source-bound local records, selected-command logs, input hashes, inventories and
preservation evidence are in outputs/mission03-evidence outside the source tree.
Independent review, trusted provenance, policy ownership and protected hosted
enforcement remain unmet. Existing SENTINEL evaluates the local execution records;
its implementation/policy are not expanded or made authoritative by local PASS.

## Session 01 — Repository & System Audit

| Criterion | Local status | Evidence and practical limit |
| --- | --- | --- |
| Repository and branch inventory | VERIFIED | Git root/remote/HEAD, seven local branch refs and two worktrees inventoried; candidate clean and original index preserved |
| Dependency mapping | VERIFIED | Backend uv workspace/lock, product npm lock and frontend pnpm lock mapped to existing components; runtime versions recorded; no new installation or current vulnerability claim |
| Architecture documentation | VERIFIED | Root/module guides plus ownership map below describe actual code paths; retrospective documentation, not a fabricated historical artifact |
| Reproducible build | NOT TESTED | Reused historical Session 08 offline packaging success (10.4s), typecheck and 128-test logs with bounded source justification; no fresh clean-install build or reproducible artifact comparison |
| Baseline tests | VERIFIED | Scoped core SQLite/manager/router and selected product state/approval/history checks pass; no full-suite success inferred |
| Known-blocker register | VERIFIED | Existing SENTINEL registry retained; remaining foundation gaps and repaired ownership defect recorded here; unresolved Windows/staging/trust issues retained |
| Source/deployment provenance | BLOCKED | Local source/dirty snapshot identified; no exact-source deployed candidate/model/staging receipt or independent hosted evidence established |

Earlier full/product audits and build logs are historical results, not current
security/deployment guarantees. Reuse avoids rebuilding functioning components.
The Windows POSIX owner-only assertion remains an existing broader-suite failure;
it was not rerun or repaired here. Missing clean-build/deployment proof is not PASS.

## Session 02 — Architecture & Shared Truth

| Criterion | Local status | Evidence and practical limit |
| --- | --- | --- |
| Canonical production state | BLOCKED | Netlify has a canonical per-workspace ProductionState, while Python SQL stores separate show/document/requirement records; no demonstrated shared cross-store authority/ID mapping |
| Stable entity IDs | VERIFIED | Synthetic SQL create/edit/snapshot IDs remain stable; product migration/isolation checks retain existing records; filename-based source linkage is a separate unresolved identity limitation |
| Documented integration contracts | VERIFIED | Current request schemas and RIGOR_INTEGRATION_CONTRACTS.md plus interface map below describe existing boundaries; live end-to-end or complete versioned shared-state contract is not verified |
| Authorization and approval ownership | BLOCKED | Unauthenticated core mutation is denied and nonboolean product signoff rejected; coarse permissions/display-name actors do not establish role-specific approval ownership or independent review |
| Cross-component state consistency | BLOCKED | Local same-show references repaired; per-production isolation and schema parity pass. No SQL/Blob replication, common concurrency contract or exact deployed consistency proof |
| Auditable change history | FAILED | Product events/selected before-after traces exist and pass scoped tests; SQL core updates overwrite current rows without an application history entry. The roadmap's complete update-history acceptance is not implemented across both stores |

FAILED history coverage is a source-inspection acceptance finding, not a claim that
the executed tests failed. Passing narrow tests cannot clear that broader criterion.
An immutable ledger was not an added requirement; even ordinary complete historical
coverage is not demonstrated by the SQL update path. Product events remain mutable
workspace records, not independently authenticated receipts or exhaustive history.

## Actual ownership and interface map

| Component | Owns | Existing path/contract | Does not establish |
| --- | --- | --- | --- |
| Netlify RIGOR product | Tester session, workspace and operational production aggregates; derived readiness, human checkpoints, documents/requirements/events | rigor_beta/netlify/functions/rigor-api.mts; _shared/model.ts; strong-consistency Blob store selected by deploy context | Per-key save is not atomic multi-writer coordination, SQL replication or engineering approval |
| DeerFlow Python core | SQL show/document/requirement records, controlled enums, UUID creation, same-show service integrity | deerflow.persistence.rigor; deerflow.rigor.manager; authenticated /api/rigor/shows/document/requirement routes | A stored SHOW_READY field is not the product's computed readiness or an operational clearance |
| Netlify–DeerFlow bridge | Bounded analysis/advice requests, source references, authenticated transport and operation receipts | _shared/deerflow.ts; app/rigor_service.py; RIGOR_INTEGRATION_CONTRACTS.md | It is not an adapter that mirrors every workspace entity into SQL |
| Human/Founder boundary | Human review/signoff in authenticated workflow; separate Founder authority for reserved actions | Existing product API and documented Founder policy | Tester role/display label is not proof of independently assigned approval ownership |

The browser product does not make SQL snapshots authoritative merely by sharing the
RIGOR name. Current Python and product document-type vocabularies/record shapes are
not a demonstrated common canonical state contract. Before shared-state-dependent
work, approve one authority/identifier/version handoff and test it; do not silently
merge stores, reinterpret status labels or rebuild the architecture in this mission.

## Actual defect, minimal repair and prevention

S02-OWNERSHIP-01: the document update route accepts show_id. RigorManager previously
validated the target show but not incoming requirement/supersession dependents.
Moving a document to another existing show could leave either dependency pointing
across show boundaries. Two synthetic SQLite regressions failed before repair.

Minimal service repair rejects changing an existing document's owning show with
RigorConflictError (the existing service error mapping produces HTTP 409). Same-show
metadata edits continue to work and preserve document/requirement/show IDs. No
reassignment workflow, data migration or automated dependent movement is added.
Existing low-level SQL mutation is not promoted to an external safety boundary;
direct database writes/concurrent external changes are not certified here.

Preventive checks cover both dependency types, stable IDs after an ordinary edit,
five service/ORM enum sets and denial before unauthenticated mutation. Existing
manager/repository/router regressions and fresh SQLite/create_all-versus-Alembic
schema checks preserve surrounding behavior. Both raw rows and API statuses must
retain their scope; never infer human approval from enum membership.
The new foundation module is added to the existing focused RIGOR CI test command;
no SENTINEL job/validator/policy is expanded. Hosted execution is still unverified.

Broader gaps need design/ownership evidence, not a speculative patch: define shared
authority and IDs, prevent filename collisions, assign approval ownership, and cover
all core/product mutations with attributable history. Retain each as an open blocker.

## Executed and reused evidence

- Ownership before: 2 failed, 7 deselected. Root cause confirmed in update_document.
- Targeted repair checks: 9 passed; 12 relevant existing core/migration checks passed.
- Final formatted-source combined backend run: 21 passed in 6.00s, one existing
  Starlette/httpx warning. This confirms the final code; intermediate runs are not
  counted again as additional unique tests.
- Selected product checks: 9 passed, 56 deliberately unselected; two test files only.
- Ruff import/format corrections are mechanical; relevant final checks/logs record
  the final source. No unrelated formatting, dependency update or broad test run.
- The first broader command had a misspelled test selector: no tests ran. Corrected
  selector passed; the collection error is retained separately, not a product defect.
- Starlette/httpx deprecation warning remains. Prior Windows broad-suite failure,
  staging gaps and certification blockers are not repaired or hidden.
- Existing product logs (128 passed/typecheck/build/audits) and Mission 02D foundation
  evidence are reused within stated source scope; no Mission 02 diagnostics repeated.

No current hosted or independently authenticated test execution is claimed. No
SENTINEL expansion, service start, external message, deployment or secret change.
One behavioral root-cause repair succeeded; no unsuccessful repair loop occurred.

## Progression decision and stop

Missions 04–06 can be considered only as separately authorized, bounded local
verification with these blockers carried forward. This is not a blanket approval
for shared-truth-dependent implementation, release, independent certification or
production changes. Those decisions require the unresolved authority/history/
approval/provenance work and actual external trust controls. No later session is
started here. Stop after reviewing Sessions 01–02.
