"""Reserve company delegation slots for distinct reviews and final synthesis."""

from uuid import uuid4

from langchain.agents.middleware import AgentMiddleware

from deerflow.agents.middlewares.tool_call_metadata import clone_ai_message_with_tool_calls
from deerflow.rigor.company_receipts import SPECIALISTS

_FALLBACK_ROLES = (
    "rigor-product-ops",
    "rigor-engineering",
    "rigor-qa-security",
    "rigor-customer-success",
    "rigor-finance-runway",
    "rigor-market-intel",
    "rigor-growth-revenue",
    "rigor-partnerships-capital",
)


class CompanySequenceMiddleware(AgentMiddleware):
    """Enforce the existing six-delegation company contract before tools execute."""

    def after_model(self, state, runtime):
        messages = state.get("messages", [])
        if not messages or getattr(messages[-1], "type", None) != "ai":
            return None
        last = messages[-1]
        previous_calls = {call["id"]: call["args"].get("subagent_type") for message in messages[:-1] if getattr(message, "type", None) == "ai" for call in getattr(message, "tool_calls", []) if call.get("name") == "task"}
        results = {message.tool_call_id: message for message in messages[:-1] if getattr(message, "type", None) == "tool" and message.name == "task"}
        if any(call_id not in results or results[call_id].additional_kwargs.get("subagent_status") != "completed" or results[call_id].additional_kwargs.get("subagent_stop_reason") for call_id in previous_calls):
            raise ValueError("Delegation lacks an uncapped completed runtime result")
        used = list(previous_calls.values())
        task_calls = [call for call in last.tool_calls if call.get("name") == "task"]
        other_calls = [call for call in last.tool_calls if call.get("name") != "task"]
        if "rigor-chief-of-staff" in used:
            return {"messages": [clone_ai_message_with_tool_calls(last, other_calls)]} if task_calls else None

        objective = next((str(message.content) for message in messages if getattr(message, "type", None) == "human"), "")
        if len(used) == 5:
            reports = "\n\n".join(f"{previous_calls[call_id]}:\n{message.content}" for call_id, message in results.items() if call_id in previous_calls)
            selected = [
                {
                    "id": f"company-chief-{uuid4()}",
                    "name": "task",
                    "args": {
                        "subagent_type": "rigor-chief-of-staff",
                        "description": "Reconcile five completed company reviews",
                        "prompt": (
                            f"Synthesize the five completed specialist reviews for this objective. Preserve evidence and unknowns; do not invent facts or perform external actions.\n\n{objective}\n\nCOMPLETED SPECIALIST REPORTS:\n{reports}"
                        ),
                    },
                }
            ]
        else:
            selected = []
            candidates = task_calls or [{"id": f"company-review-{uuid4()}", "name": "task", "args": {}}]
            for call in candidates[: min(3, 5 - len(used))]:
                args = dict(call.get("args", {}))
                role = args.get("subagent_type")
                if role not in SPECIALISTS or role in used:
                    role = next(role for role in _FALLBACK_ROLES if role not in used)
                    args["prompt"] = f"Review this objective from your assigned specialist role. Use supplied evidence; label unknowns and do not invent facts or perform external actions.\n\n{objective}"
                args["subagent_type"] = role
                args.setdefault("description", "Review the bounded founder objective")
                selected.append({**call, "args": args})
                used.append(role)
        updated = clone_ai_message_with_tool_calls(last, other_calls + selected)
        updated.additional_kwargs.pop("tool_calls", None)
        return {"messages": [updated]}

    async def aafter_model(self, state, runtime):
        return self.after_model(state, runtime)
