from datetime import UTC, date, datetime

import pytest

from deerflow.config.database_config import DatabaseConfig
from deerflow.persistence.engine import (
    close_engine,
    get_session_factory,
    init_engine_from_config,
)
from deerflow.persistence.rigor import RigorRepository
from deerflow.rigor import (
    DocumentProcessingStatus,
    DocumentType,
    RequirementOriginType,
    RequirementStatus,
    RigorConflictError,
    RigorManager,
    RigorNotFoundError,
    ShowStatus,
)


def _factory(*identifiers: str):
    values = iter(identifiers)
    return lambda: next(values)


@pytest.mark.asyncio
async def test_rigor_manager_builds_show_snapshot(tmp_path):
    await init_engine_from_config(
        DatabaseConfig(backend="sqlite", sqlite_dir=str(tmp_path))
    )
    sf = get_session_factory()
    assert sf is not None

    try:
        manager = RigorManager(
            RigorRepository(sf),
            id_factory=_factory("show-1", "doc-1", "req-1"),
        )

        show = await manager.create_show(
            tour_name="RIGOR Service Test",
            artist_or_client="Test Artist",
            venue_name="Test Arena",
            city="Las Vegas",
            state_region="NV",
            country="US",
            timezone="America/Los_Angeles",
            show_at=datetime(2026, 8, 10, 20, 0, tzinfo=UTC),
        )
        assert show["show_id"] == "show-1"
        assert show["show_status"] == ShowStatus.DOCUMENTS_PENDING

        document = await manager.add_document(
            "show-1",
            document_name="Venue Technical Package.pdf",
            document_type=DocumentType.VENUE_TECHNICAL_PACKAGE,
            source_party="Test Arena",
            document_date=date(2026, 8, 1),
            processing_status=DocumentProcessingStatus.RECEIVED,
        )
        assert document["document_id"] == "doc-1"

        requirement = await manager.add_requirement(
            "show-1",
            document_id="doc-1",
            department="VIDEO",
            category="LED_WALL",
            requirement_text="Provide a 40-foot-wide LED wall.",
            origin_type=RequirementOriginType.SOURCE_DOCUMENT,
            confidence=0.94,
        )
        assert requirement["requirement_id"] == "req-1"

        snapshot = await manager.get_show_snapshot("show-1")
        assert snapshot.show["show_id"] == "show-1"
        assert [item["document_id"] for item in snapshot.documents] == ["doc-1"]
        assert [item["requirement_id"] for item in snapshot.requirements] == [
            "req-1"
        ]

        updated = await manager.update_show(
            "show-1",
            show_status=ShowStatus.ADVANCE_IN_PROGRESS,
        )
        assert updated["show_status"] == "ADVANCE_IN_PROGRESS"

        updated_requirement = await manager.update_requirement(
            "req-1",
            requirement_status=RequirementStatus.CONFIRMED,
            owner="Video Department",
        )
        assert updated_requirement["requirement_status"] == "CONFIRMED"
        assert updated_requirement["owner"] == "Video Department"
    finally:
        await close_engine()


@pytest.mark.asyncio
async def test_rigor_manager_rejects_cross_show_sources(tmp_path):
    await init_engine_from_config(
        DatabaseConfig(backend="sqlite", sqlite_dir=str(tmp_path))
    )
    sf = get_session_factory()
    assert sf is not None

    try:
        manager = RigorManager(
            RigorRepository(sf),
            id_factory=_factory("show-1", "doc-1", "show-2"),
        )
        await manager.create_show()
        await manager.add_document(
            "show-1",
            document_name="Show One Rider.pdf",
            document_type=DocumentType.RIDER,
        )
        await manager.create_show()

        with pytest.raises(RigorConflictError, match="same show"):
            await manager.add_requirement(
                "show-2",
                document_id="doc-1",
                department="AUDIO",
                category="CONSOLE",
                requirement_text="Use the listed console.",
                origin_type=RequirementOriginType.SOURCE_DOCUMENT,
            )
    finally:
        await close_engine()


@pytest.mark.asyncio
async def test_rigor_manager_raises_for_missing_records(tmp_path):
    await init_engine_from_config(
        DatabaseConfig(backend="sqlite", sqlite_dir=str(tmp_path))
    )
    sf = get_session_factory()
    assert sf is not None

    try:
        manager = RigorManager(RigorRepository(sf))

        with pytest.raises(RigorNotFoundError, match="missing-show"):
            await manager.get_show("missing-show")

        with pytest.raises(RigorNotFoundError, match="missing-show"):
            await manager.add_document(
                "missing-show",
                document_name="Missing.pdf",
                document_type=DocumentType.OTHER,
            )
    finally:
        await close_engine()
