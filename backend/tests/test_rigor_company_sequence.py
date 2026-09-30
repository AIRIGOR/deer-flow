import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from deerflow.rigor.company_sequence import CompanySequenceMiddleware


def call(role, index):
    return {"id": str(index), "name": "task", "args": {"subagent_type": role, "prompt": "review", "description": "review"}}


def history(roles):
    messages = [HumanMessage(content="Verify only public health; no investor work")]
    for index, role in enumerate(roles):
        messages += [AIMessage(content="", tool_calls=[call(role, index)]), ToolMessage(content=f"evidence-{index}", name="task", tool_call_id=str(index), additional_kwargs={"subagent_status": "completed"})]
    return messages


def test_duplicate_sixth_specialist_becomes_chief_with_all_real_reports():
    roles = ["rigor-product-ops", "rigor-engineering", "rigor-qa-security", "rigor-market-intel", "rigor-partnerships-capital"]
    messages = history(roles) + [AIMessage(content="", tool_calls=[call(roles[-1], 5)])]
    updated = CompanySequenceMiddleware().after_model({"messages": messages}, None)["messages"][0]
    assert len(updated.tool_calls) == 1
    assert updated.tool_calls[0]["args"]["subagent_type"] == "rigor-chief-of-staff"
    assert all(f"evidence-{index}" in updated.tool_calls[0]["args"]["prompt"] for index in range(5))


def test_duplicates_and_early_chief_become_distinct_specialists_with_three_call_ceiling():
    messages = history(["rigor-product-ops"]) + [AIMessage(content="", tool_calls=[call("rigor-product-ops", 10), call("rigor-chief-of-staff", 11), call("rigor-engineering", 12), call("rigor-qa-security", 13)])]
    updated = CompanySequenceMiddleware().after_model({"messages": messages}, None)["messages"][0]
    roles = [tc["args"]["subagent_type"] for tc in updated.tool_calls]
    assert len(roles) == len(set(roles)) == 3
    assert "rigor-product-ops" not in roles and "rigor-chief-of-staff" not in roles


def test_premature_final_reply_still_runs_missing_review_and_post_chief_cannot_delegate():
    updated = CompanySequenceMiddleware().after_model({"messages": history([]) + [AIMessage(content="done")]}, None)["messages"][0]
    assert updated.tool_calls[0]["args"]["subagent_type"] == "rigor-product-ops"
    updated = CompanySequenceMiddleware().after_model({"messages": history(["rigor-chief-of-staff"]) + [AIMessage(content="done", tool_calls=[call("rigor-engineering", 10)])]}, None)["messages"][0]
    assert updated.tool_calls == []


def test_failed_specialist_cannot_be_replaced_by_a_success_claim():
    messages = history(["rigor-product-ops"])
    messages[-1].additional_kwargs["subagent_status"] = "failed"
    messages.append(AIMessage(content="done"))
    with pytest.raises(ValueError, match="uncapped completed runtime result"):
        CompanySequenceMiddleware().after_model({"messages": messages}, None)


@pytest.mark.asyncio
async def test_async_sequence_has_no_blocking_io():
    from support.detectors.blocking_io_runtime import detect_blocking_io_strict

    messages = history([]) + [AIMessage(content="done")]
    with detect_blocking_io_strict():
        updated = await CompanySequenceMiddleware().aafter_model({"messages": messages}, None)
    assert updated["messages"][0].tool_calls


@pytest.mark.parametrize("roles", [[], ["rigor-product-ops", "rigor-engineering", "rigor-qa-security", "rigor-market-intel", "rigor-partnerships-capital"]])
def test_synthetic_company_calls_execute_through_real_tool_node(roles):
    from langchain_core.tools import tool
    from langgraph.prebuilt import ToolNode
    from langgraph.runtime import Runtime

    @tool("task")
    def task(subagent_type: str, prompt: str, description: str) -> str:
        """Return the assigned role for a synthetic routing check."""
        return subagent_type

    messages = history(roles) + [AIMessage(content="premature final response")]
    updated = CompanySequenceMiddleware().after_model({"messages": messages}, None)["messages"][0]
    result = ToolNode([task]).invoke([updated.tool_calls[0]], runtime=Runtime())
    assert result["messages"][0].content == updated.tool_calls[0]["args"]["subagent_type"]
    assert result["messages"][0].tool_call_id == updated.tool_calls[0]["id"]
