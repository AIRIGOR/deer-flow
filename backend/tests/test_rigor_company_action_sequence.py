import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from deerflow.rigor.company_action_sequence import CompanyActionSequenceMiddleware


def task(role, call_id):
    return {"id": call_id, "name": "task", "args": {"subagent_type": role, "prompt": "model rewrite", "description": "review"}}


def update(messages, owner="rigor-product-ops"):
    return CompanyActionSequenceMiddleware(owner).after_model({"messages": messages}, None)["messages"][0]


def test_multiple_wrong_owner_calls_become_one_assigned_task_with_original_context():
    messages = [HumanMessage(content="ACTION PROPOSAL: moat review\nCOMPANY CONTEXT: source-123"), AIMessage(content="", tool_calls=[task("rigor-engineering", "first"), task("rigor-qa-security", "second")])]
    result = update(messages)
    assert len(result.tool_calls) == 1
    assert result.tool_calls[0]["args"]["subagent_type"] == "rigor-product-ops"
    assert "source-123" in result.tool_calls[0]["args"]["prompt"]
    assert "model rewrite" not in result.tool_calls[0]["args"]["prompt"]


def test_premature_final_answer_routes_through_real_tool_node():
    from langchain_core.tools import tool
    from langgraph.prebuilt import ToolNode
    from langgraph.runtime import Runtime

    @tool("task")
    def delegated_task(subagent_type: str, prompt: str, description: str) -> str:
        """Return the actual assigned role."""
        return subagent_type

    result = update([HumanMessage(content="bounded work"), AIMessage(content="done")])
    actual = ToolNode([delegated_task]).invoke(result.tool_calls, runtime=Runtime())["messages"][0]
    assert actual.content == "rigor-product-ops"
    assert actual.tool_call_id == result.tool_calls[0]["id"]


def completed(status="completed", stop_reason=None):
    return [
        HumanMessage(content="bounded work"),
        AIMessage(content="", tool_calls=[task("rigor-product-ops", "first")]),
        ToolMessage(content="actual artifact", name="task", tool_call_id="first", additional_kwargs={"subagent_status": status, "subagent_stop_reason": stop_reason}),
    ]


def test_completed_owner_cannot_delegate_again():
    result = update(completed() + [AIMessage(content="final artifact", tool_calls=[task("rigor-product-ops", "second")])])
    assert result.tool_calls == []
    assert result.content == "final artifact"


@pytest.mark.parametrize("status,reason", [("failed", None), ("completed", "turn_limit")])
def test_failed_or_capped_owner_cannot_become_success(status, reason):
    with pytest.raises(ValueError, match="uncapped completed"):
        update(completed(status, reason) + [AIMessage(content="done")])


def test_unknown_owner_rejected_and_optional_owner_uses_registered_role():
    with pytest.raises(ValueError, match="registered"):
        CompanyActionSequenceMiddleware("unregistered")
    result = update([HumanMessage(content="bounded work"), AIMessage(content="", tool_calls=[task("rigor-engineering", "first")])], owner=None)
    assert result.tool_calls[0]["args"]["subagent_type"] == "rigor-engineering"


@pytest.mark.asyncio
async def test_async_action_sequence_has_no_blocking_io():
    from support.detectors.blocking_io_runtime import detect_blocking_io_strict

    with detect_blocking_io_strict():
        result = await CompanyActionSequenceMiddleware("rigor-product-ops").aafter_model({"messages": [HumanMessage(content="bounded work"), AIMessage(content="done")]}, None)
    assert len(result["messages"][0].tool_calls) == 1


def test_default_action_client_has_single_owner_middleware_and_no_cycle_skill(monkeypatch):
    from deerflow.rigor import company_action_executor as module

    monkeypatch.setattr(module, "DeerFlowClient", lambda **kwargs: kwargs)
    client = module.RigorCompanyActionExecutor._default_client_factory("rigor-product-ops")
    assert client["available_skills"] == set()
    assert len(client["middlewares"]) == 1
    assert isinstance(client["middlewares"][0], CompanyActionSequenceMiddleware)
    assert client["middlewares"][0].owner == "rigor-product-ops"
