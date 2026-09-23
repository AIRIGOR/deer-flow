# RIGOR AI Company Team

RIGOR uses DeerFlow's existing lead-agent, subagent, memory, delegation-ledger, and scheduled-run architecture. The company team is a bounded operating layer inside that system, not a second agent framework.

## Operating model

The DeerFlow lead agent acts as the orchestration layer. It can delegate focused work to six RIGOR company specialists:

| Agent | Responsibility |
| --- | --- |
| `rigor-chief-of-staff` | Operating review, priorities, dependencies, founder decision packets |
| `rigor-product-ops` | Live-production workflow, operator UX, readiness logic, acceptance criteria |
| `rigor-engineering` | Architecture, implementation, debugging, tests, DeerFlow/RIGOR integration |
| `rigor-qa-security` | Release gates, regressions, security/reliability analysis, smoke tests |
| `rigor-market-intel` | Competitors, adjacent products, customers, market movement, white space |
| `rigor-partnerships-capital` | Partner/investor research, opportunity briefs, outreach drafting |

All six are registered as built-in DeerFlow subagents in
`backend/packages/harness/deerflow/subagents/builtins/rigor_company.py`.

## Control boundary

The company agents are internal workers, not autonomous corporate officers.

They may research, analyze, draft, test, and implement within their allowed toolsets. They may not recursively delegate. The partner/capital agent is research-only and receives no shell tool.

Founder approval is required before:
- spending or financial commitments;
- contracts, equity, or binding commercial terms;
- sending external outreach or public statements;
- credential rotation or disclosure;
- production promotion/deployment;
- deleting production/customer data or other irreversible actions.

The Chief of Staff should turn these cases into an approval packet with the decision, evidence, options, downside, reversibility, and exact next action.

## Default operating loop

1. **Observe** — gather product, reliability, market, and relationship signals.
2. **Diagnose** — delegate to the smallest relevant specialist set.
3. **Synthesize** — Chief of Staff produces the company state and priority order.
4. **Execute** — Engineering/Product work against explicit acceptance criteria.
5. **Verify** — QA/Security must independently check release gates.
6. **Escalate** — founder receives only decisions requiring human authority.
7. **Record** — preserve decisions, evidence, and outcomes in durable company context.

## Automation cadence

The external operating cadence can run independently of a laptop:
- daily company pulse / founder brief;
- continuous release-health condition watch;
- weekly competitive/white-space scan;
- weekly partner/capital opportunity scan.

Scheduled runs should remain non-interactive and use the existing DeerFlow run lifecycle. They should not bypass the approval boundary above.

## Next expansion

Once the operating loop has real data, add persistent company-state objects for:
- objectives and key results;
- product/release milestones;
- partner/investor pipeline;
- customer/production feedback;
- risk register;
- experiments and outcomes;
- company financial runway.

Do not add more agent roles until one of these six roles becomes overloaded by a distinct recurring job.
