import pytest
from fastapi.testclient import TestClient

from app import rigor_service


@pytest.mark.parametrize("provided", ["staging-café-credential", "wrong-ascii-value", "staging-cafè-credential"])
def test_service_token_comparison_does_not_crash_on_non_ascii_configuration(monkeypatch, provided):
    monkeypatch.setenv("RIGOR_SERVICE_TOKEN", "staging-café-credential")
    if provided == "staging-café-credential":
        rigor_service._authorize(provided)
    else:
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as rejected:
            rigor_service._authorize(provided)
        assert rejected.value.status_code == 401


def test_non_ascii_credentials_use_a_portable_digest_header(monkeypatch):
    import hashlib

    monkeypatch.setenv("RIGOR_SERVICE_TOKEN", "staging-café-credential")
    monkeypatch.setenv("RIGOR_JOHN_STAGING_ENABLED", "true")
    response = TestClient(rigor_service.app).post(
        "/api/rigor/agents/john/analyze",
        headers={"X-RIGOR-Service-Token-SHA256": hashlib.sha256("staging-café-credential".encode()).hexdigest()},
        json={"synthetic": False, "evidence": [{"source_id": "tour", "text": "Fictional tour."}]},
    )
    assert response.status_code == 422


@pytest.mark.parametrize("digest", ["bad", "0" * 64, "F" * 64])
def test_wrong_digest_cannot_fall_back_to_a_valid_raw_token(monkeypatch, digest):
    from fastapi import HTTPException

    monkeypatch.setenv("RIGOR_SERVICE_TOKEN", "test-secret")
    with pytest.raises(HTTPException) as rejected:
        rigor_service._authorize("test-secret", token_sha256=digest)
    assert rejected.value.status_code == 401


@pytest.mark.parametrize("token,expected", [(None, 401), ("wrong", 401), ("test-secret", 200)])
def test_john_endpoint_requires_auth_and_returns_advisory_only(monkeypatch, token, expected):
    monkeypatch.setenv("RIGOR_SERVICE_TOKEN", "test-secret")
    monkeypatch.setenv("RIGOR_JOHN_STAGING_ENABLED", "true")
    calls = []

    class Agent:
        async def analyze(self, *, evidence):
            calls.append(evidence)
            from deerflow.rigor.john_pm import JohnPmResult

            return JohnPmResult(actions=[])

    monkeypatch.setattr(rigor_service, "JohnPmAgent", Agent, raising=False)
    headers = {"X-RIGOR-Service-Token": token} if token else {}
    result = TestClient(rigor_service.app).post("/api/rigor/agents/john/analyze", headers=headers, json={"synthetic": True, "evidence": [{"source_id": "tour", "text": "Tour requires 400A."}]})
    assert result.status_code == expected
    assert len(calls) == (1 if expected == 200 else 0)
    if expected == 200:
        assert result.json()["release_decision"] == "HOLD_SHOW"
        assert result.json()["autonomous_show_approval"] is False


@pytest.mark.parametrize("enabled,synthetic,expected", [(None, True, 403), ("false", True, 403), ("true", False, 422)])
def test_john_endpoint_rejects_disabled_or_real_input(monkeypatch, enabled, synthetic, expected):
    monkeypatch.setenv("RIGOR_SERVICE_TOKEN", "test-secret")
    if enabled is None:
        monkeypatch.delenv("RIGOR_JOHN_STAGING_ENABLED", raising=False)
    else:
        monkeypatch.setenv("RIGOR_JOHN_STAGING_ENABLED", enabled)
    response = TestClient(rigor_service.app).post("/api/rigor/agents/john/analyze", headers={"X-RIGOR-Service-Token": "test-secret"}, json={"synthetic": synthetic, "evidence": [{"source_id": "tour", "text": "Tour requires 400A."}]})
    assert response.status_code == expected


def test_john_endpoint_sanitizes_model_failure(monkeypatch):
    from deerflow.rigor.john_pm import JohnPmError

    class Agent:
        async def analyze(self, *, evidence):
            raise JohnPmError("private provider response must not escape")

    monkeypatch.setattr(rigor_service, "JohnPmAgent", Agent)
    monkeypatch.setenv("RIGOR_SERVICE_TOKEN", "test-secret")
    monkeypatch.setenv("RIGOR_JOHN_STAGING_ENABLED", "true")
    response = TestClient(rigor_service.app).post("/api/rigor/agents/john/analyze", headers={"X-RIGOR-Service-Token": "test-secret"}, json={"synthetic": True, "evidence": [{"source_id": "tour", "text": "Tour requires 400A."}]})
    assert response.status_code == 502
    assert "private" not in response.text


def test_john_endpoint_rejects_missing_auth_configuration(monkeypatch):
    monkeypatch.delenv("RIGOR_SERVICE_TOKEN", raising=False)
    monkeypatch.setenv("RIGOR_JOHN_STAGING_ENABLED", "true")
    response = TestClient(rigor_service.app).post("/api/rigor/agents/john/analyze", json={"synthetic": True, "evidence": [{"source_id": "tour", "text": "Tour requires 400A."}]})
    assert response.status_code == 503


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
