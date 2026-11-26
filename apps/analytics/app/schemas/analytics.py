# =============================================================================
# MediCore Analytics - Pydantic Schemas for Analytics
# =============================================================================

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, date, timezone


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class UtilizationMetric(BaseModel):
    """Single utilization data point."""
    label: str
    total_slots: int = Field(ge=0)
    booked_slots: int = Field(ge=0)
    completed: int = Field(ge=0)
    cancelled: int = Field(ge=0)
    no_shows: int = Field(ge=0)
    utilization_rate: float = Field(ge=0, le=100)
    completion_rate: float = Field(ge=0, le=100)


class AppointmentUtilizationResponse(BaseModel):
    """Appointment utilization analysis response."""
    period: Dict[str, Optional[str]]
    overall_utilization: float
    overall_completion_rate: float
    total_appointments: int
    by_department: List[UtilizationMetric] = []
    by_day_of_week: List[UtilizationMetric] = []
    by_type: List[UtilizationMetric] = []
    data_source: str = "synthetic"
    generated_at: datetime = Field(default_factory=utc_now)


class WaitingTimeMetric(BaseModel):
    """Waiting time statistics."""
    label: str
    avg_minutes: float
    median_minutes: float
    min_minutes: float
    max_minutes: float
    p90_minutes: float
    sample_size: int


class WaitingTimeResponse(BaseModel):
    """Waiting time analysis response."""
    period: Dict[str, Optional[str]]
    overall_avg_minutes: float
    overall_median_minutes: float
    by_department: List[WaitingTimeMetric] = []
    by_day_of_week: List[WaitingTimeMetric] = []
    by_hour: List[WaitingTimeMetric] = []
    data_source: str = "synthetic"
    generated_at: datetime = Field(default_factory=utc_now)


class LabTurnaroundMetric(BaseModel):
    """Lab turnaround time statistics."""
    label: str
    avg_hours: float
    median_hours: float
    min_hours: float
    max_hours: float
    within_target: int
    total: int
    target_hours: Optional[float] = None
    compliance_rate: float = Field(ge=0, le=100)


class LabTurnaroundResponse(BaseModel):
    """Lab turnaround analysis response."""
    period: Dict[str, Optional[str]]
    overall_avg_hours: float
    overall_compliance_rate: float
    by_category: List[LabTurnaroundMetric] = []
    by_priority: List[LabTurnaroundMetric] = []
    abnormal_rate: float
    data_source: str = "synthetic"
    generated_at: datetime = Field(default_factory=utc_now)


class DemographicBreakdown(BaseModel):
    """Demographic category breakdown."""
    label: str
    count: int
    percentage: float


class PatientPopulationResponse(BaseModel):
    """Synthetic patient population report."""
    total_patients: int
    active_patients: int
    new_registrations_30d: int
    by_gender: List[DemographicBreakdown] = []
    by_age_group: List[DemographicBreakdown] = []
    by_blood_type: List[DemographicBreakdown] = []
    avg_age: float
    data_source: str = "synthetic"
    generated_at: datetime = Field(default_factory=utc_now)
