import json
from types import SimpleNamespace

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

    def stream(self, message, **kwargs):
        self.calls.append((message, kwargs))
        for index, agent in enumerate(["rigor-partnerships-capital"]):
            task_id = f"task-{index}"
            yield SimpleNamespace(type="messages-tuple", data={"type": "ai", "tool_calls": [{"name": "task", "id": task_id, "args": {"subagent_type": agent}}]})
            yield SimpleNamespace(type="custom", data={"type": "task_started", "task_id": task_id})
            yield SimpleNamespace(type="custom", data={"type": "task_completed", "task_id": task_id})
        yield SimpleNamespace(type="messages-tuple", data={"type": "ai", "id": "final", "content": self.response})


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
    executor = RigorCompanyActionExecutor(client_factory=lambda: StubClient("{}"))
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
    executor = RigorCompanyActionExecutor(client_factory=lambda: StubClient("not-json"))
    with pytest.raises(RigorCompanyActionExecutionError):
        await executor.execute(
            CompanyActionProposal(
                action_type=CompanyActionType.INTERNAL_RESEARCH,
                scope=CompanyActionScope.INTERNAL_EXECUTE,
                title="Research market",
            )
        )
