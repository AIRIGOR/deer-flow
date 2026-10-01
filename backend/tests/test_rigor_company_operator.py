import json
from types import SimpleNamespace

import pytest

from deerflow.rigor import (
    CompanyActionProposal,
    CompanyActionScope,
    CompanyActionStatus,
    CompanyActionType,
    RigorCompanyOperator,
    RigorCompanyPulseError,
    decide_company_action,
)


class StubClient:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def stream(self, message, **kwargs):
        self.calls.append((message, kwargs))
        messages = []
        for index, agent in enumerate(["rigor-product-ops", "rigor-engineering", "rigor-qa-security", "rigor-market-intel", "rigor-partnerships-capital", "rigor-chief-of-staff"]):
            call_id = str(index)
            messages.extend(
                [
                    {"type": "ai", "tool_calls": [{"id": call_id, "name": "task", "args": {"subagent_type": agent}}]},
                    {"type": "tool", "name": "task", "tool_call_id": call_id, "additional_kwargs": {"subagent_status": "completed", "subagent_result_sha256": "a" * 64}},
                ]
            )
        messages.append({"type": "ai", "content": self.response})
        yield SimpleNamespace(type="values", data={"messages": messages})


@pytest.mark.asyncio
async def test_company_operator_returns_structured_pulse():
    payload = {
        "current_state": "RIGOR preview is operational.",
        "top_priorities": ["Deploy company team", "Run first pulse", "Capture feedback"],
        "blockers_risks": ["Dependency remediation remains open."],
        "founder_approvals": ["Approve production promotion when QA passes."],
        "next_actions": ["Verify Render deploy", "Run pulse", "Review output"],
        "state_updates": [
            {
                "record_type": "MILESTONE",
                "title": "AI company team runnable",
                "status": "ACTIVE",
                "priority": "HIGH",
                "owner_agent": "rigor-chief-of-staff",
                "approval_required": False,
                "payload": {"phase": 1},
            }
        ],
        "action_proposals": [
            {
                "action_type": "APPLICATION_DRAFT",
                "scope": "PREPARE",
                "title": "Prepare accelerator application",
                "owner_agent": "rigor-partnerships-capital",
                "target": "accelerator",
                "reversible": True,
                "evidence_refs": ["application-deadline"],
                "payload": {},
            }
        ],
    }
    client = StubClient(json.dumps(payload))
    operator = RigorCompanyOperator(client_factory=lambda: client)

    result = await operator.run(
        objective="Run the first company review.",
        context="Preview smoke tests pass.",
    )

    assert result.top_priorities[0] == "Deploy company team"
    assert result.state_updates[0].record_type == "MILESTONE"
    assert result.action_proposals[0].action_type == CompanyActionType.APPLICATION_DRAFT
    assert len(client.calls) == 1
    _, kwargs = client.calls[0]
    assert kwargs["subagent_enabled"] is True
    assert kwargs["thread_id"].startswith("rigor-company-pulse-")
    assert len(result.delegation_receipts) == 6


def test_action_policy_auto_allows_bounded_internal_preparation():
    decision = decide_company_action(
        CompanyActionProposal(
            action_type=CompanyActionType.APPLICATION_DRAFT,
            scope=CompanyActionScope.PREPARE,
            title="Prepare E3 application",
            reversible=True,
        )
    )
    assert decision.status == CompanyActionStatus.APPROVED
    assert decision.approval_required is False


@pytest.mark.parametrize(
    ("action_type", "scope"),
    [
        (CompanyActionType.EMAIL_SEND, CompanyActionScope.EXTERNAL_EXECUTE),
        (CompanyActionType.AD_SPEND, CompanyActionScope.EXTERNAL_EXECUTE),
        (CompanyActionType.PAYMENT, CompanyActionScope.FOUNDER_RESERVED),
        (CompanyActionType.CONTRACT, CompanyActionScope.FOUNDER_RESERVED),
        (CompanyActionType.CAPITAL_ACCEPT, CompanyActionScope.FOUNDER_RESERVED),
        (CompanyActionType.PRODUCTION_PROMOTE, CompanyActionScope.FOUNDER_RESERVED),
        (CompanyActionType.CREDENTIAL_CHANGE, CompanyActionScope.FOUNDER_RESERVED),
        (CompanyActionType.DATA_DELETE, CompanyActionScope.FOUNDER_RESERVED),
    ],
)
def test_action_policy_forces_founder_approval(action_type, scope):
    decision = decide_company_action(
        CompanyActionProposal(
            action_type=action_type,
            scope=scope,
            title="Reserved action",
            reversible=False,
        )
    )
    assert decision.status == CompanyActionStatus.NEEDS_APPROVAL
    assert decision.approval_required is True


def test_code_change_requires_review():
    decision = decide_company_action(
        CompanyActionProposal(
            action_type=CompanyActionType.INTERNAL_CODE_CHANGE,
            scope=CompanyActionScope.INTERNAL_EXECUTE,
            title="Modify production code",
        )
    )
    assert decision.status == CompanyActionStatus.NEEDS_APPROVAL


@pytest.mark.asyncio
async def test_company_operator_rejects_invalid_result():
    operator = RigorCompanyOperator(client_factory=lambda: StubClient("not json"))

    with pytest.raises(RigorCompanyPulseError):
        await operator.run(objective="Run company review.")


@pytest.mark.asyncio
async def test_company_operator_rejects_empty_objective():
    operator = RigorCompanyOperator(client_factory=lambda: StubClient("{}"))

    with pytest.raises(ValueError, match="objective"):
        await operator.run(objective="   ")


def test_pulse_quarantines_invalid_actions_without_granting_execution():
    from deerflow.rigor.company_operator import _parse_pulse
    rejected = {"action_type": "DEPLOY_NOW", "scope": "INTERNAL_EXECUTE", "title": "Promote production"}
    reserved = {"action_type": "PRODUCTION_PROMOTE", "scope": "FOUNDER_RESERVED", "title": "Review production promotion"}
    result = _parse_pulse(json.dumps({"current_state": "Reviews completed; release blocked.", "top_priorities": ["Resolve release blockers"], "next_actions": ["Review rejected proposal"], "action_proposals": [rejected, reserved]}))
    assert len(result.action_proposals) == 1
    assert decide_company_action(result.action_proposals[0]).approval_required is True
    assert result.rejected_action_proposals == [{"proposal": rejected, "failure_code": "INVALID_ACTION_PROPOSAL", "status": "BLOCKED"}]
    assert "outside the executable action queue" in result.blockers_risks[-1]


@pytest.mark.parametrize("proposals", ["not a list", ["not an object"], [{}] * 13])
def test_pulse_rejects_malformed_action_collections(proposals):
    from deerflow.rigor.company_operator import _parse_pulse
    with pytest.raises(RigorCompanyPulseError):
        _parse_pulse(json.dumps({"current_state": "Reviewed", "top_priorities": ["Check"], "next_actions": ["Review"], "action_proposals": proposals}))
