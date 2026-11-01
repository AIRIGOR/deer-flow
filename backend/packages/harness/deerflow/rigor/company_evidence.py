"""Bind company results to server-read checkpoint evidence, never model claims."""

from __future__ import annotations

import hashlib
import re
from typing import Literal

from pydantic import BaseModel, Field

from .agent_contracts import company_subagent_names


class CompanyEvidenceError(RuntimeError):
    pass


class DelegationEvidence(BaseModel):
    id: str = Field(min_length=1, max_length=200)
    agent: str = Field(min_length=1, max_length=128)
    status: Literal["completed"] = "completed"
    result_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    result_ref: str = Field(min_length=1, max_length=500)


class CompanyExecutionEvidence(BaseModel):
    source: Literal["DEERFLOW_CHECKPOINT_LEDGER"] = "DEERFLOW_CHECKPOINT_LEDGER"
    thread_id: str = Field(min_length=1, max_length=200)
    checkpoint_id: str = Field(min_length=1, max_length=200)
    run_id: str = Field(min_length=1, max_length=200)
    model_output_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    delegations: list[DelegationEvidence] = Field(min_length=1, max_length=6)


class CompanyFinding(BaseModel):
    summary: str = Field(min_length=1, max_length=2000)
    evidence_ids: list[str] = Field(min_length=1, max_length=6)


class CompanyReconciliation(BaseModel):
    topic: str = Field(min_length=1, max_length=240)
    assessment: str = Field(min_length=1, max_length=2000)
    evidence_ids: list[str] = Field(min_length=2, max_length=6)
    status: Literal["UNRESOLVED", "PROPOSED_FOR_REVIEW"]
    approval_required: Literal[True] = True


def collect_company_evidence(client, thread_id: str, text: str, *, pulse: bool, owner: str | None = None) -> CompanyExecutionEvidence:
    try:
        history = client.get_thread(thread_id)
        if history["thread_id"] != thread_id or not history["checkpoints"]:
            raise ValueError
        latest = history["checkpoints"][-1]
        entries = latest["values"]["delegations"]
        expected = 6 if pulse else 1
        if len(entries) != expected or not isinstance(latest["checkpoint_id"], str) or not latest["checkpoint_id"].strip():
            raise ValueError
        allowed = set(company_subagent_names())
        run_ids = {entry.get("run_id") for entry in entries}
        if len(run_ids) != 1 or not isinstance(next(iter(run_ids)), str) or not next(iter(run_ids)).strip():
            raise ValueError
        evidence = []
        ids = set()
        for entry in entries:
            if (
                not isinstance(entry["id"], str)
                or not entry["id"].strip()
                or entry["id"] in ids
                or entry["subagent_type"] not in allowed
                or entry["status"] != "completed"
                or entry.get("stop_reason")
                or not re.fullmatch(r"[0-9a-f]{64}", entry.get("result_sha256", ""))
                or not isinstance(entry.get("result_ref"), str)
                or not entry["result_ref"].strip()
            ):
                raise ValueError
            ids.add(entry["id"])
            evidence.append(DelegationEvidence(id=entry["id"], agent=entry["subagent_type"], result_sha256=entry["result_sha256"], result_ref=entry["result_ref"]))
        agents = [item.agent for item in evidence]
        if pulse and (len(set(agents)) != 6 or agents.count("rigor-chief-of-staff") != 1):
            raise ValueError
        if not pulse and owner is not None and agents != [owner]:
            raise ValueError
        return CompanyExecutionEvidence(thread_id=thread_id, checkpoint_id=latest["checkpoint_id"], run_id=next(iter(run_ids)), model_output_sha256=hashlib.sha256(text.encode()).hexdigest(), delegations=evidence)
    except Exception as exc:
        raise CompanyEvidenceError("Company delegation evidence unavailable or invalid") from exc


def bind_reasoning_evidence(evidence: CompanyExecutionEvidence, findings: list[CompanyFinding], reconciliations: list[CompanyReconciliation]) -> None:
    allowed = {entry.id for entry in evidence.delegations}
    agents = {entry.agent: entry.id for entry in evidence.delegations}
    if not findings:
        raise CompanyEvidenceError("Company findings require delegation evidence")
    for item in [*findings, *reconciliations]:
        bound = [ref if ref in allowed else agents.get(ref, "") for ref in item.evidence_ids]
        if len(set(bound)) != len(bound) or not set(bound) <= allowed:
            raise CompanyEvidenceError("Company reasoning cites invalid delegation evidence")
        item.evidence_ids = bound
