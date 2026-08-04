from unittest.mock import AsyncMock, MagicMock

from fastapi.testclient import TestClient

from app.gateway.routers import rigor
from deerflow.rigor import (
    RigorConflictError,
    RigorNotFoundError,
    RigorShowSnapshot,
)
from _router_auth_helpers import make_authed_test_app


def _client_with_manager(manager: MagicMock) -> TestClient:
    app = make_authed_test_app()
    app.state.rigor_manager = manager
    app.include_router(rigor.router)
    return TestClient(app)


def test_create_show_route_calls_manager() -> None:
    manager = MagicMock()
    manager.create_show = AsyncMock(
        return_value={
            "show_id": "show-1",
            "tour_name": "RIGOR API Test",
            "show_status": "DOCUMENTS_PENDING",
        }
    )

    with _client_with_manager(manager) as client:
        response = client.post(
            "/api/rigor/shows",
            json={
                "tour_name": "RIGOR API Test",
                "show_status": "DOCUMENTS_PENDING",
            },
        )

    assert response.status_code == 200
    assert response.json()["show_id"] == "show-1"
    manager.create_show.assert_awaited_once()


def test_get_show_route_translates_not_found() -> None:
    manager = MagicMock()
    manager.get_show = AsyncMock(
        side_effect=RigorNotFoundError("RIGOR show not found: missing")
    )

    with _client_with_manager(manager) as client:
        response = client.get("/api/rigor/shows/missing")

    assert response.status_code == 404
    assert response.json() == {"detail": "RIGOR show not found: missing"}


def test_add_requirement_route_translates_conflict() -> None:
    manager = MagicMock()
    manager.add_requirement = AsyncMock(
        side_effect=RigorConflictError(
            "A requirement source document must belong to the same show"
        )
    )

    with _client_with_manager(manager) as client:
        response = client.post(
            "/api/rigor/shows/show-2/requirements",
            json={
                "document_id": "doc-1",
                "department": "VIDEO",
                "category": "CAMERA",
                "requirement_text": "Provide camera package.",
                "origin_type": "SOURCE_DOCUMENT",
            },
        )

    assert response.status_code == 409
    assert "same show" in response.json()["detail"]


def test_show_snapshot_route_serializes_aggregate() -> None:
    manager = MagicMock()
    manager.get_show_snapshot = AsyncMock(
        return_value=RigorShowSnapshot(
            show={"show_id": "show-1"},
            documents=[{"document_id": "doc-1"}],
            requirements=[{"requirement_id": "req-1"}],
        )
    )

    with _client_with_manager(manager) as client:
        response = client.get("/api/rigor/shows/show-1/snapshot")

    assert response.status_code == 200
    assert response.json() == {
        "show": {"show_id": "show-1"},
        "documents": [{"document_id": "doc-1"}],
        "requirements": [{"requirement_id": "req-1"}],
    }


def test_invalid_confidence_is_rejected_by_request_model() -> None:
    manager = MagicMock()
    manager.add_requirement = AsyncMock()

    with _client_with_manager(manager) as client:
        response = client.post(
            "/api/rigor/shows/show-1/requirements",
            json={
                "department": "VIDEO",
                "category": "CAMERA",
                "requirement_text": "Invalid confidence.",
                "origin_type": "HUMAN_ENTRY",
                "confidence": 1.5,
            },
        )

    assert response.status_code == 422
    manager.add_requirement.assert_not_awaited()
