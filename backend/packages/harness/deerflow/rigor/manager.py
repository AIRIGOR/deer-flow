"""Application service for RIGOR production records."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime
from enum import StrEnum
from typing import Any

from deerflow.persistence.rigor import RigorRepository

from .schemas import (
    DocumentProcessingStatus,
    DocumentType,
    RequirementOriginType,
    RequirementStatus,
    ShowStatus,
)


class RigorNotFoundError(LookupError):
    """Raised when a requested RIGOR record does not exist."""


class RigorConflictError(Exception):
    """Raised when related RIGOR records do not belong to the same show."""


@dataclass(frozen=True)
class RigorShowSnapshot:
    """Aggregate view of one show and its current source records."""

    show: dict[str, Any]
    documents: list[dict[str, Any]]
    requirements: list[dict[str, Any]]


IdentifierFactory = Callable[[], str]


def _default_identifier() -> str:
    return str(uuid.uuid4())


class RigorManager:
    """Coordinate RIGOR business operations over the persistence repository."""

    def __init__(
        self,
        repository: RigorRepository,
        *,
        id_factory: IdentifierFactory | None = None,
    ) -> None:
        self._repository = repository
        self._id_factory = id_factory or _default_identifier

    @staticmethod
    def _value(value: StrEnum | str) -> str:
        return value.value if isinstance(value, StrEnum) else value

    async def _require_show(self, show_id: str) -> dict[str, Any]:
        show = await self._repository.get_show(show_id)
        if show is None:
            raise RigorNotFoundError(f"RIGOR show not found: {show_id}")
        return show

    async def _require_document(self, document_id: str) -> dict[str, Any]:
        document = await self._repository.get_document(document_id)
        if document is None:
            raise RigorNotFoundError(f"RIGOR document not found: {document_id}")
        return document

    async def _require_requirement(self, requirement_id: str) -> dict[str, Any]:
        requirement = await self._repository.get_requirement(requirement_id)
        if requirement is None:
            raise RigorNotFoundError(
                f"RIGOR requirement not found: {requirement_id}"
            )
        return requirement

    async def create_show(
        self,
        *,
        show_id: str | None = None,
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
        show_status: ShowStatus | str = ShowStatus.DOCUMENTS_PENDING,
    ) -> dict[str, Any]:
        return await self._repository.create_show(
            show_id=show_id or self._id_factory(),
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
            show_status=self._value(show_status),
        )

    async def get_show(self, show_id: str) -> dict[str, Any]:
        return await self._require_show(show_id)

    async def list_shows(
        self,
        *,
        show_status: ShowStatus | str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        return await self._repository.list_shows(
            show_status=None if show_status is None else self._value(show_status),
            limit=limit,
            offset=offset,
        )

    async def update_show(self, show_id: str, **updates: Any) -> dict[str, Any]:
        if "show_status" in updates:
            updates["show_status"] = self._value(updates["show_status"])
        updated = await self._repository.update_show(show_id, updates=updates)
        if updated is None:
            raise RigorNotFoundError(f"RIGOR show not found: {show_id}")
        return updated

    async def delete_show(self, show_id: str) -> None:
        if not await self._repository.delete_show(show_id):
            raise RigorNotFoundError(f"RIGOR show not found: {show_id}")

    async def add_document(
        self,
        show_id: str,
        *,
        document_name: str,
        document_type: DocumentType | str,
        document_id: str | None = None,
        source_party: str | None = None,
        revision: str | None = None,
        document_date: date | None = None,
        received_at: datetime | None = None,
        file_format: str | None = None,
        page_count: int | None = None,
        storage_location: str | None = None,
        processing_status: DocumentProcessingStatus
        | str = DocumentProcessingStatus.RECEIVED,
        supersedes_document_id: str | None = None,
    ) -> dict[str, Any]:
        await self._require_show(show_id)
        if supersedes_document_id is not None:
            superseded = await self._require_document(supersedes_document_id)
            if superseded["show_id"] != show_id:
                raise RigorConflictError(
                    "A document can supersede only a document from the same show"
                )
        return await self._repository.create_document(
            document_id=document_id or self._id_factory(),
            show_id=show_id,
            document_name=document_name,
            document_type=self._value(document_type),
            source_party=source_party,
            revision=revision,
            document_date=document_date,
            received_at=received_at,
            file_format=file_format,
            page_count=page_count,
            storage_location=storage_location,
            processing_status=self._value(processing_status),
            supersedes_document_id=supersedes_document_id,
        )

    async def get_document(self, document_id: str) -> dict[str, Any]:
        return await self._require_document(document_id)

    async def list_documents(
        self,
        show_id: str,
        *,
        document_type: DocumentType | str | None = None,
        processing_status: DocumentProcessingStatus | str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        await self._require_show(show_id)
        return await self._repository.list_documents(
            show_id,
            document_type=(
                None if document_type is None else self._value(document_type)
            ),
            processing_status=(
                None
                if processing_status is None
                else self._value(processing_status)
            ),
            limit=limit,
            offset=offset,
        )

    async def update_document(
        self,
        document_id: str,
        **updates: Any,
    ) -> dict[str, Any]:
        current = await self._require_document(document_id)
        target_show_id = updates.get("show_id", current["show_id"])
        await self._require_show(target_show_id)
        if "document_type" in updates:
            updates["document_type"] = self._value(updates["document_type"])
        if "processing_status" in updates:
            updates["processing_status"] = self._value(
                updates["processing_status"]
            )
        supersedes_id = updates.get(
            "supersedes_document_id",
            current.get("supersedes_document_id"),
        )
        if supersedes_id is not None:
            superseded = await self._require_document(supersedes_id)
            if superseded["show_id"] != target_show_id:
                raise RigorConflictError(
                    "A document can supersede only a document from the same show"
                )
        updated = await self._repository.update_document(
            document_id,
            updates=updates,
        )
        if updated is None:
            raise RigorNotFoundError(
                f"RIGOR document not found: {document_id}"
            )
        return updated

    async def delete_document(self, document_id: str) -> None:
        if not await self._repository.delete_document(document_id):
            raise RigorNotFoundError(
                f"RIGOR document not found: {document_id}"
            )

    async def add_requirement(
        self,
        show_id: str,
        *,
        department: str,
        category: str,
        requirement_text: str,
        origin_type: RequirementOriginType | str,
        requirement_id: str | None = None,
        document_id: str | None = None,
        normalized_value: str | None = None,
        unit: str | None = None,
        source_page: int | None = None,
        source_location: str | None = None,
        source_excerpt: str | None = None,
        confidence: float | None = None,
        requirement_status: RequirementStatus
        | str = RequirementStatus.EXTRACTED,
        owner: str | None = None,
        due_at: datetime | None = None,
    ) -> dict[str, Any]:
        await self._require_show(show_id)
        if document_id is not None:
            document = await self._require_document(document_id)
            if document["show_id"] != show_id:
                raise RigorConflictError(
                    "A requirement source document must belong to the same show"
                )
        return await self._repository.create_requirement(
            requirement_id=requirement_id or self._id_factory(),
            show_id=show_id,
            document_id=document_id,
            department=department,
            category=category,
            requirement_text=requirement_text,
            normalized_value=normalized_value,
            unit=unit,
            origin_type=self._value(origin_type),
            source_page=source_page,
            source_location=source_location,
            source_excerpt=source_excerpt,
            confidence=confidence,
            requirement_status=self._value(requirement_status),
            owner=owner,
            due_at=due_at,
        )

    async def get_requirement(self, requirement_id: str) -> dict[str, Any]:
        return await self._require_requirement(requirement_id)

    async def list_requirements(
        self,
        show_id: str,
        *,
        department: str | None = None,
        requirement_status: RequirementStatus | str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        await self._require_show(show_id)
        return await self._repository.list_requirements(
            show_id,
            department=department,
            requirement_status=(
                None
                if requirement_status is None
                else self._value(requirement_status)
            ),
            limit=limit,
            offset=offset,
        )

    async def update_requirement(
        self,
        requirement_id: str,
        **updates: Any,
    ) -> dict[str, Any]:
        current = await self._require_requirement(requirement_id)
        target_show_id = updates.get("show_id", current["show_id"])
        await self._require_show(target_show_id)
        if "origin_type" in updates:
            updates["origin_type"] = self._value(updates["origin_type"])
        if "requirement_status" in updates:
            updates["requirement_status"] = self._value(
                updates["requirement_status"]
            )
        target_document_id = updates.get(
            "document_id",
            current.get("document_id"),
        )
        if target_document_id is not None:
            document = await self._require_document(target_document_id)
            if document["show_id"] != target_show_id:
                raise RigorConflictError(
                    "A requirement source document must belong to the same show"
                )
        updated = await self._repository.update_requirement(
            requirement_id,
            updates=updates,
        )
        if updated is None:
            raise RigorNotFoundError(
                f"RIGOR requirement not found: {requirement_id}"
            )
        return updated

    async def delete_requirement(self, requirement_id: str) -> None:
        if not await self._repository.delete_requirement(requirement_id):
            raise RigorNotFoundError(
                f"RIGOR requirement not found: {requirement_id}"
            )

    async def get_show_snapshot(self, show_id: str) -> RigorShowSnapshot:
        show = await self._require_show(show_id)
        documents = await self._repository.list_documents(show_id)
        requirements = await self._repository.list_requirements(show_id)
        return RigorShowSnapshot(
            show=show,
            documents=documents,
            requirements=requirements,
        )
