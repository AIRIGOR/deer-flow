from types import SimpleNamespace

import pytest

from deerflow.rigor.execution_receipts import collect_execution


def event(kind, **data):
    return SimpleNamespace(type=kind, data=data)


class Client:
    def __init__(self, events):
        self.events = events

    def stream(self, *args, **kwargs):
        return iter(self.events)


def completed(agent="rigor-product-ops", task_id="task-1"):
    return [
        event("messages-tuple", type="ai", id="call", tool_calls=[{"name": "task", "id": task_id, "args": {"subagent_type": agent}}]),
        event("custom", type="task_started", task_id=task_id),
        event("custom", type="task_completed", task_id=task_id),
    ]


def test_receipt_requires_correlated_runtime_completion():
    events = completed() + [event("messages-tuple", type="ai", id="final", content='{"status":"COMPLETE"}')]
    text, receipts = collect_execution(Client(events), "work", owner="rigor-product-ops")
    assert text == '{"status":"COMPLETE"}'
    assert receipts[0].model_dump() == {"task_id": "task-1", "agent": "rigor-product-ops", "status": "COMPLETE"}


@pytest.mark.parametrize(
    "events",
    [
        [event("messages-tuple", type="ai", content='{"execution_receipts":[{"status":"COMPLETE"}]}')],
        completed()[:2],
        completed("rigor-engineering"),
        [event("custom", type="task_started", task_id="orphan"), event("custom", type="task_completed", task_id="orphan")],
    ],
)
def test_unverified_or_wrong_owner_cannot_complete(events):
    with pytest.raises(ValueError):
        collect_execution(Client(events), "work", owner="rigor-product-ops")


def test_pulse_requires_five_distinct_specialists_before_chief_synthesis():
    agents = ["rigor-product-ops", "rigor-engineering", "rigor-qa-security", "rigor-market-intel", "rigor-finance-runway", "rigor-chief-of-staff"]
    events = [e for index, agent in enumerate(agents) for e in completed(agent, str(index))]
    assert len(collect_execution(Client(events), "work", pulse=True)[1]) == 6
    with pytest.raises(ValueError):
        collect_execution(Client(events[:9] + events[15:]), "work", pulse=True)
    with pytest.raises(ValueError):
        collect_execution(Client(events[15:] + events[:15]), "work", pulse=True)
