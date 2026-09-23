"""Persistence repository for RIGOR company operating state."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from deerflow.persistence.rigor.company_model import (
    COMPANY_PRIORITIES,
    COMPANY_RECORD_STATUSES,
    COMPANY_RECORD_TYPES,
    RigorCompanyRecordRow,
)
from deerflow.utils.time import coerce_iso


_UPDATE_FIELDS = frozenset(
    {
        "record_type",
        "title",
        "summary",
        "status",
        "priority",
        "owner_agent",
        "approval_required",
        "due_at",
        "source_ref",
        "payload",
    }
)


class RigorCompanyRepository:
    """Persistence boundary for durable RIGOR company-state records."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._sf = session_factory

    @staticmethod
    def _validate_choice(name: str, value: str, allowed: tuple[str, ...]) -> None:
        if value not in allowed:
            choices = ", ".join(allowed)
            raise ValueError(
                f"Invalid {name}: {value!r}. Expected one of: {choices}"
            )

    @staticmethod
    def _row_to_dict(row: RigorCompanyRecordRow) -> dict[str, Any]:
        data = row.to_dict()
        for key, value in data.items():
            if isinstance(value, datetime):
                data[key] = coerce_iso(value)
        return data

    @staticmethod
    def _pagination(limit: int, offset: int) -> tuple[int, int]:
        return max(1, min(limit, 500)), max(0, offset)

    async def create_record(
        self,
        *,
        record_id: str,
        record_type: str,
        title: str,
        summary: str | None = None,
        status: str = "OPEN",
        priority: str = "MEDIUM",
        owner_agent: str | None = None,
        approval_required: bool = False,
        due_at: datetime | None = None,
        source_ref: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        self._validate_choice("record_type", record_type, COMPANY_RECORD_TYPES)
        self._validate_choice("status", status, COMPANY_RECORD_STATUSES)
        self._validate_choice("priority", priority, COMPANY_PRIORITIES)
        now = datetime.now(UTC)
        row = RigorCompanyRecordRow(
            record_id=record_id,
            record_type=record_type,
            title=title,
            summary=summary,
            status=status,
            priority=priority,
            owner_agent=owner_agent,
            approval_required=approval_required,
            due_at=due_at,
            source_ref=source_ref,
            payload=dict(payload or {}),
            created_at=now,
            updated_at=now,
        )
        async with self._sf() as session:
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return self._row_to_dict(row)

    async def get_record(self, record_id: str) -> dict[str, Any] | None:
        async with self._sf() as session:
            row = await session.get(RigorCompanyRecordRow, record_id)
            return None if row is None else self._row_to_dict(row)

    async def list_records(
        self,
        *,
        record_type: str | None = None,
        status: str | None = None,
        owner_agent: str | None = None,
        approval_required: bool | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        if record_type is not None:
            self._validate_choice(
                "record_type",
                record_type,
                COMPANY_RECORD_TYPES,
            )
        if status is not None:
            self._validate_choice("status", status, COMPANY_RECORD_STATUSES)
        limit, offset = self._pagination(limit, offset)
        stmt = select(RigorCompanyRecordRow)
        if record_type is not None:
            stmt = stmt.where(RigorCompanyRecordRow.record_type == record_type)
        if status is not None:
            stmt = stmt.where(RigorCompanyRecordRow.status == status)
        if owner_agent is not None:
            stmt = stmt.where(RigorCompanyRecordRow.owner_agent == owner_agent)
        if approval_required is not None:
            stmt = stmt.where(
                RigorCompanyRecordRow.approval_required == approval_required
            )
        stmt = (
            stmt.order_by(
                RigorCompanyRecordRow.approval_required.desc(),
                RigorCompanyRecordRow.due_at.asc(),
                RigorCompanyRecordRow.created_at.desc(),
                RigorCompanyRecordRow.record_id.asc(),
            )
            .limit(limit)
            .offset(offset)
        )
        async with self._sf() as session:
            result = await session.execute(stmt)
            return [self._row_to_dict(row) for row in result.scalars()]

    async def update_record(
        self,
        record_id: str,
        *,
        updates: dict[str, Any],
    ) -> dict[str, Any] | None:
        unknown = set(updates) - _UPDATE_FIELDS
        if unknown:
            fields = ", ".join(sorted(unknown))
            raise ValueError(f"Unsupported update fields: {fields}")
        if "record_type" in updates:
            self._validate_choice(
                "record_type",
                updates["record_type"],
                COMPANY_RECORD_TYPES,
            )
        if "status" in updates:
            self._validate_choice(
                "status",
                updates["status"],
                COMPANY_RECORD_STATUSES,
            )
        if "priority" in updates:
            self._validate_choice(
                "priority",
                updates["priority"],
                COMPANY_PRIORITIES,
            )
        if "payload" in updates:
            updates["payload"] = dict(updates["payload"] or {})

        async with self._sf() as session:
            row = await session.get(RigorCompanyRecordRow, record_id)
            if row is None:
                return None
            for key, value in updates.items():
                setattr(row, key, value)
            row.updated_at = datetime.now(UTC)
            await session.commit()
            await session.refresh(row)
            return self._row_to_dict(row)

    async def delete_record(self, record_id: str) -> bool:
        async with self._sf() as session:
            row = await session.get(RigorCompanyRecordRow, record_id)
            if row is None:
                return False
            await session.delete(row)
            await session.commit()
            return True
