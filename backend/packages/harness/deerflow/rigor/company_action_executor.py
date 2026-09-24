"""Bounded executor for RIGOR's approved internal company actions."""

from __future__ import annotations

import asyncio
import json
from collections.abc import Callable
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from deerflow.client import DeerFlowClient
from deerflow.utils.llm_text import strip_markdown_code_fence, strip_think_blocks

from .company_actions import (
    AUTO_ALLOWED_ACTIONS,
    CompanyActionProposal,
    decide_company_action,
)


class RigorCompanyActionExecutionError(RuntimeError):
    """Raised when an approved internal action cannot return valid output."""


class RigorCompanyActionExecutionBlocked(PermissionError):
    """Raised when policy requires Founder approval before execution."""


class RigorCompanyActionExecutionResult(BaseModel):
    status: Literal["COMPLETE"] = "COMPLETE"
    result_summary: str = Field(min_length=1, max_length=6000)
    artifact_markdown: str | None = Field(default=None, max_length=30000)
    evidence_refs: list[str] = Field(default_factory=list, max_length=30)


ClientFactory = Callable[[], DeerFlowClient]


_ACTION_PROMPT = """Execute one bounded internal RIGOR company action.

This executor is an INTERNAL work lane only. It may research, analyze, test,
draft, and produce internal work artifacts. It must not send messages, post
publicly, purchase ads, spend or move money, accept capital, sign contracts,
change credentials, promote production, or delete data.

If the proposal names a registered RIGOR owner_agent, use the task tool to
delegate exactly one focused task to that specialist. Otherwise choose the
single most relevant RIGOR specialist. Do not create more than one delegation.

Complete the requested internal work, preserve evidence, and return ONLY JSON:
{
  "status": "COMPLETE",
  "result_summary": "what was actually completed",
  "artifact_markdown": "the draft/research/test artifact, or null",
  "evidence_refs": ["source URL, commit, test, file, or other evidence"]
}

Do not claim an external action was performed. Do not wrap JSON in Markdown.
"""


def _parse_execution(text: str) -> RigorCompanyActionExecutionResult:
    cleaned = strip_markdown_code_fence(strip_think_blocks(text)).strip()
    try:
        payload = json.loads(cleaned)
        return RigorCompanyActionExecutionResult.model_validate(payload)
    except (json.JSONDecodeError, ValidationError, TypeError) as exc:
        raise RigorCompanyActionExecutionError(
            "RIGOR company action executor returned invalid structured JSON"
        ) from exc


class RigorCompanyActionExecutor:
    """Execute only actions that pass RIGOR's deterministic authority policy."""

    def __init__(self, *, client_factory: ClientFactory | None = None) -> None:
        self._client_factory = client_factory or self._default_client_factory

    @staticmethod
    def _default_client_factory() -> DeerFlowClient:
        return DeerFlowClient(
            subagent_enabled=True,
            thinking_enabled=False,
            plan_mode=False,
            available_skills={"rigor-company-operator"},
            agent_name="rigor-company-action-executor",
            environment="production",
        )

    async def execute(
        self,
        proposal: CompanyActionProposal,
        *,
        context: str | None = None,
    ) -> RigorCompanyActionExecutionResult:
        decision = decide_company_action(proposal)
        if decision.approval_required:
            raise RigorCompanyActionExecutionBlocked(decision.policy_reason)
        if proposal.action_type not in AUTO_ALLOWED_ACTIONS:
            raise RigorCompanyActionExecutionBlocked(
                "action is not executable in the automatic internal lane"
            )

        context = (context or "").strip()[:20000]
        prompt = (
            f"{_ACTION_PROMPT}\n\n"
            f"ACTION PROPOSAL:\n{proposal.model_dump_json()}\n\n"
            f"COMPANY CONTEXT:\n{context or 'No additional context supplied.'}"
        )
        client = self._client_factory()
        text = await asyncio.to_thread(
            client.chat,
            prompt,
            thread_id="rigor-company-action",
            subagent_enabled=True,
            recursion_limit=100,
        )
        return _parse_execution(text)
