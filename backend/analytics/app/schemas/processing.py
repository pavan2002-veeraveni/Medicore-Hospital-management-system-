# =============================================================================
# MediCore Analytics - Pydantic Schemas for Data Processing
# =============================================================================

from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field


def utc_now() -> datetime:
    return datetime.now(UTC)


class LabTestRecord(BaseModel):
    """Single lab test result record."""
    test_code: str
    test_name: str | None = None
    value: str | None = None
    numeric_value: float | None = None
    unit: str | None = None
    reference_min: float | None = None
    reference_max: float | None = None
    sample_type: str | None = None
    collected_at: datetime | None = None
    resulted_at: datetime | None = None
    patient_id: str | None = None


class LabDataInput(BaseModel):
    """Input for laboratory dataset processing."""
    records: list[LabTestRecord] = Field(min_length=1)
    validate_units: bool = True
    validate_references: bool = True
    flag_missing: bool = True


class AppointmentRecord(BaseModel):
    """Single appointment record."""
    appointment_id: str | None = None
    patient_id: str | None = None
    doctor_id: str | None = None
    scheduled_start: datetime | None = None
    scheduled_end: datetime | None = None
    status: str | None = None
    type: str | None = None
    checked_in_at: datetime | None = None
    department: str | None = None


class AppointmentDataInput(BaseModel):
    """Input for appointment dataset processing."""
    records: list[AppointmentRecord] = Field(min_length=1)
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
    issues: list[ValidationIssue] = []
    summary: dict[str, Any] = {}
    processed_at: datetime = Field(default_factory=utc_now)


class QualityDimension(BaseModel):
    """Quality check for a specific dimension."""
    dimension: str
    score: float = Field(ge=0, le=100)
    checks_passed: int
    checks_total: int
    issues: list[str] = []


class DataQualityReport(BaseModel):
    """Comprehensive data quality report."""
    dataset_type: str
    overall_score: float = Field(ge=0, le=100)
    dimensions: list[QualityDimension] = []
    recommendations: list[str] = []
    generated_at: datetime = Field(default_factory=utc_now)
