"""RIGOR application service."""

from .analyzer import AnalyzedRequirement, RigorAnalysisError, RigorAnalysisResult, RigorDocumentAnalyzer
from .company import (
    RigorCompanyManager,
    RigorCompanyRecordNotFoundError,
    RigorCompanyStateSnapshot,
)
from .company_actions import (
    AUTO_ALLOWED_ACTIONS,
    FOUNDER_RESERVED_ACTIONS,
    CompanyActionDecision,
    CompanyActionProposal,
    CompanyActionScope,
    CompanyActionStatus,
    CompanyActionType,
    decide_company_action,
    requires_founder_approval,
)
from .company_operator import (
    CompanyStateUpdate,
    RigorCompanyOperator,
    RigorCompanyPulseError,
    RigorCompanyPulseResult,
)
from .company_schemas import CompanyPriority, CompanyRecordStatus, CompanyRecordType
from .manager import (
    RigorConflictError,
    RigorManager,
    RigorNotFoundError,
    RigorShowSnapshot,
)
from .schemas import (
    DocumentProcessingStatus,
    DocumentType,
    RequirementOriginType,
    RequirementStatus,
    ShowStatus,
)

__all__ = [
    "AUTO_ALLOWED_ACTIONS",
    "AnalyzedRequirement",
    "CompanyActionDecision",
    "CompanyActionProposal",
    "CompanyActionScope",
    "CompanyActionStatus",
    "CompanyActionType",
    "CompanyPriority",
    "CompanyStateUpdate",
    "CompanyRecordStatus",
    "CompanyRecordType",
    "DocumentProcessingStatus",
    "DocumentType",
    "FOUNDER_RESERVED_ACTIONS",
    "RequirementOriginType",
    "RequirementStatus",
    "RigorAnalysisError",
    "RigorAnalysisResult",
    "RigorCompanyManager",
    "RigorCompanyOperator",
    "RigorCompanyPulseError",
    "RigorCompanyPulseResult",
    "RigorCompanyRecordNotFoundError",
    "RigorCompanyStateSnapshot",
    "RigorConflictError",
    "RigorDocumentAnalyzer",
    "RigorManager",
    "RigorNotFoundError",
    "RigorShowSnapshot",
    "ShowStatus",
    "decide_company_action",
    "requires_founder_approval",
]
