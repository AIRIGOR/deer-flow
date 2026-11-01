"""Async SQLAlchemy repository for RIGOR production records."""

from __future__ import annotations

import hashlib
from datetime import UTC, date, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import inspect, or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from deerflow.persistence.rigor.audit import current_audit_context
from deerflow.persistence.rigor.audit_model import RigorAuditRow
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
        row: RigorShowRow | RigorDocumentRow | RigorRequirementRow | RigorAuditRow,
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
            raise ValueError(f"Invalid {name}: {value!r}. Expected one of: {choices}")

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
        changed = any(getattr(row, key) != value for key, value in updates.items())
        for key, value in updates.items():
            setattr(row, key, value)
        if changed:
            row.updated_at = datetime.now(UTC)

    @staticmethod
    def _redact(snapshot: dict[str, Any] | None) -> dict[str, Any] | None:
        if snapshot is None:
            return None
        return {key: {"redacted": True, "sha256": hashlib.sha256(str(value).encode()).hexdigest()} if key in {"source_excerpt", "storage_location"} and value is not None else value for key, value in snapshot.items()}

    async def _commit_with_audit(self, session: AsyncSession) -> None:
        """One transaction: fail either business flush or history insert, roll back both."""
        types = {RigorShowRow: ("SHOW", "show_id"), RigorDocumentRow: ("DOCUMENT", "document_id"), RigorRequirementRow: ("REQUIREMENT", "requirement_id")}
        pending = []
        for row in dict.fromkeys([*session.new, *session.dirty, *session.deleted]):
            if type(row) not in types:
                continue
            current = self._row_to_dict(row)
            action = "DELETE" if row in session.deleted else "CREATE" if row in session.new else "UPDATE"
            before = None if action == "CREATE" else dict(current)
            if action == "UPDATE":
                for attr in inspect(row).attrs:
                    history = attr.history
                    if history.has_changes() and history.deleted:
                        old = history.deleted[0]
                        before[attr.key] = coerce_iso(old) if isinstance(old, datetime) else old.isoformat() if isinstance(old, date) else old
            pending.append((row, action, before))
        await session.flush()
        for row, action, _ in pending:
            if action != "DELETE":
                await session.refresh(row)
        actor = current_audit_context()
        occurred = datetime.now(UTC)
        for row, action, before in pending:
            after = None if action == "DELETE" else self._row_to_dict(row)
            state = after if after is not None else before
            fields = sorted(key for key in set(before or {}) | set(after or {}) if key not in {"created_at", "updated_at"} and (before or {}).get(key) != (after or {}).get(key))
            if action == "UPDATE" and not fields:
                continue
            entity_type, id_key = types[type(row)]
            status_changes = {key: {"before": (before or {}).get(key), "after": (after or {}).get(key)} for key in fields if key in {"show_status", "requirement_status", "processing_status"}}
            session.add(
                RigorAuditRow(
                    audit_id=str(uuid4()),
                    entity_type=entity_type,
                    entity_id=state[id_key],
                    show_id=state["show_id"],
                    action=action,
                    actor_kind=actor.actor_kind,
                    actor_id=actor.actor_id,
                    correlation_id=actor.correlation_id,
                    source_ref=actor.source_ref,
                    occurred_at=occurred,
                    changed_fields=fields,
                    before_state=self._redact(before),
                    after_state=self._redact(after),
                    source_refs={key: state.get(key) for key in ("document_id", "supersedes_document_id", "source_page", "source_location") if key in state},
                    approval_context={"status_changes": status_changes, "verified_approval": False},
                )
            )
        await session.commit()

    async def list_history(self, show_id: str, *, entity_type: str | None = None, entity_id: str | None = None, limit: int = 100, offset: int = 0) -> list[dict[str, Any]]:
        """Trusted internal read only; no new public API or authorization grant."""
        stmt = select(RigorAuditRow).where(or_(RigorAuditRow.show_id == show_id, RigorAuditRow.before_state["show_id"].as_string() == show_id))
        if entity_type is not None:
            self._validate_choice("entity_type", entity_type, ("SHOW", "DOCUMENT", "REQUIREMENT"))
            stmt = stmt.where(RigorAuditRow.entity_type == entity_type)
        if entity_id is not None:
            stmt = stmt.where(RigorAuditRow.entity_id == entity_id)
        limit, offset = self._pagination(limit, offset)
        stmt = stmt.order_by(RigorAuditRow.occurred_at, RigorAuditRow.audit_id).limit(limit).offset(offset)
        async with self._sf() as session:
            return [self._row_to_dict(row) for row in (await session.scalars(stmt)).all()]

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
            await self._commit_with_audit(session)
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
            await self._commit_with_audit(session)
            await session.refresh(row)
            return self._row_to_dict(row)

    async def delete_show(self, show_id: str) -> bool:
        async with self._sf() as session:
            row = await session.get(RigorShowRow, show_id)
            if row is None:
                return False
            documents = list((await session.scalars(select(RigorDocumentRow).where(RigorDocumentRow.show_id == show_id))).all())
            requirements = list((await session.scalars(select(RigorRequirementRow).where(RigorRequirementRow.show_id == show_id))).all())
            ids = [document.document_id for document in documents]
            external_requirements = list((await session.scalars(select(RigorRequirementRow).where(RigorRequirementRow.document_id.in_(ids), RigorRequirementRow.show_id != show_id))).all()) if ids else []
            external_documents = list((await session.scalars(select(RigorDocumentRow).where(RigorDocumentRow.supersedes_document_id.in_(ids), RigorDocumentRow.show_id != show_id))).all()) if ids else []
            for linked in external_requirements:
                linked.document_id = None
            for linked in external_documents:
                linked.supersedes_document_id = None
            for child in [*requirements, *documents]:
                await session.delete(child)
            await session.delete(row)
            await self._commit_with_audit(session)
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
            await self._commit_with_audit(session)
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
        stmt = select(RigorDocumentRow).where(RigorDocumentRow.show_id == show_id)
        if document_type is not None:
            stmt = stmt.where(RigorDocumentRow.document_type == document_type)
        if processing_status is not None:
            stmt = stmt.where(RigorDocumentRow.processing_status == processing_status)
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
            await self._commit_with_audit(session)
            await session.refresh(row)
            return self._row_to_dict(row)

    async def delete_document(self, document_id: str) -> bool:
        async with self._sf() as session:
            row = await session.get(RigorDocumentRow, document_id)
            if row is None:
                return False
            requirements = list((await session.scalars(select(RigorRequirementRow).where(RigorRequirementRow.document_id == document_id))).all())
            revisions = list((await session.scalars(select(RigorDocumentRow).where(RigorDocumentRow.supersedes_document_id == document_id, RigorDocumentRow.document_id != document_id))).all())
            for linked in requirements:
                linked.document_id = None
            for linked in revisions:
                linked.supersedes_document_id = None
            await session.delete(row)
            await self._commit_with_audit(session)
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
            await self._commit_with_audit(session)
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
        stmt = select(RigorRequirementRow).where(RigorRequirementRow.show_id == show_id)
        if department is not None:
            stmt = stmt.where(RigorRequirementRow.department == department)
        if requirement_status is not None:
            stmt = stmt.where(RigorRequirementRow.requirement_status == requirement_status)
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
            await self._commit_with_audit(session)
            await session.refresh(row)
            return self._row_to_dict(row)

    async def delete_requirement(self, requirement_id: str) -> bool:
        async with self._sf() as session:
            row = await session.get(RigorRequirementRow, requirement_id)
            if row is None:
                return False
            await session.delete(row)
            await self._commit_with_audit(session)
            return True
