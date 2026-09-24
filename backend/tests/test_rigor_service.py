import os

import pytest
from fastapi.testclient import TestClient

from app import rigor_service


def test_rigor_service_health():
    client = TestClient(rigor_service.app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "healthy",
        "service": "rigor-deerflow-intelligence",
        "company_team": "v1",
        "action_executor": "v1",
    }


def test_rigor_service_requires_shared_token(monkeypatch):
    monkeypatch.setenv("RIGOR_SERVICE_TOKEN", "test-secret")
    client = TestClient(rigor_service.app)

    missing = client.post(
        "/api/rigor/analyze",
        json={"document_name": "venue.txt", "pages": ["Venue requires 200A power."]},
    )
    assert missing.status_code == 401

    wrong = client.post(
        "/api/rigor/analyze",
        headers={"X-RIGOR-Service-Token": "wrong"},
        json={"document_name": "venue.txt", "pages": ["Venue requires 200A power."]},
    )
    assert wrong.status_code == 401


def test_rigor_service_rejects_analysis_when_token_not_configured(monkeypatch):
    monkeypatch.delenv("RIGOR_SERVICE_TOKEN", raising=False)
    client = TestClient(rigor_service.app)
    response = client.post(
        "/api/rigor/analyze",
        headers={"X-RIGOR-Service-Token": "anything"},
        json={"document_name": "venue.txt", "pages": ["Venue requires 200A power."]},
    )
    assert response.status_code == 503


def test_rigor_company_pulse_requires_token(monkeypatch):
    monkeypatch.setenv("RIGOR_SERVICE_TOKEN", "test-secret")
    client = TestClient(rigor_service.app)

    response = client.post(
        "/api/rigor/company/pulse",
        json={"objective": "Run the company review."},
    )
    assert response.status_code == 401


def test_rigor_company_pulse_returns_structured_brief(monkeypatch):
    monkeypatch.setenv("RIGOR_SERVICE_TOKEN", "test-secret")

    class _Pulse:
        def model_dump(self):
            return {
                "current_state": "RIGOR is operating.",
                "top_priorities": ["A", "B", "C"],
                "blockers_risks": [],
                "founder_approvals": [],
                "next_actions": ["D", "E", "F"],
                "state_updates": [],
                "action_proposals": [],
            }

    class _Operator:
        async def run(self, *, objective, context=None):
            assert objective == "Run the company review."
            assert context == "CI green."
            return _Pulse()

    monkeypatch.setattr(rigor_service, "RigorCompanyOperator", _Operator)
    client = TestClient(rigor_service.app)
    response = client.post(
        "/api/rigor/company/pulse",
        headers={"X-RIGOR-Service-Token": "test-secret"},
        json={
            "objective": "Run the company review.",
            "context": "CI green.",
        },
    )

    assert response.status_code == 200
    assert response.json()["top_priorities"] == ["A", "B", "C"]


def test_rigor_company_action_requires_token(monkeypatch):
    monkeypatch.setenv("RIGOR_SERVICE_TOKEN", "test-secret")
    client = TestClient(rigor_service.app)
    response = client.post(
        "/api/rigor/company/action/execute",
        json={
            "proposal": {
                "action_type": "APPLICATION_DRAFT",
                "scope": "PREPARE",
                "title": "Prepare application",
            }
        },
    )
    assert response.status_code == 401


def test_rigor_company_action_executes_internal_work(monkeypatch):
    monkeypatch.setenv("RIGOR_SERVICE_TOKEN", "test-secret")

    class _Result:
        def model_dump(self):
            return {
                "status": "COMPLETE",
                "result_summary": "Draft prepared.",
                "artifact_markdown": "# Draft",
                "evidence_refs": [],
            }

    class _Executor:
        async def execute(self, proposal, *, context=None):
            assert proposal.action_type.value == "APPLICATION_DRAFT"
            assert context == "Saudi application."
            return _Result()

    monkeypatch.setattr(rigor_service, "RigorCompanyActionExecutor", _Executor)
    client = TestClient(rigor_service.app)
    response = client.post(
        "/api/rigor/company/action/execute",
        headers={"X-RIGOR-Service-Token": "test-secret"},
        json={
            "proposal": {
                "action_type": "APPLICATION_DRAFT",
                "scope": "PREPARE",
                "title": "Prepare application",
            },
            "context": "Saudi application.",
        },
    )
    assert response.status_code == 200
    assert response.json()["status"] == "COMPLETE"
