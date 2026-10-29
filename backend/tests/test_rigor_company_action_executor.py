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
    assert kwargs["max_total_subagents"] == 1
    assert kwargs["max_concurrent_subagents"] == 1
    assert "COORDINATION CONTRACTS" in client.calls[0][0]


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
@pytest.mark.parametrize("owner", ["unknown-agent", "general-purpose", "bash", "rigor-company-operator", "rigor-company-action-executor", "rigor-document-analyst", "rigor-john-model", "rigor-john-brief", "", "rigor-engineering "])
async def test_action_executor_rejects_unregistered_or_non_dispatchable_owner_before_client_creation(owner):
    def forbidden_client():
        pytest.fail("An invalid handoff must not construct a model client")

    executor = RigorCompanyActionExecutor(client_factory=forbidden_client)
    with pytest.raises(RigorCompanyActionExecutionBlocked, match="registered RIGOR company subagent"):
        await executor.execute(CompanyActionProposal(action_type=CompanyActionType.INTERNAL_RESEARCH, scope=CompanyActionScope.OBSERVE, title="Review synthetic evidence", owner_agent=owner))


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


@pytest.mark.asyncio
async def test_action_executions_use_isolated_threads():
    client = StubClient(json.dumps({"status": "COMPLETE", "result_summary": "Reviewed"}))
    executor = RigorCompanyActionExecutor(client_factory=lambda: client)
    proposal = CompanyActionProposal(
        action_type=CompanyActionType.INTERNAL_RESEARCH,
        scope=CompanyActionScope.INTERNAL_EXECUTE,
        title="Review evidence",
    )
    await executor.execute(proposal)
    await executor.execute(proposal)
    threads = [kwargs["thread_id"] for _, kwargs in client.calls]
    assert all(thread.startswith("rigor-company-action-") for thread in threads)
    assert threads[0] != threads[1]
