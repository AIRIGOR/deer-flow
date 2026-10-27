# John staging contract

Frontend route POST /api/agents/john/analyze requires an authenticated tester and a synthetic production. Gateway route POST /api/rigor/agents/john/analyze requires the shared staging service token and RIGOR_JOHN_STAGING_ENABLED=true. Body: strict boolean synthetic=true and nonempty evidence entries (source_id and text). Invalid/oversize evidence is rejected; model/provider errors are sanitized.

Response: agent John, mode MODEL_ADVISORY_ONLY, release_decision HOLD_SHOW, autonomous_show_approval false, bounded actions referencing only supplied source IDs or MISSING_EVIDENCE. The existing gateway adapter validates response/citations and saves an operation receipt. Configured, request accepted, deployment ready and model execution verified are separate states.

RIGOR_MODEL_API_KEY is the precise model credential variable. Staging secrets remain in provider dashboards/runtime, never logs, committed files or chat. No production token reuse.
