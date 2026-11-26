# MediCore Hospital Management Platform — System Design Document

**Version:** 1.0.0  
**Status:** Architecture Baseline  
**Scope:** End-to-End Platform Architecture, Service Boundaries, Domain Modules, Security, Data Flows, and Scalability

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Service Boundaries](#3-service-boundaries)
4. [Module Architecture](#4-module-architecture)
5. [Communication Patterns](#5-communication-patterns)
6. [Security Architecture](#6-security-architecture)
7. [Data Flow Diagrams](#7-data-flow-diagrams)
8. [Scalability Considerations](#8-scalability-considerations)

---

## 1. System Overview

**MediCore** is an enterprise-grade, modular Hospital, Appointment, and Patient Care Management Platform designed to digitize clinical, administrative, diagnostic, financial, and regulatory interoperability workflows across healthcare facilities.

### Core Capabilities

| Capability Area | Description |
| :--- | :--- |
| **Patient Registration & Demographics** | Master Patient Index (MPI), Medical Record Number (MRN) generation, demographics, emergency contacts, and insurance profiles. |
| **Appointment Scheduling** | Slot management, clinician availability, booking lifecycle (`REQUESTED` to `COMPLETED`, `CANCELLED`, `NO_SHOW`), and automated reminders. |
| **Clinical Encounters & Diagnoses** | Outpatient/inpatient visit documentation, vitals, SOAP notes, ICD-10 diagnosis coding, and clinical status tracking. |
| **Prescriptions & Pharmacy** | Medication orders, dosage/frequency schedules, allergy/interaction flags, dispensing status, and e-prescription tracking. |
| **Laboratory Management** | Lab test orders, specimen tracking, diagnostic workflows, reference ranges, and verified result publication. |
| **Billing & Revenue Cycle** | Encounter-linked itemized invoicing, insurance claims/adjustments, payment recording, and receipt generation. |
| **Patient Consent Management** | Granular opt-in/opt-out consent policies (treatment, data sharing, analytics, external FHIR exchange) with versioning and revocation. |
| **Immutable Audit Logging** | Tamper-evident audit trail capturing authentication events, PHI access, clinical mutations, and administrative actions. |
| **FHIR R4 Interoperability** | Standards-based bidirectional synchronization and resource mapping (`Patient`, `Encounter`, `Observation`, `MedicationRequest`, `DiagnosticReport`) with external EHR/HIE systems. |
| **Multi-Channel Notifications** | Asynchronous, retry-resilient delivery of appointment reminders, lab-ready alerts, billing notices, and security alerts via Email (SMTP) and SMS. |
| **Operational & Clinical Analytics** | Read-only reporting for bed/appointment utilization, turnaround times, revenue metrics, and anonymized clinical trends. |

### Architectural Goals

- **Single Source of Truth:** All transactional healthcare data is owned and mutated exclusively by the core API service.
- **Strict Compliance & Security:** Defense-in-depth combining Argon2id password hashing, short-lived JWTs with rotating refresh tokens, RBAC, resource-level authorization, explicit consent gates, and comprehensive audit logs.
- **Asynchronous Resilience:** Non-blocking execution of notifications, FHIR synchronization, and heavy side effects via Redis-backed BullMQ queues.
- **Clean Separation of Concerns:** Presentation (`apps/web`), transactional business logic (`apps/api`), and read-only analytics (`apps/analytics`) remain cleanly decoupled within a unified monorepo.

---

## 2. Architecture

MediCore is organized as an **npm workspaces monorepo** containing three primary deployable runtime services, two backing data stores, shared internal packages, and infrastructure definitions.

### Repository & Service Topology

| Component | Path | Technology Stack | Port | Responsibility |
| :--- | :--- | :--- | :--- | :--- |
| **Web Frontend** | `apps/web` | Next.js (App Router), TypeScript, React | `3000` | Role-specific clinical, administrative, and patient portals; presentation and SSR/CSR routing. |
| **Core REST API** | `apps/api` | Express.js, TypeScript, Prisma ORM, Zod, BullMQ, Pino, Swagger | `4000` | All domain business logic, transactional persistence, auth/RBAC, consent checks, audit logging, queue producers/workers, FHIR sync. |
| **Analytics Service** | `apps/analytics` | Python, FastAPI, Uvicorn | `8000` | Read-only operational/clinical aggregations, KPIs, and statistical queries via internal API. |
| **Primary Database** | `database/` | PostgreSQL | `5432` | ACID-compliant relational storage for all clinical, operational, billing, consent, and audit records. |
| **Cache & Queue Broker** | — | Redis (`ioredis`) | `6379` | BullMQ job queues, delayed/scheduled jobs, token/session revocation state, and short-lived caching. |
| **Shared Packages** | `packages/*` | TypeScript (`api-contracts`, `shared-types`, `shared-config`) | — | Shared DTOs, Zod/contract definitions, error schemas, constants, and linting/TS configs. |
| **Infrastructure** | `infrastructure/` | Docker Compose, Nginx, Monitoring scripts | `80/443` | Reverse proxy/TLS termination, container orchestration, and health/observability tooling. |

### High-Level Architecture Diagram

```mermaid
flowchart TB
    subgraph Clients["External Clients & Integrations"]
        Browser["Clinicians, Staff & Patients<br/>Browser / Web Client"]
        ExtFHIR["External EHR / HIE<br/>FHIR R4 Server :8080"]
        SMTP["SMTP Provider<br/>Email Gateway"]
        SMS["SMS Provider<br/>SMS Gateway"]
    end

    subgraph Edge["Edge & Reverse Proxy"]
        Nginx["Nginx Reverse Proxy / TLS Termination"]
    end

    subgraph Monorepo["MediCore Monorepo Services"]
        Web["Next.js App Router<br/>apps/web :3000<br/>Presentation Tier"]
        API["Express.js REST API<br/>apps/api :4000<br/>Domain Logic & Workers"]
        Analytics["FastAPI Analytics<br/>apps/analytics :8000<br/>Read-Only Aggregation"]
    end

    subgraph Data["Data & Messaging Infrastructure"]
        PG[("PostgreSQL :5432<br/>medicore_db")]
        Redis[("Redis :6379<br/>BullMQ Queues & Cache")]
    end

    Browser -->|"HTTPS"| Nginx
    Nginx -->|"HTTP :3000"| Web
    Nginx -->|"HTTPS REST /api/v1 :4000"| API
    Web -->|"REST over HTTPS + JWT"| API
    API -->|"Internal REST + X-API-Key :8000"| Analytics
    API -->|"Prisma ORM (Read/Write)"| PG
    Analytics -->|"Read-Only DB Role (medicore_readonly)"| PG
    API -->|"BullMQ / ioredis"| Redis
    API -->|"FHIR R4 REST + Bearer Token"| ExtFHIR
    API -->|"Async Worker Delivery"| SMTP
    API -->|"Async Worker Delivery"| SMS
```

---

## 3. Service Boundaries

Strict service boundaries prevent split-brain business logic, accidental PHI exposure, and tight database coupling across teams and runtimes.

### Boundary Matrix

| Responsibility | `apps/web` (Next.js) | `apps/api` (Express.js) | `apps/analytics` (FastAPI) |
| :--- | :--- | :--- | :--- |
| **UI Rendering & Client Navigation** | **Owner** | None | None |
| **Business Rules & State Transitions** | None (UX hints only) | **Owner** | None |
| **Transactional Writes (CRUD)** | None | **Owner (Exclusive)** | None (Strictly Prohibited) |
| **Authentication & Token Issuance** | Token storage/forwarding | **Owner** | Validates internal API key only |
| **RBAC, Resource Auth & Consent** | Route/menu gating (UX) | **Enforced Authoritatively** | Receives pre-authorized scope |
| **Audit Log Generation** | None | **Owner** | None |
| **Queue Production & Processing** | None | **Owner** | None |
| **Complex Analytical Aggregations** | Renders charts/tables | Proxies & enforces RBAC | **Owner (Read-Only)** |
| **Direct PostgreSQL Access** | Forbidden | Read/Write (`medicore_user`) | Read-Only (`medicore_readonly`) |
| **Direct Redis Access** | Forbidden | Read/Write | Optional read cache only |

### Boundary Rules

1. **Express API (`apps/api`) Owns ALL Business Data:**
   - All domain entities (`patients`, `staff`, `departments`, `appointments`, `encounters`, `diagnoses`, `prescriptions`, `laboratories`, `billing`, `consent`, `audit`, `notifications`, `fhir`) are exclusively created, updated, and validated inside `apps/api`.
   - Every mutation passes through Zod schema validation, authentication middleware, RBAC + resource-level authorization, consent checks (where PHI access/sharing applies), and Prisma transactions.
   - `apps/api` acts as the **API Gateway / BFF** for analytics requests: `apps/web` requests analytics through `apps/api` (or via authenticated API-mediated endpoints) so user JWTs, RBAC permissions, and audit trails are consistently enforced before calling `apps/analytics`.

2. **FastAPI Analytics (`apps/analytics`) Provides READ-ONLY Analytics:**
   - Exposes internal endpoints (e.g., `/api/v1/analytics/appointments`, `/api/v1/analytics/revenue`, `/api/v1/analytics/lab-turnaround`) protected by `ANALYTICS_API_KEY`.
   - Connects to PostgreSQL using a dedicated, least-privilege **read-only** database principal (`medicore_readonly`) with `SELECT`-only grants on approved tables/materialized views.
   - Never mutates operational tables, never issues user tokens, and is never exposed directly to unauthenticated public traffic.

3. **Next.js Frontend (`apps/web`) Handles Presentation Only:**
   - Built with Next.js App Router for Server Components, Client Components, form UX, dashboards, and role-based layouts.
   - Contains zero direct database drivers, zero Redis clients, and zero authoritative authorization logic.
   - All state mutations and protected data fetches flow over HTTPS to `apps/api` (`/api/v1/*`) using JWT bearer credentials.

---

## 4. Module Architecture

The Express.js backend (`apps/api/src/modules/`) follows a **modular monolith** pattern. Each module encapsulates its own routes, controllers, services, repositories (via Prisma), Zod validators, and domain types, communicating across module boundaries through well-defined service interfaces or internal domain events.

> **Note:** MediCore organizes **14 domain and platform modules** (spanning the 13 clinical/operational/platform modules plus `diagnoses` as a dedicated clinical sub-domain alongside `encounters`) under `apps/api/src/modules/`:

### Module Inventory

| # | Module | Core Responsibilities & Owned Entities | Key Integrations / Interactions |
| :-: | :--- | :--- | :--- |
| 1 | **`auth`** | User registration/login, Argon2id password hashing, JWT access (`15m`) & refresh (`7d`) token lifecycle, token rotation/revocation, MFA/session management. | `staff`, `patients`, `audit`, Redis (token blocklist/sessions). |
| 2 | **`patients`** | Patient demographic records, MRN assignment, emergency contacts, insurance details, patient search, and profile lifecycle. | `auth`, `consent`, `audit`, `fhir`. |
| 3 | **`staff`** | Clinician & hospital employee profiles, medical licenses, specialties, shift schedules, and role assignments. | `auth`, `departments`, `appointments`, `audit`. |
| 4 | **`departments`** | Hospital departments/wards, clinical service lines, room/resource capacity, and department head assignments. | `staff`, `appointments`, `encounters`. |
| 5 | **`appointments`** | Slot availability, appointment booking, strict state machine enforcement (`REQUESTED` to `COMPLETED`/`CANCELLED`/`NO_SHOW`), rescheduling. | `patients`, `staff`, `departments`, `encounters`, `notifications`, `audit`. |
| 6 | **`encounters`** | Clinical visit records (outpatient, emergency, inpatient), triage vitals, chief complaints, clinical notes, discharge summaries. | `appointments`, `patients`, `staff`, `diagnoses`, `prescriptions`, `laboratories`, `billing`, `fhir`, `audit`. |
| 7 | **`diagnoses`** | ICD-10 / SNOMED diagnosis recording, primary vs. secondary classification, chronic/active problem lists, clinical resolution tracking. | `encounters`, `patients`, `fhir`, `audit`. |
| 8 | **`prescriptions`** | Medication orders, dosage/route/frequency/duration, drug-allergy/interaction checks, pharmacy fulfillment status (`ORDERED`, `DISPENSED`, `CANCELLED`). | `encounters`, `patients`, `staff`, `notifications`, `fhir`, `audit`. |
| 9 | **`laboratories`** | Lab test catalog, test orders, specimen collection/accessioning, analyzer/tech result entry, critical value flags, report verification. | `encounters`, `patients`, `staff`, `notifications`, `billing`, `fhir`, `audit`. |
| 10 | **`billing`** | Charge capture from encounters/labs/prescriptions, itemized invoices, tax/discount rules, insurance claim metadata, payments, refunds, ledger status. | `encounters`, `laboratories`, `prescriptions`, `patients`, `notifications`, `audit`. |
| 11 | **`consent`** | Patient consent policies (`TREATMENT`, `DATA_SHARING`, `FHIR_EXPORT`, `ANALYTICS`), consent capture, versioning, expiration, and revocation enforcement. | `patients`, `encounters`, `fhir`, `audit`. |
| 12 | **`audit`** | Append-only audit log writer & query API capturing `actorId`, `role`, `action`, `resourceType`, `resourceId`, `ipAddress`, `correlationId`, and field diffs. | All modules (cross-cutting middleware + explicit domain audit hooks). |
| 13 | **`notifications`** | Template rendering, channel preference resolution, BullMQ job scheduling, email (SMTP) & SMS dispatch, delivery status tracking, retry/DLQ handling. | `appointments`, `laboratories`, `prescriptions`, `billing`, `auth`, Redis/BullMQ. |
| 14 | **`fhir`** | HL7 FHIR R4 resource mappers (`Patient`, `Practitioner`, `Encounter`, `Condition`, `MedicationRequest`, `DiagnosticReport`), outbound/inbound sync, retry/backoff via BullMQ. | `patients`, `encounters`, `diagnoses`, `prescriptions`, `laboratories`, `consent`, `audit`, Redis/BullMQ. |

### Internal Layering per Module

```text
apps/api/src/modules/<module>/
├── <module>.routes.ts       # Express router + OpenAPI annotations + middleware chain
├── <module>.controller.ts   # HTTP request/response mapping & status codes
├── <module>.service.ts      # Business logic, state transitions, consent & event emission
├── <module>.schema.ts       # Zod request/response validation schemas
├── <module>.repository.ts   # Prisma queries & transaction wrappers
└── <module>.types.ts        # Module-scoped interfaces & DTOs
```

---

## 5. Communication Patterns

MediCore enforces explicit, typed, and authenticated communication protocols across every boundary.

| Link | Protocol & Transport | Auth Mechanism | Key Libraries / Config |
| :--- | :--- | :--- | :--- |
| **Frontend → Express API** | REST over HTTPS (JSON), `/api/v1/*` | Bearer JWT Access Token (`15m`) + HttpOnly/secure Refresh Token (`7d`) | `fetch` / typed client (`packages/api-contracts`), `CORS_ORIGIN`, `helmet`, `express-rate-limit` |
| **Express API → Analytics** | Internal REST over HTTP/HTTPS (private network), `/api/v1/*` | Static/rotated Internal API Key header (`X-API-Key: ANALYTICS_API_KEY`) | `ANALYTICS_PORT=8000`, internal HTTP client with timeouts |
| **Express API → PostgreSQL** | TCP / TLS (`5432`) via Prisma Client | DB user credentials (`DATABASE_URL`) | `@prisma/client`, connection pool (`DATABASE_POOL_MIN=2`, `DATABASE_POOL_MAX=10`) |
| **Analytics → PostgreSQL** | TCP / TLS (`5432`) via SQLAlchemy / asyncpg | Read-only DB role (`ANALYTICS_DATABASE_URL`, `medicore_readonly`) | Read-only SQL queries & materialized views |
| **Express API → Redis** | RESP over TCP / TLS (`6379`) | Optional `REDIS_PASSWORD` (`REDIS_URL`) | `ioredis` + `bullmq` (queues, delayed reminders, retries, DLQ, token revocation cache) |
| **Express API → External FHIR** | REST over HTTPS (FHIR R4 JSON/Bundle) | `FHIR_AUTH_TOKEN` (Bearer/OAuth2) | Async BullMQ worker, `FHIR_TIMEOUT_MS=30000`, `FHIR_RETRY_ATTEMPTS=3`, `FHIR_RETRY_DELAY_MS=1000` |
| **Express API → SMTP / SMS** | SMTP/TLS (`SMTP_PORT=2525`) & HTTPS SMS API | SMTP credentials / `SMS_API_KEY` | BullMQ `notifications` worker |

### Service Communication Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as Clinician / Admin / Patient
    participant Web as Next.js Frontend (:3000)
    participant API as Express API (:4000)
    participant PG as PostgreSQL (:5432)
    participant Redis as Redis / BullMQ (:6379)
    participant Analytics as FastAPI Analytics (:8000)

    Note over Web,API: Synchronous Transactional Request
    User->>Web: Perform clinical or admin action
    Web->>API: HTTPS POST /api/v1/encounters<br/>Authorization: Bearer {JWT}
    API->>API: Validate JWT + RBAC + Consent + Zod Schema
    API->>PG: Prisma Transaction (Insert Encounter + Audit Log)
    PG-->>API: Committed Record
    API->>Redis: Enqueue async jobs (notification / FHIR sync)
    Redis-->>API: Job Ack
    API-->>Web: 201 Created (JSON DTO)
    Web-->>User: Render updated clinical view

    Note over Web,Analytics: Read-Only Analytics Request
    User->>Web: Open Operations Dashboard
    Web->>API: HTTPS GET /api/v1/analytics/utilization<br/>Authorization: Bearer {JWT}
    API->>API: Verify Admin/Analyst RBAC & Log Audit Access
    API->>Analytics: Internal GET /api/v1/metrics/utilization<br/>X-API-Key: {ANALYTICS_API_KEY}
    Analytics->>PG: SELECT aggregation (medicore_readonly)
    PG-->>Analytics: Aggregated Rows
    Analytics-->>API: 200 OK (Metrics JSON)
    API-->>Web: 200 OK (Dashboard Payload)
```

---

## 6. Security Architecture

Healthcare data (PHI/PII) demands zero-trust enforcement inside `apps/api` regardless of client behavior.

### 6.1 Authentication & Token Lifecycle

- **Password Hashing:** Passwords are hashed using **Argon2id** (`argon2`) tuned with `ARGON2_MEMORY_COST=65536` (64 MiB), `ARGON2_TIME_COST=3`, and `ARGON2_PARALLELISM=4`.
- **Short-Lived Access Tokens:** Signed JWT (`HS256`/`RS256` via `JWT_ACCESS_SECRET`) with `JWT_ACCESS_EXPIRY=15m`, carrying `sub` (userId), `role`, `staffId`/`patientId`, `departmentId`, and `jti` (unique token ID).
- **Refresh Token Rotation & Revocation:**
  - Issued with `JWT_REFRESH_EXPIRY=7d` (`JWT_REFRESH_SECRET`), stored securely (`HttpOnly`, `SameSite=Strict`, `Secure` cookie or hashed token record).
  - Every `/auth/refresh` call rotates the refresh token and invalidates the previous token family in Redis/PostgreSQL.
  - Reuse of a revoked refresh token triggers immediate **family revocation** (forcing re-authentication across sessions).
- **Logout / Forced Revocation:** Active `jti` values can be blocklisted in Redis with TTL equal to remaining access token lifetime.

### 6.2 Role-Based Access Control (RBAC)

Every protected endpoint declares required roles via declarative middleware (`authorizeRoles([...])`):

| Role | Scope & Primary Permissions |
| :--- | :--- |
| **`SUPER_ADMIN`** | System configuration, department setup, user/role administration, full audit log inspection. |
| **`HOSPITAL_ADMIN`** | Staff onboarding, scheduling oversight, operational analytics, billing overrides. |
| **`DOCTOR`** | Assigned/department patient encounters, diagnoses, prescriptions, lab orders, clinical notes. |
| **`NURSE`** | Triage vitals, appointment check-in, care-team encounter updates, specimen collection. |
| **`LAB_TECHNICIAN`** | View ordered lab tests, update specimen status, enter & verify lab results. |
| **`PHARMACIST`** | View active prescriptions, verify drug interactions, mark prescriptions dispensed. |
| **`RECEPTIONIST` / `BILLING_CLERK`** | Patient registration, appointment booking/check-in, invoice generation, payment capture. |
| **`PATIENT`** | Self-service profile, own appointments, own verified lab reports, prescriptions, invoices, and consent management. |

### 6.3 Resource-Level Authorization

RBAC alone is insufficient in healthcare ("a doctor cannot read every patient's chart without clinical justification"). MediCore enforces **resource-level authorization** in the service/policy layer:
- **Patient Self-Access:** A `PATIENT` can only read/mutate records where `resource.patientId === req.user.patientId`.
- **Care-Team / Department Scoping:** Clinicians (`DOCTOR`, `NURSE`) access encounter/clinical records when assigned as the attending/consulting provider, sharing the patient's active department encounter, or invoking an audited **break-glass** emergency override.
- **Laboratory & Pharmacy Scoping:** Technicians and pharmacists only view fields required for fulfillment (order metadata, relevant patient identifiers/allergies), without unrestricted financial or unrelated clinical history access.

### 6.4 Patient Consent Checks

Before returning sensitive clinical records, exporting to external FHIR servers, or including identifiable records in secondary workflows, `apps/api` invokes the `consent` module:
- Evaluates active consent records (`patientId`, `purpose`: `TREATMENT` | `DATA_SHARING` | `FHIR_EXPORT` | `ANALYTICS`, `status`: `GRANTED` | `REVOKED`, `expiresAt`).
- Denies external FHIR export (`403 Forbidden` — `CONSENT_REQUIRED`) if `FHIR_EXPORT` consent is absent or revoked.
- Records every consent grant, update, revocation, and consent-gate decision in the immutable `audit` log.

### 6.5 Transport, Input & Infrastructure Hardening

- **HTTP Security Headers:** `helmet` middleware enforces CSP, HSTS, `X-Frame-Options`, and MIME-sniffing protections.
- **CORS & Rate Limiting:** Strict `CORS_ORIGIN` allowlist (`http://localhost:3000` in dev) and `express-rate-limit` (`RATE_LIMIT_WINDOW_MS=900000`, `RATE_LIMIT_MAX_REQUESTS=100`, with tighter thresholds on `/auth/*`).
- **Payload Validation:** Strict `zod` schema validation on all params, queries, and bodies (`MAX_REQUEST_SIZE=10mb`), stripping unknown fields to prevent mass-assignment attacks.
- **Structured Logging & PHI Redaction:** `pino` JSON logging redacts authorization headers, passwords, tokens, and sensitive PHI fields while preserving `correlationId` for distributed tracing.

---

## 7. Data Flow Diagrams

### 7.1 Authentication Flow (Login, Access, Refresh & Revocation)

```mermaid
sequenceDiagram
    autonumber
    actor User as User
    participant Web as Next.js Web (:3000)
    participant API as Express API (:4000)
    participant PG as PostgreSQL (:5432)
    participant Redis as Redis (:6379)

    Note over User,Redis: 1. Login & Token Issuance
    User->>Web: Submit email + password
    Web->>API: POST /api/v1/auth/login
    API->>PG: Fetch user & passwordHash
    PG-->>API: User record (role, status)
    API->>API: Verify password via Argon2id
    alt Invalid credentials or inactive account
        API->>PG: Write failed login to audit log
        API-->>Web: 401 Unauthorized
    else Valid credentials
        API->>API: Sign Access JWT (15m) & Refresh JWT (7d)
        API->>Redis: Store refresh token family metadata (TTL 7d)
        API->>PG: Write LOGIN_SUCCESS to audit log
        API-->>Web: 200 OK (Access JWT + HttpOnly Refresh Cookie)
    end

    Note over User,Redis: 2. Authenticated API Request
    Web->>API: GET /api/v1/patients/:id<br/>Authorization: Bearer {AccessJWT}
    API->>API: Verify JWT signature & expiry
    API->>Redis: Check jti not in revocation blocklist
    API->>API: Enforce RBAC + Resource Auth + Consent Check
    API->>PG: Query patient record + Write PHI_READ audit
    API-->>Web: 200 OK (Patient DTO)

    Note over User,Redis: 3. Refresh Token Rotation
    Web->>API: POST /api/v1/auth/refresh (Refresh Cookie)
    API->>API: Verify Refresh JWT
    API->>Redis: Validate token family & unused state
    alt Token already used (replay detected)
        API->>Redis: Revoke entire token family
        API->>PG: Write SECURITY_TOKEN_REUSE audit
        API-->>Web: 401 Unauthorized (Force re-login)
    else Valid unused refresh token
        API->>Redis: Rotate family & invalidate old refresh jti
        API-->>Web: 200 OK (New Access JWT + New Refresh Cookie)
    end
```

### 7.2 Appointment Workflow State Machine

Appointments follow a deterministic finite state machine enforced inside `appointments.service.ts` within a Prisma transaction. Invalid transitions return `409 Conflict` (`INVALID_STATE_TRANSITION`).

```mermaid
stateDiagram-v2
    [*] --> REQUESTED : Patient or staff books slot

    REQUESTED --> CONFIRMED : Staff or doctor confirms slot
    REQUESTED --> CANCELLED : Patient or staff cancels before confirmation

    CONFIRMED --> CHECKED_IN : Patient checks in at reception
    CONFIRMED --> CANCELLED : Patient or staff cancels prior to visit
    CONFIRMED --> NO_SHOW : Grace period expires without check-in

    CHECKED_IN --> IN_PROGRESS : Clinician opens encounter
    CHECKED_IN --> CANCELLED : Visit cancelled while waiting
    CHECKED_IN --> NO_SHOW : Patient leaves before consultation

    IN_PROGRESS --> COMPLETED : Encounter signed and finalized

    COMPLETED --> [*]
    CANCELLED --> [*]
    NO_SHOW --> [*]
```

#### State Side Effects

| Transition | Synchronous Side Effects (PostgreSQL) | Asynchronous Side Effects (BullMQ) |
| :--- | :--- | :--- |
| `* -> REQUESTED` | Reserve slot lock, create appointment, write audit log | Enqueue booking-received notification |
| `REQUESTED -> CONFIRMED` | Confirm slot, write audit log | Enqueue confirmation + scheduled reminder jobs |
| `CONFIRMED -> CHECKED_IN` | Record arrival timestamp, notify care queue | Update waiting room display / nurse alert |
| `CHECKED_IN -> IN_PROGRESS` | Create/link clinical `Encounter` record | None |
| `IN_PROGRESS -> COMPLETED` | Finalize appointment, trigger encounter billing capture | Enqueue post-visit summary & FHIR encounter sync |
| `* -> CANCELLED` / `NO_SHOW` | Release slot capacity, record reason & actor | Cancel pending reminder jobs; send cancellation notice |

### 7.3 Notification Processing Flow

Notifications are decoupled from HTTP request latency using **BullMQ** backed by Redis, ensuring reliable delivery, exponential backoff retries, and dead-letter visibility.

```mermaid
flowchart LR
    subgraph Producers["Domain Modules (apps/api)"]
        Appt["appointments"]
        Lab["laboratories"]
        Rx["prescriptions"]
        Bill["billing"]
    end

    subgraph APIQueue["Notification Orchestration"]
        NotifSvc["notifications.service<br/>Validate & Persist Record"]
        PG[("PostgreSQL :5432<br/>notifications table")]
        Queue["BullMQ Queue<br/>notifications-dispatch<br/>Redis :6379"]
    end

    subgraph Worker["BullMQ Worker Pool"]
        Consume["Worker Consumer<br/>Concurrency & Rate Limit"]
        Template["Render Template<br/>Check Patient Preferences"]
        Route{"Channel?"}
        Email["Email Adapter<br/>SMTP :2525"]
        Sms["SMS Adapter<br/>SMS Gateway API"]
    end

    subgraph Reliability["Retry & Failure Handling"]
        Retry["Exponential Backoff<br/>Attempts: 3-5"]
        DLQ["Dead-Letter Queue<br/>notifications-dlq"]
    end

    Appt --> NotifSvc
    Lab --> NotifSvc
    Rx --> NotifSvc
    Bill --> NotifSvc

    NotifSvc -->|"1. Status = PENDING"| PG
    NotifSvc -->|"2. Enqueue job + delay"| Queue
    Queue -->|"3. Dequeue"| Consume
    Consume --> Template
    Template --> Route
    Route -->|"EMAIL"| Email
    Route -->|"SMS"| Sms

    Email -->|"Success"| PG
    Sms -->|"Success"| PG

    Email -->|"Transient Error"| Retry
    Sms -->|"Transient Error"| Retry
    Retry -->|"Re-enqueue"| Queue
    Retry -->|"Max Attempts Exceeded"| DLQ
    DLQ -->|"Status = FAILED"| PG
```

### 7.4 End-to-End Clinical, Billing & FHIR Data Flow

```mermaid
flowchart TB
    Appt["Appointment CHECKED_IN -> IN_PROGRESS"] --> Enc["Clinical Encounter Created<br/>Vitals + Notes"]
    Enc --> Diag["Diagnoses Recorded<br/>ICD-10 Codes"]
    Enc --> Rx["Prescription Ordered"]
    Enc --> Lab["Lab Test Ordered"]

    Lab -->|"Tech Verifies Result"| LabDone["Lab Report PUBLISHED"]
    LabDone -->|"BullMQ Job"| Notif1["Notify Doctor & Patient"]
    LabDone -->|"Charge Event"| Bill["Billing Invoice Generated<br/>Encounter + Labs + Meds"]
    Rx -->|"Dispensed"| Bill

    Enc -->|"Consent Check: FHIR_EXPORT"| ConsentGate{"Consent Granted?"}
    ConsentGate -->|"Yes"| FhirQueue["BullMQ: fhir-sync Queue"]
    ConsentGate -->|"No"| AuditSkip["Audit: FHIR Sync Skipped"]
    FhirQueue -->|"FHIR R4 Bundle + Retries"| ExtFHIR["External FHIR Server :8080"]

    Enc --> AuditDB[("Audit Log<br/>PostgreSQL")]
    Bill --> AuditDB
```

---

## 8. Scalability Considerations

MediCore is designed to scale smoothly from a single clinic deployment to a multi-department hospital network.

### 8.1 Horizontal Scaling of Stateless Services

- **Next.js (`apps/web`) & Express API (`apps/api`):** Both services are stateless in request handling (JWTs are self-contained; session/revocation state and queues live in Redis/PostgreSQL). Multiple replicas can run behind **Nginx** or a cloud load balancer with health checks (`/health` / `/ready`).
- **Worker Separation:** BullMQ workers (`notifications`, `fhir`) currently co-located or launched from `apps/api` can be scaled into dedicated worker replicas by running only the worker entrypoint, preventing heavy background bursts (e.g., batch reminders or FHIR sync retries) from degrading API P99 latency.

### 8.2 Database Scaling & Query Optimization (PostgreSQL)

- **Connection Pooling:** `apps/api` manages bounded pools (`DATABASE_POOL_MIN=2`, `DATABASE_POOL_MAX=10` per instance). At higher API replica counts, introduce **PgBouncer** in transaction-pooling mode in front of PostgreSQL to prevent connection exhaustion.
- **Read Replicas for Analytics & Reporting:** Currently `apps/analytics` uses `medicore_readonly` against PostgreSQL. Under heavy analytical load, point `ANALYTICS_DATABASE_URL` directly to a dedicated **PostgreSQL Read Replica** so OLAP aggregations never contend with OLTP clinical writes.
- **Indexing & Table Partitioning:**
  - Composite B-tree indexes on high-cardinality query paths: `(patientId, createdAt)`, `(departmentId, scheduledAt, status)`, and `(actorId, timestamp)`.
  - Time-based range partitioning (monthly/quarterly) on high-volume append-only tables such as `audit_logs` and `notifications`, enabling fast retention archival without table bloat.

### 8.3 Redis & Queue Resilience

- **Backpressure & Rate Shaping:** BullMQ queues configure per-worker concurrency limits and external provider rate limiters (e.g., SMTP/SMS provider quotas, external FHIR server throughput) to avoid cascading failures.
- **Dead-Letter Queues (DLQ) & Idempotency:** Every queued job carries a deterministic idempotency key (e.g., `appt-reminder:{appointmentId}:{window}` or `fhir-sync:{resourceType}:{resourceId}:{version}`), ensuring safe retries without duplicate patient notifications or duplicate FHIR resources.
- **High Availability:** Production deployments should run Redis with **Sentinel** or **Redis Cluster** (with AOF persistence enabled) so scheduled reminder jobs survive node restarts.

### 8.4 Caching & Payload Optimization

- **Hot Reference Data Caching:** Department catalogs, staff availability templates, lab test catalogs, and active consent policy lookups are strong candidates for short-TTL Redis caching with explicit write-through invalidation on updates.
- **Analytics Pre-Aggregation:** Expensive hospital-wide KPIs (monthly occupancy, lab turnaround percentiles, revenue summaries) in `apps/analytics` should leverage **PostgreSQL materialized views** refreshed on a schedule plus Redis response caching keyed by query parameters and time bucket.
- **Compression & Pagination:** `apps/api` enables `compression` middleware and enforces cursor/keyset or bounded offset pagination on all list endpoints (`patients`, `appointments`, `audit`, `encounters`) to bound memory and network overhead.

### 8.5 External Integration Resilience (FHIR & Notification Providers)

- **Timeouts & Bounded Retries:** External FHIR calls enforce `FHIR_TIMEOUT_MS=30000` with `FHIR_RETRY_ATTEMPTS=3` and exponential backoff (`FHIR_RETRY_DELAY_MS=1000`).
- **Circuit Breaking:** If an external FHIR endpoint or SMS gateway experiences sustained downtime, worker circuits trip to pause immediate retries and preserve local API responsiveness while queuing jobs for deferred replay.
