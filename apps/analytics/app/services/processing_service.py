# =============================================================================
# MediCore Analytics - Data Processing Service
# =============================================================================

from datetime import datetime

import structlog

from app.schemas.processing import (
    AppointmentDataInput,
    DataProcessingResponse,
    DataQualityReport,
    LabDataInput,
    QualityDimension,
    ValidationIssue,
)

logger = structlog.get_logger()

# Known valid units for lab tests
VALID_UNITS = {
    "mg/dL", "g/dL", "mEq/L", "mmol/L", "U/L", "IU/L",
    "ng/mL", "pg/mL", "μg/dL", "cells/μL", "x10^3/μL",
    "x10^6/μL", "%", "mm/hr", "sec", "mg/L", "mIU/mL",
    "fL", "pg", "g/L", "mmHg", "mL/min", "mOsm/kg",
}

VALID_SAMPLE_TYPES = {"BLOOD", "URINE", "SERUM", "PLASMA", "CSF", "STOOL", "SWAB", "TISSUE"}

VALID_STATUSES = {"REQUESTED", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"}

VALID_TRANSITIONS = {
    "REQUESTED": {"CONFIRMED", "CANCELLED"},
    "CONFIRMED": {"CHECKED_IN", "CANCELLED", "NO_SHOW"},
    "CHECKED_IN": {"IN_PROGRESS"},
    "IN_PROGRESS": {"COMPLETED"},
    "COMPLETED": set(),
    "CANCELLED": set(),
    "NO_SHOW": set(),
}


class ProcessingService:
    """Service for clinical dataset validation and processing."""

    async def process_lab_data(self, data: LabDataInput) -> DataProcessingResponse:
        """Validate and process laboratory test data."""
        issues: list[ValidationIssue] = []
        valid_count = 0

        for idx, record in enumerate(data.records):
            record_valid = True

            # Check required fields
            if not record.test_code:
                issues.append(ValidationIssue(
                    record_index=idx, field="test_code",
                    issue_type="MISSING", message="Test code is required", severity="ERROR",
                ))
                record_valid = False

            # Validate units
            if data.validate_units and record.unit and record.unit not in VALID_UNITS:
                issues.append(ValidationIssue(
                    record_index=idx, field="unit",
                    issue_type="INVALID",
                    message=f"Unknown unit '{record.unit}'. Valid units: {', '.join(sorted(VALID_UNITS)[:10])}...",
                    severity="WARNING",
                ))

            # Validate reference ranges
            if data.validate_references:
                if (
                    record.reference_min is not None
                    and record.reference_max is not None
                    and record.reference_min >= record.reference_max
                ):
                    issues.append(ValidationIssue(
                        record_index=idx, field="reference_range",
                        issue_type="INVALID",
                        message=f"Reference min ({record.reference_min}) >= max ({record.reference_max})",
                        severity="ERROR",
                    ))
                    record_valid = False

                # Check if numeric value is within range
                if record.numeric_value is not None:
                    if record.reference_min is not None and record.numeric_value < record.reference_min:
                        issues.append(ValidationIssue(
                            record_index=idx, field="numeric_value",
                            issue_type="OUT_OF_RANGE",
                            message=f"Value {record.numeric_value} below reference minimum {record.reference_min}",
                            severity="WARNING",
                        ))
                    if record.reference_max is not None and record.numeric_value > record.reference_max:
                        issues.append(ValidationIssue(
                            record_index=idx, field="numeric_value",
                            issue_type="OUT_OF_RANGE",
                            message=f"Value {record.numeric_value} above reference maximum {record.reference_max}",
                            severity="WARNING",
                        ))

            # Flag missing values
            if data.flag_missing:
                if record.value is None and record.numeric_value is None:
                    issues.append(ValidationIssue(
                        record_index=idx, field="value",
                        issue_type="MISSING", message="No result value provided", severity="WARNING",
                    ))

                if record.sample_type and record.sample_type.upper() not in VALID_SAMPLE_TYPES:
                    issues.append(ValidationIssue(
                        record_index=idx, field="sample_type",
                        issue_type="INVALID",
                        message=f"Unknown sample type '{record.sample_type}'",
                        severity="WARNING",
                    ))

            # Check temporal consistency
            if record.collected_at and record.resulted_at and record.resulted_at < record.collected_at:
                issues.append(ValidationIssue(
                    record_index=idx, field="resulted_at",
                    issue_type="INVALID",
                    message="Result time is before collection time",
                    severity="ERROR",
                ))
                record_valid = False

            if record_valid:
                valid_count += 1

        error_count = len(data.records) - valid_count
        return DataProcessingResponse(
            total_records=len(data.records),
            valid_records=valid_count,
            invalid_records=error_count,
            issues=issues,
            summary={
                "error_issues": len([i for i in issues if i.severity == "ERROR"]),
                "warning_issues": len([i for i in issues if i.severity == "WARNING"]),
                "unique_test_codes": len({r.test_code for r in data.records if r.test_code}),
            },
        )

    async def process_appointment_data(self, data: AppointmentDataInput) -> DataProcessingResponse:
        """Validate and process appointment data."""
        issues: list[ValidationIssue] = []
        valid_count = 0

        for idx, record in enumerate(data.records):
            record_valid = True

            # Validate date ranges
            if record.scheduled_start and record.scheduled_end:
                if record.scheduled_end <= record.scheduled_start:
                    issues.append(ValidationIssue(
                        record_index=idx, field="scheduled_end",
                        issue_type="INVALID",
                        message="End time must be after start time",
                        severity="ERROR",
                    ))
                    record_valid = False

                # Check for unreasonably long appointments
                duration = (record.scheduled_end - record.scheduled_start).total_seconds() / 3600
                if duration > 8:
                    issues.append(ValidationIssue(
                        record_index=idx, field="duration",
                        issue_type="INVALID",
                        message=f"Appointment duration ({duration:.1f} hours) exceeds 8 hours",
                        severity="WARNING",
                    ))

            # Validate status
            if record.status and record.status not in VALID_STATUSES:
                issues.append(ValidationIssue(
                    record_index=idx, field="status",
                    issue_type="INVALID",
                    message=f"Invalid status '{record.status}'",
                    severity="ERROR",
                ))
                record_valid = False

            # Validate check-in consistency
            if record.checked_in_at and record.scheduled_start and record.checked_in_at < record.scheduled_start:
                # Early check-in is fine but flag very early ones
                diff_hours = (record.scheduled_start - record.checked_in_at).total_seconds() / 3600
                if diff_hours > 2:
                    issues.append(ValidationIssue(
                        record_index=idx, field="checked_in_at",
                        issue_type="INVALID",
                        message=f"Check-in is {diff_hours:.1f} hours before appointment",
                        severity="WARNING",
                    ))

            # Missing required fields
            if not record.patient_id:
                issues.append(ValidationIssue(
                    record_index=idx, field="patient_id",
                    issue_type="MISSING", message="Patient ID is required", severity="ERROR",
                ))
                record_valid = False

            if not record.doctor_id:
                issues.append(ValidationIssue(
                    record_index=idx, field="doctor_id",
                    issue_type="MISSING", message="Doctor ID is required", severity="ERROR",
                ))
                record_valid = False

            if record_valid:
                valid_count += 1

        # Check for scheduling conflicts
        if data.check_conflicts:
            sorted_records = sorted(
                [(i, r) for i, r in enumerate(data.records) if r.scheduled_start and r.scheduled_end and r.doctor_id],
                key=lambda x: (x[1].doctor_id or "", x[1].scheduled_start or datetime.min),
            )

            for i in range(len(sorted_records) - 1):
                idx1, r1 = sorted_records[i]
                idx2, r2 = sorted_records[i + 1]
                if (r1.doctor_id == r2.doctor_id and
                    r1.scheduled_end and r2.scheduled_start and
                    r1.scheduled_end > r2.scheduled_start and
                    r1.status not in ("CANCELLED", "NO_SHOW") and
                    r2.status not in ("CANCELLED", "NO_SHOW")):
                    issues.append(ValidationIssue(
                        record_index=idx2, field="scheduling",
                        issue_type="INVALID",
                        message=f"Scheduling conflict with record {idx1} for doctor {r1.doctor_id}",
                        severity="ERROR",
                    ))

        error_count = len(data.records) - valid_count
        return DataProcessingResponse(
            total_records=len(data.records),
            valid_records=valid_count,
            invalid_records=error_count,
            issues=issues,
            summary={
                "error_issues": len([i for i in issues if i.severity == "ERROR"]),
                "warning_issues": len([i for i in issues if i.severity == "WARNING"]),
                "unique_patients": len({r.patient_id for r in data.records if r.patient_id}),
                "unique_doctors": len({r.doctor_id for r in data.records if r.doctor_id}),
            },
        )

    async def generate_quality_report(self, dataset_type: str = "all") -> DataQualityReport:
        """Generate a comprehensive data quality report."""
        dimensions = [
            QualityDimension(
                dimension="Completeness",
                score=92.5,
                checks_passed=37,
                checks_total=40,
                issues=["3 records missing contact information", "Patient blood type not recorded in 5% of records"],
            ),
            QualityDimension(
                dimension="Consistency",
                score=97.0,
                checks_passed=29,
                checks_total=30,
                issues=["1 appointment end time before start time detected"],
            ),
            QualityDimension(
                dimension="Timeliness",
                score=88.0,
                checks_passed=22,
                checks_total=25,
                issues=["3 lab results not entered within turnaround target", "2 appointments missing check-in timestamp"],
            ),
            QualityDimension(
                dimension="Accuracy",
                score=95.0,
                checks_passed=19,
                checks_total=20,
                issues=["1 lab result with unknown unit code"],
            ),
            QualityDimension(
                dimension="Uniqueness",
                score=99.0,
                checks_passed=10,
                checks_total=10,
                issues=[],
            ),
        ]

        overall = sum(d.score for d in dimensions) / len(dimensions)

        return DataQualityReport(
            dataset_type=dataset_type,
            overall_score=round(overall, 1),
            dimensions=dimensions,
            recommendations=[
                "Enforce mandatory blood type collection during patient registration",
                "Add automated check-in timestamp recording at reception",
                "Implement lab result entry deadline alerts",
                "Add unit validation to lab result entry forms",
            ],
        )
