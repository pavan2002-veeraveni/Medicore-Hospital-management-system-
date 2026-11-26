# MediCore Testing Strategy

## Testing Pyramid

```
       ┌─────────────┐
       │   E2E Tests  │  Playwright
       │  (Minimal)   │
       ├─────────────┤
       │ Integration  │  Supertest, HTTPX
       │   Tests      │
       ├─────────────┤
       │  Unit Tests  │  Vitest, Pytest
       │  (Most)      │
       └─────────────┘
```

## Tools

| Layer | Tool | Purpose |
|-------|------|---------|
| Frontend Unit | Vitest + React Testing Library | Component testing |
| Frontend E2E | Playwright | Browser automation |
| Backend Unit | Vitest | Service/utility testing |
| Backend Integration | Vitest + Supertest | API endpoint testing |
| Python Unit | Pytest | Service testing |
| Python Integration | Pytest + HTTPX | API endpoint testing |
| Database | Prisma Migrate + test DB | Migration & constraint testing |

## 20 Mandatory Test Scenarios

| # | Scenario | Type | Location |
|---|----------|------|----------|
| 1 | Valid patient registration | Integration | `backend/api/tests/patients.test.ts` |
| 2 | Duplicate patient registration | Integration | `backend/api/tests/patients.test.ts` |
| 3 | Successful login | Integration | `backend/api/tests/auth.test.ts` |
| 4 | Invalid login | Integration | `backend/api/tests/auth.test.ts` |
| 5 | Unauthorized API access | Integration | `backend/api/tests/auth.test.ts` |
| 6 | Cross-patient record access (IDOR) | Security | `backend/api/tests/security.test.ts` |
| 7 | Invalid appointment request | Integration | `backend/api/tests/appointments.test.ts` |
| 8 | Concurrent doctor appointment booking | Concurrency | `backend/api/tests/appointments.test.ts` |
| 9 | Appointment cancellation | Integration | `backend/api/tests/appointments.test.ts` |
| 10 | Invalid workflow transitions | Integration | `backend/api/tests/appointments.test.ts` |
| 11 | Prescription validation | Integration | `backend/api/tests/prescriptions.test.ts` |
| 12 | Laboratory result association | Integration | `backend/api/tests/labs.test.ts` |
| 13 | Consent revocation | Integration | `backend/api/tests/consent.test.ts` |
| 14 | Audit log generation | Integration | `backend/api/tests/audit.test.ts` |
| 15 | Duplicate notification processing | Integration | `backend/api/tests/notifications.test.ts` |
| 16 | FHIR integration timeout | Integration | `backend/api/tests/fhir.test.ts` |
| 17 | Invalid FHIR resource | Integration | `backend/api/tests/fhir.test.ts` |
| 18 | Database outage handling | Failure | `backend/api/tests/resilience.test.ts` |
| 19 | Invalid billing request | Integration | `backend/api/tests/billing.test.ts` |
| 20 | Role-based dashboard access | E2E | `frontend/tests/e2e/dashboards.spec.ts` |

## Coverage Targets

| Layer | Target |
|-------|--------|
| Backend services | 70%+ |
| Backend routes | 80%+ |
| Frontend components | 60%+ |
| Python analytics | 80%+ |

## Test Data Strategy
- Synthetic fixtures using seed data
- Test-specific database that resets between suites
- Factory functions for generating test entities
- No real patient data ever used

## Running Tests

```bash
# All tests
npm test

# Backend only
cd backend/api && npm test

# Frontend only
cd frontend && npm test

# Python only
cd backend/analytics && python -m pytest -v

# With coverage
cd backend/api && npm run test:coverage
cd backend/analytics && python -m pytest --cov=app --cov-report=html
```
