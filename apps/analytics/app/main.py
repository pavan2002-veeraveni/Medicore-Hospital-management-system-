# =============================================================================
# MediCore Analytics - FastAPI Application
# =============================================================================

from contextlib import asynccontextmanager
from datetime import UTC, datetime

import structlog
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import analytics, data_processing
from app.config import settings
from app.middleware.auth import verify_api_key
from app.repositories.analytics_repo import AnalyticsRepository

logger = structlog.get_logger()
_health_repo = AnalyticsRepository()


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
cors_origins = [o.strip() for o in settings.CORS_ORIGIN.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins or ["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key", "X-Request-ID"],
)


# Health endpoints
@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "medicore-analytics",
        "timestamp": datetime.now(UTC).isoformat(),
        "version": "1.0.0",
    }


@app.get("/ready", tags=["Health"])
async def readiness_check():
    """Readiness check reporting read-only DB connectivity vs synthetic fallback mode."""
    db_connected = _health_repo.check_connection()
    return {
        "status": "ready",
        "service": "medicore-analytics",
        "database": "UP" if db_connected else "SYNTHETIC_FALLBACK",
        "timestamp": datetime.now(UTC).isoformat(),
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
