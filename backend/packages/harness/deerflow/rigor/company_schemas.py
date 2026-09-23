"""Controlled values for RIGOR company operating state."""

from enum import StrEnum


class CompanyRecordType(StrEnum):
    OBJECTIVE = "OBJECTIVE"
    MILESTONE = "MILESTONE"
    RELATIONSHIP = "RELATIONSHIP"
    FEEDBACK = "FEEDBACK"
    RISK = "RISK"
    EXPERIMENT = "EXPERIMENT"
    RUNWAY = "RUNWAY"


class CompanyRecordStatus(StrEnum):
    OPEN = "OPEN"
    ACTIVE = "ACTIVE"
    BLOCKED = "BLOCKED"
    NEEDS_APPROVAL = "NEEDS_APPROVAL"
    COMPLETE = "COMPLETE"
    ARCHIVED = "ARCHIVED"


class CompanyPriority(StrEnum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
