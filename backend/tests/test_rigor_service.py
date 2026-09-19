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
