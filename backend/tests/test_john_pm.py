"""John PM model tests: source validation and immutable HOLD decision."""

import json
from types import SimpleNamespace

import pytest

from deerflow.rigor.john_pm import JohnEvidence, JohnPmAgent, JohnPmError


class FakeModel:
    def __init__(self, payload):
        self.payload = payload

    async def ainvoke(self, messages):
        return SimpleNamespace(content=json.dumps(self.payload))


@pytest.mark.asyncio
async def test_john_returns_advisory_only_with_verified_source():
    model = FakeModel({"actions": [{
        "priority": "P0", "department": "Power",
        "question": "Confirm venue power supply against the tour requirement.",
        "evidence_ids": ["tour-power", "venue-power"],
    }]})
    agent = JohnPmAgent(model_factory=lambda: model)
    result = await agent.analyze(evidence=[
        JohnEvidence(source_id="tour-power", text="Tour requires 400A show power"),
        JohnEvidence(source_id="venue-power", text="Venue limited to 200A"),
    ])
    assert result.release_decision == "HOLD_SHOW"
    assert result.autonomous_show_approval is False
    assert result.actions[0].priority == "P0"
    assert result.actions[0].evidence_ids == ["tour-power", "venue-power"]


@pytest.mark.asyncio
async def test_john_rejects_fabricated_evidence():
    model = FakeModel({"actions": [{
        "priority": "P0", "department": "Rigging",
        "question": "Confirm rigging weight with the venue department.",
        "evidence_ids": ["fake-citation"],
    }]})
    with pytest.raises(JohnPmError, match="nonexistent"):
        await JohnPmAgent(model_factory=lambda: model).analyze(
            evidence=[JohnEvidence(source_id="real", text="Venue trim limited to 38ft")]
        )


@pytest.mark.asyncio
async def test_john_rejects_model_claiming_show_ready():
    model = FakeModel({"actions": [], "release_decision": "SHOW_READY"})
    with pytest.raises(JohnPmError, match="unexpected"):
        await JohnPmAgent(model_factory=lambda: model).analyze(
            evidence=[JohnEvidence(source_id="real", text="Tour requires 400A show power")]
        )


@pytest.mark.asyncio
async def test_john_rejects_duplicate_evidence_ids():
    with pytest.raises(JohnPmError, match="duplicate"):
        await JohnPmAgent().analyze(evidence=[
            JohnEvidence(source_id="same", text="Tour requires 400A show power"),
            JohnEvidence(source_id="same", text="Venue limited to 200A show power"),
        ])
