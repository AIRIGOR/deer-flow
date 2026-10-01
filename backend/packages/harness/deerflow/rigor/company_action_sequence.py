"""Enforce a single real owner delegation for bounded internal company actions."""

from uuid import uuid4

from langchain.agents.middleware import AgentMiddleware

from deerflow.agents.middlewares.tool_call_metadata import clone_ai_message_with_tool_calls
from deerflow.rigor.company_receipts import SPECIALISTS

_ACTION_OWNERS = SPECIALISTS | {"rigor-chief-of-staff"}


class CompanyActionSequenceMiddleware(AgentMiddleware):
    """Reserve one task call and require its uncapped completion before synthesis."""

    def __init__(self, owner: str | None = None):
        if owner and owner not in _ACTION_OWNERS:
            raise ValueError("Action owner must be a registered RIGOR agent")
        self.owner = owner

    def after_model(self, state, runtime):
        messages = state.get("messages", [])
        if not messages or getattr(messages[-1], "type", None) != "ai":
            return None
        last = messages[-1]
        previous_calls = [call for message in messages[:-1] if getattr(message, "type", None) == "ai" for call in getattr(message, "tool_calls", []) if call.get("name") == "task"]
        task_calls = [call for call in last.tool_calls if call.get("name") == "task"]
        other_calls = [call for call in last.tool_calls if call.get("name") != "task"]
        if previous_calls:
            if len(previous_calls) != 1:
                raise ValueError("Action requires exactly one completed delegation to its owner")
            call = previous_calls[0]
            role = call.get("args", {}).get("subagent_type")
            if role not in _ACTION_OWNERS or (self.owner and role != self.owner):
                raise ValueError("Action delegation does not match its registered owner")
            results = [message for message in messages[:-1] if getattr(message, "type", None) == "tool" and message.name == "task" and message.tool_call_id == call.get("id")]
            if len(results) != 1 or results[0].additional_kwargs.get("subagent_status") != "completed" or results[0].additional_kwargs.get("subagent_stop_reason"):
                raise ValueError("Delegation lacks an uncapped completed runtime result")
            if not task_calls:
                return None
            selected = []
        else:
            first = task_calls[0] if task_calls else {}
            suggested = first.get("args", {}).get("subagent_type")
            role = self.owner or (suggested if suggested in _ACTION_OWNERS else "rigor-product-ops")
            objective = next((str(message.content) for message in messages if getattr(message, "type", None) == "human"), "")
            selected = [
                {
                    "id": first.get("id") or f"company-action-{uuid4()}",
                    "name": "task",
                    "type": "tool_call",
                    "args": {
                        "subagent_type": role,
                        "description": "Complete the single bounded internal company action",
                        "prompt": (
                            "Complete this assigned internal action and produce a nonempty evidence-backed artifact. Preserve supplied facts, sources, and unknowns. "
                            "Do not delegate, send messages, publish, spend money, sign contracts, change credentials, promote production, or delete data.\n\n"
                            f"{objective}"
                        ),
                    },
                }
            ]
        updated = clone_ai_message_with_tool_calls(last, other_calls + selected)
        updated.additional_kwargs.pop("tool_calls", None)
        return {"messages": [updated]}

    async def aafter_model(self, state, runtime):
        return self.after_model(state, runtime)
