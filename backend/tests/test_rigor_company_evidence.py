import json
from types import SimpleNamespace

import pytest
from langchain_core.messages import AIMessage, ToolMessage
from support.rigor_evidence import PULSE_AGENTS, checkpoint

from deerflow.agents.middlewares.delegation_ledger import extract_delegations
from deerflow.rigor.company_action_executor import RigorCompanyActionExecutionError, _parse_execution
from deerflow.rigor.company_evidence import CompanyEvidenceError, collect_company_evidence
from deerflow.rigor.company_operator import RigorCompanyOperator, RigorCompanyPulseError


def test_checkpoint_proof_omits_private_report_text_and_binds_the_model_output():
    history = checkpoint("rigor-company-pulse-test", PULSE_AGENTS)
    proof = collect_company_evidence(SimpleNamespace(get_thread=lambda _: history), history["thread_id"], "synthetic result", pulse=True)
    assert len(proof.delegations) == 6
    assert proof.run_id == "synthetic-run"
    assert "private fixture detail" not in proof.model_dump_json()
    assert len(proof.model_output_sha256) == 64


def test_evidence_accepts_the_existing_runtime_ledger_producer_format():
    messages = [
        AIMessage(content="", tool_calls=[{"id": "call-qa", "name": "task", "args": {"subagent_type": "rigor-qa-security", "description": "Synthetic check"}}]),
        ToolMessage(content="Synthetic result", tool_call_id="call-qa", id="result-qa", additional_kwargs={"subagent_status": "completed", "subagent_result_brief": "Synthetic result", "subagent_result_sha256": "a" * 64}),
    ]
    entries = extract_delegations(messages)
    for entry in entries:
        entry["run_id"] = "synthetic-run"
    history = {"thread_id": "rigor-company-action-test", "checkpoints": [{"checkpoint_id": "checkpoint", "values": {"delegations": entries}}]}
    evidence = collect_company_evidence(SimpleNamespace(get_thread=lambda _: history), history["thread_id"], "Synthetic result", pulse=False, owner="rigor-qa-security")
    assert evidence.delegations[0].id == "call-qa"
    assert evidence.delegations[0].result_ref == "result-qa"


@pytest.mark.parametrize("failure", ["empty", "foreign_thread", "failed", "capped", "digest", "duplicate", "unknown", "wrong_owner", "mixed_runs"])
def test_rejects_incomplete_or_mismatched_runtime_proof(failure):
    history = checkpoint("rigor-company-action-test", ["rigor-qa-security"])
    entries = history["checkpoints"][0]["values"]["delegations"]
    if failure == "empty":
        entries.clear()
    elif failure == "foreign_thread":
        history["thread_id"] = "different-thread"
    elif failure == "failed":
        entries[0]["status"] = "failed"
    elif failure == "capped":
        entries[0]["stop_reason"] = "token_capped"
    elif failure == "digest":
        entries[0]["result_sha256"] = "fabricated"
    elif failure == "unknown":
        entries[0]["subagent_type"] = "general-purpose"
    elif failure in {"duplicate", "mixed_runs"}:
        history = checkpoint("rigor-company-action-test", PULSE_AGENTS)
        entries = history["checkpoints"][0]["values"]["delegations"]
        entries[1]["id" if failure == "duplicate" else "run_id"] = entries[0]["id"] if failure == "duplicate" else "different-run"
    with pytest.raises(CompanyEvidenceError, match="delegation evidence"):
        collect_company_evidence(SimpleNamespace(get_thread=lambda _: history), "rigor-company-action-test", "synthetic", pulse=failure in {"duplicate", "mixed_runs"}, owner="rigor-engineering" if failure == "wrong_owner" else None)


def test_checkpoint_read_errors_are_sanitized():
    def unavailable(_):
        raise RuntimeError("private provider detail")

    with pytest.raises(CompanyEvidenceError) as rejected:
        collect_company_evidence(SimpleNamespace(get_thread=unavailable), "thread", "result", pulse=False)
    assert "private provider detail" not in str(rejected.value)


@pytest.mark.parametrize(
    "status,approval,refs",
    [
        ("UNRESOLVED", True, ["task-1", "task-2"]),
        ("PROPOSED_FOR_REVIEW", True, ["task-1", "task-2"]),
        ("RESOLVED", True, ["task-1", "task-2"]),
        ("UNRESOLVED", False, ["task-1", "task-2"]),
        ("UNRESOLVED", True, ["task-1", "invented"]),
        ("UNRESOLVED", True, ["task-1", "task-1"]),
    ],
)
@pytest.mark.asyncio
async def test_reconciliation_requires_real_distinct_evidence_and_human_review(status, approval, refs):
    payload = {
        "current_state": "Synthetic review",
        "top_priorities": ["Review"],
        "next_actions": ["Human decision"],
        "findings": [{"summary": "Conflicting specialist assessments", "evidence_ids": ["task-1"]}],
        "reconciliations": [{"topic": "Synthetic capacity discrepancy", "assessment": "Request human comparison of both reports", "evidence_ids": refs, "status": status, "approval_required": approval}],
    }
    client = SimpleNamespace(chat=lambda *args, **kwargs: json.dumps(payload), get_thread=lambda thread_id: checkpoint(thread_id, PULSE_AGENTS))
    operator = RigorCompanyOperator(client_factory=lambda: client)
    if status in {"UNRESOLVED", "PROPOSED_FOR_REVIEW"} and approval and refs == ["task-1", "task-2"]:
        result = await operator.run(objective="Synthetic review")
        assert result.reconciliations[0].approval_required is True
        assert result.reconciliations[0].status != "RESOLVED"
        assert len(result.execution_evidence.delegations) == 6
    else:
        with pytest.raises(RigorCompanyPulseError):
            await operator.run(objective="Synthetic review")


def test_model_cannot_supply_runtime_execution_proof():
    with pytest.raises(RigorCompanyActionExecutionError):
        _parse_execution(json.dumps({"status": "COMPLETE", "result_summary": "Claim", "execution_evidence": {"source": "DEERFLOW_CHECKPOINT_LEDGER"}}))


@pytest.mark.asyncio
async def test_specialist_names_are_bound_to_the_actual_completed_delegations():
    payload = {
        "current_state": "Synthetic review",
        "top_priorities": ["Review"],
        "next_actions": ["Human decision"],
        "findings": [{"summary": "Operator finding", "evidence_ids": ["rigor-product-ops"]}],
        "reconciliations": [{"topic": "Disagreement", "assessment": "Ask human reviewer", "evidence_ids": ["rigor-product-ops", "rigor-engineering"], "status": "UNRESOLVED"}],
    }
    client = SimpleNamespace(chat=lambda *args, **kwargs: json.dumps(payload), get_thread=lambda thread_id: checkpoint(thread_id, PULSE_AGENTS))
    result = await RigorCompanyOperator(client_factory=lambda: client).run(objective="Synthetic review")
    assert result.findings[0].evidence_ids == ["task-1"]
    assert result.reconciliations[0].evidence_ids == ["task-1", "task-2"]
