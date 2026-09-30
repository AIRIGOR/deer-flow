from types import SimpleNamespace

import pytest

from deerflow.rigor.company_receipts import run_with_receipts


class Client:
    def __init__(self, messages):
        self.messages = messages

    def stream(self, prompt, **kwargs):
        yield SimpleNamespace(type="values", data={"messages": self.messages})


def delegation(agent, call_id, status="completed", stop_reason=None):
    metadata = {"subagent_status": status, "subagent_result_sha256": "a" * 64}
    if stop_reason:
        metadata["subagent_stop_reason"] = stop_reason
    return [
        {"type": "ai", "tool_calls": [{"id": call_id, "name": "task", "args": {"subagent_type": agent}}]},
        {"type": "tool", "name": "task", "tool_call_id": call_id, "additional_kwargs": metadata},
    ]


def test_records_runtime_delegation_not_model_claim():
    messages = delegation("rigor-qa-security", "call-1") + [{"type": "ai", "content": '{"status":"COMPLETE"}'}]
    text, receipts = run_with_receipts(Client(messages), "proof", mode="action", owner="rigor-qa-security")
    assert text == '{"status":"COMPLETE"}'
    assert receipts[0]["agent"] == "rigor-qa-security"
    assert receipts[0]["result_sha256"] == "a" * 64


@pytest.mark.parametrize(
    "messages",
    [
        [{"type": "ai", "content": '{"status":"COMPLETE"}'}],
        delegation("rigor-qa-security", "call-1", status="failed"),
        delegation("rigor-qa-security", "call-1", stop_reason="token_capped"),
        delegation("rigor-market-intel", "call-1"),
    ],
)
def test_rejects_missing_failed_capped_or_wrong_owner_delegation(messages):
    with pytest.raises(ValueError):
        run_with_receipts(Client(messages), "proof", mode="action", owner="rigor-qa-security")


def test_cycle_requires_five_distinct_specialists_then_chief():
    agents = ["rigor-product-ops", "rigor-engineering", "rigor-qa-security", "rigor-market-intel", "rigor-partnerships-capital", "rigor-chief-of-staff"]
    messages = sum((delegation(agent, str(index)) for index, agent in enumerate(agents)), [])
    _, receipts = run_with_receipts(Client(messages), "proof", mode="pulse")
    assert len(receipts) == 6
    with pytest.raises(ValueError):
        run_with_receipts(Client(messages[2:] + messages[:2]), "proof", mode="pulse")


def test_chief_cannot_start_before_all_specialists_return():
    agents = ["rigor-product-ops", "rigor-engineering", "rigor-qa-security", "rigor-market-intel", "rigor-partnerships-capital"]
    pairs = [delegation(agent, str(index)) for index, agent in enumerate(agents)]
    messages = [pair[0] for pair in pairs] + delegation("rigor-chief-of-staff", "chief") + [pair[1] for pair in pairs]
    with pytest.raises(ValueError):
        run_with_receipts(Client(messages), "proof", mode="pulse")
