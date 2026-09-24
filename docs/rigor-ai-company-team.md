# RIGOR AI Company Team

RIGOR uses DeerFlow's existing lead-agent, subagent, memory, delegation-ledger, and scheduled-run architecture. The company team is a bounded operating layer inside that system, not a second agent framework.

## Operating model

RIGOR separates the **business operating team** from the **product organization**.

The recurring business pulse uses exactly six delegated roles:

| Business agent | Responsibility |
| --- | --- |
| `rigor-chief-of-staff` | Business operating review, priorities, dependencies, founder decision packets |
| `rigor-growth-sales` | ICP, qualified pipeline, prospect research, sales experiments, demo preparation |
| `rigor-customer-success` | Onboarding, adoption, account health, support triage, feedback, retention risk |
| `rigor-finance-ops` | Runway, costs, revenue tracking, forecasts, KPIs, billing/invoice preparation |
| `rigor-market-intel` | Competitors, adjacent products, customers, market movement, white space |
| `rigor-partnerships-capital` | Partner/investor research, opportunity briefs, outreach drafting |

A separate product organization remains available for targeted execution:

| Product agent | Responsibility |
| --- | --- |
| `rigor-product-ops` | Live-production workflow, operator UX, readiness logic, acceptance criteria |
| `rigor-engineering` | Architecture, implementation, debugging, tests, DeerFlow/RIGOR integration |
| `rigor-qa-security` | Release gates, regressions, security/reliability analysis, smoke tests |

All nine are registered as built-in DeerFlow subagents in
`backend/packages/harness/deerflow/subagents/builtins/rigor_company.py`.
The business pulse consumes five business specialist reports plus one Chief of
Staff synthesis. Product work created by the business review becomes an
explicit handoff rather than consuming a recurring business seat.

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

1. **Observe** — gather pipeline, customer, financial, market, and relationship signals.
2. **Diagnose** — Growth/Sales, Customer Success, Finance/Ops, Market Intel, and Partnerships/Capital each produce a focused report.
3. **Synthesize** — Chief of Staff produces one business state and priority order.
4. **Handoff** — product or reliability work becomes a precise task for Product/Ops, Engineering, or QA/Security.
5. **Execute** — the product organization works against explicit acceptance criteria.
6. **Verify** — QA/Security independently checks release gates for product changes.
7. **Escalate** — founder receives only decisions requiring human authority.
8. **Record** — preserve decisions, evidence, and outcomes in durable company context.

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


## Durable company state

RIGOR company operations now persist in `rigor_company_records` rather than living only inside agent conversations.

Supported record types:
- `OBJECTIVE`
- `MILESTONE`
- `RELATIONSHIP`
- `FEEDBACK`
- `RISK`
- `EXPERIMENT`
- `RUNWAY`

Each record can carry status, priority, owner agent, approval requirement, due time, source reference, and structured JSON payload. `RigorCompanyManager.get_state_snapshot()` returns grouped operating state plus the active founder-approval queue.

The migration is `c8e7d9a1f203_add_rigor_company_operating_state.py`.

## Company operating skill

`skills/public/rigor-company-operator/SKILL.md` defines the standard company cycle.

The lead agent delegates one focused report to Growth/Sales, Customer Success,
Finance/Ops, Market Intelligence, and Partnerships/Capital, then sends those five
reports to the Chief of Staff for synthesis. That consumes exactly six delegated
subagents, matching DeerFlow's default per-run ceiling. Product/Ops, Engineering,
and QA/Security remain available for targeted follow-on execution.

The final founder brief must distinguish:
- current state;
- top three priorities;
- blockers and risks;
- founder approvals;
- next three actions;
- durable state updates.

This is the default operating loop for recurring company pulses and strategic operating reviews.
