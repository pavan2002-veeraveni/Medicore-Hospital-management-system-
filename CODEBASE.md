# MediCore Codebase Summary

## Project: MediCore Hospital Management Platform
## Type: Monorepo (Node.js + Python)

## Services

### 1. Frontend (`frontend/`)
- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **State**: TanStack Query, Zustand
- **Forms**: React Hook Form + Zod
- **Charts**: Recharts

### 2. Backend API (`backend/api/`)
- **Framework**: Express.js
- **Language**: TypeScript
- **ORM**: Prisma (PostgreSQL, schema & migrations in `database/`)
- **Auth**: JWT (access + refresh tokens), Argon2id
- **Validation**: Zod
- **Docs**: Swagger/OpenAPI
- **Queue**: BullMQ (Redis)

### 3. Analytics Service (`backend/analytics/`)
- **Framework**: FastAPI
- **Language**: Python 3.12
- **Validation**: Pydantic
- **Processing**: Pandas, NumPy
- **Testing**: Pytest + HTTPX

### 4. Infrastructure
- **Database**: PostgreSQL 16
- **Cache**: Redis 7
- **Container**: Docker + Docker Compose
- **CI/CD**: GitHub Actions
- **Proxy**: Nginx

## Modules (13)
1. Auth (JWT, RBAC, refresh tokens)
2. Users (management)
3. Patients (registration, records)
4. Staff (profiles, schedules)
5. Departments (CRUD)
6. Appointments (state machine, conflict prevention)
7. Encounters (clinical notes, vitals)
8. Diagnoses (ICD-10 style codes)
9. Prescriptions (medications, dosage)
10. Laboratories (orders, results, validation)
11. Billing (invoices, payments)
12. Consent (grant, revoke, history)
13. Notifications (email/SMS sandbox, BullMQ)

## Database Tables (32)
users, roles, permissions, user_roles, role_permissions, patients,
patient_contacts, staff, departments, doctor_schedules, appointments,
encounters, vital_signs, diagnoses, medication_catalog, prescriptions,
prescription_items, laboratory_tests, lab_orders, lab_order_items,
lab_results, invoices, invoice_items, payments, consents,
consent_history, audit_logs, notifications, notification_jobs,
refresh_tokens, fhir_sync_records, idempotency_records

## User Roles (7)
PATIENT, RECEPTIONIST, DOCTOR, NURSE, LAB_TECHNICIAN, BILLING_OFFICER, HOSPITAL_ADMIN
