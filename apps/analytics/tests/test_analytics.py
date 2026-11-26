# =============================================================================
# MediCore Analytics - Pytest Tests
# =============================================================================

import pytest
from httpx import AsyncClient, ASGITransport
from app.config import settings
from app.main import app
from datetime import datetime, timedelta, timezone
import json
import time
from pathlib import Path


@pytest.fixture
def test_headers():
    """Headers with valid API key for testing."""
    return {"X-API-Key": settings.API_KEY}


@pytest.fixture
def invalid_headers():
    """Headers with invalid API key."""
    return {"X-API-Key": "invalid-key"}


@pytest.mark.asyncio
async def test_health_check():
    """Test health endpoint."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "medicore-analytics"


@pytest.mark.asyncio
async def test_readiness_check():
    """Test readiness endpoint."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/ready")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_appointment_utilization_unauthorized():
    """Test that analytics endpoint requires API key."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/analytics/appointment-utilization")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_appointment_utilization_invalid_key(invalid_headers):
    """Test that analytics endpoint rejects invalid API key."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/v1/analytics/appointment-utilization",
            headers=invalid_headers,
        )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_appointment_utilization(test_headers):
    """Test appointment utilization analytics."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/v1/analytics/appointment-utilization",
            headers=test_headers,
        )
    assert response.status_code == 200
    data = response.json()
    assert "overall_utilization" in data
    assert "total_appointments" in data
    assert "by_department" in data
    assert len(data["by_department"]) > 0
    assert 0 <= data["overall_utilization"] <= 100


@pytest.mark.asyncio
async def test_waiting_times(test_headers):
    """Test waiting time analytics."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/v1/analytics/waiting-times",
            headers=test_headers,
        )
    assert response.status_code == 200
    data = response.json()
    assert "overall_avg_minutes" in data
    assert "by_department" in data
    assert data["overall_avg_minutes"] > 0


@pytest.mark.asyncio
async def test_lab_turnaround(test_headers):
    """Test lab turnaround analytics."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/v1/analytics/lab-turnaround",
            headers=test_headers,
        )
    assert response.status_code == 200
    data = response.json()
    assert "overall_avg_hours" in data
    assert "by_category" in data


@pytest.mark.asyncio
async def test_patient_population(test_headers):
    """Test patient population analytics."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/v1/analytics/patient-population",
            headers=test_headers,
        )
    assert response.status_code == 200
    data = response.json()
    assert data["total_patients"] > 0
    assert "by_gender" in data
    assert "by_age_group" in data


@pytest.mark.asyncio
async def test_process_lab_data_valid(test_headers):
    """Test lab data processing with valid data."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/analytics/process-lab-data",
            headers=test_headers,
            json={
                "records": [
                    {
                        "test_code": "CBC",
                        "test_name": "Complete Blood Count",
                        "value": "14.5",
                        "numeric_value": 14.5,
                        "unit": "g/dL",
                        "reference_min": 12.0,
                        "reference_max": 17.5,
                        "sample_type": "BLOOD",
                    },
                    {
                        "test_code": "GLU",
                        "test_name": "Blood Glucose",
                        "value": "95",
                        "numeric_value": 95.0,
                        "unit": "mg/dL",
                        "reference_min": 70.0,
                        "reference_max": 100.0,
                        "sample_type": "BLOOD",
                    },
                ],
                "validate_units": True,
                "validate_references": True,
                "flag_missing": True,
            },
        )
    assert response.status_code == 200
    data = response.json()
    assert data["total_records"] == 2
    assert data["valid_records"] == 2


@pytest.mark.asyncio
async def test_process_lab_data_invalid(test_headers):
    """Test lab data processing with invalid data (missing values, bad ranges)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/analytics/process-lab-data",
            headers=test_headers,
            json={
                "records": [
                    {
                        "test_code": "",
                        "unit": "invalid_unit",
                    },
                    {
                        "test_code": "HGB",
                        "numeric_value": 20.0,
                        "reference_min": 15.0,
                        "reference_max": 10.0,  # Invalid: min > max
                    },
                ],
                "validate_units": True,
                "validate_references": True,
                "flag_missing": True,
            },
        )
    assert response.status_code == 200
    data = response.json()
    assert data["invalid_records"] > 0
    assert len(data["issues"]) > 0


@pytest.mark.asyncio
async def test_process_appointment_data_valid(test_headers):
    """Test appointment data processing with valid data."""
    now = datetime.now(timezone.utc)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/analytics/process-appointment-data",
            headers=test_headers,
            json={
                "records": [
                    {
                        "appointment_id": "apt-001",
                        "patient_id": "pat-001",
                        "doctor_id": "doc-001",
                        "scheduled_start": now.isoformat(),
                        "scheduled_end": (now + timedelta(minutes=30)).isoformat(),
                        "status": "CONFIRMED",
                        "type": "CONSULTATION",
                    },
                ],
                "check_conflicts": True,
                "validate_transitions": True,
            },
        )
    assert response.status_code == 200
    data = response.json()
    assert data["total_records"] == 1
    assert data["valid_records"] == 1


@pytest.mark.asyncio
async def test_process_appointment_data_conflict(test_headers):
    """Test appointment data processing detects scheduling conflicts."""
    now = datetime.now(timezone.utc)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/analytics/process-appointment-data",
            headers=test_headers,
            json={
                "records": [
                    {
                        "appointment_id": "apt-001",
                        "patient_id": "pat-001",
                        "doctor_id": "doc-001",
                        "scheduled_start": now.isoformat(),
                        "scheduled_end": (now + timedelta(minutes=30)).isoformat(),
                        "status": "CONFIRMED",
                    },
                    {
                        "appointment_id": "apt-002",
                        "patient_id": "pat-002",
                        "doctor_id": "doc-001",
                        "scheduled_start": (now + timedelta(minutes=15)).isoformat(),
                        "scheduled_end": (now + timedelta(minutes=45)).isoformat(),
                        "status": "CONFIRMED",
                    },
                ],
                "check_conflicts": True,
            },
        )
    assert response.status_code == 200
    data = response.json()
    # Should detect the overlap
    conflict_issues = [i for i in data["issues"] if "conflict" in i["message"].lower()]
    assert len(conflict_issues) > 0


@pytest.mark.asyncio
async def test_process_sample_datasets_and_benchmark(test_headers):
    """Test processing sample synthetic datasets and benchmark 1,000-record throughput."""
    datasets_dir = Path(__file__).resolve().parent.parent / "datasets"
    lab_payload = json.loads((datasets_dir / "sample_lab_data.json").read_text(encoding="utf-8"))
    appt_payload = json.loads((datasets_dir / "sample_appointments.json").read_text(encoding="utf-8"))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res_lab = await client.post("/api/v1/analytics/process-lab-data", headers=test_headers, json=lab_payload)
        assert res_lab.status_code == 200
        assert res_lab.json()["total_records"] == 2

        res_appt = await client.post("/api/v1/analytics/process-appointment-data", headers=test_headers, json=appt_payload)
        assert res_appt.status_code == 200
        assert res_appt.json()["valid_records"] == 2

        # Benchmark: 1,000 lab records processed under 2 seconds
        bulk_records = [
            {
                "test_code": "CBC",
                "numeric_value": 5000 + (i % 7000),
                "unit": "cells/μL",
                "reference_min": 4500,
                "reference_max": 11000,
                "sample_type": "BLOOD",
            }
            for i in range(1000)
        ]
        t0 = time.perf_counter()
        res_bulk = await client.post(
            "/api/v1/analytics/process-lab-data",
            headers=test_headers,
            json={"records": bulk_records, "validate_units": True, "validate_references": True},
        )
        elapsed = time.perf_counter() - t0
        assert res_bulk.status_code == 200
        assert res_bulk.json()["total_records"] == 1000
        assert elapsed < 2.0


@pytest.mark.asyncio
async def test_data_quality_report(test_headers):
    """Test data quality report generation."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/analytics/data-quality?dataset_type=all",
            headers=test_headers,
        )
    assert response.status_code == 200
    data = response.json()
    assert "overall_score" in data
    assert 0 <= data["overall_score"] <= 100
    assert len(data["dimensions"]) > 0
    assert len(data["recommendations"]) > 0


@pytest.mark.asyncio
async def test_process_lab_data_empty(test_headers):
    """Test lab data processing rejects empty records."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/analytics/process-lab-data",
            headers=test_headers,
            json={"records": []},
        )
    assert response.status_code == 422  # Validation error - min_length=1
