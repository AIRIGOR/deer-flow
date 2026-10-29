# RIGOR agent contracts

The canonical read-only inventory is
`backend/packages/harness/deerflow/rigor/agent_contracts.py`.
`get_agent_contracts()` returns fresh frozen records. Every record declares mission,
tools/tool scope, authority, inputs, outputs, handoffs, failure behavior, entrypoint
and enforcement limits. Builtin tool/deny lists, skills and default turn/time budgets
derive from real `SubagentConfig` objects; profiles add role-specific I/O contracts.

This inventories 16 repository-declared roles. It does not activate agents, discover
deployment-specific custom agents, resolve live permissions or grant new authority.
`tools=None` / `INHERITED_RUNTIME` explicitly means unresolved runtime capabilities.
An empty tool tuple / `NO_TOOLS` identifies the direct analysis/advisory paths.
Declared skill/turn/timeout defaults can be overridden by runtime configuration.

## Inventory

| Role | Mission / output | Declared tool scope | Handoff |
| --- | --- | --- | --- |
| rigor-company-operator | Five specialist reports, then Chief of Staff synthesis; validated company pulse | Inherited runtime, company operating skill | Company workers; 6 total / 3 concurrent |
| rigor-company-action-executor | One eligible internal action; result/artifact/evidence | Inherited runtime, company operating skill | One company worker; 1 total / 1 concurrent |
| rigor-chief-of-staff | Evidence synthesis, priorities, risks, Founder decision packet | Search/fetch and sandbox artifact files | Return to caller / human review |
| rigor-product-ops | Operator problem, product behavior, acceptance tests | Search/fetch and sandbox artifact files | Return to caller / human review |
| rigor-engineering | Explicitly delegated implementation, changed files/tests/rollback | Shell and sandbox files | Return to caller / human review |
| rigor-qa-security | Gate evidence, reproduction, severity and release-hold recommendation | Shell and sandbox files | Return to caller / human review |
| rigor-market-intel | Dated developments, citations and implications | Search/fetch and sandbox artifact files | Return to caller / human review |
| rigor-partnerships-capital | Opportunity evidence, unsent drafts, Founder decisions | Search/fetch and sandbox artifact files | Return to caller / human review |
| rigor-growth-revenue | Segments, offer hypotheses and measurable experiments | Search/fetch and sandbox artifact files | Return to caller / human review |
| rigor-customer-success | Feedback triage, draft response and product implications | Search/fetch and sandbox artifact files | Return to caller / human review |
| rigor-finance-runway | Supplied-number scenarios, sensitivity and evidence gaps | Search/fetch and sandbox artifact files | Return to caller / human review |
| rigor-document-analyst | Page-cited requirements from untrusted source text | No tools | Result to caller / human review |
| rigor-john-model | Synthetic, read-only adversarial PM actions; HOLD_SHOW | No tools | Result to caller / human review |
| rigor-john-brief | Deterministic read-only blockers and recommendations | No tools | Brief to caller / human review |
| general-purpose | Framework delegated task, evidence and errors | Inherited runtime | Return to caller; not a company action owner |
| bash | Framework command execution, outputs and errors | Shell, listing and sandbox files | Return to caller; not a company action owner |

The programmatic records contain the exact tool names, each role's inputs/outputs
and entrypoints. Engineering code changes require explicit delegation/review;
QA implementation requires an explicit fixing assignment. Research tools include
sandbox artifact writing, not just reading. Shell/file tools are capabilities,
not independent permission to make external or irreversible changes.

## Authority and failure behavior

Company workers return findings to the caller and do not recursively delegate.
Founder policy still gates spending, contracts/equity, external commitments,
credentials, production promotion and irreversible actions. The existing
deterministic action policy remains authoritative; code changes require review.
The named-owner gate runs before constructing a model client. Unknown, whitespace,
framework, coordinator and direct-model owners raise an execution-blocked error
(HTTP 409 at the standalone gateway) rather than silently selecting another role.

Operator/executor prompts receive the reviewed worker contracts. Workers are told
to report failure, timeout, missing evidence and partial findings, preserve evidence,
escalate authority gaps, and never claim unverified completion. The operator must
report a missing specialist as an incomplete cycle rather than fabricate findings.
These are failure-policy instructions; they do not attest that a worker actually ran.

Existing structured-result parsers reject malformed operator/executor output.
The document analyst validates page/excerpt provenance. John model output remains
schema/citation checked, synthetic-gated, read-only and fixed to HOLD_SHOW. The
deterministic John brief identifies evidence gaps without mutating records.
Provider failures remain subject to existing exception/gateway handling; the registry
does not add automatic retries or convert a failed result into success.

## Verification boundary

Tests cover inventory completeness, immutable snapshots, config-derived tools and
budgets, missing-profile rejection, removal from owner eligibility, prompt contracts,
no model-client construction on invalid owners, delegation-cap arguments and existing
client/limit behavior. Registration is tested outside pytest by exporting the JSON
inventory without starting any agent or calling a model.

Actual tool availability/authorization, dynamic custom agents, model compliance,
five-specialist-plus-synthesis order, exact specialist selection and per-agent
completion receipts still need authenticated runtime evidence. The existing lead
runtime can expose framework/custom agents; contract prompts and the named-owner
gate are not a complete per-tool-call routing firewall. A structured COMPLETE result
alone does not prove delegation or readiness. No live agents are activated by this
development change, and production promotion remains a separate human decision.
