from datetime import UTC, date, datetime

import pytest

from deerflow.config.database_config import DatabaseConfig
from deerflow.persistence.engine import (
    close_engine,
    get_session_factory,
    init_engine_from_config,
)
from deerflow.persistence.rigor import RigorRepository


@pytest.mark.asyncio
async def test_rigor_repository_end_to_end(tmp_path):
    await init_engine_from_config(
        DatabaseConfig(backend="sqlite", sqlite_dir=str(tmp_path))
    )
    sf = get_session_factory()
    assert sf is not None

    try:
        repo = RigorRepository(sf)

        show = await repo.create_show(
            show_id="show-1",
            tour_name="RIGOR Test Tour",
            artist_or_client="Test Artist",
            venue_name="Test Arena",
            city="Las Vegas",
            state_region="NV",
            country="US",
            timezone="America/Los_Angeles",
            show_at=datetime(2026, 8, 10, 20, 0, tzinfo=UTC),
        )
        assert show["show_id"] == "show-1"
        assert show["show_status"] == "DOCUMENTS_PENDING"
        assert isinstance(show["created_at"], str)

        document = await repo.create_document(
            document_id="doc-1",
            show_id="show-1",
            document_name="Venue Technical Package.pdf",
            document_type="VENUE_TECHNICAL_PACKAGE",
            source_party="Test Arena",
            revision="v1",
            document_date=date(2026, 8, 1),
            file_format="application/pdf",
            page_count=24,
            storage_location="shows/show-1/documents/doc-1.pdf",
        )
        assert document["document_id"] == "doc-1"
        assert document["processing_status"] == "RECEIVED"
        assert document["document_date"] == "2026-08-01"

        requirement = await repo.create_requirement(
            requirement_id="req-1",
            show_id="show-1",
            document_id="doc-1",
            department="VIDEO",
            category="LED_WALL",
            requirement_text="Provide a 40-foot-wide LED wall.",
            normalized_value="40",
            unit="ft",
            origin_type="SOURCE_DOCUMENT",
            source_page=7,
            source_location="Video section",
            confidence=0.94,
        )
        assert requirement["requirement_id"] == "req-1"
        assert requirement["confidence"] == pytest.approx(0.94)
        assert requirement["requirement_status"] == "EXTRACTED"

        assert [row["document_id"] for row in await repo.list_documents("show-1")] == [
            "doc-1"
        ]
        assert [
            row["requirement_id"]
            for row in await repo.list_requirements("show-1", department="VIDEO")
        ] == ["req-1"]

        updated_show = await repo.update_show(
            "show-1",
            updates={"show_status": "ADVANCE_IN_PROGRESS"},
        )
        assert updated_show is not None
        assert updated_show["show_status"] == "ADVANCE_IN_PROGRESS"

        updated_document = await repo.update_document(
            "doc-1",
            updates={"processing_status": "PROCESSED"},
        )
        assert updated_document is not None
        assert updated_document["processing_status"] == "PROCESSED"

        updated_requirement = await repo.update_requirement(
            "req-1",
            updates={
                "requirement_status": "CONFIRMED",
                "owner": "Video Department",
            },
        )
        assert updated_requirement is not None
        assert updated_requirement["requirement_status"] == "CONFIRMED"
        assert updated_requirement["owner"] == "Video Department"

        assert await repo.delete_show("show-1") is True
        assert await repo.get_show("show-1") is None
        assert await repo.get_document("doc-1") is None
        assert await repo.get_requirement("req-1") is None
    finally:
        await close_engine()


@pytest.mark.asyncio
async def test_rigor_repository_validates_controlled_values(tmp_path):
    await init_engine_from_config(
        DatabaseConfig(backend="sqlite", sqlite_dir=str(tmp_path))
    )
    sf = get_session_factory()
    assert sf is not None

    try:
        repo = RigorRepository(sf)

        with pytest.raises(ValueError, match="Invalid show_status"):
            await repo.create_show(
                show_id="show-bad",
                show_status="NOT_A_STATUS",
            )

        with pytest.raises(ValueError, match="Invalid document_type"):
            await repo.create_document(
                document_id="doc-bad",
                show_id="show-bad",
                document_name="bad.pdf",
                document_type="NOT_A_TYPE",
            )

        with pytest.raises(ValueError, match="confidence"):
            await repo.create_requirement(
                requirement_id="req-bad",
                show_id="show-bad",
                department="VIDEO",
                category="CAMERA",
                requirement_text="Invalid confidence",
                origin_type="HUMAN_ENTRY",
                confidence=1.5,
            )
    finally:
        await close_engine()
