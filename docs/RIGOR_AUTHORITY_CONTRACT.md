# Founder-approved authority contract — Mission 05C

Approved October 30, 2026 in the Mission 05C instruction. Policy approval is not an account assignment, verified implementation, production release or independent certification.

| Boundary | Approved contract | Current enforceability |
| --- | --- | --- |
| Production records | SQL will own authoritative shows, production requirements and approvals once integration is implemented and verified. Blob retains drafts/workspaces. | Independent stores remain independent; no mapping, migration or synchronization introduced. |
| Founder | Controls company policy and production-release authorization within authorized scope. | Existing Founder command token supports internal commands, not a verified gateway human Founder assignment or production-release grant. |
| Production manager | Explicitly assigned PM controls show-level signoff and scoped show audit visibility. | No inspected verified user-to-show assignment capability. Signoff and scoped audit access BLOCKED. |
| Department lead | Explicitly assigned lead controls own-department approvals. | No inspected verified user-to-show/department assignment capability. Department approval BLOCKED. |
| Every approval | Authenticated user identity plus verified assignment/scope; mandatory safety and certification gates cannot be bypassed. | Generic admin/user, threads permissions, tester roles, owner strings, service tokens, body/header role claims and execution receipts cannot establish these grants. |
| Audit access | Founder has company visibility within authorized scope; PM has assigned-show scope; others need explicit record access. Ordinary permissions cannot alter history. | No public audit endpoint is exposed. Internal repository history is a trusted process interface, not a user authorization surface. Scoped user access remains BLOCKED. |

## Minimum enforcement boundary

The application service must reject SQL `APPROVED` requirements and `SHOW_READY` / `SHOW_COMPLETE` show claims on both creation and update while verified assignments, approval persistence and mandatory gate evidence are absent. This intentionally permits no successful formal approval, including a generic administrator or claimed Founder. No synthetic grants or approval accounts are installed. The HTTP adapter returns 403 for these denied service operations; unauthenticated mutations remain 401.

Other requirement statuses (including source confirmation/rejection/resolution) and ordinary CRUD remain existing data/review operations. They are not authenticated department signoff or production release. An `owner` label is not an assignment. Do not consume existing or legacy status rows as proof of approval. Trusted direct repository/SQL callers remain outside this application-service boundary; no tamper-proof or database permission enforcement is claimed.

Blob checkpoint completion, conflict resolution, readiness and requirement review remain workspace draft decisions, not authoritative approvals. Snapshot authority metadata must say draft-only, unsynchronized and no production-release authorization. Existing calculated `SHOW_READY` scores do not confer release authority. This mission does not turn a tester session into a verified human approver or change synthetic-staging and Founder-reserved execution gates.

No public SQL audit read/update/delete endpoint is added while identity linkage and access assignments are missing. Approval attempts rejected before persistence do not create approval records or successful-change audit rows. Existing authenticated ordinary writes retain stable user/entity/show IDs and the Mission 04 transactional history contract, including `verified_approval=false`. Security-denial logging and an immutable approval ledger are not implemented here.

## Exact remaining implementation prerequisites

1. Verified human identity linkage between gateway users, Founder authority and any workspace identity; no inference from role text or shared tokens.
2. Explicit, revocable show/department assignments and company scope, backed by an approved persistence/admin-management contract. No assignments are assumed to exist.
3. Durable approvals binding actor, assignment, show/department, source/entity revision, decision, time and gate evidence; define rejection/revocation/invalidation behavior. Existing status fields and audit snapshots cannot substitute for this.
4. Mandatory safety/certification gate records and a non-bypassable server transition check, including external certification controls still absent.
5. Scoped audit-read policy, record grants, sensitive-field handling and retention. Expose no user audit endpoint before these are implemented/tested.

Session 02 remains BLOCKED. Session 08 can resume only as separately authorized development or synthetic verification retaining human-review gates; production approval/release or an integrated shared-truth claim is not cleared. Stop after Mission 05C.


## VS02 local contract, October 31, 2026

Gateway session identity can now be checked against a server-owned assignment-reader
contract via read-only /api/rigor/founder/authority. No production reader or grants
are installed; default remains DENY/503. Isolated tests verify tenant/scope matching,
revocation and actor references. Netlify command/receipt linkage is not implemented.
See RIGOR_SESSION09_VS02_EVIDENCE.md; this does not clear any approval/release gate.
