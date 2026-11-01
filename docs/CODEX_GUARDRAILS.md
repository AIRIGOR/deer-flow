# Codex development guardrails

Permanent repository guidance established by RIGOR ASCENSION, Mission 01.
The root AGENTS.md is the entry point; applicable module guides retain ownership
of their detailed safeguards. This document adds a development workflow, not a
runtime guard, autonomous monitor or certification system.

## Before changing code

1. Read docs/RIGOR_BUILD_STATE.md and inspect branch, HEAD, git status and the
   relevant diff. Distinguish committed evidence from uncommitted work. Preserve
   existing working code, user changes and prior checkpoints; do not reset, replace
   or rebuild a functioning subsystem merely to simplify the task.
2. Use the root map and applicable module AGENTS.md. Search with bounded rg queries,
   then read relevant entrypoints, callers, contracts and tests. Reuse existing
   safeguards rather than introducing parallel implementations or copied policy.
3. Before coding, record measurable acceptance criteria, scope, exclusions and
   verification commands in the build-state checkpoint or a linked task document.
   Each criterion needs an observable result, including failure behavior where
   relevant. Documentation-only missions record document acceptance checks.
4. Perform an integration preflight: inspect affected callers and consumers,
   schemas, authorization, persistence/migrations, retries, deployment boundaries
   and dependency/runtime assumptions as applicable. Identify compatibility risks,
   baseline failures and required paired changes before implementation. Mark
   unknowns explicitly; do not treat inspection as proof of compatibility.

## Implement and verify economically

- Make the smallest change that meets the criteria. Avoid unsolicited refactors,
  dependency upgrades, infrastructure changes, mass formatting and rebuilds.
- Select the narrowest meaningful test from the affected path first. For behavior
  changes, capture a regression or baseline where practical, implement, then rerun
  the targeted checks. Broaden to affected integrations and required module/CI
  checks after targeted checks pass. A known baseline failure must be recorded;
  it does not justify calling the broader suite green.
- Follow module test obligations for the actual change. Documentation-only work
  checks content, links, scope and diff whitespace; do not run application builds
  or model calls without a change-specific reason.
- Reuse recorded results only for the same revision or an explicitly justified
  unchanged path and environment. Record that scope. Do not repeat passing checks
  unless subsequent changes, failures or unresolved concerns warrant it. Bound
  searches, output and fail-fast runs; avoid polling unchanged state and whole-repo
  dumps. Credit conservation never permits omitting required checks.
- For each failure, state a root-cause hypothesis and the discriminating check.
  Permit at most two unsuccessful repair attempts per hypothesis. After the second,
  stop speculative edits for that hypothesis, preserve evidence, and checkpoint the
  blocker. Continue with a different hypothesis only when new evidence supports it;
  renaming the same guess does not reset the limit. Seek missing input when needed.

## Protect authority and evidence

- Follow existing backend/AGENTS.md and rigor_beta/AGENTS.md controls for secrets,
  Founder authority, synthetic staging, approval gates and scoped receipts. Never
  print or commit secrets, tokens, credential-equivalent digests, cookies or raw
  sensitive configuration. Use redacted diagnostics and presence-only checks.
- Local implementation/build success does not authorize deployment, production
  mutations, credential changes, real-data ingestion or outbound commitments.
  Preserve production isolation and human approvals. Require explicit authorization
  for actions outside the task's scope; never weaken a gate to obtain a green test.
- Update docs/RIGOR_BUILD_STATE.md at meaningful milestones and before stopping.
  Record branch/base, changed scope, criteria, commands and outcomes, artifact/log
  locations, failed hypotheses and attempt counts when applicable, remaining
  blockers and the next authorized action. Keep earlier checkpoints accessible.
- Claims must name their verification scope: inspection, mocked test, local build,
  synthetic staging or live evidence. Record skips, warnings and failed checks.
  Never infer operational safety, exhaustive detection, release readiness or
  certification from unit tests, a build, status labels or receipt presence.
  Instruction files are guidance; they do not prove automated enforcement.

## Mission boundary

Mission 01 changes only development guidance and its checkpoint. Do not implement
SENTINEL, start another session or modify production under this mission. After
reporting protections, evidence and blockers, stop. The next mission requires a
separate user instruction and defined acceptance criteria.
