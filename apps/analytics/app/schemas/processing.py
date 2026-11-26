# =============================================================================
# MediCore Analytics - Pydantic Schemas for Data Processing
# =============================================================================

from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class LabTestRecord(BaseModel):
    """Single lab test result record."""
    test_code: str
    test_name: Optional[str] = None
    value: Optional[str] = None
    numeric_value: Optional[float] = None
    unit: Optional[str] = None
    reference_min: Optional[float] = None
    reference_max: Optional[float] = None
    sample_type: Optional[str] = None
    collected_at: Optional[datetime] = None
    resulted_at: Optional[datetime] = None
    patient_id: Optional[str] = None


class LabDataInput(BaseModel):
    """Input for laboratory dataset processing."""
    records: List[LabTestRecord] = Field(min_length=1)
    validate_units: bool = True
    validate_references: bool = True
    flag_missing: bool = True


class AppointmentRecord(BaseModel):
    """Single appointment record."""
    appointment_id: Optional[str] = None
    patient_id: Optional[str] = None
    doctor_id: Optional[str] = None
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None
    status: Optional[str] = None
    type: Optional[str] = None
    checked_in_at: Optional[datetime] = None
    department: Optional[str] = None


class AppointmentDataInput(BaseModel):
    """Input for appointment dataset processing."""
    records: List[AppointmentRecord] = Field(min_length=1)
    check_conflicts: bool = True
    validate_transitions: bool = True


class ValidationIssue(BaseModel):
    """A data validation issue found during processing."""
    record_index: int
    field: str
    issue_type: str  # MISSING, INVALID, OUT_OF_RANGE, MALFORMED
    message: str
    severity: str = "WARNING"  # WARNING, ERROR


class DataProcessingResponse(BaseModel):
    """Response from data processing endpoints."""
    total_records: int
    valid_records: int
    invalid_records: int
    issues: List[ValidationIssue] = []
    summary: Dict[str, Any] = {}
    processed_at: datetime = Field(default_factory=utc_now)


class QualityDimension(BaseModel):
    """Quality check for a specific dimension."""
    dimension: str
    score: float = Field(ge=0, le=100)
    checks_passed: int
    checks_total: int
    issues: List[str] = []


class DataQualityReport(BaseModel):
    """Comprehensive data quality report."""
    dataset_type: str
    overall_score: float = Field(ge=0, le=100)
    dimensions: List[QualityDimension] = []
    recommendations: List[str] = []
    generated_at: datetime = Field(default_factory=utc_now)
