"""Policy-enforced action proposals for the RIGOR AI company.

This module is intentionally side-effect free. It classifies proposed company
actions into an automatic internal lane or a Founder-approval lane. External
connectors/executors must consume these decisions rather than trusting a model's
self-declared approval requirement.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class CompanyActionType(StrEnum):
    INTERNAL_RESEARCH = "INTERNAL_RESEARCH"
    INTERNAL_TEST = "INTERNAL_TEST"
    INTERNAL_DOCUMENT = "INTERNAL_DOCUMENT"
    INTERNAL_CODE_CHANGE = "INTERNAL_CODE_CHANGE"
    OUTREACH_DRAFT = "OUTREACH_DRAFT"
    SUPPORT_DRAFT = "SUPPORT_DRAFT"
    APPLICATION_DRAFT = "APPLICATION_DRAFT"
    EMAIL_SEND = "EMAIL_SEND"
    PUBLIC_POST = "PUBLIC_POST"
    AD_SPEND = "AD_SPEND"
    CONTRACT = "CONTRACT"
    CAPITAL_ACCEPT = "CAPITAL_ACCEPT"
    PAYMENT = "PAYMENT"
    PRODUCTION_PROMOTE = "PRODUCTION_PROMOTE"
    CREDENTIAL_CHANGE = "CREDENTIAL_CHANGE"
    DATA_DELETE = "DATA_DELETE"


class CompanyActionScope(StrEnum):
    OBSERVE = "OBSERVE"
    PREPARE = "PREPARE"
    INTERNAL_EXECUTE = "INTERNAL_EXECUTE"
    EXTERNAL_EXECUTE = "EXTERNAL_EXECUTE"
    FOUNDER_RESERVED = "FOUNDER_RESERVED"


class CompanyActionStatus(StrEnum):
    APPROVED = "APPROVED"
    NEEDS_APPROVAL = "NEEDS_APPROVAL"
    EXECUTING = "EXECUTING"
    COMPLETE = "COMPLETE"
    FAILED = "FAILED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class CompanyActionProposal(BaseModel):
    action_type: CompanyActionType
    scope: CompanyActionScope
    title: str = Field(min_length=1, max_length=255)
    summary: str | None = Field(default=None, max_length=4000)
    owner_agent: str | None = Field(default=None, max_length=128)
    target: str | None = Field(default=None, max_length=1000)
    reversible: bool = True
    evidence_refs: list[str] = Field(default_factory=list, max_length=20)
    payload: dict[str, Any] = Field(default_factory=dict)


class CompanyActionDecision(BaseModel):
    action_type: CompanyActionType
    scope: CompanyActionScope
    title: str
    summary: str | None = None
    owner_agent: str | None = None
    target: str | None = None
    reversible: bool
    evidence_refs: list[str] = Field(default_factory=list)
    payload: dict[str, Any] = Field(default_factory=dict)
    approval_required: bool
    status: CompanyActionStatus
    policy_reason: str


FOUNDER_RESERVED_ACTIONS = frozenset(
    {
        CompanyActionType.EMAIL_SEND,
        CompanyActionType.PUBLIC_POST,
        CompanyActionType.AD_SPEND,
        CompanyActionType.CONTRACT,
        CompanyActionType.CAPITAL_ACCEPT,
        CompanyActionType.PAYMENT,
        CompanyActionType.PRODUCTION_PROMOTE,
        CompanyActionType.CREDENTIAL_CHANGE,
        CompanyActionType.DATA_DELETE,
    }
)

AUTO_ALLOWED_ACTIONS = frozenset(
    {
        CompanyActionType.INTERNAL_RESEARCH,
        CompanyActionType.INTERNAL_TEST,
        CompanyActionType.INTERNAL_DOCUMENT,
        CompanyActionType.OUTREACH_DRAFT,
        CompanyActionType.SUPPORT_DRAFT,
        CompanyActionType.APPLICATION_DRAFT,
    }
)


def requires_founder_approval(
    action_type: CompanyActionType,
    scope: CompanyActionScope,
) -> tuple[bool, str]:
    """Return the enforced approval decision and evidence-friendly reason."""
    if action_type in FOUNDER_RESERVED_ACTIONS:
        return True, f"{action_type.value} is Founder-reserved"
    if scope in {
        CompanyActionScope.EXTERNAL_EXECUTE,
        CompanyActionScope.FOUNDER_RESERVED,
    }:
        return True, f"{scope.value} requires Founder approval"
    if action_type == CompanyActionType.INTERNAL_CODE_CHANGE:
        return True, "code changes require review before execution"
    if action_type in AUTO_ALLOWED_ACTIONS and scope in {
        CompanyActionScope.OBSERVE,
        CompanyActionScope.PREPARE,
        CompanyActionScope.INTERNAL_EXECUTE,
    }:
        return False, "bounded internal action is eligible for automatic execution"
    return True, "action is not on the automatic allowlist"


def decide_company_action(proposal: CompanyActionProposal) -> CompanyActionDecision:
    approval_required, reason = requires_founder_approval(
        proposal.action_type,
        proposal.scope,
    )
    return CompanyActionDecision(
        **proposal.model_dump(),
        approval_required=approval_required,
        status=(
            CompanyActionStatus.NEEDS_APPROVAL
            if approval_required
            else CompanyActionStatus.APPROVED
        ),
        policy_reason=reason,
    )
