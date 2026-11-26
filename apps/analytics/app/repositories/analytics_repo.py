# =============================================================================
# MediCore Analytics - Read-Only Database Repository (SQLAlchemy)
# =============================================================================
# Connects to read-only analytical views in PostgreSQL when configured,
# falling back cleanly when no database is attached (e.g., isolated unit tests).

from typing import Optional, List, Dict, Any
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
import structlog
from app.config import settings

logger = structlog.get_logger()


class AnalyticsRepository:
    """Read-only SQL repository for analytical PostgreSQL views."""

    def __init__(self, database_url: Optional[str] = None):
        self.database_url = database_url or settings.DATABASE_URL
        self._engine: Optional[Engine] = None

    def _get_engine(self) -> Optional[Engine]:
        if self._engine is None and self.database_url:
            try:
                self._engine = create_engine(
                    self.database_url,
                    pool_pre_ping=True,
                    connect_args={"connect_timeout": 2},
                )
            except Exception as exc:
                logger.warning("analytics_db_engine_init_failed", error=str(exc))
                return None
        return self._engine

    def check_connection(self) -> bool:
        """Return True if read-only database views are reachable."""
        engine = self._get_engine()
        if not engine:
            return False
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return True
        except Exception:
            return False

    def fetch_appointment_utilization(self) -> Optional[List[Dict[str, Any]]]:
        """Query vw_appointment_utilization view if available."""
        engine = self._get_engine()
        if not engine:
            return None
        try:
            with engine.connect() as conn:
                rows = conn.execute(
                    text(
                        "SELECT department_name, status, type, appointment_count, avg_duration_minutes "
                        "FROM vw_appointment_utilization LIMIT 1000"
                    )
                ).mappings().all()
                return [dict(r) for r in rows] if rows else None
        except Exception as exc:
            logger.debug("analytics_view_fallback", view="vw_appointment_utilization", error=str(exc))
            return None

    def fetch_waiting_times(self) -> Optional[List[Dict[str, Any]]]:
        """Query vw_waiting_times view if available."""
        engine = self._get_engine()
        if not engine:
            return None
        try:
            with engine.connect() as conn:
                rows = conn.execute(
                    text(
                        "SELECT department_name, wait_minutes "
                        "FROM vw_waiting_times LIMIT 5000"
                    )
                ).mappings().all()
                return [dict(r) for r in rows] if rows else None
        except Exception as exc:
            logger.debug("analytics_view_fallback", view="vw_waiting_times", error=str(exc))
            return None

    def fetch_lab_turnaround(self) -> Optional[List[Dict[str, Any]]]:
        """Query vw_lab_turnaround view if available."""
        engine = self._get_engine()
        if not engine:
            return None
        try:
            with engine.connect() as conn:
                rows = conn.execute(
                    text(
                        "SELECT category, priority, target_hours, is_abnormal, actual_hours "
                        "FROM vw_lab_turnaround LIMIT 5000"
                    )
                ).mappings().all()
                return [dict(r) for r in rows] if rows else None
        except Exception as exc:
            logger.debug("analytics_view_fallback", view="vw_lab_turnaround", error=str(exc))
            return None
