import json
from dataclasses import FrozenInstanceError, asdict, replace

import pytest

from deerflow.rigor.agent_contracts import company_subagent_names, get_agent_contracts, render_company_handoffs
from deerflow.subagents.builtins import BUILTIN_SUBAGENTS
from deerflow.subagents.builtins.rigor_company import RIGOR_COMPANY_SUBAGENTS


def test_inventory_covers_every_builtin_and_rigor_entrypoint_without_granting_dispatch():
    registry = get_agent_contracts()
    assert set(registry) == set(BUILTIN_SUBAGENTS) | {"rigor-company-operator", "rigor-company-action-executor", "rigor-document-analyst", "rigor-john-model", "rigor-john-brief"}
    assert len(registry) == 16
    assert set(company_subagent_names()) == set(RIGOR_COMPANY_SUBAGENTS)
    assert "general-purpose" not in company_subagent_names()
    assert "rigor-john-model" not in company_subagent_names()


def test_contracts_have_explicit_mission_authority_io_handoffs_failure_and_provenance():
    registry = get_agent_contracts()
    for name, contract in registry.items():
        assert name == contract.name
        for field in ("mission", "authority", "inputs", "outputs", "handoffs", "failure_behavior", "entrypoint", "enforcement"):
            assert getattr(contract, field), (name, field)
        assert all(target in registry or target in {"CALLER", "HUMAN_REVIEW"} for target in contract.handoffs)
        assert "Do not claim unverified completion." in contract.failure_behavior
        assert contract.tool_scope in {"DECLARED_ALLOWLIST", "INHERITED_RUNTIME", "NO_TOOLS"}
    json.dumps({name: asdict(contract) for name, contract in registry.items()})


def test_builtin_tool_and_budget_contracts_are_derived_from_real_configs():
    registry = get_agent_contracts()
    for name, config in BUILTIN_SUBAGENTS.items():
        contract = registry[name]
        assert contract.tools == (tuple(config.tools) if config.tools is not None else None)
        assert contract.disallowed_tools == tuple(config.disallowed_tools or ())
        assert contract.declared_max_turns == config.max_turns
        assert contract.declared_timeout_seconds == config.timeout_seconds
        assert contract.declared_skills == (tuple(config.skills) if config.skills is not None else None)
        assert contract.mission == config.description.strip()
        assert contract.max_delegations == 0
    assert registry["general-purpose"].tool_scope == "INHERITED_RUNTIME"
    for name in ("rigor-document-analyst", "rigor-john-model", "rigor-john-brief"):
        assert registry[name].tools == ()
        assert registry[name].tool_scope == "NO_TOOLS"
    assert registry["rigor-company-operator"].max_delegations == 6
    assert registry["rigor-company-operator"].max_concurrent_delegations == 3
    assert registry["rigor-company-action-executor"].max_delegations == 1
    assert registry["rigor-company-action-executor"].max_concurrent_delegations == 1


def test_inventory_snapshots_cannot_mutate_live_agent_configuration():
    registry = get_agent_contracts()
    contract = registry.pop("rigor-engineering")
    with pytest.raises(FrozenInstanceError):
        contract.name = "promoted-agent"
    assert "rigor-engineering" in get_agent_contracts()
    assert isinstance(contract.tools, tuple)


def test_role_authority_distinguishes_financial_execution_from_internal_preparation():
    registry = get_agent_contracts()
    assert "No banking or payment execution" in " ".join(registry["rigor-finance-runway"].authority)
    assert "unsent drafts only" in " ".join(registry["rigor-partnerships-capital"].authority)
    assert "explicit delegation" in " ".join(registry["rigor-qa-security"].authority)


def test_new_rigor_subagent_requires_an_explicit_contract(monkeypatch):
    monkeypatch.setitem(BUILTIN_SUBAGENTS, "rigor-unregistered", replace(BUILTIN_SUBAGENTS["rigor-engineering"], name="rigor-unregistered"))
    with pytest.raises(ValueError, match="Missing RIGOR agent contract"):
        get_agent_contracts()


def test_removed_company_registration_cannot_remain_an_eligible_owner(monkeypatch):
    monkeypatch.delitem(RIGOR_COMPANY_SUBAGENTS, "rigor-engineering")
    assert "rigor-engineering" in get_agent_contracts()
    assert "rigor-engineering" not in company_subagent_names()


def test_handoff_prompt_contains_only_registered_company_workers_and_failure_rules():
    prompt = render_company_handoffs()
    assert prompt.startswith("COORDINATION CONTRACTS")
    records = json.loads(prompt.split("\n", 1)[1])
    assert {record["name"] for record in records} == set(RIGOR_COMPANY_SUBAGENTS)
    assert all(record["failure_behavior"] for record in records)
    selected = json.loads(render_company_handoffs("rigor-qa-security").split("\n", 1)[1])
    assert [record["name"] for record in selected] == ["rigor-qa-security"]
    with pytest.raises(ValueError):
        render_company_handoffs("general-purpose")
