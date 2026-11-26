# =============================================================================
# MediCore Analytics - Analytics Service
# =============================================================================

from datetime import date

import numpy as np
import pandas as pd
import structlog

from app.repositories.analytics_repo import AnalyticsRepository
from app.schemas.analytics import (
    AppointmentUtilizationResponse,
    DemographicBreakdown,
    LabTurnaroundMetric,
    LabTurnaroundResponse,
    PatientPopulationResponse,
    UtilizationMetric,
    WaitingTimeMetric,
    WaitingTimeResponse,
)

logger = structlog.get_logger()


def _utilization_group(df: pd.DataFrame, group_col: str) -> list[UtilizationMetric]:
    metrics: list[UtilizationMetric] = []
    for label, group in df.groupby(group_col, dropna=False):
        total = int(group["appointment_count"].sum())
        completed = int(group.loc[group["status"] == "COMPLETED", "appointment_count"].sum())
        cancelled = int(group.loc[group["status"] == "CANCELLED", "appointment_count"].sum())
        no_shows = int(group.loc[group["status"] == "NO_SHOW", "appointment_count"].sum())
        metrics.append(
            UtilizationMetric(
                label=str(label or "Unassigned"),
                total_slots=total,
                booked_slots=total,
                completed=completed,
                cancelled=cancelled,
                no_shows=no_shows,
                utilization_rate=100.0 if total else 0.0,
                completion_rate=round((completed / total) * 100, 1) if total else 0.0,
            )
        )
    return metrics


def _wait_metric(label: str, times: np.ndarray) -> WaitingTimeMetric:
    return WaitingTimeMetric(
        label=label,
        avg_minutes=round(float(np.mean(times)), 1),
        median_minutes=round(float(np.median(times)), 1),
        min_minutes=round(float(np.min(times)), 1),
        max_minutes=round(float(np.max(times)), 1),
        p90_minutes=round(float(np.percentile(times, 90)), 1),
        sample_size=len(times),
    )


def _turnaround_metric(label: str, group: pd.DataFrame) -> LabTurnaroundMetric:
    hours = group["actual_hours"].astype(float).to_numpy()
    targets = group["target_hours"].astype(float).to_numpy()
    within = int(np.sum(hours <= targets))
    total = len(hours)
    avg_target = float(np.mean(targets)) if total else None
    return LabTurnaroundMetric(
        label=label,
        avg_hours=round(float(np.mean(hours)), 1),
        median_hours=round(float(np.median(hours)), 1),
        min_hours=round(float(np.min(hours)), 1),
        max_hours=round(float(np.max(hours)), 1),
        within_target=within,
        total=total,
        target_hours=round(avg_target, 1) if avg_target is not None else None,
        compliance_rate=round((within / total) * 100, 1) if total else 0.0,
    )


class AnalyticsService:
    """
    Analytics service for clinical data processing.

    Queries read-only PostgreSQL analytical views when available, and falls
    back to synthetic operational data when no database connection is active.
    """

    def __init__(self, repository: AnalyticsRepository | None = None):
        self.repo = repository or AnalyticsRepository()

    async def get_appointment_utilization(
        self,
        date_from: date | None = None,
        date_to: date | None = None,
        department_id: str | None = None,
        doctor_id: str | None = None,
    ) -> AppointmentUtilizationResponse:
        """Calculate appointment utilization metrics."""
        db_rows = self.repo.fetch_appointment_utilization(
            date_from=date_from,
            date_to=date_to,
            department_id=department_id,
            doctor_id=doctor_id,
        )
        if db_rows:
            df = pd.DataFrame(db_rows)
            df["day_of_week"] = pd.to_datetime(df["appointment_date"]).dt.day_name()
            total_appts = int(df["appointment_count"].sum())
            total_completed = int(df.loc[df["status"] == "COMPLETED", "appointment_count"].sum())
            return AppointmentUtilizationResponse(
                period={"from": str(date_from) if date_from else None, "to": str(date_to) if date_to else None},
                overall_utilization=100.0 if total_appts else 0.0,
                overall_completion_rate=round((total_completed / total_appts) * 100, 1) if total_appts else 0.0,
                total_appointments=total_appts,
                by_department=_utilization_group(df, "department_name"),
                by_day_of_week=_utilization_group(df, "day_of_week"),
                by_type=_utilization_group(df, "type"),
                data_source="database",
            )

        # Synthetic operational fallback
        departments = ["Cardiology", "Orthopedics", "General Medicine", "Pediatrics", "Dermatology"]
        days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        types = ["CONSULTATION", "FOLLOW_UP", "PROCEDURE", "EMERGENCY"]

        by_department = []
        total_booked = 0
        total_slots = 0
        total_completed = 0

        for dept in departments:
            slots = np.random.randint(80, 150)
            booked = np.random.randint(int(slots * 0.5), slots)
            completed = np.random.randint(int(booked * 0.7), booked)
            cancelled = np.random.randint(0, booked - completed)
            no_shows = booked - completed - cancelled

            total_slots += slots
            total_booked += booked
            total_completed += completed

            by_department.append(UtilizationMetric(
                label=dept,
                total_slots=slots,
                booked_slots=booked,
                completed=completed,
                cancelled=cancelled,
                no_shows=no_shows,
                utilization_rate=round((booked / slots) * 100, 1) if slots else 0,
                completion_rate=round((completed / booked) * 100, 1) if booked else 0,
            ))

        by_day = []
        for day in days:
            slots = np.random.randint(40, 80)
            booked = np.random.randint(int(slots * 0.5), slots)
            completed = np.random.randint(int(booked * 0.7), booked)
            cancelled = np.random.randint(0, max(1, booked - completed))
            no_shows = max(0, booked - completed - cancelled)
            by_day.append(UtilizationMetric(
                label=day,
                total_slots=slots,
                booked_slots=booked,
                completed=completed,
                cancelled=cancelled,
                no_shows=no_shows,
                utilization_rate=round((booked / slots) * 100, 1) if slots else 0,
                completion_rate=round((completed / booked) * 100, 1) if booked else 0,
            ))

        by_type = []
        for t in types:
            slots = np.random.randint(30, 100)
            booked = np.random.randint(int(slots * 0.4), slots)
            completed = np.random.randint(int(booked * 0.6), booked)
            cancelled = np.random.randint(0, max(1, booked - completed))
            no_shows = max(0, booked - completed - cancelled)
            by_type.append(UtilizationMetric(
                label=t,
                total_slots=slots,
                booked_slots=booked,
                completed=completed,
                cancelled=cancelled,
                no_shows=no_shows,
                utilization_rate=round((booked / slots) * 100, 1) if slots else 0,
                completion_rate=round((completed / booked) * 100, 1) if booked else 0,
            ))

        return AppointmentUtilizationResponse(
            period={
                "from": str(date_from) if date_from else None,
                "to": str(date_to) if date_to else None,
            },
            overall_utilization=round((total_booked / total_slots) * 100, 1) if total_slots else 0,
            overall_completion_rate=round((total_completed / total_booked) * 100, 1) if total_booked else 0,
            total_appointments=total_booked,
            by_department=by_department,
            by_day_of_week=by_day,
            by_type=by_type,
        )

    async def get_waiting_times(
        self,
        date_from: date | None = None,
        date_to: date | None = None,
        department_id: str | None = None,
    ) -> WaitingTimeResponse:
        """Calculate patient waiting time metrics."""
        db_rows = self.repo.fetch_waiting_times(
            date_from=date_from,
            date_to=date_to,
            department_id=department_id,
        )
        if db_rows:
            df = pd.DataFrame(db_rows)
            df["wait_minutes"] = df["wait_minutes"].astype(float)
            checked_in_ts = pd.to_datetime(df["checked_in_at"], utc=True)
            df["day_of_week"] = checked_in_ts.dt.day_name()
            df["hour"] = checked_in_ts.dt.hour.astype(str) + ":00"
            all_times = df["wait_minutes"].to_numpy()
            return WaitingTimeResponse(
                period={"from": str(date_from) if date_from else None, "to": str(date_to) if date_to else None},
                overall_avg_minutes=round(float(np.mean(all_times)), 1),
                overall_median_minutes=round(float(np.median(all_times)), 1),
                by_department=[_wait_metric(str(lbl or "Unassigned"), grp["wait_minutes"].to_numpy()) for lbl, grp in df.groupby("department_name", dropna=False)],
                by_day_of_week=[_wait_metric(str(lbl), grp["wait_minutes"].to_numpy()) for lbl, grp in df.groupby("day_of_week")],
                by_hour=[_wait_metric(str(lbl), grp["wait_minutes"].to_numpy()) for lbl, grp in df.groupby("hour")],
                data_source="database",
            )

        departments = ["Cardiology", "Orthopedics", "General Medicine", "Pediatrics", "Dermatology"]
        days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
        hours = [f"{h}:00" for h in range(8, 18)]

        all_wait_times = np.random.exponential(15, 500) + 5  # skewed right

        by_department = [_wait_metric(dept, np.random.exponential(12, 100) + 5) for dept in departments]
        by_day = [_wait_metric(day, np.random.exponential(14, 80) + 5) for day in days]
        by_hour = [_wait_metric(hour, np.random.exponential(10 + np.random.randint(0, 10), 30) + 5) for hour in hours]

        return WaitingTimeResponse(
            period={"from": str(date_from) if date_from else None, "to": str(date_to) if date_to else None},
            overall_avg_minutes=round(float(np.mean(all_wait_times)), 1),
            overall_median_minutes=round(float(np.median(all_wait_times)), 1),
            by_department=by_department,
            by_day_of_week=by_day,
            by_hour=by_hour,
        )

    async def get_lab_turnaround(
        self,
        date_from: date | None = None,
        date_to: date | None = None,
        category: str | None = None,
        priority: str | None = None,
    ) -> LabTurnaroundResponse:
        """Calculate laboratory turnaround metrics."""
        db_rows = self.repo.fetch_lab_turnaround(category=category, priority=priority)
        if db_rows:
            df = pd.DataFrame(db_rows)
            hours = df["actual_hours"].astype(float).to_numpy()
            targets = df["target_hours"].astype(float).to_numpy()
            within = int(np.sum(hours <= targets))
            total = len(df)
            abnormal_count = int(df["is_abnormal"].astype(bool).sum())
            return LabTurnaroundResponse(
                period={"from": str(date_from) if date_from else None, "to": str(date_to) if date_to else None},
                overall_avg_hours=round(float(np.mean(hours)), 1),
                overall_compliance_rate=round((within / total) * 100, 1) if total else 0.0,
                by_category=[_turnaround_metric(str(lbl or "General"), grp) for lbl, grp in df.groupby("category", dropna=False)],
                by_priority=[_turnaround_metric(str(lbl or "ROUTINE"), grp) for lbl, grp in df.groupby("priority", dropna=False)],
                abnormal_rate=round((abnormal_count / total) * 100, 1) if total else 0.0,
                data_source="database",
            )

        categories = [
            ("Hematology", 4), ("Biochemistry", 6), ("Microbiology", 48),
            ("Immunology", 12), ("Urinalysis", 2),
        ]
        priorities = [("ROUTINE", 24), ("URGENT", 4), ("STAT", 1)]

        by_category = []
        all_hours = []
        total_within = 0
        total_tests = 0
        total_abnormal = 0

        for cat, target in categories:
            hours = np.random.exponential(target * 0.6, 50) + 0.5
            within = int(np.sum(hours <= target))
            total = len(hours)
            total_within += within
            total_tests += total
            total_abnormal += np.random.randint(5, 15)
            all_hours.extend(hours.tolist())

            by_category.append(LabTurnaroundMetric(
                label=cat,
                avg_hours=round(float(np.mean(hours)), 1),
                median_hours=round(float(np.median(hours)), 1),
                min_hours=round(float(np.min(hours)), 1),
                max_hours=round(float(np.max(hours)), 1),
                within_target=within,
                total=total,
                target_hours=float(target),
                compliance_rate=round((within / total) * 100, 1) if total else 0,
            ))

        by_priority = []
        for pri, target in priorities:
            hours = np.random.exponential(target * 0.5, 30) + 0.3
            within = int(np.sum(hours <= target))
            total = len(hours)
            by_priority.append(LabTurnaroundMetric(
                label=pri,
                avg_hours=round(float(np.mean(hours)), 1),
                median_hours=round(float(np.median(hours)), 1),
                min_hours=round(float(np.min(hours)), 1),
                max_hours=round(float(np.max(hours)), 1),
                within_target=within,
                total=total,
                target_hours=float(target),
                compliance_rate=round((within / total) * 100, 1) if total else 0,
            ))

        all_hours_arr = np.array(all_hours)
        return LabTurnaroundResponse(
            period={"from": str(date_from) if date_from else None, "to": str(date_to) if date_to else None},
            overall_avg_hours=round(float(np.mean(all_hours_arr)), 1),
            overall_compliance_rate=round((total_within / total_tests) * 100, 1) if total_tests else 0,
            by_category=by_category,
            by_priority=by_priority,
            abnormal_rate=round((total_abnormal / total_tests) * 100, 1) if total_tests else 0,
        )

    async def get_patient_population(self) -> PatientPopulationResponse:
        """Generate synthetic patient population analytics."""
        total = np.random.randint(800, 1500)
        active = int(total * np.random.uniform(0.85, 0.95))
        new_30d = np.random.randint(20, 80)

        genders = [
            DemographicBreakdown(label="Male", count=int(total * 0.48), percentage=48.0),
            DemographicBreakdown(label="Female", count=int(total * 0.50), percentage=50.0),
            DemographicBreakdown(label="Other", count=int(total * 0.02), percentage=2.0),
        ]

        age_groups = [
            ("0-17", 0.15), ("18-30", 0.20), ("31-45", 0.22),
            ("46-60", 0.23), ("61-75", 0.13), ("76+", 0.07),
        ]
        by_age = [
            DemographicBreakdown(label=g, count=int(total * p), percentage=round(p * 100, 1))
            for g, p in age_groups
        ]

        blood_types = [
            ("O+", 0.38), ("A+", 0.27), ("B+", 0.22), ("AB+", 0.05),
            ("O-", 0.04), ("A-", 0.02), ("B-", 0.01), ("AB-", 0.01),
        ]
        by_blood = [
            DemographicBreakdown(label=b, count=int(total * p), percentage=round(p * 100, 1))
            for b, p in blood_types
        ]

        return PatientPopulationResponse(
            total_patients=total,
            active_patients=active,
            new_registrations_30d=new_30d,
            by_gender=genders,
            by_age_group=by_age,
            by_blood_type=by_blood,
            avg_age=round(float(np.random.uniform(35, 50)), 1),
        )
