"""Validate company delegation using runtime messages, never model claims."""

from __future__ import annotations

import logging
import re
from uuid import uuid4

SPECIALISTS = {
    "rigor-product-ops",
    "rigor-engineering",
    "rigor-qa-security",
    "rigor-market-intel",
    "rigor-partnerships-capital",
    "rigor-growth-revenue",
    "rigor-customer-success",
    "rigor-finance-runway",
}


def run_with_receipts(client, prompt: str, *, mode: str, owner: str | None = None, **kwargs):
    messages = []
    chunks: dict[str, list[str]] = {}
    last_id = ""
    for event in client.stream(prompt, thread_id=f"rigor-company-{mode}-{uuid4()}", **kwargs):
        if event.type == "values" and isinstance(event.data.get("messages"), list):
            messages = event.data["messages"]
        if event.type == "messages-tuple" and event.data.get("type") == "ai":
            delta = event.data.get("content", "")
            if delta:
                last_id = event.data.get("id") or ""
                chunks.setdefault(last_id, []).append(delta)

    calls = {}
    results = {}
    for position, message in enumerate(messages):
        if message.get("type") == "ai":
            for call in message.get("tool_calls", []):
                if call.get("name") != "task":
                    continue
                call_id = call.get("id")
                if not call_id or call_id in calls:
                    raise ValueError("Missing or duplicate delegation call ID")
                calls[call_id] = (call.get("args", {}).get("subagent_type"), position)
        elif message.get("type") == "tool" and message.get("name") == "task":
            results[message.get("tool_call_id")] = (message.get("additional_kwargs", {}), position)

    receipts = []
    for call_id, (agent, call_position) in calls.items():
        metadata, result_position = results.get(call_id, ({}, -1))
        digest = metadata.get("subagent_result_sha256", "")
        if metadata.get("subagent_status") != "completed" or metadata.get("subagent_stop_reason") or not re.fullmatch(r"[0-9a-f]{64}", digest) or result_position <= call_position:
            raise ValueError("Delegation lacks an uncapped completed runtime result")
        receipts.append({"call_id": call_id, "agent": agent, "status": "completed", "result_sha256": digest})

    agents = [receipt["agent"] for receipt in receipts]
    if mode == "pulse":
        if len(agents) != 6 or len(set(agents[:5])) != 5 or not set(agents[:5]) <= SPECIALISTS or agents[-1] != "rigor-chief-of-staff":
            safe_agents = [agent if agent in SPECIALISTS | {"rigor-chief-of-staff"} else "unregistered" for agent in agents]
            logging.getLogger(__name__).warning("RIGOR company sequence invalid: task_count=%s roles=%s", len(agents), ",".join(safe_agents))
            raise ValueError("Company cycle requires five specialists and one final Chief of Staff")
        chief_position = calls[receipts[-1]["call_id"]][1]
        if any(results[receipt["call_id"]][1] >= chief_position for receipt in receipts[:5]):
            raise ValueError("Chief of Staff started before all specialist results returned")
    elif mode == "action":
        if len(agents) != 1 or agents[0] not in SPECIALISTS | {"rigor-chief-of-staff"} or (owner and agents[0] != owner):
            raise ValueError("Action requires exactly one completed delegation to its owner")
    else:
        raise ValueError("Unknown company execution mode")

    text = "".join(chunks.get(last_id, []))
    if not text:
        text = next((message.get("content", "") for message in reversed(messages) if message.get("type") == "ai" and not message.get("tool_calls")), "")
    return text, receipts
