import json

import pytest

from deerflow.rigor import (
    CompanyActionProposal,
    CompanyActionScope,
    CompanyActionType,
    RigorCompanyActionExecutionBlocked,
    RigorCompanyActionExecutionError,
    RigorCompanyActionExecutor,
)


class StubClient:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def chat(self, message, **kwargs):
        self.calls.append((message, kwargs))
        return self.response


@pytest.mark.asyncio
async def test_action_executor_runs_approved_internal_action():
    client = StubClient(
        json.dumps(
            {
                "status": "COMPLETE",
                "result_summary": "Prepared accelerator application draft.",
                "artifact_markdown": "# Draft\nPrepared content.",
                "evidence_refs": ["deadline-source"],
            }
        )
    )
    executor = RigorCompanyActionExecutor(client_factory=lambda: client)
    result = await executor.execute(
        CompanyActionProposal(
            action_type=CompanyActionType.APPLICATION_DRAFT,
            scope=CompanyActionScope.PREPARE,
            title="Prepare accelerator application",
            owner_agent="rigor-partnerships-capital",
        ),
        context="Deadline is active.",
    )

    assert result.status == "COMPLETE"
    assert "accelerator" in result.result_summary.lower()
    assert len(client.calls) == 1
    _, kwargs = client.calls[0]
    assert kwargs["subagent_enabled"] is True


@pytest.mark.asyncio
async def test_action_executor_blocks_founder_reserved_action():
    executor = RigorCompanyActionExecutor(
        client_factory=lambda: StubClient("{}")
    )
    with pytest.raises(RigorCompanyActionExecutionBlocked):
        await executor.execute(
            CompanyActionProposal(
                action_type=CompanyActionType.EMAIL_SEND,
                scope=CompanyActionScope.EXTERNAL_EXECUTE,
                title="Send investor email",
            )
        )


@pytest.mark.asyncio
async def test_action_executor_rejects_invalid_result():
    executor = RigorCompanyActionExecutor(
        client_factory=lambda: StubClient("not-json")
    )
    with pytest.raises(RigorCompanyActionExecutionError):
        await executor.execute(
            CompanyActionProposal(
                action_type=CompanyActionType.INTERNAL_RESEARCH,
                scope=CompanyActionScope.INTERNAL_EXECUTE,
                title="Research market",
            )
        )
