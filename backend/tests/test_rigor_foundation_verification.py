"""Focused shared-truth invariants; synthetic records and temporary SQLite only."""

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.gateway.routers import rigor
from deerflow.config.database_config import DatabaseConfig
from deerflow.persistence.engine import close_engine, get_session_factory, init_engine_from_config
from deerflow.persistence.rigor import RigorRepository, model
from deerflow.rigor import schemas
from deerflow.rigor.manager import RigorConflictError, RigorManager


@pytest.mark.asyncio
@pytest.mark.parametrize("dependent", ["requirement", "superseding-document"])
async def test_document_reassignment_cannot_break_existing_source_ownership(tmp_path, dependent):
    await init_engine_from_config(DatabaseConfig(backend="sqlite", sqlite_dir=str(tmp_path)))
    try:
        manager = RigorManager(RigorRepository(get_session_factory()))
        await manager.create_show(show_id="show-a")
        await manager.create_show(show_id="show-b")
        await manager.add_document("show-a", document_id="doc-a", document_name="Synthetic rider", document_type="RIDER")
        if dependent == "requirement":
            await manager.add_requirement("show-a", requirement_id="req-a", document_id="doc-a", department="VIDEO", category="SCREEN", requirement_text="Synthetic screen", origin_type="SOURCE_DOCUMENT")
        else:
            await manager.add_document("show-a", document_id="doc-new", document_name="Synthetic revision", document_type="RIDER", supersedes_document_id="doc-a")
        with pytest.raises(RigorConflictError, match="owning show"):
            await manager.update_document("doc-a", show_id="show-b")
        snapshot = await manager.get_show_snapshot("show-a")
        assert all(item["show_id"] == "show-a" for item in snapshot.documents + snapshot.requirements)
        assert (await manager.get_document("doc-a"))["show_id"] == "show-a"
    finally:
        await close_engine()


@pytest.mark.asyncio
async def test_same_show_document_edit_preserves_entity_ids(tmp_path):
    await init_engine_from_config(DatabaseConfig(backend="sqlite", sqlite_dir=str(tmp_path)))
    try:
        manager = RigorManager(RigorRepository(get_session_factory()))
        await manager.create_show(show_id="show-a")
        await manager.add_document("show-a", document_id="doc-a", document_name="Original synthetic title", document_type="RIDER")
        await manager.add_requirement("show-a", requirement_id="req-a", document_id="doc-a", department="VIDEO", category="SCREEN", requirement_text="Synthetic screen", origin_type="SOURCE_DOCUMENT")
        changed = await manager.update_document("doc-a", show_id="show-a", document_name="Corrected synthetic title")
        assert changed["document_id"] == "doc-a"
        snapshot = await manager.get_show_snapshot("show-a")
        assert snapshot.show["show_id"] == "show-a"
        assert snapshot.documents[0]["document_id"] == "doc-a"
        assert snapshot.requirements[0]["requirement_id"] == "req-a"
        assert snapshot.requirements[0]["document_id"] == "doc-a"
    finally:
        await close_engine()


@pytest.mark.parametrize(
    "enum_name,choices_name",
    [("ShowStatus", "SHOW_STATUSES"), ("DocumentType", "DOCUMENT_TYPES"), ("DocumentProcessingStatus", "DOCUMENT_PROCESSING_STATUSES"), ("RequirementOriginType", "REQUIREMENT_ORIGIN_TYPES"), ("RequirementStatus", "REQUIREMENT_STATUSES")],
)
def test_service_enums_match_persistence_choices(enum_name, choices_name):
    assert tuple(value.value for value in getattr(schemas, enum_name)) == getattr(model, choices_name)


def test_core_show_mutation_requires_authenticated_context():
    app = FastAPI()
    manager = MagicMock()
    manager.create_show = AsyncMock()
    app.state.rigor_manager = manager
    app.include_router(rigor.router)
    with TestClient(app) as client:
        response = client.post("/api/rigor/shows", json={"show_name": "Synthetic denied show"})
    assert response.status_code == 401
    manager.create_show.assert_not_awaited()
