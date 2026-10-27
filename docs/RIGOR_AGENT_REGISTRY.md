# RIGOR source agent registry

Status: PARTIAL. Source registrations exist; live registration/tool availability/model execution remain NOT TESTED on this staging candidate. Registry source: `backend/packages/harness/deerflow/subagents/builtins/rigor_company.py`. Runtime receipt role allowlist: `deerflow/rigor/execution_receipts.py`; the Netlify validator uses the same nine names.

| Registered role | Mission/output focus | Tool group | Max turns / deadline seconds |
|---|---|---|---|
| rigor-chief-of-staff | Reconcile specialist reports into priorities, tradeoffs and Founder decisions | Research | 80 / 900 |
| rigor-product-ops | Production workflow and measurable product acceptance | Research | 100 / 1200 |
| rigor-engineering | Minimal implementation, tests and rollback notes | Engineering | 150 / 1800 |
| rigor-qa-security | Reproducible gate findings and release risks | Engineering | 120 / 1500 |
| rigor-market-intel | Sourced market intelligence | Research | 100 / 1500 |
| rigor-partnerships-capital | Partnership/capital preparation and exact draft packets | Research | 100 / 1500 |
| rigor-growth-revenue | Growth/revenue analysis and proposals | Research | 100 / 1500 |
| rigor-customer-success | Customer operations analysis | Research | 100 / 1500 |
| rigor-finance-runway | Runway/finance analysis and proposals | Research | 100 / 1500 |

Research tools in source: `web_search`, `web_fetch`, `read_file`, `write_file`, `str_replace`. Engineering tools: `bash`, `read_file`, `write_file`, `str_replace`. All inherit the selected model. All disallow `task`, `ask_clarification`, `present_files`. These are configured tool lists, not proof of deployed filesystem isolation or complete capability policy.

Common handoff contract: bounded assigned objective plus supplied evidence/context -> structured result and independently correlated task execution receipt. Company pulse selects five distinct registered specialists, then one Chief of Staff after all five finish; six delegations maximum. Success requires completed runtime events matching task IDs and assigned roles, not a model-written success claim. Conclusions remain independently unverified assessments.

State/authority contract: supplied company context is evidence for analysis, not authorization to mutate production facts or approve a proposal. Return proposals through the existing policy/queue boundary. Preserve Founder-reserved effects. Automatic action claims survive failure/uncertainty and cannot be automatically retried; a later pulse cannot reopen a failed execution. A source-registered agent is not a distinct authenticated human principal.

Known gaps: no fully certified cross-agent causal trace and handoff-ack protocol, no live proof of tool capability confinement, no measured per-role SLOs, and no independently verified shared-state write arbitration for every path. Existing individual deadlines exceed some outer adapter budgets; effective cancellation behavior needs failure-injection evidence. Do not mark session 07 complete from this inventory alone.

The separate Akhasha main source declares five local adapter roles (`strategy`, `product_operations`, `market_intelligence`, `partnerships_capital`, `qa_security`). It is not mapped into these nine registrations by assumption. No additional agents were invented or activated.
