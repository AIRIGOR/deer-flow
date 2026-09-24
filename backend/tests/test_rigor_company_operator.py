import json

import pytest

from deerflow.rigor.company_operator import (
    RigorCompanyOperator,
    RigorCompanyPulseError,
)


class StubClient:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def chat(self, message, **kwargs):
        self.calls.append((message, kwargs))
        return self.response


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
    }
    client = StubClient(json.dumps(payload))
    operator = RigorCompanyOperator(client_factory=lambda: client)

    result = await operator.run(
        objective="Run the first company review.",
        context="Preview smoke tests pass.",
    )

    assert result.top_priorities[0] == "Deploy company team"
    assert result.state_updates[0].record_type == "MILESTONE"
    assert len(client.calls) == 1
    message, kwargs = client.calls[0]
    assert kwargs["subagent_enabled"] is True
    assert kwargs["thread_id"] == "rigor-company-pulse"
    assert "rigor-growth-sales" in message
    assert "rigor-customer-success" in message
    assert "rigor-finance-ops" in message
    assert "rigor-product-ops" not in message.split("Operating sequence:", 1)[1].split("Human authority boundary:", 1)[0]


@pytest.mark.asyncio
async def test_company_operator_rejects_invalid_result():
    operator = RigorCompanyOperator(
        client_factory=lambda: StubClient("not json")
    )

    with pytest.raises(RigorCompanyPulseError):
        await operator.run(objective="Run company review.")


@pytest.mark.asyncio
async def test_company_operator_rejects_empty_objective():
    operator = RigorCompanyOperator(
        client_factory=lambda: StubClient("{}")
    )

    with pytest.raises(ValueError, match="objective"):
        await operator.run(objective="   ")
