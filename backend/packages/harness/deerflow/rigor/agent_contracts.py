"""Repository-declared agent contracts, not live permissions or execution proof."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class AgentContract:
    name: str
    kind: str
    mission: str
    tools: tuple[str, ...] | None
    tool_scope: str
    disallowed_tools: tuple[str, ...]
    authority: tuple[str, ...]
    inputs: tuple[str, ...]
    outputs: tuple[str, ...]
    handoffs: tuple[str, ...]
    failure_behavior: tuple[str, ...]
    entrypoint: str
    enforcement: tuple[str, ...]
    max_delegations: int = 0
    max_concurrent_delegations: int = 0
    declared_skills: tuple[str, ...] | None = None
    declared_max_turns: int | None = None
    declared_timeout_seconds: int | None = None


_FAILURE = (
    "Report failure, timeout, missing evidence or partial findings to the caller.",
    "Preserve supporting evidence and request human review when authority is missing.",
    "Do not claim unverified completion.",
)
_INTERNAL_AUTHORITY = (
    "Internal research, analysis and preparation within the assigned mission.",
    "Founder approval remains required for spending, contracts/equity, external commitments, credentials, production promotion and irreversible actions.",
    "No recursive task delegation; return findings and proposed handoffs to the caller.",
)
_ROLE_AUTHORITY = {
    "rigor-chief-of-staff": ("Synthesize and prepare Founder decision packets; no corporate commitments or autonomous release approval.",),
    "rigor-product-ops": ("Recommend source-backed product behavior and acceptance criteria; no autonomous show approval.",),
    "rigor-engineering": ("Code changes require explicit delegation and the applicable review gate.",),
    "rigor-qa-security": ("Implementation fixes require explicit delegation; otherwise return remediation and a release-hold recommendation.",),
    "rigor-market-intel": ("Descriptive, cited research only; no contacting targets or making commitments.",),
    "rigor-partnerships-capital": ("Research and unsent drafts only; no terms acceptance, capital acceptance or binding outreach.",),
    "rigor-growth-revenue": ("Hypotheses and unsent collateral only; no promised pricing, ad purchases or external delivery.",),
    "rigor-customer-success": ("Support triage and draft responses; external delivery needs a separate authorized action path.",),
    "rigor-finance-runway": ("No banking or payment execution, transfers, purchases or capital acceptance.",),
}
# Mission/tool/budget fields come from the real config; these profiles make its
# input/output contract explicit. New RIGOR workers must add a reviewed profile.
_COMPANY_IO = {
    "rigor-chief-of-staff": (("Five specialist reports", "Founder objective and durable company state"), ("Prioritized founder brief", "Evidence, risks, approval packets and proposed state updates")),
    "rigor-product-ops": (("Production sources and operator workflow evidence", "Product objective and current behavior"), ("Operator problem and proposed behavior", "Acceptance tests, failure modes and priorities")),
    "rigor-engineering": (("Explicit implementation delegation", "Repository, constraints and acceptance criteria"), ("Changed files and test evidence", "Residual risk and rollback notes")),
    "rigor-qa-security": (("Candidate revision and verification scope", "Existing tests and security evidence"), ("PASS/FAIL per gate with reproduction", "Remediation and release-hold recommendation")),
    "rigor-market-intel": (("Market question and company context", "Dated primary-source evidence"), ("Categorized developments and citations", "Threat/opportunity implications and recommendations")),
    "rigor-partnerships-capital": (("Relationship or funding objective", "Public opportunities, deadlines and proof requirements"), ("Opportunity briefs and unsent drafts", "Evidence gaps and requested Founder decisions")),
    "rigor-growth-revenue": (("Product proof and customer segment evidence", "Commercial objective and supplied metrics"), ("Offer hypotheses and measurable experiments", "Revenue implications and next safe action")),
    "rigor-customer-success": (("Operator feedback and support context", "Reproduction and adoption evidence"), ("Issue classification and severity", "Draft response and product/retention implications")),
    "rigor-finance-runway": (("Supplied or verified financial numbers", "Budget assumptions and scenario objective"), ("Runway scenarios, sensitivity and evidence gaps", "Capital implications and Founder decision packet")),
}


def get_agent_contracts() -> dict[str, AgentContract]:
    """Return fresh immutable snapshots without resolving live config or tools.

    Late imports preserve the package's lightweight state/config import paths.
    None tools explicitly means inherited runtime capabilities, not no tools.
    """
    from deerflow.subagents.builtins import BUILTIN_SUBAGENTS
    from deerflow.subagents.builtins.rigor_company import RIGOR_COMPANY_SUBAGENTS

    contracts = {}
    for name, config in BUILTIN_SUBAGENTS.items():
        if name.startswith("rigor-") and name not in _COMPANY_IO:
            raise ValueError("Missing RIGOR agent contract")
        inputs, outputs = _COMPANY_IO.get(name, (("Delegated framework task and supplied context",), ("Task result, evidence and errors",)))
        authority = _INTERNAL_AUTHORITY if name in _COMPANY_IO else ("Framework worker capabilities; not an authorized RIGOR company action owner.",)
        authority += _ROLE_AUTHORITY.get(name, ())
        contracts[name] = AgentContract(
            name=name,
            kind="SUBAGENT",
            mission=config.description.strip(),
            tools=tuple(config.tools) if config.tools is not None else None,
            tool_scope="DECLARED_ALLOWLIST" if config.tools is not None else "INHERITED_RUNTIME",
            disallowed_tools=tuple(config.disallowed_tools or ()),
            authority=authority,
            inputs=inputs,
            outputs=outputs,
            handoffs=("CALLER", "HUMAN_REVIEW"),
            failure_behavior=_FAILURE,
            entrypoint=f"deerflow.subagents.builtins:BUILTIN_SUBAGENTS[{name!r}]",
            enforcement=(
                "Declared tool allow/deny lists are subagent config; effective skills, limits and permissions require runtime inspection.",
                "Mission/authority/failure instructions are policy guidance, not a shell security boundary.",
            ),
            declared_max_turns=config.max_turns,
            declared_timeout_seconds=config.timeout_seconds,
            declared_skills=tuple(config.skills) if config.skills is not None else None,
        )

    company_names = tuple(sorted(RIGOR_COMPANY_SUBAGENTS))
    if not set(company_names) <= contracts.keys():
        raise ValueError("Missing RIGOR agent contract")
    for name, mission, inputs, outputs, budget, entrypoint in (
        (
            "rigor-company-operator",
            "Coordinate five specialist reports followed by one Chief of Staff synthesis.",
            ("Founder objective", "Explicit supplied company context and durable state"),
            ("Validated company pulse", "Priorities, risks, approval requests, action proposals and state updates"),
            6,
            "deerflow.rigor.company_operator:RigorCompanyOperator.run",
        ),
        (
            "rigor-company-action-executor",
            "Execute one policy-eligible internal action with one company-subagent handoff.",
            ("CompanyActionProposal", "Bounded supplied context"),
            ("Validated execution result", "Internal artifact and evidence references"),
            1,
            "deerflow.rigor.company_action_executor:RigorCompanyActionExecutor.execute",
        ),
    ):
        contracts[name] = AgentContract(
            name=name,
            kind="COORDINATOR",
            mission=mission,
            tools=None,
            tool_scope="INHERITED_RUNTIME",
            disallowed_tools=(),
            authority=(
                "Internal coordination; tool availability does not grant external or Founder-reserved authority.",
                "Deterministic action policy and named-owner checks gate execution." if name == "rigor-company-action-executor" else "Propose actions for the existing policy gate; a pulse cannot grant execution approval.",
            ),
            inputs=inputs,
            outputs=outputs,
            handoffs=company_names + ("HUMAN_REVIEW",),
            failure_behavior=(
                ("Missing or failed specialist means an incomplete cycle; preserve the synthesis slot rather than make an unplanned retry.",)
                if budget == 6
                else ("Reject invalid owners or disallowed actions before client construction; malformed structured output fails execution.",)
            )
            + _FAILURE,
            entrypoint=entrypoint,
            enforcement=("Client invocation supplies an explicit total/concurrent delegation cap.", "Handoff order and report completeness require execution evidence; prompts alone are not proof."),
            max_delegations=budget,
            max_concurrent_delegations=3 if budget == 6 else 1,
            declared_skills=("rigor-company-operator",),
        )

    for name, mission, inputs, outputs, entrypoint, failure in (
        (
            "rigor-document-analyst",
            "Extract source-backed production requirements from supplied page text.",
            ("Document name", "Page-numbered untrusted text"),
            ("RigorAnalysisResult with excerpts, pages and confidence",),
            "deerflow.rigor.analyzer:RigorDocumentAnalyzer.analyze",
            "Invalid JSON or citations fail analysis; upload/readiness remain gated.",
        ),
        (
            "rigor-john-model",
            "Adversarial, read-only production-manager advisory on synthetic evidence.",
            ("Bounded synthetic JohnEvidence with unique source IDs",),
            ("Validated JohnPmResult; HOLD_SHOW and no autonomous approval",),
            "deerflow.rigor.john_pm:JohnPmAgent.analyze",
            "Invalid or unavailable model output fails safely with sanitized errors; never approve or mutate a show.",
        ),
        (
            "rigor-john-brief",
            "Produce deterministic read-only production blockers and human-review recommendations.",
            ("Authenticated production/workspace snapshot",),
            ("Read-only briefing with evidence and human-signoff recommendation",),
            "rigor_beta/netlify/functions/_shared/john-ai-pm.ts:johnPmBrief",
            "Missing evidence becomes an explicit blocker or review recommendation; never fabricate state or approvals.",
        ),
    ):
        contracts[name] = AgentContract(
            name=name,
            kind="DETERMINISTIC" if name == "rigor-john-brief" else "MODEL",
            mission=mission,
            tools=(),
            tool_scope="NO_TOOLS",
            disallowed_tools=("task",),
            authority=("Read-only analysis/advisory; no show approval, source review, conflict resolution, external actions or production mutation.",),
            inputs=inputs,
            outputs=outputs,
            handoffs=("CALLER", "HUMAN_REVIEW"),
            failure_behavior=(failure,) + _FAILURE,
            entrypoint=entrypoint,
            enforcement=("Existing schema/provenance checks and read-only implementation; gateway/session and John model synthetic-staging gates remain separate.",),
            declared_skills=(),
        )
    return contracts


def company_subagent_names() -> tuple[str, ...]:
    """Only reviewed company workers may be named in an internal action handoff."""
    registry = get_agent_contracts()
    return tuple(sorted(name for name in registry["rigor-company-action-executor"].handoffs if name in registry))


def render_company_handoffs(owner: str | None = None) -> str:
    registry = get_agent_contracts()
    allowed = company_subagent_names()
    if owner is not None and owner not in allowed:
        raise ValueError("Owner must be a registered RIGOR company subagent")
    names = (owner,) if owner is not None else allowed
    return "COORDINATION CONTRACTS (repository declarations; verify actual execution)\n" + json.dumps([asdict(registry[name]) for name in names])
