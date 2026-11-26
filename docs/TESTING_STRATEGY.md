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
| 1 | Valid patient registration | Integration | `apps/api/tests/patients.test.ts` |
| 2 | Duplicate patient registration | Integration | `apps/api/tests/patients.test.ts` |
| 3 | Successful login | Integration | `apps/api/tests/auth.test.ts` |
| 4 | Invalid login | Integration | `apps/api/tests/auth.test.ts` |
| 5 | Unauthorized API access | Integration | `apps/api/tests/auth.test.ts` |
| 6 | Cross-patient record access (IDOR) | Security | `apps/api/tests/security.test.ts` |
| 7 | Invalid appointment request | Integration | `apps/api/tests/appointments.test.ts` |
| 8 | Concurrent doctor appointment booking | Concurrency | `apps/api/tests/appointments.test.ts` |
| 9 | Appointment cancellation | Integration | `apps/api/tests/appointments.test.ts` |
| 10 | Invalid workflow transitions | Integration | `apps/api/tests/appointments.test.ts` |
| 11 | Prescription validation | Integration | `apps/api/tests/prescriptions.test.ts` |
| 12 | Laboratory result association | Integration | `apps/api/tests/labs.test.ts` |
| 13 | Consent revocation | Integration | `apps/api/tests/consent.test.ts` |
| 14 | Audit log generation | Integration | `apps/api/tests/audit.test.ts` |
| 15 | Duplicate notification processing | Integration | `apps/api/tests/notifications.test.ts` |
| 16 | FHIR integration timeout | Integration | `apps/api/tests/fhir.test.ts` |
| 17 | Invalid FHIR resource | Integration | `apps/api/tests/fhir.test.ts` |
| 18 | Database outage handling | Failure | `apps/api/tests/resilience.test.ts` |
| 19 | Invalid billing request | Integration | `apps/api/tests/billing.test.ts` |
| 20 | Role-based dashboard access | E2E | `apps/web/tests/e2e/dashboards.spec.ts` |

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
cd apps/api && npm test

# Frontend only
cd apps/web && npm test

# Python only
cd apps/analytics && python -m pytest -v

# With coverage
cd apps/api && npm run test:coverage
cd apps/analytics && python -m pytest --cov=app --cov-report=html
```
