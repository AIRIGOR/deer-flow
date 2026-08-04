"""Async SQLAlchemy repository for RIGOR production records."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from deerflow.persistence.rigor.model import (
    DOCUMENT_PROCESSING_STATUSES,
    DOCUMENT_TYPES,
    REQUIREMENT_ORIGIN_TYPES,
    REQUIREMENT_STATUSES,
    SHOW_STATUSES,
    RigorDocumentRow,
    RigorRequirementRow,
    RigorShowRow,
)
from deerflow.utils.time import coerce_iso


_SHOW_UPDATE_FIELDS = frozenset(
    {
        "tour_name",
        "artist_or_client",
        "show_name",
        "venue_name",
        "city",
        "state_region",
        "country",
        "timezone",
        "load_in_at",
        "doors_at",
        "show_at",
        "curfew_at",
        "show_status",
    }
)

_DOCUMENT_UPDATE_FIELDS = frozenset(
    {
        "show_id",
        "document_name",
        "document_type",
        "source_party",
        "revision",
        "document_date",
        "received_at",
        "file_format",
        "page_count",
        "storage_location",
        "processing_status",
        "supersedes_document_id",
    }
)

_REQUIREMENT_UPDATE_FIELDS = frozenset(
    {
        "show_id",
        "document_id",
        "department",
        "category",
        "requirement_text",
        "normalized_value",
        "unit",
        "origin_type",
        "source_page",
        "source_location",
        "source_excerpt",
        "confidence",
        "requirement_status",
        "owner",
        "due_at",
    }
)


class RigorRepository:
    """Persistence boundary for RIGOR shows, documents, and requirements."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._sf = session_factory

    @staticmethod
    def _row_to_dict(
        row: RigorShowRow | RigorDocumentRow | RigorRequirementRow,
    ) -> dict[str, Any]:
        data = row.to_dict()
        for key, value in data.items():
            if isinstance(value, datetime):
                data[key] = coerce_iso(value)
            elif isinstance(value, date):
                data[key] = value.isoformat()
        return data

    @staticmethod
    def _validate_choice(name: str, value: str, allowed: tuple[str, ...]) -> None:
        if value not in allowed:
            choices = ", ".join(allowed)
            raise ValueError(
                f"Invalid {name}: {value!r}. Expected one of: {choices}"
            )

    @staticmethod
    def _validate_confidence(value: float | None) -> None:
        if value is not None and not 0.0 <= value <= 1.0:
            raise ValueError("confidence must be between 0.0 and 1.0")

    @staticmethod
    def _pagination(limit: int, offset: int) -> tuple[int, int]:
        return max(1, min(limit, 500)), max(0, offset)

    @staticmethod
    def _apply_updates(
        row: Any,
        updates: dict[str, Any],
        allowed_fields: frozenset[str],
    ) -> None:
        unknown = set(updates) - allowed_fields
        if unknown:
            fields = ", ".join(sorted(unknown))
            raise ValueError(f"Unsupported update fields: {fields}")
        for key, value in updates.items():
            setattr(row, key, value)
        row.updated_at = datetime.now(UTC)

    async def create_show(
        self,
        *,
        show_id: str,
        tour_name: str | None = None,
        artist_or_client: str | None = None,
        show_name: str | None = None,
        venue_name: str | None = None,
        city: str | None = None,
        state_region: str | None = None,
        country: str | None = None,
        timezone: str | None = None,
        load_in_at: datetime | None = None,
        doors_at: datetime | None = None,
        show_at: datetime | None = None,
        curfew_at: datetime | None = None,
        show_status: str = "DOCUMENTS_PENDING",
    ) -> dict[str, Any]:
        self._validate_choice("show_status", show_status, SHOW_STATUSES)
        now = datetime.now(UTC)
        row = RigorShowRow(
            show_id=show_id,
            tour_name=tour_name,
            artist_or_client=artist_or_client,
            show_name=show_name,
            venue_name=venue_name,
            city=city,
            state_region=state_region,
            country=country,
            timezone=timezone,
            load_in_at=load_in_at,
            doors_at=doors_at,
            show_at=show_at,
            curfew_at=curfew_at,
            show_status=show_status,
            created_at=now,
            updated_at=now,
        )
        async with self._sf() as session:
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return self._row_to_dict(row)

    async def get_show(self, show_id: str) -> dict[str, Any] | None:
        async with self._sf() as session:
            row = await session.get(RigorShowRow, show_id)
            return None if row is None else self._row_to_dict(row)

    async def list_shows(
        self,
        *,
        show_status: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        if show_status is not None:
            self._validate_choice("show_status", show_status, SHOW_STATUSES)
        limit, offset = self._pagination(limit, offset)
        stmt = select(RigorShowRow)
        if show_status is not None:
            stmt = stmt.where(RigorShowRow.show_status == show_status)
        stmt = (
            stmt.order_by(
                RigorShowRow.show_at.asc(),
                RigorShowRow.created_at.desc(),
                RigorShowRow.show_id.asc(),
            )
            .limit(limit)
            .offset(offset)
        )
        async with self._sf() as session:
            result = await session.execute(stmt)
            return [self._row_to_dict(row) for row in result.scalars()]

    async def update_show(
        self,
        show_id: str,
        *,
        updates: dict[str, Any],
    ) -> dict[str, Any] | None:
        if "show_status" in updates:
            self._validate_choice(
                "show_status",
                updates["show_status"],
                SHOW_STATUSES,
            )
        async with self._sf() as session:
            row = await session.get(RigorShowRow, show_id)
            if row is None:
                return None
            self._apply_updates(row, updates, _SHOW_UPDATE_FIELDS)
            await session.commit()
            await session.refresh(row)
            return self._row_to_dict(row)

    async def delete_show(self, show_id: str) -> bool:
        async with self._sf() as session:
            row = await session.get(RigorShowRow, show_id)
            if row is None:
                return False
            await session.delete(row)
            await session.commit()
            return True

    async def create_document(
        self,
        *,
        document_id: str,
        show_id: str,
        document_name: str,
        document_type: str,
        source_party: str | None = None,
        revision: str | None = None,
        document_date: date | None = None,
        received_at: datetime | None = None,
        file_format: str | None = None,
        page_count: int | None = None,
        storage_location: str | None = None,
        processing_status: str = "RECEIVED",
        supersedes_document_id: str | None = None,
    ) -> dict[str, Any]:
        self._validate_choice("document_type", document_type, DOCUMENT_TYPES)
        self._validate_choice(
            "processing_status",
            processing_status,
            DOCUMENT_PROCESSING_STATUSES,
        )
        now = datetime.now(UTC)
        row = RigorDocumentRow(
            document_id=document_id,
            show_id=show_id,
            document_name=document_name,
            document_type=document_type,
            source_party=source_party,
            revision=revision,
            document_date=document_date,
            received_at=received_at or now,
            file_format=file_format,
            page_count=page_count,
            storage_location=storage_location,
            processing_status=processing_status,
            supersedes_document_id=supersedes_document_id,
            created_at=now,
            updated_at=now,
        )
        async with self._sf() as session:
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return self._row_to_dict(row)

    async def get_document(self, document_id: str) -> dict[str, Any] | None:
        async with self._sf() as session:
            row = await session.get(RigorDocumentRow, document_id)
            return None if row is None else self._row_to_dict(row)

    async def list_documents(
        self,
        show_id: str,
        *,
        document_type: str | None = None,
        processing_status: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        if document_type is not None:
            self._validate_choice("document_type", document_type, DOCUMENT_TYPES)
        if processing_status is not None:
            self._validate_choice(
                "processing_status",
                processing_status,
                DOCUMENT_PROCESSING_STATUSES,
            )
        limit, offset = self._pagination(limit, offset)
        stmt = select(RigorDocumentRow).where(
            RigorDocumentRow.show_id == show_id
        )
        if document_type is not None:
            stmt = stmt.where(RigorDocumentRow.document_type == document_type)
        if processing_status is not None:
            stmt = stmt.where(
                RigorDocumentRow.processing_status == processing_status
            )
        stmt = (
            stmt.order_by(
                RigorDocumentRow.received_at.desc(),
                RigorDocumentRow.document_id.asc(),
            )
            .limit(limit)
            .offset(offset)
        )
        async with self._sf() as session:
            result = await session.execute(stmt)
            return [self._row_to_dict(row) for row in result.scalars()]

    async def update_document(
        self,
        document_id: str,
        *,
        updates: dict[str, Any],
    ) -> dict[str, Any] | None:
        if "document_type" in updates:
            self._validate_choice(
                "document_type",
                updates["document_type"],
                DOCUMENT_TYPES,
            )
        if "processing_status" in updates:
            self._validate_choice(
                "processing_status",
                updates["processing_status"],
                DOCUMENT_PROCESSING_STATUSES,
            )
        async with self._sf() as session:
            row = await session.get(RigorDocumentRow, document_id)
            if row is None:
                return None
            self._apply_updates(row, updates, _DOCUMENT_UPDATE_FIELDS)
            await session.commit()
            await session.refresh(row)
            return self._row_to_dict(row)

    async def delete_document(self, document_id: str) -> bool:
        async with self._sf() as session:
            row = await session.get(RigorDocumentRow, document_id)
            if row is None:
                return False
            await session.delete(row)
            await session.commit()
            return True

    async def create_requirement(
        self,
        *,
        requirement_id: str,
        show_id: str,
        department: str,
        category: str,
        requirement_text: str,
        origin_type: str,
        document_id: str | None = None,
        normalized_value: str | None = None,
        unit: str | None = None,
        source_page: int | None = None,
        source_location: str | None = None,
        source_excerpt: str | None = None,
        confidence: float | None = None,
        requirement_status: str = "EXTRACTED",
        owner: str | None = None,
        due_at: datetime | None = None,
    ) -> dict[str, Any]:
        self._validate_choice(
            "origin_type",
            origin_type,
            REQUIREMENT_ORIGIN_TYPES,
        )
        self._validate_choice(
            "requirement_status",
            requirement_status,
            REQUIREMENT_STATUSES,
        )
        self._validate_confidence(confidence)
        now = datetime.now(UTC)
        row = RigorRequirementRow(
            requirement_id=requirement_id,
            show_id=show_id,
            document_id=document_id,
            department=department,
            category=category,
            requirement_text=requirement_text,
            normalized_value=normalized_value,
            unit=unit,
            origin_type=origin_type,
            source_page=source_page,
            source_location=source_location,
            source_excerpt=source_excerpt,
            confidence=confidence,
            requirement_status=requirement_status,
            owner=owner,
            due_at=due_at,
            created_at=now,
            updated_at=now,
        )
        async with self._sf() as session:
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return self._row_to_dict(row)

    async def get_requirement(
        self,
        requirement_id: str,
    ) -> dict[str, Any] | None:
        async with self._sf() as session:
            row = await session.get(RigorRequirementRow, requirement_id)
            return None if row is None else self._row_to_dict(row)

    async def list_requirements(
        self,
        show_id: str,
        *,
        department: str | None = None,
        requirement_status: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        if requirement_status is not None:
            self._validate_choice(
                "requirement_status",
                requirement_status,
                REQUIREMENT_STATUSES,
            )
        limit, offset = self._pagination(limit, offset)
        stmt = select(RigorRequirementRow).where(
            RigorRequirementRow.show_id == show_id
        )
        if department is not None:
            stmt = stmt.where(RigorRequirementRow.department == department)
        if requirement_status is not None:
            stmt = stmt.where(
                RigorRequirementRow.requirement_status == requirement_status
            )
        stmt = (
            stmt.order_by(
                RigorRequirementRow.created_at.asc(),
                RigorRequirementRow.requirement_id.asc(),
            )
            .limit(limit)
            .offset(offset)
        )
        async with self._sf() as session:
            result = await session.execute(stmt)
            return [self._row_to_dict(row) for row in result.scalars()]

    async def update_requirement(
        self,
        requirement_id: str,
        *,
        updates: dict[str, Any],
    ) -> dict[str, Any] | None:
        if "origin_type" in updates:
            self._validate_choice(
                "origin_type",
                updates["origin_type"],
                REQUIREMENT_ORIGIN_TYPES,
            )
        if "requirement_status" in updates:
            self._validate_choice(
                "requirement_status",
                updates["requirement_status"],
                REQUIREMENT_STATUSES,
            )
        if "confidence" in updates:
            self._validate_confidence(updates["confidence"])
        async with self._sf() as session:
            row = await session.get(RigorRequirementRow, requirement_id)
            if row is None:
                return None
            self._apply_updates(row, updates, _REQUIREMENT_UPDATE_FIELDS)
            await session.commit()
            await session.refresh(row)
            return self._row_to_dict(row)

    async def delete_requirement(self, requirement_id: str) -> bool:
        async with self._sf() as session:
            row = await session.get(RigorRequirementRow, requirement_id)
            if row is None:
                return False
            await session.delete(row)
            await session.commit()
            return True
