# MediCore Hospital Management Platform — REST API Design Document

**Version:** `1.0.0`  
**Base URL:** `/api/v1` (Local Dev: `http://localhost:4000/api/v1`)  
**Protocol:** HTTPS / JSON (`application/json`)  
**Target Service:** `apps/api` (Express.js + TypeScript + Prisma + PostgreSQL + Redis + BullMQ)  
**Last Updated:** 2026-11-26

---

## Table of Contents

1. [API Conventions](#1-api-conventions)
2. [Authentication Endpoints (`/api/v1/auth`)](#2-authentication-endpoints-apiv1auth)
3. [Resource Endpoints](#3-resource-endpoints)
   - [3.1 Users (`/api/v1/users`)](#31-users-apiv1users)
   - [3.2 Patients (`/api/v1/patients`)](#32-patients-apiv1patients)
   - [3.3 Staff (`/api/v1/staff`)](#33-staff-apiv1staff)
   - [3.4 Departments (`/api/v1/departments`)](#34-departments-apiv1departments)
   - [3.5 Appointments (`/api/v1/appointments`)](#35-appointments-apiv1appointments)
   - [3.6 Encounters (`/api/v1/encounters`)](#36-encounters-apiv1encounters)
   - [3.7 Diagnoses (`/api/v1/diagnoses`)](#37-diagnoses-apiv1diagnoses)
   - [3.8 Prescriptions (`/api/v1/prescriptions`)](#38-prescriptions-apiv1prescriptions)
   - [3.9 Laboratories (`/api/v1/laboratories`)](#39-laboratories-apiv1laboratories)
   - [3.10 Lab Orders (`/api/v1/lab-orders`)](#310-lab-orders-apiv1lab-orders)
   - [3.11 Lab Results (`/api/v1/lab-results`)](#311-lab-results-apiv1lab-results)
   - [3.12 Billing & Invoices (`/api/v1/billing/invoices`)](#312-billing--invoices-apiv1billinginvoices)
   - [3.13 Payments (`/api/v1/payments`)](#313-payments-apiv1payments)
   - [3.14 Consents (`/api/v1/consents`)](#314-consents-apiv1consents)
   - [3.15 Audit Logs (`/api/v1/audit-logs`)](#315-audit-logs-apiv1audit-logs)
   - [3.16 Notifications (`/api/v1/notifications`)](#316-notifications-apiv1notifications)
   - [3.17 FHIR Interoperability (`/api/v1/fhir`)](#317-fhir-interoperability-apiv1fhir)
4. [Health Endpoints](#4-health-endpoints)
5. [Rate Limiting Strategy](#5-rate-limiting-strategy)
6. [Error Codes Reference](#6-error-codes-reference)

---

## 1. API Conventions

### 1.1 Versioning & Base URL

- All REST API endpoints are prefixed with `/api/v1`.
- Breaking changes require incrementing the major path version (`/api/v2`). Non-breaking additions (new optional fields, new endpoints, new enum values documented as extensible) are released within `/api/v1`.
- Health probes (`/health`, `/ready`) are exposed at `/api/v1/health` and `/api/v1/ready`, with root-level aliases (`/health`, `/ready`) for container orchestrators and Nginx upstream checks.

### 1.2 Transport & Data Formats

| Convention | Specification |
| :--- | :--- |
| **Content-Type** | `application/json; charset=utf-8` for all request and response bodies (except CSV/NDJSON/FHIR exports where noted). |
| **Identifiers** | UUID v4 strings (e.g., `"550e8400-e29b-41d4-a716-446655440000"`). |
| **Timestamps** | ISO 8601 UTC format (`YYYY-MM-DDTHH:mm:ss.sssZ`, e.g., `"2026-11-26T09:30:00.000Z"`). |
| **Dates** | ISO 8601 calendar date (`YYYY-MM-DD`, e.g., `"1990-05-14"`). |
| **Monetary Values** | Integer minor units (cents) paired with ISO 4217 `currency` code (e.g., `amountCents: 15000`, `currency: "USD"`). |
| **Max Request Size** | `10mb` (configured via `MAX_REQUEST_SIZE=10mb`). |
| **Authentication** | `Authorization: Bearer <access_token>` header (JWT, `15m` TTL). |
| **Idempotency** | `Idempotency-Key: <uuid>` supported on payment creation and critical write operations. |

### 1.3 Request Correlation (`X-Request-ID`)

- Every incoming HTTP request is assigned a correlation ID via the `X-Request-ID` header.
- If the client supplies a valid UUID/alphanumeric `X-Request-ID` (max 64 chars), the API preserves it; otherwise, the server generates a UUID v4.
- The correlation ID is:
  - Returned in the `X-Request-ID` HTTP response header.
  - Attached to all Pino structured log entries and BullMQ job metadata.
  - Included in every error response body as `requestId`.

### 1.4 Standard Success Response Envelope

All `2xx` JSON responses adhere to the standard envelope:

```json
{
  "success": true,
  "message": "Resource retrieved successfully",
  "data": {},
  "meta": {}
}
```

#### Single Resource / Action Response Example

```json
{
  "success": true,
  "message": "Patient created successfully",
  "data": {
    "id": "b7b1f19a-8a2c-4f21-b41e-6c991234abcd",
    "mrn": "MC-2026-000142",
    "firstName": "Elena",
    "lastName": "Rostova"
  },
  "meta": {
    "requestId": "c1f3d9a2-7e10-4a8e-9b11-1d2e3f4a5b6c",
    "timestamp": "2026-11-26T09:46:12.104Z"
  }
}
```

#### Collection Response with Pagination `meta` Example

```json
{
  "success": true,
  "message": "Patients retrieved successfully",
  "data": [
    {
      "id": "b7b1f19a-8a2c-4f21-b41e-6c991234abcd",
      "mrn": "MC-2026-000142",
      "firstName": "Elena",
      "lastName": "Rostova",
      "status": "ACTIVE"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 142,
    "totalPages": 8,
    "hasNextPage": true,
    "hasPreviousPage": false,
    "sortBy": "createdAt",
    "order": "desc"
  }
}
```

### 1.5 Standard Error Response Envelope

All `4xx` and `5xx` responses adhere to:

```json
{
  "success": false,
  "message": "Validation failed for request payload",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [
      {
        "field": "body.dateOfBirth",
        "message": "Date of birth must be in YYYY-MM-DD format and in the past",
        "rule": "invalid_date"
      }
    ]
  },
  "requestId": "c1f3d9a2-7e10-4a8e-9b11-1d2e3f4a5b6c"
}
```

### 1.6 Pagination, Filtering & Sorting Query Parameters

| Parameter | Type | Default | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `page` | `integer` | `1` | `>= 1` | 1-indexed page number. |
| `limit` | `integer` | `20` | `1 <= limit <= 100` | Number of items per page. |
| `sortBy` | `string` | `createdAt` | Whitelisted per resource | Field to sort by. Unknown fields trigger `VALIDATION_ERROR`. |
| `order` | `string` | `desc` | `asc` \| `desc` | Sort direction (case-insensitive). |
| `search` | `string` | — | Max 100 chars | Case-insensitive partial match on primary display fields. |
| `status` | `string` | — | Resource enum | Filter by status (e.g., `?status=ACTIVE`, or comma-separated `?status=SCHEDULED,CONFIRMED`). |
| `department` | `string` | — | Slug or UUID | Filter by department code/slug or ID (e.g., `?department=cardiology`). |
| `from` / `to` | `ISO8601` | — | `from <= to` | Inclusive date/time range filter. |

Example combined query:

```http
GET /api/v1/appointments?page=1&limit=20&status=SCHEDULED&department=cardiology&sortBy=scheduledAt&order=asc
```

### 1.7 Role-Based Access Control (RBAC) Matrix

| Role Code | Description | Access Scope |
| :--- | :--- | :--- |
| `ADMIN` | Hospital / System Administrator | Full platform administration, user/staff/department management, audit logs, system config. |
| `DOCTOR` | Attending Physician / Specialist | Clinical encounters, diagnoses, prescriptions, lab orders/results, patient charts, own schedule. |
| `NURSE` | Registered Nurse / Triage | Triage vitals, encounters (nursing notes), lab orders/collection, appointment check-in, patient charts. |
| `RECEPTIONIST` | Front Desk / Scheduler | Patient registration, demographic updates, appointment scheduling, billing/invoice lookup. |
| `LAB_TECHNICIAN` | Laboratory Technologist | Laboratory catalog, specimen collection (`lab-orders`), entering/verifying `lab-results`. |
| `PHARMACIST` | Licensed Pharmacist | Viewing & dispensing `prescriptions`, drug interaction/allergy checks. |
| `BILLING_STAFF` | Finance / Billing Specialist | Invoice generation, adjustments, payment capture, refunds, insurance claims. |
| `PATIENT` | Registered Patient | Self-scoped (`owner`) access to own profile, appointments, prescriptions, lab results, invoices, payments, consents, notifications. |

> **Ownership Rule (`self`):** Whenever a role is listed as `PATIENT (self)` or `STAFF (self)`, the authorization guard enforces that the authenticated user's `patientId` / `staffId` / `userId` matches the target resource; otherwise `403 FORBIDDEN` is returned.

---

## 2. Authentication Endpoints (`/api/v1/auth`)

All authentication endpoints use Argon2id password hashing (`memoryCost=65536`, `timeCost=3`, `parallelism=4`) and JWT access (`15m`) + refresh (`7d`) tokens. Refresh tokens are tracked in Redis for rotation, reuse detection, and revocation on logout.

### Endpoints Summary

| Method & Path | Auth / Role | Description | Success Code | Error Codes |
| :--- | :--- | :--- | :--- | :--- |
| `POST /api/v1/auth/register` | Public (or `ADMIN` for staff roles) | Register a new patient account | `201` | `VALIDATION_ERROR`, `CONFLICT`, `FORBIDDEN`, `RATE_LIMIT_EXCEEDED` |
| `POST /api/v1/auth/login` | Public | Authenticate user and issue JWT pair | `200` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `ACCOUNT_LOCKED`, `RATE_LIMIT_EXCEEDED` |
| `POST /api/v1/auth/logout` | Authenticated (Any role) | Revoke current refresh token & blacklist access token | `200` | `UNAUTHORIZED`, `TOKEN_INVALID` |
| `POST /api/v1/auth/refresh-token` | Public (Valid Refresh Token) | Rotate refresh token and issue new access token | `200` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `TOKEN_EXPIRED`, `TOKEN_INVALID` |
| `POST /api/v1/auth/forgot-password` | Public | Request time-limited password reset token via email | `200` | `VALIDATION_ERROR`, `RATE_LIMIT_EXCEEDED` |
| `POST /api/v1/auth/reset-password` | Public (Valid Reset Token) | Complete password reset and revoke all active sessions | `200` | `VALIDATION_ERROR`, `TOKEN_EXPIRED`, `TOKEN_INVALID` |

### Endpoint Details

#### `POST /api/v1/auth/register`

- **Required Role(s):** Public (creates `PATIENT` account only; attempting to pass privileged roles without `ADMIN` auth is rejected with `403 FORBIDDEN`).
- **Request Body Schema:**
  ```json
  {
    "email": "elena.rostova@example.com",
    "password": "StrongPassword!2026",
    "firstName": "Elena",
    "lastName": "Rostova",
    "phone": "+14155550199",
    "dateOfBirth": "1990-05-14",
    "gender": "FEMALE"
  }
  ```
  - `email`: valid email, unique (case-insensitive).
  - `password`: min 12 chars, at least 1 uppercase, 1 lowercase, 1 digit, 1 special character.
  - `gender`: `MALE | FEMALE | OTHER | PREFER_NOT_TO_SAY`.
- **Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "Account registered successfully",
    "data": {
      "user": {
        "id": "a1b2c3d4-0000-4000-8000-000000000001",
        "email": "elena.rostova@example.com",
        "role": "PATIENT",
        "status": "ACTIVE",
        "emailVerified": false
      },
      "patientId": "b7b1f19a-8a2c-4f21-b41e-6c991234abcd",
      "tokens": {
        "accessToken": "eyJhbGciOi...",
        "refreshToken": "eyJhbGciOi...",
        "expiresIn": 900,
        "tokenType": "Bearer"
      }
    },
    "meta": {}
  }
  ```
- **Error Scenarios:**
  - `400 VALIDATION_ERROR`: Weak password, invalid email, future `dateOfBirth`.
  - `403 FORBIDDEN`: Non-admin attempts to register a non-`PATIENT` role.
  - `409 CONFLICT`: Email or phone already registered.
  - `429 RATE_LIMIT_EXCEEDED`: Registration attempts exceed auth rate limit.

#### `POST /api/v1/auth/login`

- **Required Role(s):** Public
- **Request Body Schema:**
  ```json
  {
    "email": "dr.chen@medicore.org",
    "password": "StrongPassword!2026"
  }
  ```
- **Response (`200 OK`):** Sets optional `HttpOnly; Secure; SameSite=Strict` refresh cookie (for web clients) and returns tokens in JSON:
  ```json
  {
    "success": true,
    "message": "Login successful",
    "data": {
      "user": {
        "id": "u-1111",
        "email": "dr.chen@medicore.org",
        "role": "DOCTOR",
        "firstName": "Marcus",
        "lastName": "Chen",
        "staffId": "s-2222",
        "patientId": null
      },
      "tokens": {
        "accessToken": "eyJhbGciOi...",
        "refreshToken": "eyJhbGciOi...",
        "expiresIn": 900,
        "tokenType": "Bearer"
      }
    },
    "meta": {}
  }
  ```
- **Error Scenarios:**
  - `400 VALIDATION_ERROR`: Missing `email` or `password`.
  - `401 UNAUTHORIZED`: Invalid credentials (constant-time Argon2 verification; generic message to prevent user enumeration).
  - `423 LOCKED` (`ACCOUNT_LOCKED`): Account suspended or temporarily locked after repeated failed login attempts.
  - `429 RATE_LIMIT_EXCEEDED`: Exceeded auth rate limit.

#### `POST /api/v1/auth/logout`

- **Required Role(s):** Any authenticated role
- **Headers:** `Authorization: Bearer <accessToken>`
- **Request Body Schema:**
  ```json
  {
    "refreshToken": "eyJhbGciOi...",
    "allSessions": false
  }
  ```
  - `refreshToken`: optional if sent via `HttpOnly` cookie.
  - `allSessions`: boolean (default `false`); if `true`, invalidates all refresh token families for the user.
- **Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Logged out successfully",
    "data": { "revoked": true },
    "meta": {}
  }
  ```
- **Error Scenarios:**
  - `401 UNAUTHORIZED`: Missing or invalid bearer token.

#### `POST /api/v1/auth/refresh-token`

- **Required Role(s):** Public (requires valid, unrevoked refresh token in body or cookie)
- **Request Body Schema:**
  ```json
  {
    "refreshToken": "eyJhbGciOi..."
  }
  ```
- **Response (`200 OK`):** Rotates refresh token (old token immediately invalidated; reuse of a rotated token revokes the entire token family):
  ```json
  {
    "success": true,
    "message": "Token refreshed successfully",
    "data": {
      "accessToken": "eyJhbGciOi...",
      "refreshToken": "eyJhbGciOi...",
      "expiresIn": 900,
      "tokenType": "Bearer"
    },
    "meta": {}
  }
  ```
- **Error Scenarios:**
  - `400 VALIDATION_ERROR`: Refresh token missing from both body and cookie.
  - `401 TOKEN_EXPIRED`: Refresh token past 7-day TTL.
  - `401 TOKEN_INVALID`: Malformed, revoked, or reused refresh token.

#### `POST /api/v1/auth/forgot-password`

- **Required Role(s):** Public
- **Request Body Schema:**
  ```json
  {
    "email": "elena.rostova@example.com"
  }
  ```
- **Response (`200 OK`):** Always returns `200 OK` regardless of whether the email exists (prevents email enumeration); dispatches a BullMQ email job if user exists:
  ```json
  {
    "success": true,
    "message": "If an account with that email exists, a password reset link has been sent",
    "data": { "dispatched": true },
    "meta": {}
  }
  ```
- **Error Scenarios:**
  - `400 VALIDATION_ERROR`: Invalid email format.
  - `429 RATE_LIMIT_EXCEEDED`: Too many password reset requests.

#### `POST /api/v1/auth/reset-password`

- **Required Role(s):** Public (requires valid single-use reset token)
- **Request Body Schema:**
  ```json
  {
    "token": "rst_9f8e7d6c5b4a3210fedcba9876543210",
    "newPassword": "NewStrongPassword!2026"
  }
  ```
- **Response (`200 OK`):** Updates password hash, invalidates reset token, and revokes all active user refresh tokens in Redis:
  ```json
  {
    "success": true,
    "message": "Password reset successfully. Please log in with your new password.",
    "data": { "passwordUpdated": true },
    "meta": {}
  }
  ```
- **Error Scenarios:**
  - `400 VALIDATION_ERROR`: Password fails complexity rules.
  - `401 TOKEN_EXPIRED`: Reset token expired (15-minute TTL).
  - `401 TOKEN_INVALID`: Reset token invalid or already consumed.

---

## 3. Resource Endpoints

---

### 3.1 Users (`/api/v1/users`)

Account credentials, authentication status, and role assignments. Clinical/demographic profiles live in `patients` and `staff`.

#### Endpoints Summary

| Method & Path | Required Role(s) | Description | Status | Error Codes |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/v1/users` | `ADMIN` | List paginated user accounts | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR` |
| `GET /api/v1/users/me` | Any Authenticated | Get current authenticated user's profile | `200` | `UNAUTHORIZED` |
| `GET /api/v1/users/:id` | `ADMIN`, `Self` | Get user account by ID | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND` |
| `POST /api/v1/users` | `ADMIN` | Create user account (any role) | `201` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT` |
| `PATCH /api/v1/users/:id` | `ADMIN`, `Self` (limited fields) | Update user profile/role/status | `200` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT` |
| `PATCH /api/v1/users/:id/password` | `Self` | Change own password (requires current password) | `200` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN` |
| `DELETE /api/v1/users/:id` | `ADMIN` | Soft-delete / deactivate user account | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE_TRANSITION` |

#### Schemas & Details

- **Query Filters (`GET /api/v1/users`):** `page`, `limit`, `sortBy` (`createdAt`, `email`, `role`, `status`), `order`, `role` (`ADMIN|DOCTOR|NURSE|RECEPTIONIST|LAB_TECHNICIAN|PHARMACIST|BILLING_STAFF|PATIENT`), `status` (`ACTIVE|INACTIVE|SUSPENDED`), `search`.
- **`POST /api/v1/users` Request Body:**
  ```json
  {
    "email": "nurse.patel@medicore.org",
    "password": "TempPassword!2026",
    "firstName": "Priya",
    "lastName": "Patel",
    "phone": "+14155550144",
    "role": "NURSE",
    "status": "ACTIVE"
  }
  ```
- **`PATCH /api/v1/users/:id` Request Body:**
  - `Self` may update: `firstName`, `lastName`, `phone`.
  - `ADMIN` may additionally update: `role`, `status` (`ACTIVE|INACTIVE|SUSPENDED`), `emailVerified`.
- **`PATCH /api/v1/users/:id/password` Request Body:**
  ```json
  {
    "currentPassword": "OldPassword!2026",
    "newPassword": "NewPassword!2026"
  }
  ```
- **Response Schema (`200` / `201`):**
  ```json
  {
    "success": true,
    "message": "User retrieved successfully",
    "data": {
      "id": "u-1001",
      "email": "nurse.patel@medicore.org",
      "firstName": "Priya",
      "lastName": "Patel",
      "phone": "+14155550144",
      "role": "NURSE",
      "status": "ACTIVE",
      "emailVerified": true,
      "lastLoginAt": "2026-11-26T08:15:00.000Z",
      "createdAt": "2026-01-10T10:00:00.000Z",
      "updatedAt": "2026-11-26T08:15:00.000Z"
    },
    "meta": {}
  }
  ```
- **Error Scenarios:**
  - `403 FORBIDDEN`: Non-admin attempting to list users, change `role`/`status`, or read another user.
  - `409 CONFLICT`: Duplicate `email`.
  - `422 INVALID_STATE_TRANSITION`: Admin attempting to delete their own active `ADMIN` account (`cannot self-deactivate last admin`).

---

### 3.2 Patients (`/api/v1/patients`)

Manages patient demographics, Medical Record Numbers (MRN), emergency contacts, insurance metadata, allergies, and medical summary.

#### Endpoints Summary

| Method & Path | Required Role(s) | Description | Status | Error Codes |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/v1/patients` | `ADMIN`, `DOCTOR`, `NURSE`, `RECEPTIONIST`, `BILLING_STAFF` | Search & list patients | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR` |
| `GET /api/v1/patients/:id` | `ADMIN`, `DOCTOR`, `NURSE`, `RECEPTIONIST`, `LAB_TECHNICIAN`, `PHARMACIST`, `BILLING_STAFF`, `PATIENT (self)` | Get full patient profile | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONSENT_REQUIRED` |
| `POST /api/v1/patients` | `ADMIN`, `RECEPTIONIST`, `DOCTOR`, `NURSE` | Register a new patient record | `201` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT` |
| `PATCH /api/v1/patients/:id` | `ADMIN`, `RECEPTIONIST`, `DOCTOR`, `NURSE`, `PATIENT (self - contact fields only)` | Update patient demographics/medical metadata | `200` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT` |
| `GET /api/v1/patients/:id/summary` | `ADMIN`, `DOCTOR`, `NURSE`, `PHARMACIST`, `PATIENT (self)` | Get clinical summary (allergies, active meds, diagnoses, recent visits) | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONSENT_REQUIRED` |
| `DELETE /api/v1/patients/:id` | `ADMIN` | Archive/soft-delete patient record | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE_TRANSITION` |

#### Schemas & Details

- **Query Filters (`GET /api/v1/patients`):** `page`, `limit`, `sortBy` (`createdAt`, `lastName`, `mrn`, `dateOfBirth`), `order`, `status` (`ACTIVE|INACTIVE|DECEASED|ARCHIVED`), `bloodGroup`, `gender`, `search` (matches `mrn`, `firstName`, `lastName`, `phone`, `email`).
- **`POST /api/v1/patients` Request Body:**
  ```json
  {
    "userId": "a1b2c3d4-0000-4000-8000-000000000001",
    "firstName": "Elena",
    "lastName": "Rostova",
    "dateOfBirth": "1990-05-14",
    "gender": "FEMALE",
    "bloodGroup": "O_POSITIVE",
    "phone": "+14155550199",
    "email": "elena.rostova@example.com",
    "nationalId": "SSN-XXX-XX-1234",
    "address": {
      "line1": "742 Evergreen Terrace",
      "city": "San Francisco",
      "state": "CA",
      "postalCode": "94107",
      "country": "US"
    },
    "emergencyContact": {
      "name": "Victor Rostov",
      "relationship": "SPOUSE",
      "phone": "+14155550188"
    },
    "insurance": {
      "provider": "BlueCross BlueShield",
      "policyNumber": "BCBS-99887766",
      "groupNumber": "GRP-4421",
      "validUntil": "2027-12-31"
    },
    "allergies": ["Penicillin", "Peanuts"]
  }
  ```
- **Response Schema (`200` / `201`):** Sensitive identifiers like `nationalId` are masked (`***-**-1234`) for non-admin/non-billing roles:
  ```json
  {
    "success": true,
    "message": "Patient retrieved successfully",
    "data": {
      "id": "b7b1f19a-8a2c-4f21-b41e-6c991234abcd",
      "mrn": "MC-2026-000142",
      "firstName": "Elena",
      "lastName": "Rostova",
      "dateOfBirth": "1990-05-14",
      "gender": "FEMALE",
      "bloodGroup": "O_POSITIVE",
      "allergies": ["Penicillin", "Peanuts"],
      "status": "ACTIVE",
      "createdAt": "2026-11-26T09:46:12.104Z"
    },
    "meta": {}
  }
  ```
- **Error Scenarios:**
  - `403 CONSENT_REQUIRED`: External or restricted-chart access attempted without active `DATA_SHARING` / `TREATMENT` consent when patient has privacy restrictions enabled.
  - `409 CONFLICT`: Patient with matching `nationalId` or `userId` already exists.
  - `422 INVALID_STATE_TRANSITION`: Attempting to archive a patient who currently has an `IN_PROGRESS` inpatient encounter.

---

### 3.3 Staff (`/api/v1/staff`)

Manages hospital personnel (doctors, nurses, technicians, pharmacists, receptionists, billing staff), credentials, licenses, department assignments, and weekly availability schedules.

#### Endpoints Summary

| Method & Path | Required Role(s) | Description | Status | Error Codes |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/v1/staff` | Any Authenticated | List staff directory (patients see public provider fields only) | `200` | `UNAUTHORIZED`, `VALIDATION_ERROR` |
| `GET /api/v1/staff/:id` | Any Authenticated | Get staff profile & credentials | `200` | `UNAUTHORIZED`, `NOT_FOUND` |
| `POST /api/v1/staff` | `ADMIN` | Onboard staff profile linked to a user | `201` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`, `NOT_FOUND` |
| `PATCH /api/v1/staff/:id` | `ADMIN`, `Staff (self - bio/phone)` | Update staff details, specialization, or status | `200` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND` |
| `GET /api/v1/staff/:id/availability` | Any Authenticated | Get available booking slots for a provider on a date range | `200` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `NOT_FOUND` |
| `PUT /api/v1/staff/:id/schedule` | `ADMIN`, `DOCTOR (self)` | Define recurring weekly shifts & break windows | `200` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND` |
| `DELETE /api/v1/staff/:id` | `ADMIN` | Deactivate staff member | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE_TRANSITION` |

#### Schemas & Details

- **Query Filters (`GET /api/v1/staff`):** `page`, `limit`, `sortBy` (`lastName`, `employeeCode`, `createdAt`), `order`, `department` (slug or ID), `staffType` (`DOCTOR|NURSE|LAB_TECHNICIAN|PHARMACIST|RECEPTIONIST|BILLING_STAFF|ADMIN`), `specialization`, `status` (`ACTIVE|ON_LEAVE|INACTIVE`), `search`.
- **`POST /api/v1/staff` Request Body:**
  ```json
  {
    "userId": "u-2222",
    "employeeCode": "EMP-CARD-019",
    "staffType": "DOCTOR",
    "departmentId": "dept-cardiology-uuid",
    "specialization": "Interventional Cardiology",
    "licenseNumber": "MD-CA-884210",
    "licenseExpiry": "2028-06-30",
    "consultationFeeCents": 20000,
    "slotDurationMinutes": 30
  }
  ```
- **`PUT /api/v1/staff/:id/schedule` Request Body:**
  ```json
  {
    "schedules": [
      {
        "dayOfWeek": 1,
        "startTime": "09:00",
        "endTime": "17:00",
        "breakStart": "12:30",
        "breakEnd": "13:30",
        "isActive": true
      }
    ]
  }
  ```
- **`GET /api/v1/staff/:id/availability` Query Params:** `?from=2026-11-27&to=2026-12-03` (max 31-day span).
- **Availability Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Provider availability retrieved",
    "data": {
      "staffId": "s-2222",
      "slotDurationMinutes": 30,
      "days": [
        {
          "date": "2026-11-27",
          "slots": [
            { "start": "2026-11-27T09:00:00.000Z", "end": "2026-11-27T09:30:00.000Z", "available": true },
            { "start": "2026-11-27T09:30:00.000Z", "end": "2026-11-27T10:00:00.000Z", "available": false }
          ]
        }
      ]
    },
    "meta": {}
  }
  ```
- **Error Scenarios:**
  - `404 NOT_FOUND`: Referenced `userId` or `departmentId` does not exist.
  - `409 CONFLICT`: Duplicate `employeeCode`, `licenseNumber`, or `userId` already linked to staff.
  - `422 INVALID_STATE_TRANSITION`: Deactivating a provider with active future `CONFIRMED` appointments without reassignment.

---

### 3.4 Departments (`/api/v1/departments`)

Hospital clinical and operational units (e.g., Cardiology, Radiology, Emergency, Pediatrics).

#### Endpoints Summary

| Method & Path | Required Role(s) | Description | Status | Error Codes |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/v1/departments` | Any Authenticated (or Public directory) | List departments | `200` | `VALIDATION_ERROR` |
| `GET /api/v1/departments/:id` | Any Authenticated | Get department details & head physician | `200` | `NOT_FOUND` |
| `POST /api/v1/departments` | `ADMIN` | Create a new department | `201` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT` |
| `PATCH /api/v1/departments/:id` | `ADMIN` | Update department details or head of department | `200` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT` |
| `DELETE /api/v1/departments/:id` | `ADMIN` | Deactivate/archive department | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE_TRANSITION` |

#### Schemas & Details

- **Query Filters (`GET /api/v1/departments`):** `page`, `limit`, `sortBy` (`name`, `code`, `createdAt`), `order`, `status` (`ACTIVE|INACTIVE`), `search`.
- **`POST /api/v1/departments` Request Body:**
  ```json
  {
    "code": "CARD",
    "slug": "cardiology",
    "name": "Cardiology & Vascular Care",
    "description": "Inpatient and outpatient cardiovascular care",
    "floor": "3rd Floor, East Wing",
    "phoneExtension": "3100",
    "headStaffId": "s-2222",
    "status": "ACTIVE"
  }
  ```
- **Response (`200` / `201`):**
  ```json
  {
    "success": true,
    "message": "Department retrieved successfully",
    "data": {
      "id": "dept-cardiology-uuid",
      "code": "CARD",
      "slug": "cardiology",
      "name": "Cardiology & Vascular Care",
      "floor": "3rd Floor, East Wing",
      "phoneExtension": "3100",
      "headStaffId": "s-2222",
      "staffCount": 14,
      "status": "ACTIVE",
      "createdAt": "2026-01-05T08:00:00.000Z"
    },
    "meta": {}
  }
  ```
- **Error Scenarios:**
  - `409 CONFLICT`: Duplicate `code` or `slug`.
  - `422 INVALID_STATE_TRANSITION`: Archiving a department that still has active staff or upcoming scheduled appointments.

---

### 3.5 Appointments (`/api/v1/appointments`)

Scheduling, check-in, rescheduling, and cancellation lifecycle with conflict prevention.

**Lifecycle State Machine:**
- `SCHEDULED` -> `CONFIRMED` | `CHECKED_IN` | `CANCELLED` | `RESCHEDULED`
- `CONFIRMED` -> `CHECKED_IN` | `CANCELLED` | `NO_SHOW` | `RESCHEDULED`
- `CHECKED_IN` -> `IN_PROGRESS` | `CANCELLED`
- `IN_PROGRESS` -> `COMPLETED`
- Terminal states: `COMPLETED`, `CANCELLED`, `NO_SHOW`, `RESCHEDULED` (re-linked to new appointment ID).

#### Endpoints Summary

| Method & Path | Required Role(s) | Description | Status | Error Codes |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/v1/appointments` | `ADMIN`, `DOCTOR`, `NURSE`, `RECEPTIONIST`, `PATIENT (self)` | List appointments with filters | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR` |
| `GET /api/v1/appointments/:id` | `ADMIN`, `DOCTOR`, `NURSE`, `RECEPTIONIST`, `PATIENT (self)` | Get appointment details | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND` |
| `POST /api/v1/appointments` | `ADMIN`, `RECEPTIONIST`, `DOCTOR`, `NURSE`, `PATIENT (self)` | Book a new appointment | `201` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `APPOINTMENT_CONFLICT` |
| `PATCH /api/v1/appointments/:id` | `ADMIN`, `RECEPTIONIST`, `DOCTOR`, `NURSE`, `PATIENT (self - limited)` | Reschedule or update appointment notes | `200` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `APPOINTMENT_CONFLICT`, `INVALID_STATE_TRANSITION` |
| `POST /api/v1/appointments/:id/status` | `ADMIN`, `RECEPTIONIST`, `DOCTOR`, `NURSE`, `PATIENT (self - CANCELLED only)` | Transition appointment status | `200` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE_TRANSITION` |
| `DELETE /api/v1/appointments/:id` | `ADMIN`, `RECEPTIONIST` | Cancel & soft-delete erroneous draft appointment | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE_TRANSITION` |

#### Schemas & Details

- **Query Filters (`GET /api/v1/appointments`):** `page`, `limit`, `sortBy` (`scheduledAt`, `createdAt`, `status`), `order`, `status`, `department`, `doctorId`, `patientId`, `type` (`IN_PERSON|TELEHEALTH|FOLLOW_UP|EMERGENCY`), `from`, `to`.
- **`POST /api/v1/appointments` Request Body:**
  ```json
  {
    "patientId": "b7b1f19a-8a2c-4f21-b41e-6c991234abcd",
    "doctorId": "s-2222",
    "departmentId": "dept-cardiology-uuid",
    "scheduledStart": "2026-11-28T10:00:00.000Z",
    "scheduledEnd": "2026-11-28T10:30:00.000Z",
    "type": "IN_PERSON",
    "reason": "Annual cardiac checkup",
    "notes": "Patient requested morning slot"
  }
  ```
- **`POST /api/v1/appointments/:id/status` Request Body:**
  ```json
  {
    "status": "CHECKED_IN",
    "reason": "Arrived at reception desk"
  }
  ```
- **Response (`200` / `201`):** Triggers async BullMQ reminder scheduling on creation:
  ```json
  {
    "success": true,
    "message": "Appointment booked successfully",
    "data": {
      "id": "apt-uuid",
      "appointmentNumber": "APT-2026-09124",
      "patientId": "b7b1f19a-8a2c-4f21-b41e-6c991234abcd",
      "doctorId": "s-2222",
      "departmentId": "dept-cardiology-uuid",
      "scheduledStart": "2026-11-28T10:00:00.000Z",
      "scheduledEnd": "2026-11-28T10:30:00.000Z",
      "type": "IN_PERSON",
      "status": "SCHEDULED",
      "reason": "Annual cardiac checkup",
      "createdAt": "2026-11-26T09:50:00.000Z"
    },
    "meta": {}
  }
  ```
- **Error Scenarios:**
  - `409 APPOINTMENT_CONFLICT`: Provider already has an overlapping non-cancelled appointment, slot falls outside provider's active schedule/break, or patient has an overlapping appointment.
  - `422 INVALID_STATE_TRANSITION`: e.g., transitioning `CANCELLED` -> `CHECKED_IN` or `COMPLETED` -> `CANCELLED`.
  - `403 FORBIDDEN`: Patient attempting to set `CHECKED_IN` or `COMPLETED` status, or book for another patient.

---

### 3.6 Encounters (`/api/v1/encounters`)

Clinical visits/episodes of care (outpatient, inpatient, emergency, telehealth), capturing chief complaints, vitals, SOAP clinical notes, and sign-off.

**Lifecycle:** `OPEN` -> `IN_PROGRESS` -> `COMPLETED` -> `SIGNED` (immutable once signed; amendments require an addendum).

#### Endpoints Summary

| Method & Path | Required Role(s) | Description | Status | Error Codes |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/v1/encounters` | `ADMIN`, `DOCTOR`, `NURSE`, `BILLING_STAFF`, `PATIENT (self)` | List clinical encounters | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR` |
| `GET /api/v1/encounters/:id` | `ADMIN`, `DOCTOR`, `NURSE`, `PHARMACIST`, `LAB_TECHNICIAN`, `BILLING_STAFF`, `PATIENT (self)` | Get encounter details, vitals & notes | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONSENT_REQUIRED` |
| `POST /api/v1/encounters` | `DOCTOR`, `NURSE`, `ADMIN` | Start a new clinical encounter | `201` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `CONSENT_REQUIRED` |
| `PATCH /api/v1/encounters/:id` | `DOCTOR`, `NURSE` | Update vitals, triage level, or SOAP notes | `200` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE_TRANSITION` |
| `POST /api/v1/encounters/:id/sign` | `DOCTOR` | Digitally finalize and lock the encounter record | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE_TRANSITION` |
| `POST /api/v1/encounters/:id/amendments` | `DOCTOR` | Append a signed clinical addendum to a `SIGNED` encounter | `201` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE_TRANSITION` |

#### Schemas & Details

- **Query Filters (`GET /api/v1/encounters`):** `page`, `limit`, `sortBy` (`startedAt`, `createdAt`), `order`, `patientId`, `doctorId`, `department`, `status` (`OPEN|IN_PROGRESS|COMPLETED|SIGNED`), `encounterType` (`OUTPATIENT|INPATIENT|EMERGENCY|TELEHEALTH`), `from`, `to`.
- **`POST /api/v1/encounters` Request Body:**
  ```json
  {
    "patientId": "b7b1f19a-8a2c-4f21-b41e-6c991234abcd",
    "appointmentId": "apt-uuid-optional",
    "attendingDoctorId": "s-2222",
    "departmentId": "dept-cardiology-uuid",
    "encounterType": "OUTPATIENT",
    "chiefComplaint": "Intermittent chest tightness on exertion",
    "vitals": {
      "temperatureCelsius": 36.8,
      "bloodPressureSystolic": 128,
      "bloodPressureDiastolic": 82,
      "heartRateBpm": 76,
      "respiratoryRate": 16,
      "spo2Percent": 98,
      "weightKg": 64.5,
      "heightCm": 168
    },
    "clinicalNotes": {
      "subjective": "Patient reports symptoms over last 5 days.",
      "objective": "Normal S1/S2, no murmurs.",
      "assessment": "Suspected stable angina; rule out GERD.",
      "plan": "Order ECG, Lipid Panel, and Troponin-I."
    }
  }
  ```
- **Response (`200` / `201`):**
  ```json
  {
    "success": true,
    "message": "Encounter saved successfully",
    "data": {
      "id": "enc-3333",
      "encounterNumber": "ENC-2026-04112",
      "patientId": "b7b1f19a-8a2c-4f21-b41e-6c991234abcd",
      "appointmentId": "apt-uuid-optional",
      "attendingDoctorId": "s-2222",
      "departmentId": "dept-cardiology-uuid",
      "encounterType": "OUTPATIENT",
      "status": "IN_PROGRESS",
      "startedAt": "2026-11-26T10:00:00.000Z",
      "signedAt": null,
      "signedByStaffId": null
    },
    "meta": {}
  }
  ```
- **Error Scenarios:**
  - `403 CONSENT_REQUIRED`: Patient lacks active `TREATMENT` consent for the department/provider.
  - `409 CONFLICT`: `appointmentId` already linked to an existing encounter.
  - `422 INVALID_STATE_TRANSITION`: Modifying clinical fields directly on a `SIGNED` encounter (must use `/amendments`), or signing an encounter missing `chiefComplaint`/`assessment`.

---

### 3.7 Diagnoses (`/api/v1/diagnoses`)

ICD-10 / SNOMED-CT coded clinical diagnoses recorded within an encounter.

#### Endpoints Summary

| Method & Path | Required Role(s) | Description | Status | Error Codes |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/v1/diagnoses` | `ADMIN`, `DOCTOR`, `NURSE`, `BILLING_STAFF`, `PATIENT (self)` | List diagnoses (filterable by patient/encounter/ICD-10) | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR` |
| `GET /api/v1/diagnoses/:id` | `ADMIN`, `DOCTOR`, `NURSE`, `BILLING_STAFF`, `PATIENT (self)` | Get single diagnosis record | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND` |
| `POST /api/v1/diagnoses` | `DOCTOR` | Record a diagnosis on an active encounter | `201` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE_TRANSITION` |
| `PATCH /api/v1/diagnoses/:id` | `DOCTOR` | Update clinical status (`ACTIVE`, `RESOLVED`, `RULED_OUT`) or severity | `200` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE_TRANSITION` |
| `DELETE /api/v1/diagnoses/:id` | `DOCTOR`, `ADMIN` | Remove erroneous diagnosis from an unsigned encounter | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE_TRANSITION` |

#### Schemas & Details

- **Query Filters (`GET /api/v1/diagnoses`):** `page`, `limit`, `sortBy` (`diagnosedAt`, `icd10Code`), `order`, `patientId`, `encounterId`, `icd10Code`, `category` (`PRIMARY|SECONDARY|DIFFERENTIAL`), `clinicalStatus` (`ACTIVE|RECURRENCE|RESOLVED|RULED_OUT`).
- **`POST /api/v1/diagnoses` Request Body:**
  ```json
  {
    "encounterId": "enc-3333",
    "icd10Code": "I20.9",
    "snomedCode": "194828000",
    "description": "Angina pectoris, unspecified",
    "category": "PRIMARY",
    "severity": "MODERATE",
    "clinicalStatus": "ACTIVE",
    "onsetDate": "2026-11-21",
    "notes": "Requires stress test confirmation"
  }
  ```
- **Response (`200` / `201`):**
  ```json
  {
    "success": true,
    "message": "Diagnosis recorded successfully",
    "data": {
      "id": "diag-4100",
      "encounterId": "enc-3333",
      "patientId": "b7b1f19a-8a2c-4f21-b41e-6c991234abcd",
      "diagnosedByStaffId": "s-2222",
      "icd10Code": "I20.9",
      "snomedCode": "194828000",
      "description": "Angina pectoris, unspecified",
      "category": "PRIMARY",
      "severity": "MODERATE",
      "clinicalStatus": "ACTIVE",
      "diagnosedAt": "2026-11-26T10:25:00.000Z"
    },
    "meta": {}
  }
  ```
- **Error Scenarios:**
  - `400 VALIDATION_ERROR`: Malformed ICD-10 code format.
  - `422 INVALID_STATE_TRANSITION`: Adding/deleting diagnosis on a `SIGNED` encounter.

---

### 3.8 Prescriptions (`/api/v1/prescriptions`)

Medication orders, allergy/interaction warnings, pharmacy dispensing, and cancellation.

**Lifecycle:** `ACTIVE` -> `PARTIALLY_DISPENSED` -> `DISPENSED` | `EXPIRED` | `CANCELLED`.

#### Endpoints Summary

| Method & Path | Required Role(s) | Description | Status | Error Codes |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/v1/prescriptions` | `ADMIN`, `DOCTOR`, `NURSE`, `PHARMACIST`, `PATIENT (self)` | List prescriptions | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR` |
| `GET /api/v1/prescriptions/:id` | `ADMIN`, `DOCTOR`, `NURSE`, `PHARMACIST`, `PATIENT (self)` | Get prescription & dispensing history | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND` |
| `POST /api/v1/prescriptions` | `DOCTOR` | Issue new prescription (runs allergy check) | `201` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT` |
| `PATCH /api/v1/prescriptions/:id` | `DOCTOR` | Modify dosage/instructions prior to dispensing | `200` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE_TRANSITION` |
| `POST /api/v1/prescriptions/:id/dispense` | `PHARMACIST` | Record full or partial medication dispensing | `200` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE_TRANSITION` |
| `POST /api/v1/prescriptions/:id/cancel` | `DOCTOR`, `PHARMACIST`, `ADMIN` | Cancel an undispensed prescription | `200` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE_TRANSITION` |

#### Schemas & Details

- **Query Filters (`GET /api/v1/prescriptions`):** `page`, `limit`, `sortBy` (`prescribedAt`, `createdAt`), `order`, `patientId`, `doctorId`, `encounterId`, `status` (`ACTIVE|PARTIALLY_DISPENSED|DISPENSED|CANCELLED|EXPIRED`), `from`, `to`.
- **`POST /api/v1/prescriptions` Request Body:**
  ```json
  {
    "encounterId": "enc-3333",
    "patientId": "b7b1f19a-8a2c-4f21-b41e-6c991234abcd",
    "validUntil": "2026-12-26",
    "overrideAllergyWarning": false,
    "items": [
      {
        "medicationCode": "RXNORM-1191",
        "medicationName": "Aspirin 81mg Chewable Tablet",
        "dosage": "81 mg",
        "route": "ORAL",
        "frequency": "ONCE_DAILY",
        "durationDays": 30,
        "quantity": 30,
        "refillsAllowed": 2,
        "instructions": "Take with food in the morning"
      }
    ]
  }
  ```
- **`POST /api/v1/prescriptions/:id/dispense` Request Body:**
  ```json
  {
    "dispensedItems": [
      {
        "prescriptionItemId": "pi-4444",
        "quantityDispensed": 30,
        "lotNumber": "LOT-2026-A9",
        "expiryDate": "2028-04-30"
      }
    ],
    "counselingNotes": "Patient counseled on GI bleeding signs"
  }
  ```
- **Response (`200` / `201`):**
  ```json
  {
    "success": true,
    "message": "Prescription retrieved successfully",
    "data": {
      "id": "rx-7001",
      "prescriptionNumber": "RX-2026-18402",
      "encounterId": "enc-3333",
      "patientId": "b7b1f19a-8a2c-4f21-b41e-6c991234abcd",
      "prescriberId": "s-2222",
      "status": "ACTIVE",
      "validUntil": "2026-12-26",
      "items": [
        {
          "id": "pi-4444",
          "medicationCode": "RXNORM-1191",
          "medicationName": "Aspirin 81mg Chewable Tablet",
          "quantity": 30,
          "quantityDispensed": 0
        }
      ],
      "prescribedAt": "2026-11-26T10:30:00.000Z"
    },
    "meta": {}
  }
  ```
- **Error Scenarios:**
  - `409 CONFLICT`: Patient has a documented allergy matching `medicationCode` and `overrideAllergyWarning` is `false`.
  - `422 INVALID_STATE_TRANSITION`: Dispensing an `EXPIRED` or `CANCELLED` prescription, or modifying a `DISPENSED` prescription.

---

### 3.9 Laboratories (`/api/v1/laboratories`)

Manages internal/external diagnostic laboratory facilities and test catalogs (LOINC codes, specimen types, reference ranges, turnaround times).

#### Endpoints Summary

| Method & Path | Required Role(s) | Description | Status | Error Codes |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/v1/laboratories` | Any Authenticated | List configured laboratories | `200` | `UNAUTHORIZED`, `VALIDATION_ERROR` |
| `GET /api/v1/laboratories/:id` | Any Authenticated | Get laboratory details & test catalog | `200` | `UNAUTHORIZED`, `NOT_FOUND` |
| `POST /api/v1/laboratories` | `ADMIN` | Register a new laboratory | `201` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT` |
| `PATCH /api/v1/laboratories/:id` | `ADMIN`, `LAB_TECHNICIAN` | Update lab metadata, contact, or status | `200` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND` |
| `GET /api/v1/laboratories/:id/tests` | Any Authenticated | List available lab tests offered by the lab | `200` | `UNAUTHORIZED`, `NOT_FOUND` |
| `POST /api/v1/laboratories/:id/tests` | `ADMIN`, `LAB_TECHNICIAN` | Add a diagnostic test definition to lab catalog | `201` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT` |

#### Schemas & Details

- **Query Filters (`GET /api/v1/laboratories`):** `page`, `limit`, `sortBy` (`name`, `createdAt`), `order`, `type` (`INTERNAL|EXTERNAL_PARTNER`), `status` (`ACTIVE|INACTIVE`), `search`.
- **`POST /api/v1/laboratories` Request Body:**
  ```json
  {
    "code": "LAB-CORE-01",
    "name": "MediCore Central Pathology Lab",
    "type": "INTERNAL",
    "accreditationNumber": "CAP-902104",
    "phone": "+14155550200",
    "email": "pathology@medicore.org",
    "location": "2nd Floor, North Wing",
    "operatingHours": "24/7",
    "status": "ACTIVE"
  }
  ```
- **`POST /api/v1/laboratories/:id/tests` Request Body:**
  ```json
  {
    "loincCode": "2093-3",
    "testCode": "LIPID-PANEL",
    "name": "Comprehensive Lipid Panel",
    "specimenType": "SERUM",
    "turnaroundHours": 6,
    "priceCents": 6500,
    "referenceRange": { "unit": "mg/dL", "min": 0, "max": 200 }
  }
  ```
- **Response (`200` / `201`):**
  ```json
  {
    "success": true,
    "message": "Laboratory retrieved successfully",
    "data": {
      "id": "lab-core-uuid",
      "code": "LAB-CORE-01",
      "name": "MediCore Central Pathology Lab",
      "type": "INTERNAL",
      "accreditationNumber": "CAP-902104",
      "status": "ACTIVE",
      "testCount": 48
    },
    "meta": {}
  }
  ```
- **Error Scenarios:**
  - `409 CONFLICT`: Duplicate lab `code` or duplicate `loincCode`/`testCode` within the same lab.

---

### 3.10 Lab Orders (`/api/v1/lab-orders`)

Diagnostic test requisitions created by clinicians, tracked through specimen collection and lab processing.

**Lifecycle:** `ORDERED` -> `SPECIMEN_COLLECTED` -> `IN_PROGRESS` -> `COMPLETED` | `CANCELLED`.

#### Endpoints Summary

| Method & Path | Required Role(s) | Description | Status | Error Codes |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/v1/lab-orders` | `ADMIN`, `DOCTOR`, `NURSE`, `LAB_TECHNICIAN`, `PATIENT (self)` | List lab orders | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR` |
| `GET /api/v1/lab-orders/:id` | `ADMIN`, `DOCTOR`, `NURSE`, `LAB_TECHNICIAN`, `PATIENT (self)` | Get lab order details & specimen status | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND` |
| `POST /api/v1/lab-orders` | `DOCTOR`, `NURSE` | Create a diagnostic lab order | `201` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND` |
| `POST /api/v1/lab-orders/:id/collect` | `NURSE`, `LAB_TECHNICIAN` | Record specimen collection & barcode | `200` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE_TRANSITION` |
| `PATCH /api/v1/lab-orders/:id/status` | `LAB_TECHNICIAN`, `DOCTOR`, `ADMIN` | Transition lab order status (`IN_PROGRESS`, `CANCELLED`) | `200` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE_TRANSITION` |

#### Schemas & Details

- **Query Filters (`GET /api/v1/lab-orders`):** `page`, `limit`, `sortBy` (`orderedAt`, `priority`), `order`, `patientId`, `encounterId`, `laboratoryId`, `status` (`ORDERED|SPECIMEN_COLLECTED|IN_PROGRESS|COMPLETED|CANCELLED`), `priority` (`ROUTINE|URGENT|STAT`), `from`, `to`.
- **`POST /api/v1/lab-orders` Request Body:**
  ```json
  {
    "encounterId": "enc-3333",
    "patientId": "b7b1f19a-8a2c-4f21-b41e-6c991234abcd",
    "laboratoryId": "lab-core-uuid",
    "priority": "URGENT",
    "fastingRequired": true,
    "clinicalIndication": "Evaluate chest tightness and cardiac risk",
    "testIds": ["test-lipid-uuid", "test-troponin-uuid"]
  }
  ```
- **`POST /api/v1/lab-orders/:id/collect` Request Body:**
  ```json
  {
    "specimenBarcode": "SPC-20261126-0084",
    "collectedAt": "2026-11-26T10:15:00.000Z",
    "specimenCondition": "ACCEPTABLE",
    "notes": "Venipuncture left antecubital"
  }
  ```
- **Response (`200` / `201`):**
  ```json
  {
    "success": true,
    "message": "Lab order created successfully",
    "data": {
      "id": "lo-5555",
      "orderNumber": "LAB-2026-03219",
      "encounterId": "enc-3333",
      "patientId": "b7b1f19a-8a2c-4f21-b41e-6c991234abcd",
      "laboratoryId": "lab-core-uuid",
      "orderedByStaffId": "s-2222",
      "priority": "URGENT",
      "status": "ORDERED",
      "specimenBarcode": null,
      "orderedAt": "2026-11-26T10:10:00.000Z"
    },
    "meta": {}
  }
  ```
- **Error Scenarios:**
  - `404 NOT_FOUND`: Invalid `laboratoryId`, `patientId`, or `testIds`.
  - `422 INVALID_STATE_TRANSITION`: Collecting specimen on a `CANCELLED` or `COMPLETED` order, or cancelling an already `COMPLETED` order.

---

### 3.11 Lab Results (`/api/v1/lab-results`)

Structured diagnostic test results, abnormal/critical flags, pathologist verification, and patient release.

**Lifecycle:** `PRELIMINARY` -> `FINAL` (verified) -> `AMENDED`.

#### Endpoints Summary

| Method & Path | Required Role(s) | Description | Status | Error Codes |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/v1/lab-results` | `ADMIN`, `DOCTOR`, `NURSE`, `LAB_TECHNICIAN`, `PATIENT (self - FINAL/AMENDED only)` | List lab results | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR` |
| `GET /api/v1/lab-results/:id` | `ADMIN`, `DOCTOR`, `NURSE`, `LAB_TECHNICIAN`, `PATIENT (self - FINAL/AMENDED only)` | Get detailed lab result & analytes | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONSENT_REQUIRED` |
| `POST /api/v1/lab-results` | `LAB_TECHNICIAN`, `DOCTOR` | Submit lab result values for a lab order | `201` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE_TRANSITION` |
| `PATCH /api/v1/lab-results/:id` | `LAB_TECHNICIAN`, `DOCTOR` | Update `PRELIMINARY` result before verification | `200` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE_TRANSITION` |
| `POST /api/v1/lab-results/:id/verify` | `LAB_TECHNICIAN` (Senior), `DOCTOR` | Verify and finalize result (`FINAL`) and notify clinician/patient | `200` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE_TRANSITION` |

#### Schemas & Details

- **Query Filters (`GET /api/v1/lab-results`):** `page`, `limit`, `sortBy` (`reportedAt`, `createdAt`), `order`, `patientId`, `labOrderId`, `status` (`PRELIMINARY|FINAL|AMENDED`), `abnormalFlag` (`NORMAL|LOW|HIGH|CRITICAL_LOW|CRITICAL_HIGH`), `from`, `to`.
- **`POST /api/v1/lab-results` Request Body:**
  ```json
  {
    "labOrderId": "lo-5555",
    "labTestId": "test-troponin-uuid",
    "status": "PRELIMINARY",
    "analytes": [
      {
        "code": "10839-9",
        "name": "Troponin I, Cardiac",
        "value": "0.01",
        "unit": "ng/mL",
        "referenceMin": 0.0,
        "referenceMax": 0.04,
        "abnormalFlag": "NORMAL"
      }
    ],
    "interpretation": "Within normal limits",
    "criticalValueNotified": false
  }
  ```
- **Response (`200` / `201`):**
  ```json
  {
    "success": true,
    "message": "Lab result verified successfully",
    "data": {
      "id": "lr-6100",
      "labOrderId": "lo-5555",
      "labTestId": "test-troponin-uuid",
      "patientId": "b7b1f19a-8a2c-4f21-b41e-6c991234abcd",
      "status": "FINAL",
      "analytes": [
        {
          "code": "10839-9",
          "name": "Troponin I, Cardiac",
          "value": "0.01",
          "unit": "ng/mL",
          "referenceMin": 0.0,
          "referenceMax": 0.04,
          "abnormalFlag": "NORMAL"
        }
      ],
      "verifiedByStaffId": "s-3301",
      "reportedAt": "2026-11-26T11:20:00.000Z"
    },
    "meta": {}
  }
  ```
- **Error Scenarios:**
  - `403 FORBIDDEN`: Patient attempting to view an unverified `PRELIMINARY` result.
  - `422 INVALID_STATE_TRANSITION`: Submitting results for an order whose status is still `ORDERED` (specimen not yet collected) or editing a `FINAL` result without issuing an amendment.

---

### 3.12 Billing & Invoices (`/api/v1/billing/invoices`)

Itemized hospital billing for consultations, procedures, prescriptions, and laboratory orders.

**Lifecycle:** `DRAFT` -> `ISSUED` -> `PARTIALLY_PAID` -> `PAID` | `OVERDUE` | `VOID`.

#### Endpoints Summary

| Method & Path | Required Role(s) | Description | Status | Error Codes |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/v1/billing/invoices` | `ADMIN`, `BILLING_STAFF`, `RECEPTIONIST`, `PATIENT (self)` | List invoices | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR` |
| `GET /api/v1/billing/invoices/:id` | `ADMIN`, `BILLING_STAFF`, `RECEPTIONIST`, `PATIENT (self)` | Get itemized invoice & payment ledger | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND` |
| `POST /api/v1/billing/invoices` | `ADMIN`, `BILLING_STAFF` | Create a new draft or issued invoice | `201` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND` |
| `PATCH /api/v1/billing/invoices/:id` | `ADMIN`, `BILLING_STAFF` | Adjust line items, discounts, or tax on `DRAFT` invoice | `200` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE_TRANSITION` |
| `POST /api/v1/billing/invoices/:id/issue` | `ADMIN`, `BILLING_STAFF` | Finalize and issue invoice to patient | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE_TRANSITION` |
| `POST /api/v1/billing/invoices/:id/void` | `ADMIN`, `BILLING_STAFF` | Void an unpaid invoice with audit reason | `200` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE_TRANSITION` |

#### Schemas & Details

- **Query Filters (`GET /api/v1/billing/invoices`):** `page`, `limit`, `sortBy` (`issuedAt`, `dueDate`, `totalCents`, `createdAt`), `order`, `patientId`, `encounterId`, `status` (`DRAFT|ISSUED|PARTIALLY_PAID|PAID|OVERDUE|VOID`), `from`, `to`.
- **`POST /api/v1/billing/invoices` Request Body:**
  ```json
  {
    "patientId": "b7b1f19a-8a2c-4f21-b41e-6c991234abcd",
    "encounterId": "enc-3333",
    "currency": "USD",
    "dueDate": "2026-12-26",
    "issueImmediately": true,
    "insuranceCoverageCents": 15000,
    "items": [
      {
        "category": "CONSULTATION",
        "referenceId": "apt-uuid",
        "description": "Cardiology Outpatient Consultation",
        "quantity": 1,
        "unitPriceCents": 20000,
        "taxRatePercent": 0
      },
      {
        "category": "LAB_TEST",
        "referenceId": "lo-5555",
        "description": "Comprehensive Lipid Panel",
        "quantity": 1,
        "unitPriceCents": 6500,
        "taxRatePercent": 0
      }
    ]
  }
  ```
- **Response (`200` / `201`):**
  ```json
  {
    "success": true,
    "message": "Invoice created successfully",
    "data": {
      "id": "inv-6666",
      "invoiceNumber": "INV-2026-00412",
      "patientId": "b7b1f19a-8a2c-4f21-b41e-6c991234abcd",
      "encounterId": "enc-3333",
      "currency": "USD",
      "status": "ISSUED",
      "subtotalCents": 26500,
      "taxCents": 0,
      "discountCents": 0,
      "insuranceCoverageCents": 15000,
      "totalCents": 11500,
      "amountPaidCents": 0,
      "balanceDueCents": 11500,
      "dueDate": "2026-12-26",
      "issuedAt": "2026-11-26T11:30:00.000Z"
    },
    "meta": {}
  }
  ```
- **Error Scenarios:**
  - `422 INVALID_STATE_TRANSITION`: Editing line items after `ISSUED`, or voiding a `PAID`/`PARTIALLY_PAID` invoice (requires refund first).

---

### 3.13 Payments (`/api/v1/payments`)

Records invoice payments (card, cash, insurance claim settlement, bank transfer) and refunds with idempotency support.

#### Endpoints Summary

| Method & Path | Required Role(s) | Description | Status | Error Codes |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/v1/payments` | `ADMIN`, `BILLING_STAFF`, `PATIENT (self)` | List payment transactions | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR` |
| `GET /api/v1/payments/:id` | `ADMIN`, `BILLING_STAFF`, `PATIENT (self)` | Get payment receipt & transaction details | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND` |
| `POST /api/v1/payments` | `ADMIN`, `BILLING_STAFF`, `RECEPTIONIST`, `PATIENT (self)` | Record/process a payment against an invoice | `201` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INVALID_STATE_TRANSITION`, `PAYMENT_FAILED` |
| `POST /api/v1/payments/:id/refund` | `ADMIN`, `BILLING_STAFF` | Issue full or partial refund for a settled payment | `201` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE_TRANSITION`, `PAYMENT_FAILED` |

#### Schemas & Details

- **Query Filters (`GET /api/v1/payments`):** `page`, `limit`, `sortBy` (`paidAt`, `createdAt`, `amountCents`), `order`, `invoiceId`, `patientId`, `method` (`CARD|CASH|BANK_TRANSFER|INSURANCE`), `status` (`PENDING|SUCCEEDED|FAILED|REFUNDED|PARTIALLY_REFUNDED`), `from`, `to`.
- **`POST /api/v1/payments` Headers & Request Body:**
  - Optional Header: `Idempotency-Key: <uuid>` (prevents duplicate charges on network retries; replays cached `201` response within 24h).
  ```json
  {
    "invoiceId": "inv-6666",
    "amountCents": 11500,
    "currency": "USD",
    "method": "CARD",
    "externalTransactionRef": "ch_3Q9xYz2eZvKYlo2C0123",
    "notes": "Patient co-pay settlement"
  }
  ```
- **`POST /api/v1/payments/:id/refund` Request Body:**
  ```json
  {
    "amountCents": 5000,
    "reason": "Billing adjustment for duplicate lab charge"
  }
  ```
- **Response (`200` / `201`):**
  ```json
  {
    "success": true,
    "message": "Payment processed successfully",
    "data": {
      "id": "pay-7200",
      "receiptNumber": "RCP-2026-00891",
      "invoiceId": "inv-6666",
      "patientId": "b7b1f19a-8a2c-4f21-b41e-6c991234abcd",
      "amountCents": 11500,
      "currency": "USD",
      "method": "CARD",
      "status": "SUCCEEDED",
      "paidAt": "2026-11-26T11:35:00.000Z"
    },
    "meta": {}
  }
  ```
- **Error Scenarios:**
  - `400 VALIDATION_ERROR`: `amountCents <= 0`, currency mismatch, or `amountCents > invoice.balanceDueCents`.
  - `402 PAYMENT_REQUIRED` (`PAYMENT_FAILED`): External payment processor declined transaction.
  - `409 CONFLICT`: Idempotency key reused with a different request payload.
  - `422 INVALID_STATE_TRANSITION`: Paying a `DRAFT`, `VOID`, or already `PAID` invoice, or refunding more than remaining settled amount.

---

### 3.14 Consents (`/api/v1/consents`)

Patient HIPAA/GDPR consent records governing treatment, telehealth, data sharing, research, and external FHIR exchange. Protected clinical endpoints verify active consent and return `403 CONSENT_REQUIRED` when absent or revoked.

**Lifecycle:** `PENDING` -> `GRANTED` -> `REVOKED` | `EXPIRED`.

#### Endpoints Summary

| Method & Path | Required Role(s) | Description | Status | Error Codes |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/v1/consents` | `ADMIN`, `DOCTOR`, `NURSE`, `PATIENT (self)` | List consent records | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR` |
| `GET /api/v1/consents/:id` | `ADMIN`, `DOCTOR`, `NURSE`, `PATIENT (self)` | Get consent record & signed metadata | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND` |
| `POST /api/v1/consents` | `ADMIN`, `DOCTOR`, `NURSE`, `RECEPTIONIST`, `PATIENT (self)` | Grant or record a patient consent | `201` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT` |
| `POST /api/v1/consents/:id/revoke` | `ADMIN`, `PATIENT (self)` | Revoke an active consent | `200` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE_TRANSITION` |

#### Schemas & Details

- **Query Filters (`GET /api/v1/consents`):** `page`, `limit`, `sortBy` (`grantedAt`, `createdAt`), `order`, `patientId`, `consentType` (`TREATMENT|DATA_SHARING|TELEHEALTH|FHIR_EXCHANGE|RESEARCH|MARKETING`), `status` (`PENDING|GRANTED|REVOKED|EXPIRED`).
- **`POST /api/v1/consents` Request Body:**
  ```json
  {
    "patientId": "b7b1f19a-8a2c-4f21-b41e-6c991234abcd",
    "consentType": "FHIR_EXCHANGE",
    "scope": ["Patient", "Encounter", "DiagnosticReport", "MedicationRequest"],
    "policyVersion": "v2.1",
    "expiresAt": "2027-11-26T00:00:00.000Z",
    "signatureMethod": "ELECTRONIC_PORTAL",
    "witnessStaffId": null
  }
  ```
- **`POST /api/v1/consents/:id/revoke` Request Body:**
  ```json
  {
    "reason": "Patient opted out of external FHIR data sharing"
  }
  ```
- **Response (`200` / `201`):**
  ```json
  {
    "success": true,
    "message": "Consent recorded successfully",
    "data": {
      "id": "con-8100",
      "patientId": "b7b1f19a-8a2c-4f21-b41e-6c991234abcd",
      "consentType": "FHIR_EXCHANGE",
      "scope": ["Patient", "Encounter", "DiagnosticReport", "MedicationRequest"],
      "policyVersion": "v2.1",
      "status": "GRANTED",
      "grantedAt": "2026-11-26T09:40:00.000Z",
      "expiresAt": "2027-11-26T00:00:00.000Z",
      "revokedAt": null
    },
    "meta": {}
  }
  ```
- **Error Scenarios:**
  - `422 INVALID_STATE_TRANSITION`: Revoking an already `REVOKED` or `EXPIRED` consent.

---

### 3.15 Audit Logs (`/api/v1/audit-logs`)

Immutable, append-only compliance ledger recording every PHI read, mutation, authentication event, consent change, and FHIR export. **Write/delete HTTP endpoints are intentionally omitted** to guarantee tamper resistance.

#### Endpoints Summary

| Method & Path | Required Role(s) | Description | Status | Error Codes |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/v1/audit-logs` | `ADMIN` | Query & filter audit trail | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR` |
| `GET /api/v1/audit-logs/:id` | `ADMIN` | Get single audit log event with diff metadata | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND` |
| `GET /api/v1/audit-logs/export` | `ADMIN` | Stream/export compliance audit logs as CSV or NDJSON | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR` |

#### Schemas & Details

- **Query Filters (`GET /api/v1/audit-logs`):** `page`, `limit`, `sortBy` (`occurredAt`), `order`, `actorUserId`, `action` (`CREATE|READ|UPDATE|DELETE|LOGIN|LOGOUT|EXPORT|CONSENT_CHANGE`), `resourceType` (`PATIENT|ENCOUNTER|PRESCRIPTION|LAB_RESULT|INVOICE|USER|FHIR`), `resourceId`, `patientId`, `requestId`, `from`, `to`.
- **Response Schema (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Audit log retrieved successfully",
    "data": {
      "id": "aud-9999",
      "occurredAt": "2026-11-26T09:46:12.104Z",
      "requestId": "c1f3d9a2-7e10-4a8e-9b11-1d2e3f4a5b6c",
      "actorUserId": "u-2222",
      "actorRole": "DOCTOR",
      "action": "UPDATE",
      "resourceType": "ENCOUNTER",
      "resourceId": "enc-3333",
      "patientId": "b7b1f19a-8a2c-4f21-b41e-6c991234abcd",
      "ipAddress": "10.0.4.21",
      "userAgent": "Mozilla/5.0 ...",
      "outcome": "SUCCESS",
      "changedFields": ["clinicalNotes.assessment", "status"]
    },
    "meta": {}
  }
  ```
- **Error Scenarios:**
  - `400 VALIDATION_ERROR`: Export date range exceeds maximum 90-day window.
  - `403 FORBIDDEN`: Any non-`ADMIN` role attempting to read or export audit logs.

---

### 3.16 Notifications (`/api/v1/notifications`)

In-app alerts, appointment reminders, lab result alerts, and billing notices dispatched asynchronously via BullMQ workers (Email/SMS/In-App).

#### Endpoints Summary

| Method & Path | Required Role(s) | Description | Status | Error Codes |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/v1/notifications` | Any Authenticated (`Self` scoped; `ADMIN` can filter all) | List notifications for current user | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR` |
| `GET /api/v1/notifications/:id` | `Self`, `ADMIN` | Get single notification | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND` |
| `POST /api/v1/notifications` | `ADMIN`, `DOCTOR`, `NURSE`, `RECEPTIONIST` | Enqueue an ad-hoc notification job | `202` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND` |
| `PATCH /api/v1/notifications/:id/read` | `Self` | Mark notification as read | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND` |
| `POST /api/v1/notifications/read-all` | `Self` | Mark all unread notifications as read | `200` | `UNAUTHORIZED` |

#### Schemas & Details

- **Query Filters (`GET /api/v1/notifications`):** `page`, `limit`, `sortBy` (`createdAt`), `order`, `channel` (`IN_APP|EMAIL|SMS`), `status` (`QUEUED|SENT|DELIVERED|FAILED|READ`), `category` (`APPOINTMENT|LAB_RESULT|BILLING|SYSTEM`), `unreadOnly` (`true|false`).
- **`POST /api/v1/notifications` Request Body:**
  ```json
  {
    "recipientUserId": "a1b2c3d4-0000-4000-8000-000000000001",
    "channels": ["IN_APP", "EMAIL"],
    "category": "APPOINTMENT",
    "title": "Appointment Reminder",
    "message": "You have an appointment with Dr. Chen tomorrow at 10:00 AM.",
    "metadata": { "appointmentId": "apt-uuid" }
  }
  ```
- **Response (`202 Accepted`):**
  ```json
  {
    "success": true,
    "message": "Notification queued for delivery",
    "data": {
      "id": "notif-8888",
      "jobId": "bullmq:notifications:10492",
      "status": "QUEUED",
      "channels": ["IN_APP", "EMAIL"]
    },
    "meta": {}
  }
  ```

---

### 3.17 FHIR Interoperability (`/api/v1/fhir`)

HL7 FHIR R4 interoperability bridge connecting MediCore with external EHR/HIE systems (`FHIR_BASE_URL`), enforcing `FHIR_EXCHANGE` consent and executing async syncs via BullMQ with configured timeout (`30000ms`) and retries (`3`).

#### Endpoints Summary

| Method & Path | Required Role(s) | Description | Status | Error Codes |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/v1/fhir/metadata` | `ADMIN`, `DOCTOR`, `LAB_TECHNICIAN` | Return MediCore FHIR R4 CapabilityStatement | `200` | `UNAUTHORIZED`, `FORBIDDEN` |
| `GET /api/v1/fhir/patients/:patientId/export` | `ADMIN`, `DOCTOR`, `PATIENT (self)` | Export patient record as a FHIR R4 `Bundle` | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONSENT_REQUIRED` |
| `POST /api/v1/fhir/sync/patients/:patientId` | `ADMIN`, `DOCTOR` | Queue outbound/inbound FHIR sync job for a patient | `202` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONSENT_REQUIRED`, `FHIR_SYNC_ERROR` |
| `POST /api/v1/fhir/import` | `ADMIN`, `DOCTOR` | Import a validated FHIR R4 `Bundle` (`Patient`, `Condition`, `Observation`, `MedicationRequest`) | `200` | `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `CONSENT_REQUIRED`, `FHIR_SYNC_ERROR` |
| `GET /api/v1/fhir/sync-jobs/:jobId` | `ADMIN`, `DOCTOR` | Check status of an asynchronous FHIR sync job | `200` | `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND` |

#### Schemas & Details

- **Supported FHIR R4 Resources:** `Patient`, `Practitioner`, `Encounter`, `Condition` (Diagnoses), `MedicationRequest` (Prescriptions), `DiagnosticReport` & `Observation` (Lab Results), `Consent`.
- **`POST /api/v1/fhir/sync/patients/:patientId` Request Body:**
  ```json
  {
    "direction": "BIDIRECTIONAL",
    "resources": ["Patient", "Encounter", "DiagnosticReport", "MedicationRequest"],
    "externalSystemId": "hie-national-gateway"
  }
  ```
- **Sync Response (`202 Accepted`):**
  ```json
  {
    "success": true,
    "message": "FHIR synchronization job queued",
    "data": {
      "jobId": "fhir-sync-7712",
      "patientId": "b7b1f19a-8a2c-4f21-b41e-6c991234abcd",
      "status": "QUEUED",
      "direction": "BIDIRECTIONAL"
    },
    "meta": {}
  }
  ```
- **Export Response (`200 OK`):** Returns `{ success: true, message: "...", data: { resourceType: "Bundle", type: "collection", entry: [...] }, meta: {} }` (or raw `application/fhir+json` when `Accept: application/fhir+json` is specified).
- **Error Scenarios:**
  - `403 CONSENT_REQUIRED`: Patient has not granted or has revoked `FHIR_EXCHANGE` consent.
  - `502 BAD_GATEWAY` / `504 GATEWAY_TIMEOUT` (`FHIR_SYNC_ERROR`): Upstream FHIR server unreachable, rejected payload, or exceeded `FHIR_TIMEOUT_MS` (`30000ms`).

---

## 4. Health Endpoints

Health endpoints are unauthenticated, exempt from global rate limiting, and used by Docker health checks, Nginx upstreams, and monitoring probes.

| Method & Path | Alias | Auth | Purpose | Status Codes |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/v1/health` | `GET /health` | Public | **Liveness probe** — confirms Express process is alive and responsive | `200 OK` |
| `GET /api/v1/ready` | `GET /ready` | Public | **Readiness probe** — verifies PostgreSQL, Redis, and BullMQ worker queue connectivity | `200 OK`, `503 SERVICE_UNAVAILABLE` |

### `GET /api/v1/health` Response (`200 OK`)

```json
{
  "success": true,
  "message": "Service is healthy",
  "data": {
    "status": "UP",
    "service": "medicore-api",
    "version": "1.0.0",
    "uptimeSeconds": 14820,
    "timestamp": "2026-11-26T09:46:12.104Z"
  },
  "meta": {}
}
```

### `GET /api/v1/ready` Response (`200 OK` / `503 Service Unavailable`)

```json
{
  "success": true,
  "message": "All dependencies ready",
  "data": {
    "status": "READY",
    "checks": {
      "postgres": { "status": "UP", "latencyMs": 3 },
      "redis": { "status": "UP", "latencyMs": 1 },
      "bullmq": { "status": "UP" },
      "fhirGateway": { "status": "DEGRADED", "optional": true }
    }
  },
  "meta": {}
}
```

> If `postgres` or `redis` fails connectivity within a `2000ms` check timeout, `/ready` returns `503 Service Unavailable` with `error.code = "SERVICE_UNAVAILABLE"`.

---

## 5. Rate Limiting Strategy

MediCore implements a **two-layer rate limiting architecture** combining **Nginx edge limits** (protection against volumetric floods) and **application-level Redis-backed `express-rate-limit`** (accurate distributed sliding/fixed-window enforcement across API replicas).

### 5.1 Rate Limit Tiers

| Tier | Applies To | Key Strategy | Window | Max Requests | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Global Default** | All `/api/v1/*` routes | `userId` (if authenticated) else Client IP | `15 min` (`900000ms`) | `100` (default from `.env`) | Baseline protection per `RATE_LIMIT_WINDOW_MS` & `RATE_LIMIT_MAX_REQUESTS`. |
| **Auth Strict** | `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password` | Client IP + normalized `email` | `15 min` | `10` | Mitigates credential stuffing, brute force, and email spam. |
| **Token Refresh** | `/auth/refresh-token` | Client IP + `userId` | `15 min` | `30` | Allows normal multi-tab token refreshes while blocking abuse. |
| **Clinical / Staff High-Throughput** | Authenticated `DOCTOR`, `NURSE`, `LAB_TECHNICIAN`, `RECEPTIONIST`, `PHARMACIST`, `ADMIN` | `userId` | `15 min` | `1,000` | Supports active hospital workstation & dashboard polling. |
| **Heavy / Export / FHIR** | `/audit-logs/export`, `/fhir/sync/*`, `/fhir/import`, `/fhir/patients/*/export` | `userId` | `15 min` | `20` | Protects database and external FHIR gateway from bulk spikes. |
| **Payments** | `POST /payments`, `POST /payments/*/refund` | `userId` + Client IP | `1 min` | `10` | Prevents rapid payment retry storms alongside `Idempotency-Key`. |
| **Exemptions** | `GET /health`, `GET /ready` | — | — | Unlimited | Never rate-limited so orchestration probes never fail falsely. |

### 5.2 Standard Rate Limit Headers & `429` Response

Every rate-limited response includes standard `draft-7` IETF headers:
- `RateLimit-Limit`: Maximum requests allowed in the current window.
- `RateLimit-Remaining`: Remaining requests in the current window.
- `RateLimit-Reset`: Seconds until the current window resets.
- `Retry-After`: Present on `429` responses indicating wait time in seconds.

**`429 Too Many Requests` Payload:**

```json
{
  "success": false,
  "message": "Too many requests. Please retry after 42 seconds.",
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "details": [
      {
        "tier": "AUTH_STRICT",
        "limit": 10,
        "windowSeconds": 900,
        "retryAfterSeconds": 42
      }
    ]
  },
  "requestId": "c1f3d9a2-7e10-4a8e-9b11-1d2e3f4a5b6c"
}
```

---

## 6. Error Codes Reference

All error responses use the standard error envelope (`success: false`) with one of the canonical `error.code` values below:

| Error Code | HTTP Status | Category | Description & Trigger Condition |
| :--- | :--- | :--- | :--- |
| `VALIDATION_ERROR` | `400 Bad Request` | Input | Zod schema validation failed for request body, query params, or path UUIDs; includes per-field `details[]`. |
| `BAD_REQUEST` | `400 Bad Request` | Input | Malformed JSON payload, unsupported `Content-Type`, or invalid query combination. |
| `UNAUTHORIZED` | `401 Unauthorized` | Auth | Missing `Authorization` header, invalid credentials on login, or revoked session. |
| `TOKEN_EXPIRED` | `401 Unauthorized` | Auth | JWT access token, refresh token, or password-reset token has expired. |
| `TOKEN_INVALID` | `401 Unauthorized` | Auth | Malformed signature, unrecognized token, or detected refresh-token reuse. |
| `PAYMENT_FAILED` | `402 Payment Required` | Billing | Upstream payment gateway declined the charge or refund operation. |
| `FORBIDDEN` | `403 Forbidden` | Authorization | Authenticated user's role or ownership (`self`) lacks permission for the requested action. |
| `CONSENT_REQUIRED` | `403 Forbidden` | Compliance | Patient has not granted or has revoked required consent (`TREATMENT`, `DATA_SHARING`, or `FHIR_EXCHANGE`). |
| `NOT_FOUND` | `404 Not Found` | Resource | Target resource ID or route does not exist (or is outside tenant/soft-delete visibility). |
| `CONFLICT` | `409 Conflict` | Integrity | Unique constraint violation (duplicate email, MRN, license, department code), allergy override not confirmed, or idempotency key payload mismatch. |
| `APPOINTMENT_CONFLICT` | `409 Conflict` | Scheduling | Requested appointment time overlaps an existing booking, falls outside provider working hours/breaks, or double-books patient/provider. |
| `PAYLOAD_TOO_LARGE` | `413 Payload Too Large` | Transport | Request body exceeds `MAX_REQUEST_SIZE` (`10mb`). |
| `INVALID_STATE_TRANSITION` | `422 Unprocessable Entity` | Workflow | Operation violates entity lifecycle rules (e.g., editing a `SIGNED` encounter, cancelling a `COMPLETED` appointment, voiding a `PAID` invoice). |
| `ACCOUNT_LOCKED` | `423 Locked` | Security | Account temporarily locked due to excessive failed login attempts or administrative suspension. |
| `RATE_LIMIT_EXCEEDED` | `429 Too Many Requests` | Traffic | Client exceeded the configured rate limit tier; inspect `Retry-After` header. |
| `INTERNAL_SERVER_ERROR` | `500 Internal Server Error` | Server | Unhandled exception or unexpected database failure (stack traces never exposed in production; logged with `requestId`). |
| `FHIR_SYNC_ERROR` | `502 Bad Gateway` | Integration | Upstream HL7 FHIR server returned an error, invalid Bundle, or timed out (`FHIR_TIMEOUT_MS`). |
| `SERVICE_UNAVAILABLE` | `503 Service Unavailable` | Availability | Readiness dependency (`PostgreSQL` or `Redis`) is unreachable or service is gracefully shutting down. |
