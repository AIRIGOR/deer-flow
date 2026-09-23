from datetime import UTC, datetime

import pytest

from deerflow.config.database_config import DatabaseConfig
from deerflow.persistence.engine import (
    close_engine,
    get_session_factory,
    init_engine_from_config,
)
from deerflow.persistence.rigor import RigorCompanyRepository
from deerflow.rigor import (
    CompanyPriority,
    CompanyRecordStatus,
    CompanyRecordType,
    RigorCompanyManager,
)


@pytest.mark.asyncio
async def test_rigor_company_state_persists_and_groups(tmp_path):
    await init_engine_from_config(
        DatabaseConfig(backend="sqlite", sqlite_dir=str(tmp_path))
    )
    sf = get_session_factory()
    assert sf is not None

    try:
        repo = RigorCompanyRepository(sf)
        manager = RigorCompanyManager(
            repo,
            id_factory=iter(["objective-1", "risk-1", "relationship-1"]).__next__,
        )

        objective = await manager.create_record(
            record_type=CompanyRecordType.OBJECTIVE,
            title="Make RIGOR investor-share ready",
            status=CompanyRecordStatus.ACTIVE,
            priority=CompanyPriority.HIGH,
            owner_agent="rigor-chief-of-staff",
            payload={"metric": "release gate passes"},
        )
        assert objective["record_id"] == "objective-1"
        assert objective["payload"]["metric"] == "release gate passes"

        risk = await manager.create_record(
            record_type=CompanyRecordType.RISK,
            title="Dependency vulnerabilities",
            status=CompanyRecordStatus.NEEDS_APPROVAL,
            priority=CompanyPriority.HIGH,
            owner_agent="rigor-qa-security",
            approval_required=True,
            due_at=datetime(2026, 9, 30, tzinfo=UTC),
        )
        assert risk["approval_required"] is True

        relationship = await manager.create_record(
            record_type=CompanyRecordType.RELATIONSHIP,
            title="Strategic production partner",
            owner_agent="rigor-partnerships-capital",
            source_ref="public-source",
        )

        snapshot = await manager.get_state_snapshot()
        assert [row["record_id"] for row in snapshot.objectives] == [
            "objective-1"
        ]
        assert [row["record_id"] for row in snapshot.risks] == ["risk-1"]
        assert [row["record_id"] for row in snapshot.relationships] == [
            "relationship-1"
        ]
        assert [row["record_id"] for row in snapshot.approvals] == ["risk-1"]

        updated = await manager.update_record(
            relationship["record_id"],
            status=CompanyRecordStatus.ACTIVE,
            priority=CompanyPriority.MEDIUM,
        )
        assert updated["status"] == "ACTIVE"
    finally:
        await close_engine()


@pytest.mark.asyncio
async def test_rigor_company_repository_validates_controlled_values(tmp_path):
    await init_engine_from_config(
        DatabaseConfig(backend="sqlite", sqlite_dir=str(tmp_path))
    )
    sf = get_session_factory()
    assert sf is not None

    try:
        repo = RigorCompanyRepository(sf)
        with pytest.raises(ValueError, match="Invalid record_type"):
            await repo.create_record(
                record_id="bad",
                record_type="NOT_A_TYPE",
                title="bad",
            )
    finally:
        await close_engine()
