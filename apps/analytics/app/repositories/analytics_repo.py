# =============================================================================
# MediCore Analytics - Read-Only Database Repository (SQLAlchemy)
# =============================================================================
# Connects to read-only analytical views in PostgreSQL when configured,
# falling back cleanly when no database is attached (e.g., isolated unit tests).

from datetime import date
from typing import Any

import structlog
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

from app.config import settings

logger = structlog.get_logger()


class AnalyticsRepository:
    """Read-only SQL repository for analytical PostgreSQL views."""

    def __init__(self, database_url: str | None = None):
        self.database_url = database_url or settings.DATABASE_URL
        self._engine: Engine | None = None

    def _get_engine(self) -> Engine | None:
        if self._engine is None and self.database_url:
            try:
                self._engine = create_engine(
                    self.database_url,
                    pool_pre_ping=True,
                    connect_args={"connect_timeout": 2},
                )
            except (SQLAlchemyError, ImportError, ValueError, OSError) as exc:
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
        except SQLAlchemyError:
            return False

    def fetch_appointment_utilization(
        self,
        date_from: date | None = None,
        date_to: date | None = None,
        department_id: str | None = None,
        doctor_id: str | None = None,
    ) -> list[dict[str, Any]] | None:
        """Query vw_appointment_utilization (or read-only appointments when doctor-filtered)."""
        engine = self._get_engine()
        if not engine:
            return None
        try:
            clauses: list[str] = []
            params: dict[str, Any] = {}
            if doctor_id:
                clauses.append('a."doctor_id"::text = :doctor_id')
                params["doctor_id"] = doctor_id
                if date_from:
                    clauses.append('DATE(a."scheduled_start" AT TIME ZONE \'UTC\') >= :date_from')
                    params["date_from"] = date_from
                if date_to:
                    clauses.append('DATE(a."scheduled_start" AT TIME ZONE \'UTC\') <= :date_to')
                    params["date_to"] = date_to
                if department_id:
                    clauses.append('a."department_id"::text = :department_id')
                    params["department_id"] = department_id
                where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
                sql = text(
                    'SELECT d."name" AS "department_name", DATE(a."scheduled_start" AT TIME ZONE \'UTC\') AS "appointment_date", '
                    'a."type", a."status", COUNT(*)::int AS "appointment_count", '
                    'AVG(EXTRACT(EPOCH FROM (a."scheduled_end" - a."scheduled_start")) / 60.0)::float AS "avg_duration_minutes" '
                    'FROM "appointments" a LEFT JOIN "departments" d ON d."id" = a."department_id" '
                    f"{where_sql} "
                    'GROUP BY d."name", DATE(a."scheduled_start" AT TIME ZONE \'UTC\'), a."type", a."status" LIMIT 1000'
                )
            else:
                if date_from:
                    clauses.append('"appointment_date" >= :date_from')
                    params["date_from"] = date_from
                if date_to:
                    clauses.append('"appointment_date" <= :date_to')
                    params["date_to"] = date_to
                if department_id:
                    clauses.append('"department_id"::text = :department_id')
                    params["department_id"] = department_id
                where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
                sql = text(
                    'SELECT department_name, appointment_date, status, type, appointment_count, avg_duration_minutes '
                    f'FROM vw_appointment_utilization {where_sql} LIMIT 1000'
                )

            with engine.connect() as conn:
                rows = conn.execute(sql, params).mappings().all()
                return [dict(r) for r in rows] if rows else None
        except SQLAlchemyError as exc:
            logger.debug("analytics_view_fallback", view="vw_appointment_utilization", error=str(exc))
            return None

    def fetch_waiting_times(
        self,
        date_from: date | None = None,
        date_to: date | None = None,
        department_id: str | None = None,
    ) -> list[dict[str, Any]] | None:
        """Query vw_waiting_times view if available."""
        engine = self._get_engine()
        if not engine:
            return None
        try:
            clauses: list[str] = []
            params: dict[str, Any] = {}
            if date_from:
                clauses.append('DATE("checked_in_at" AT TIME ZONE \'UTC\') >= :date_from')
                params["date_from"] = date_from
            if date_to:
                clauses.append('DATE("checked_in_at" AT TIME ZONE \'UTC\') <= :date_to')
                params["date_to"] = date_to
            if department_id:
                clauses.append('"department_id"::text = :department_id')
                params["department_id"] = department_id
            where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
            with engine.connect() as conn:
                rows = conn.execute(
                    text(
                        "SELECT department_name, checked_in_at, wait_minutes "
                        f"FROM vw_waiting_times {where_sql} LIMIT 5000"
                    ),
                    params,
                ).mappings().all()
                return [dict(r) for r in rows] if rows else None
        except SQLAlchemyError as exc:
            logger.debug("analytics_view_fallback", view="vw_waiting_times", error=str(exc))
            return None

    def fetch_lab_turnaround(
        self,
        category: str | None = None,
        priority: str | None = None,
    ) -> list[dict[str, Any]] | None:
        """Query vw_lab_turnaround view if available."""
        engine = self._get_engine()
        if not engine:
            return None
        try:
            clauses: list[str] = []
            params: dict[str, Any] = {}
            if category:
                clauses.append('"category" = :category')
                params["category"] = category
            if priority:
                clauses.append('"priority"::text = :priority')
                params["priority"] = priority
            where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
            with engine.connect() as conn:
                rows = conn.execute(
                    text(
                        "SELECT category, priority, target_hours, is_abnormal, actual_hours "
                        f"FROM vw_lab_turnaround {where_sql} LIMIT 5000"
                    ),
                    params,
                ).mappings().all()
                return [dict(r) for r in rows] if rows else None
        except SQLAlchemyError as exc:
            logger.debug("analytics_view_fallback", view="vw_lab_turnaround", error=str(exc))
            return None
