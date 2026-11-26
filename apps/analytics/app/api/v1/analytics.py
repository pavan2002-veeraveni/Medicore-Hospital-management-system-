# =============================================================================
# MediCore Analytics - Analytics Endpoints
# =============================================================================

from datetime import date
from typing import Annotated

import structlog
from fastapi import APIRouter, HTTPException, Query

from app.schemas.analytics import (
    AppointmentUtilizationResponse,
    LabTurnaroundResponse,
    PatientPopulationResponse,
    WaitingTimeResponse,
)
from app.services.analytics_service import AnalyticsService

logger = structlog.get_logger()
router = APIRouter()
analytics_service = AnalyticsService()


@router.get(
    "/appointment-utilization",
    response_model=AppointmentUtilizationResponse,
    summary="Appointment Utilization Analysis",
    description="Analyze appointment slot utilization rates by department, doctor, and time period.",
)
async def appointment_utilization(
    date_from: Annotated[date | None, Query(description="Start date")] = None,
    date_to: Annotated[date | None, Query(description="End date")] = None,
    department_id: Annotated[str | None, Query(description="Filter by department")] = None,
    doctor_id: Annotated[str | None, Query(description="Filter by doctor")] = None,
):
    """Calculate appointment utilization metrics."""
    try:
        return await analytics_service.get_appointment_utilization(
            date_from=date_from,
            date_to=date_to,
            department_id=department_id,
            doctor_id=doctor_id,
        )
    except (RuntimeError, ValueError, TypeError, LookupError) as e:
        logger.error("appointment_utilization_error", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to generate utilization report") from e


@router.get(
    "/waiting-times",
    response_model=WaitingTimeResponse,
    summary="Patient Waiting Time Analysis",
    description="Analyze patient waiting times from check-in to encounter start.",
)
async def waiting_times(
    date_from: Annotated[date | None, Query(description="Start date")] = None,
    date_to: Annotated[date | None, Query(description="End date")] = None,
    department_id: Annotated[str | None, Query(description="Filter by department")] = None,
):
    """Calculate waiting time metrics."""
    try:
        return await analytics_service.get_waiting_times(
            date_from=date_from,
            date_to=date_to,
            department_id=department_id,
        )
    except (RuntimeError, ValueError, TypeError, LookupError) as e:
        logger.error("waiting_times_error", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to generate waiting time report") from e


@router.get(
    "/lab-turnaround",
    response_model=LabTurnaroundResponse,
    summary="Laboratory Turnaround Time Analysis",
    description="Analyze laboratory test turnaround times from order to result.",
)
async def lab_turnaround(
    date_from: Annotated[date | None, Query(description="Start date")] = None,
    date_to: Annotated[date | None, Query(description="End date")] = None,
    category: Annotated[str | None, Query(description="Test category")] = None,
    priority: Annotated[str | None, Query(description="Order priority")] = None,
):
    """Calculate laboratory turnaround metrics."""
    try:
        return await analytics_service.get_lab_turnaround(
            date_from=date_from,
            date_to=date_to,
            category=category,
            priority=priority,
        )
    except (RuntimeError, ValueError, TypeError, LookupError) as e:
        logger.error("lab_turnaround_error", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to generate turnaround report") from e


@router.get(
    "/patient-population",
    response_model=PatientPopulationResponse,
    summary="Synthetic Patient Population Report",
    description="Generate synthetic patient population demographics and statistics.",
)
async def patient_population():
    """Generate patient population analytics using synthetic data."""
    try:
        return await analytics_service.get_patient_population()
    except (RuntimeError, ValueError, TypeError, LookupError) as e:
        logger.error("patient_population_error", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to generate population report") from e
