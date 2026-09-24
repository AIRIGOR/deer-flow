"""DeerFlow-backed operating cycle for the RIGOR AI company team."""

from __future__ import annotations

import asyncio
import json
from collections.abc import Callable
from typing import Any

from pydantic import BaseModel, Field, ValidationError

from deerflow.client import DeerFlowClient
from deerflow.utils.llm_text import (
    strip_markdown_code_fence,
    strip_think_blocks,
)

from .company_actions import CompanyActionProposal


class RigorCompanyPulseError(RuntimeError):
    """Raised when the AI company operating cycle cannot return a valid brief."""


class CompanyStateUpdate(BaseModel):
    record_type: str = Field(
        pattern="^(OBJECTIVE|MILESTONE|RELATIONSHIP|FEEDBACK|RISK|EXPERIMENT|RUNWAY)$"
    )
    title: str = Field(min_length=1, max_length=255)
    summary: str | None = Field(default=None, max_length=4000)
    status: str = Field(
        default="OPEN",
        pattern="^(OPEN|ACTIVE|BLOCKED|NEEDS_APPROVAL|COMPLETE|ARCHIVED)$",
    )
    priority: str = Field(
        default="MEDIUM",
        pattern="^(CRITICAL|HIGH|MEDIUM|LOW)$",
    )
    owner_agent: str | None = Field(default=None, max_length=128)
    approval_required: bool = False
    source_ref: str | None = Field(default=None, max_length=2000)
    payload: dict[str, Any] = Field(default_factory=dict)


class RigorCompanyPulseResult(BaseModel):
    current_state: str = Field(min_length=1, max_length=8000)
    top_priorities: list[str] = Field(min_length=1, max_length=3)
    blockers_risks: list[str] = Field(default_factory=list, max_length=12)
    founder_approvals: list[str] = Field(default_factory=list, max_length=12)
    next_actions: list[str] = Field(min_length=1, max_length=3)
    state_updates: list[CompanyStateUpdate] = Field(
        default_factory=list,
        max_length=20,
    )
    action_proposals: list[CompanyActionProposal] = Field(
        default_factory=list,
        max_length=12,
    )


ClientFactory = Callable[[], DeerFlowClient]


_COMPANY_PROMPT = """Run one complete RIGOR AI company operating cycle.

FOUNDER VISION:
RIGOR is the flagship product inside an increasingly AI-operated company. The
Founder sets vision and hard boundaries; the AI company should proactively run
recurring internal business functions, preserve company memory, advance product
proof, build revenue readiness, and maintain capital readiness without waiting
for the Founder to coordinate every task.

AVAILABLE SPECIALISTS:
- rigor-product-ops
- rigor-engineering
- rigor-qa-security
- rigor-market-intel
- rigor-partnerships-capital
- rigor-growth-revenue
- rigor-customer-success
- rigor-finance-runway

You MUST use the task tool and the registered RIGOR company subagents.

Operating sequence:
1. Select exactly five specialists from the available specialist pool based on
   the Founder objective, current company context, unresolved durable state,
   revenue path, capital readiness, and highest-leverage risks.
2. Delegate one focused report to each selected specialist. The five reports may
   run in parallel.
3. After all five return, delegate exactly one synthesis task to
   rigor-chief-of-staff. Include compact evidence from all five reports plus any
   relevant durable state.
4. Do not create a seventh delegation.

Standing checks, when materially relevant:
- product proof and real operator value;
- revenue path and customer conversion evidence;
- capital readiness and time-sensitive opportunities;
- moat growth: Production Handshake, change-impact intelligence, operational
  memory, and proprietary production intelligence;
- recurring Founder work that can safely move into the AI operating layer;
- state that must survive into the next cycle.

ACTION LAYER:
Propose concrete actions that should enter RIGOR's durable action queue. The
platform policy engine, not you, decides whether an action may execute
automatically. Use these exact action types:
INTERNAL_RESEARCH, INTERNAL_TEST, INTERNAL_DOCUMENT, INTERNAL_CODE_CHANGE,
OUTREACH_DRAFT, SUPPORT_DRAFT, APPLICATION_DRAFT, EMAIL_SEND, PUBLIC_POST,
AD_SPEND, CONTRACT, CAPITAL_ACCEPT, PAYMENT, PRODUCTION_PROMOTE,
CREDENTIAL_CHANGE, DATA_DELETE.

Use these exact scopes:
OBSERVE, PREPARE, INTERNAL_EXECUTE, EXTERNAL_EXECUTE, FOUNDER_RESERVED.

Do not hide a Founder-reserved action as a draft or internal action. Drafting an
email is OUTREACH_DRAFT/PREPARE; actually sending it is
EMAIL_SEND/EXTERNAL_EXECUTE. Preparing an investor application is
APPLICATION_DRAFT/PREPARE; accepting financing is
CAPITAL_ACCEPT/FOUNDER_RESERVED.

Human authority boundary:
- no spending or financial commitments;
- no accepting investment, grants with binding terms, contracts, equity, SAFEs,
  notes, or binding commercial/capital terms;
- no binding external outreach or public statements;
- no promises of pricing, exclusivity, ownership, equity, or delivery commitments;
- no credential rotation/disclosure;
- no production promotion/deployment;
- no destructive or irreversible action.

For any such recommendation, put it in founder_approvals and also create an
accurately typed action_proposal when execution would be useful.

The Chief of Staff synthesis must reconcile conflicting recommendations and
make clear what the AI company can continue automatically versus what requires
Founder authority. Include product, revenue-path, customer, and capital-readiness
facts in the synthesis when material.

Return ONLY JSON in this exact shape:
{
  "current_state": "concise evidence-based company state",
  "top_priorities": ["priority 1", "priority 2", "priority 3"],
  "blockers_risks": ["risk or blocker"],
  "founder_approvals": ["approval needed"],
  "next_actions": ["action 1", "action 2", "action 3"],
  "state_updates": [
    {
      "record_type": "OBJECTIVE|MILESTONE|RELATIONSHIP|FEEDBACK|RISK|EXPERIMENT|RUNWAY",
      "title": "durable state record title",
      "summary": "what changed and why it matters",
      "status": "OPEN|ACTIVE|BLOCKED|NEEDS_APPROVAL|COMPLETE|ARCHIVED",
      "priority": "CRITICAL|HIGH|MEDIUM|LOW",
      "owner_agent": "registered RIGOR agent name or null",
      "approval_required": false,
      "source_ref": "URL, commit, deploy, test, or other evidence reference",
      "payload": {}
    }
  ],
  "action_proposals": [
    {
      "action_type": "INTERNAL_RESEARCH|INTERNAL_TEST|INTERNAL_DOCUMENT|INTERNAL_CODE_CHANGE|OUTREACH_DRAFT|SUPPORT_DRAFT|APPLICATION_DRAFT|EMAIL_SEND|PUBLIC_POST|AD_SPEND|CONTRACT|CAPITAL_ACCEPT|PAYMENT|PRODUCTION_PROMOTE|CREDENTIAL_CHANGE|DATA_DELETE",
      "scope": "OBSERVE|PREPARE|INTERNAL_EXECUTE|EXTERNAL_EXECUTE|FOUNDER_RESERVED",
      "title": "specific executable action",
      "summary": "what should happen and why",
      "owner_agent": "registered RIGOR agent name or null",
      "target": "target system/person/resource or null",
      "reversible": true,
      "evidence_refs": ["URL, commit, deploy, test, or other evidence reference"],
      "payload": {}
    }
  ]
}

Do not wrap the JSON in Markdown.
"""


def _parse_pulse(text: str) -> RigorCompanyPulseResult:
    cleaned = strip_markdown_code_fence(strip_think_blocks(text)).strip()
    try:
        payload = json.loads(cleaned)
        return RigorCompanyPulseResult.model_validate(payload)
    except (json.JSONDecodeError, ValidationError, TypeError) as exc:
        raise RigorCompanyPulseError(
            "RIGOR company operator returned invalid structured JSON"
        ) from exc


class RigorCompanyOperator:
    """Run one bounded RIGOR company cycle through DeerFlow subagents."""

    def __init__(
        self,
        *,
        client_factory: ClientFactory | None = None,
    ) -> None:
        self._client_factory = client_factory or self._default_client_factory

    @staticmethod
    def _default_client_factory() -> DeerFlowClient:
        return DeerFlowClient(
            subagent_enabled=True,
            thinking_enabled=False,
            plan_mode=False,
            available_skills={"rigor-company-operator"},
            agent_name="rigor-company-operator",
            environment="production",
        )

    async def run(
        self,
        *,
        objective: str,
        context: str | None = None,
    ) -> RigorCompanyPulseResult:
        objective = " ".join(objective.split())[:4000]
        if not objective:
            raise ValueError("objective must not be empty")
        context = (context or "").strip()[:30000]
        prompt = (
            f"{_COMPANY_PROMPT}\n\n"
            f"FOUNDER OBJECTIVE:\n{objective}\n\n"
            f"CURRENT COMPANY CONTEXT:\n{context or 'No additional context supplied.'}"
        )
        client = self._client_factory()
        text = await asyncio.to_thread(
            client.chat,
            prompt,
            thread_id="rigor-company-pulse",
            subagent_enabled=True,
            recursion_limit=180,
        )
        return _parse_pulse(text)
