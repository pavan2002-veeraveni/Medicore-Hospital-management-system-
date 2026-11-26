# =============================================================================
# MediCore Analytics - Data Processing Endpoints
# =============================================================================

import structlog
from fastapi import APIRouter, HTTPException

from app.schemas.processing import (
    AppointmentDataInput,
    DataProcessingResponse,
    DataQualityReport,
    LabDataInput,
)
from app.services.processing_service import ProcessingService

logger = structlog.get_logger()
router = APIRouter()
processing_service = ProcessingService()


@router.post(
    "/process-lab-data",
    response_model=DataProcessingResponse,
    summary="Process Laboratory Dataset",
    description="Validate and process laboratory test data, checking units and reference ranges.",
)
async def process_lab_data(data: LabDataInput):
    """
    Process synthetic laboratory dataset:
    - Validate test codes and units
    - Check reference range metadata
    - Flag missing or malformed values
    - Generate data quality report
    """
    try:
        result = await processing_service.process_lab_data(data)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("process_lab_data_error", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to process lab data")


@router.post(
    "/process-appointment-data",
    response_model=DataProcessingResponse,
    summary="Process Appointment Dataset",
    description="Validate and process appointment scheduling data.",
)
async def process_appointment_data(data: AppointmentDataInput):
    """
    Process synthetic appointment dataset:
    - Validate date ranges and time slots
    - Check for scheduling conflicts
    - Validate status transitions
    - Generate data quality report
    """
    try:
        result = await processing_service.process_appointment_data(data)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("process_appointment_data_error", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to process appointment data")


@router.post(
    "/data-quality",
    response_model=DataQualityReport,
    summary="Generate Data Quality Report",
    description="Run data quality checks across datasets.",
)
async def data_quality_report(
    dataset_type: str = "all",
):
    """Generate a comprehensive data quality report."""
    try:
        result = await processing_service.generate_quality_report(dataset_type)
        return result
    except Exception as e:
        logger.error("data_quality_error", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to generate quality report")
