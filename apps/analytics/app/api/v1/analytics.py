# =============================================================================
# MediCore Analytics - Analytics Endpoints
# =============================================================================

from datetime import date
from typing import Optional

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
    date_from: Optional[date] = Query(None, description="Start date"),
    date_to: Optional[date] = Query(None, description="End date"),
    department_id: Optional[str] = Query(None, description="Filter by department"),
    doctor_id: Optional[str] = Query(None, description="Filter by doctor"),
):
    """Calculate appointment utilization metrics."""
    try:
        result = await analytics_service.get_appointment_utilization(
            date_from=date_from,
            date_to=date_to,
            department_id=department_id,
            doctor_id=doctor_id,
        )
        return result
    except Exception as e:
        logger.error("appointment_utilization_error", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to generate utilization report")


@router.get(
    "/waiting-times",
    response_model=WaitingTimeResponse,
    summary="Patient Waiting Time Analysis",
    description="Analyze patient waiting times from check-in to encounter start.",
)
async def waiting_times(
    date_from: Optional[date] = Query(None, description="Start date"),
    date_to: Optional[date] = Query(None, description="End date"),
    department_id: Optional[str] = Query(None, description="Filter by department"),
):
    """Calculate waiting time metrics."""
    try:
        result = await analytics_service.get_waiting_times(
            date_from=date_from,
            date_to=date_to,
            department_id=department_id,
        )
        return result
    except Exception as e:
        logger.error("waiting_times_error", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to generate waiting time report")


@router.get(
    "/lab-turnaround",
    response_model=LabTurnaroundResponse,
    summary="Laboratory Turnaround Time Analysis",
    description="Analyze laboratory test turnaround times from order to result.",
)
async def lab_turnaround(
    date_from: Optional[date] = Query(None, description="Start date"),
    date_to: Optional[date] = Query(None, description="End date"),
    category: Optional[str] = Query(None, description="Test category"),
    priority: Optional[str] = Query(None, description="Order priority"),
):
    """Calculate laboratory turnaround metrics."""
    try:
        result = await analytics_service.get_lab_turnaround(
            date_from=date_from,
            date_to=date_to,
            category=category,
            priority=priority,
        )
        return result
    except Exception as e:
        logger.error("lab_turnaround_error", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to generate turnaround report")


@router.get(
    "/patient-population",
    response_model=PatientPopulationResponse,
    summary="Synthetic Patient Population Report",
    description="Generate synthetic patient population demographics and statistics.",
)
async def patient_population():
    """Generate patient population analytics using synthetic data."""
    try:
        result = await analytics_service.get_patient_population()
        return result
    except Exception as e:
        logger.error("patient_population_error", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to generate population report")
