"""Correlate task-tool requests with runtime events; never trust model receipts."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

AGENTS = frozenset(
    {
        "rigor-chief-of-staff",
        "rigor-product-ops",
        "rigor-engineering",
        "rigor-qa-security",
        "rigor-market-intel",
        "rigor-partnerships-capital",
        "rigor-growth-revenue",
        "rigor-customer-success",
        "rigor-finance-runway",
    }
)


class ExecutionReceipt(BaseModel):
    task_id: str
    agent: str
    status: Literal["COMPLETE"] = "COMPLETE"


def collect_execution(client, prompt: str, *, owner: str | None = None, pulse: bool = False, **kwargs):
    chunks: dict[str, list[str]] = {}
    last_id = ""
    calls: dict[str, str] = {}
    started: dict[str, int] = {}
    completed: dict[str, int] = {}
    failed: set[str] = set()
    for index, event in enumerate(client.stream(prompt, **kwargs)):
        data = event.data
        if event.type == "messages-tuple" and data.get("type") == "ai":
            message_id = data.get("id") or ""
            if data.get("content"):
                chunks.setdefault(message_id, []).append(data["content"])
                last_id = message_id
            for call in data.get("tool_calls", []):
                if call.get("name") != "task" or not call.get("id"):
                    continue
                args = call.get("args")
                agent = args.get("subagent_type") if isinstance(args, dict) else None
                if agent:
                    calls[call["id"]] = agent
        if event.type == "custom":
            task_id = data.get("task_id")
            if not isinstance(task_id, str) or not task_id:
                continue
            kind = data.get("type")
            if kind == "task_started":
                started.setdefault(task_id, index)
            elif kind == "task_completed":
                completed[task_id] = index
            elif kind in {"task_failed", "task_timed_out", "task_cancelled"}:
                failed.add(task_id)
    expected = 6 if pulse else 1
    if len(calls) != expected or failed or len(started) != expected or len(completed) != expected:
        raise ValueError("Specialist runtime execution was not verified")
    for task_id, agent in calls.items():
        if agent not in AGENTS or task_id not in started or task_id not in completed or started[task_id] >= completed[task_id]:
            raise ValueError("Specialist receipt correlation failed")
    if pulse:
        chiefs = [task_id for task_id, agent in calls.items() if agent == "rigor-chief-of-staff"]
        specialists = [task_id for task_id, agent in calls.items() if agent != "rigor-chief-of-staff"]
        if len(chiefs) != 1 or len({calls[task_id] for task_id in specialists}) != 5:
            raise ValueError("Company cycle requires five distinct specialists and one chief")
        if started[chiefs[0]] <= max(completed[task_id] for task_id in specialists):
            raise ValueError("Chief synthesis must follow all specialist reports")
    elif owner and next(iter(calls.values())) != owner:
        raise ValueError("Executed specialist differs from action owner")
    receipts = [ExecutionReceipt(task_id=task_id, agent=agent) for task_id, agent in calls.items()]
    return "".join(chunks.get(last_id, ())), receipts
