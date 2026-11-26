# =============================================================================
# MediCore Analytics - FastAPI Application
# =============================================================================

from contextlib import asynccontextmanager
from datetime import datetime, timezone

import structlog
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import analytics, data_processing
from app.config import settings
from app.middleware.auth import verify_api_key

logger = structlog.get_logger()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    logger.info("MediCore Analytics Service starting up", port=settings.PORT)
    yield
    logger.info("MediCore Analytics Service shutting down")

app = FastAPI(
    title="MediCore Analytics Service",
    description="""
    Clinical data processing and analytics service for MediCore Hospital Management Platform.
    
    **Responsibilities:**
    - Appointment utilization analysis
    - Waiting-time calculations
    - Laboratory turnaround analysis
    - Synthetic patient population reports
    - Clinical dataset validation
    - Data quality reporting
    
    **IMPORTANT:** This service does NOT generate medical diagnoses or treatment recommendations.
    It processes synthetic data only for educational purposes.
    """,
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.CORS_ORIGIN],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Health endpoints
@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "medicore-analytics",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "1.0.0",
    }

@app.get("/ready", tags=["Health"])
async def readiness_check():
    """Readiness check endpoint."""
    return {
        "status": "ready",
        "service": "medicore-analytics",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

# API Routes
app.include_router(
    analytics.router,
    prefix="/api/v1/analytics",
    tags=["Analytics"],
    dependencies=[Depends(verify_api_key)],
)

app.include_router(
    data_processing.router,
    prefix="/api/v1/analytics",
    tags=["Data Processing"],
    dependencies=[Depends(verify_api_key)],
)
