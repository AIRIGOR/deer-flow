# John agent inventory

John is a fictional Touring Production Manager for a synthetic Celestial Circuit tour. Existing deterministic briefing: rigor_beta/netlify/functions/_shared/john-ai-pm.ts. Existing model: backend/packages/harness/deerflow/rigor/john_pm.py. New service route: POST /api/rigor/agents/john/analyze.

Authority: read supplied bounded evidence, draft questions, cite supplied IDs or MISSING_EVIDENCE; no tools, approvals, writes, communications, deployment or spending. Model limit: 80 evidence items, 25,000 total characters, 20 actions. Caller timeout: 45 seconds. The free Render service may take longer to wake; cold-start behavior remains an acceptance issue.

Local model tests use injected fake models; no live execution success is claimed. Other company agents retain their existing source inventory and require separate live verification.
