import pytest
from langchain_core.messages import AIMessage, HumanMessage

from deerflow.agents.middlewares.dynamic_context_middleware import DynamicContextMiddleware
from deerflow.rigor.company_action_sequence import CompanyActionSequenceMiddleware
from deerflow.rigor.company_sequence import CompanySequenceMiddleware


@pytest.mark.parametrize("middleware", [CompanyActionSequenceMiddleware("rigor-partnerships-capital"), CompanySequenceMiddleware()])
def test_delegation_uses_real_command_after_injected_memory(middleware):
    objective = "ACTION PROPOSAL: prepare ten outreach drafts; keep UNSENT"
    messages = DynamicContextMiddleware._make_reminder_and_user_messages(
        HumanMessage(content=objective, id="command"), "Current date", "OLD MEMORY: generic readiness review"
    ) + [AIMessage(content="premature summary")]
    update = middleware.after_model({"messages": messages}, None)
    prompt = update["messages"][0].tool_calls[0]["args"]["prompt"]
    assert objective in prompt
    assert "OLD MEMORY" not in prompt


@pytest.mark.parametrize("middleware", [CompanyActionSequenceMiddleware(), CompanySequenceMiddleware()])
def test_missing_actual_command_cannot_delegate_memory_as_work(middleware):
    messages = [HumanMessage(content="memory", additional_kwargs={"hide_from_ui": True, "dynamic_context_reminder": True}), AIMessage(content="done")]
    with pytest.raises(ValueError, match="actual company command"):
        middleware.after_model({"messages": messages}, None)
