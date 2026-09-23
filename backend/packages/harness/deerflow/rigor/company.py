"""Application service for RIGOR company operating state."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Any

from deerflow.persistence.rigor import RigorCompanyRepository

from .company_schemas import (
    CompanyPriority,
    CompanyRecordStatus,
    CompanyRecordType,
)


class RigorCompanyRecordNotFoundError(LookupError):
    """Raised when a requested company-state record does not exist."""


@dataclass(frozen=True)
class RigorCompanyStateSnapshot:
    """Current durable operating state grouped by company-record type."""

    records: list[dict[str, Any]]
    objectives: list[dict[str, Any]]
    milestones: list[dict[str, Any]]
    relationships: list[dict[str, Any]]
    feedback: list[dict[str, Any]]
    risks: list[dict[str, Any]]
    experiments: list[dict[str, Any]]
    runway: list[dict[str, Any]]
    approvals: list[dict[str, Any]]


IdentifierFactory = Callable[[], str]


def _default_identifier() -> str:
    return str(uuid.uuid4())


class RigorCompanyManager:
    """Coordinate durable company-state records over the persistence layer."""

    def __init__(
        self,
        repository: RigorCompanyRepository,
        *,
        id_factory: IdentifierFactory | None = None,
    ) -> None:
        self._repository = repository
        self._id_factory = id_factory or _default_identifier

    @staticmethod
    def _value(value: StrEnum | str) -> str:
        return value.value if isinstance(value, StrEnum) else value

    async def create_record(
        self,
        *,
        record_type: CompanyRecordType | str,
        title: str,
        record_id: str | None = None,
        summary: str | None = None,
        status: CompanyRecordStatus | str = CompanyRecordStatus.OPEN,
        priority: CompanyPriority | str = CompanyPriority.MEDIUM,
        owner_agent: str | None = None,
        approval_required: bool = False,
        due_at: datetime | None = None,
        source_ref: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return await self._repository.create_record(
            record_id=record_id or self._id_factory(),
            record_type=self._value(record_type),
            title=title,
            summary=summary,
            status=self._value(status),
            priority=self._value(priority),
            owner_agent=owner_agent,
            approval_required=approval_required,
            due_at=due_at,
            source_ref=source_ref,
            payload=payload,
        )

    async def get_record(self, record_id: str) -> dict[str, Any]:
        record = await self._repository.get_record(record_id)
        if record is None:
            raise RigorCompanyRecordNotFoundError(
                f"RIGOR company record not found: {record_id}"
            )
        return record

    async def list_records(
        self,
        *,
        record_type: CompanyRecordType | str | None = None,
        status: CompanyRecordStatus | str | None = None,
        owner_agent: str | None = None,
        approval_required: bool | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        return await self._repository.list_records(
            record_type=(
                None if record_type is None else self._value(record_type)
            ),
            status=None if status is None else self._value(status),
            owner_agent=owner_agent,
            approval_required=approval_required,
            limit=limit,
            offset=offset,
        )

    async def update_record(
        self,
        record_id: str,
        **updates: Any,
    ) -> dict[str, Any]:
        if "record_type" in updates:
            updates["record_type"] = self._value(updates["record_type"])
        if "status" in updates:
            updates["status"] = self._value(updates["status"])
        if "priority" in updates:
            updates["priority"] = self._value(updates["priority"])
        updated = await self._repository.update_record(
            record_id,
            updates=updates,
        )
        if updated is None:
            raise RigorCompanyRecordNotFoundError(
                f"RIGOR company record not found: {record_id}"
            )
        return updated

    async def get_state_snapshot(self) -> RigorCompanyStateSnapshot:
        records = await self._repository.list_records(limit=500)

        def typed(record_type: CompanyRecordType) -> list[dict[str, Any]]:
            return [
                record
                for record in records
                if record["record_type"] == record_type.value
            ]

        approvals = [
            record
            for record in records
            if record["approval_required"]
            and record["status"]
            not in {
                CompanyRecordStatus.COMPLETE.value,
                CompanyRecordStatus.ARCHIVED.value,
            }
        ]
        return RigorCompanyStateSnapshot(
            records=records,
            objectives=typed(CompanyRecordType.OBJECTIVE),
            milestones=typed(CompanyRecordType.MILESTONE),
            relationships=typed(CompanyRecordType.RELATIONSHIP),
            feedback=typed(CompanyRecordType.FEEDBACK),
            risks=typed(CompanyRecordType.RISK),
            experiments=typed(CompanyRecordType.EXPERIMENT),
            runway=typed(CompanyRecordType.RUNWAY),
            approvals=approvals,
        )
