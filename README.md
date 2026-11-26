# MediCore 🏥

## Hospital, Appointment & Patient Care Management Platform

> **IMPORTANT**: This is an educational healthcare engineering project using synthetic patient data only. It does not claim legal, medical, or regulatory compliance certification.

---

## Overview

MediCore is a comprehensive hospital management platform that enables patients and hospital staff to manage registrations, appointments, clinical encounters, diagnoses, prescriptions, laboratory orders, results, billing, consent, notifications, audit trails, and healthcare interoperability.

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Nginx Reverse Proxy                       │
├──────────────┬──────────────────┬────────────────────────────┤
│  Next.js     │  Express.js      │  FastAPI                    │
│  Frontend    │  Backend API     │  Analytics Service          │
│  :3000       │  :4000           │  :8000                      │
├──────────────┴──────────────────┼────────────────────────────┤
│           PostgreSQL :5432      │  Redis :6379 + BullMQ       │
└─────────────────────────────────┴────────────────────────────┘
```

### Key Features

- **7 Role-Based Dashboards**: Patient, Doctor, Nurse, Receptionist, Lab Technician, Billing Officer, Administrator
- **13 Business Modules**: Auth, Patients, Staff, Departments, Appointments, Encounters, Diagnoses, Prescriptions, Labs, Billing, Consent, Audit, Notifications
- **Appointment Workflow Engine**: State machine with conflict prevention
- **FHIR R4 Interoperability**: Synthetic Patient, Appointment, Encounter, Observation resources
- **Security**: JWT + refresh token rotation, RBAC, resource-level auth, consent checks, audit logging
- **Analytics**: Python FastAPI service for utilization, waiting times, lab turnaround, population reports

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, React Hook Form, Zod, Recharts |
| Backend | Node.js 20, Express.js, TypeScript, Prisma ORM, Zod, JWT, Argon2id |
| Analytics | Python 3.12, FastAPI, Pydantic, Pandas, NumPy |
| Database | PostgreSQL 16 |
| Cache/Queue | Redis 7, BullMQ |
| Infrastructure | Docker, Docker Compose, Nginx, GitHub Actions |
| Testing | Vitest, Supertest, Pytest, HTTPX, Playwright |

---

## Quick Start

### Prerequisites

- Node.js >= 20
- Python >= 3.10
- Docker & Docker Compose
- PostgreSQL 16 (or use Docker)

### Option 1: Docker Compose (Recommended)

```bash
# Clone the repository
git clone <repo-url>
cd medicore

# Copy environment file
cp .env.example .env

# Start all services
docker compose up --build

# Access the application
# Frontend: http://localhost:3000
# API:      http://localhost:4000
# API Docs: http://localhost:4000/api-docs
# Analytics: http://localhost:8000/docs
```

### Option 2: Local Development

```bash
# 1. Install dependencies
npm install

# 2. Start PostgreSQL and Redis (Docker)
docker compose up postgres redis -d

# 3. Copy and configure environment
cp .env.example .env
# Edit .env with your database credentials

# 4. Run database migrations and seed
cd backend/api
npx prisma generate
npx prisma migrate dev
npm run db:seed
cd ../..

# 5. Start development servers
npm run dev
# Or individually:
# npm run dev:api  (Express on :4000)
# npm run dev:web  (Next.js on :3000)

# 6. Start analytics service
cd backend/analytics
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Demo Accounts

All accounts use password: `Password123!`

| Role | Email |
|------|-------|
| Admin | admin@medicore.local |
| Doctor | doctor.smith@medicore.local |
| Doctor | doctor.jones@medicore.local |
| Nurse | nurse.williams@medicore.local |
| Receptionist | reception@medicore.local |
| Lab Technician | lab@medicore.local |
| Billing | billing@medicore.local |
| Patient | patient1@medicore.local |

---

## API Documentation

- **Swagger UI**: http://localhost:4000/api-docs
- **OpenAPI JSON**: http://localhost:4000/api-docs.json
- **Analytics Docs**: http://localhost:8000/docs

Base URL: `http://localhost:4000/api/v1`

### Key Endpoints

| Module | Endpoint | Methods |
|--------|----------|---------|
| Auth | `/api/v1/auth` | POST login, register, refresh-token, logout |
| Patients | `/api/v1/patients` | GET, POST, PUT |
| Appointments | `/api/v1/appointments` | GET, POST, PATCH (confirm, check-in, complete, cancel) |
| Encounters | `/api/v1/encounters` | GET, POST, PATCH, POST vitals |
| Prescriptions | `/api/v1/prescriptions` | GET, POST, PATCH status |
| Lab Orders | `/api/v1/lab-orders` | GET, POST, PATCH status, POST results |
| Billing | `/api/v1/billing` | GET, POST, PATCH issue/cancel |
| Payments | `/api/v1/payments` | GET, POST |
| Consents | `/api/v1/consents` | GET, POST, PATCH revoke |
| Audit Logs | `/api/v1/audit-logs` | GET (admin only) |
| FHIR | `/api/v1/fhir` | GET export, POST import |

---

## Testing

```bash
# Backend tests
cd backend/api && npm test

# Frontend tests
cd frontend && npm test

# Python analytics tests
cd backend/analytics && python -m pytest tests/ -v

# All tests
npm test
```

---

## Docker

```bash
# Build and start
docker compose up --build -d

# View logs
docker compose logs -f

# Stop
docker compose down

# Stop and remove volumes
docker compose down -v

# Database backup
docker exec medicore-postgres pg_dump -U medicore_user medicore_db > backup.sql

# Database restore
docker exec -i medicore-postgres psql -U medicore_user medicore_db < backup.sql
```

---

## Project Structure

```
medicore/
├── backend/
│   ├── api/           # Express.js backend
│   └── analytics/     # FastAPI analytics service
├── frontend/          # Next.js frontend
├── database/          # Single Prisma schema, migrations, seeds & docs
├── packages/          # Shared types and configs
├── infrastructure/    # Docker, Nginx, scripts
├── docs/              # Architecture documentation
├── postman/           # API collection
└── .github/           # CI/CD workflows
```

---

## 15 Assessment Mapping

| # | Assessment | Status |
|---|-----------|--------|
| 01 | Healthcare role-based frontend | TESTED |
| 02 | Hospital backend APIs | TESTED |
| 03 | Clinical relational database | TESTED |
| 04 | Clinical data security | TESTED |
| 05 | Python clinical data processing | VERIFIED |
| 06 | FastAPI clinical analytics | VERIFIED |
| 07 | Appointment workflow engine | TESTED |
| 08 | Healthcare interoperability (FHIR) | TESTED |
| 09 | Docker healthcare environment | TESTED |
| 10 | Git and clinical change review | VERIFIED |
| 11 | Healthcare CI/CD | VERIFIED |
| 12 | Privacy and workflow testing | TESTED |
| 13 | Healthcare API documentation | VERIFIED |
| 14 | Secure hospital deployment | IMPLEMENTED |
| 15 | Healthcare incident simulation | TESTED |

See [docs/ASSESSMENT_MAPPING.md](docs/ASSESSMENT_MAPPING.md) for detailed evidence.

---

## Documentation

- [**End-to-End Project & System Architecture**](docs/END_TO_END_ARCHITECTURE.md)
- [Codebase Analysis](docs/CODEBASE_ANALYSIS.md)
- [System Design](docs/SYSTEM_DESIGN.md)
- [Database Design](docs/DATABASE_DESIGN.md)
- [API Design](docs/API_DESIGN.md)
- [Security Design](docs/SECURITY_DESIGN.md)
- [Implementation Roadmap](docs/IMPLEMENTATION_ROADMAP.md)
- [Assessment Mapping](docs/ASSESSMENT_MAPPING.md)

---

## Known Limitations

- FHIR integration uses a local mock (not connected to a production FHIR server)
- Email/SMS notifications use sandbox mode (logs instead of sending)
- Payment processing is sandbox-only (no real payment gateway)
- All patient data is synthetic - not real medical records
- This is an educational project, not a certified medical system

---

## License

MIT - Educational purposes only
