# MediCore Incident Response Plan

## Overview
This document describes incident simulation scenarios, reproduction steps, corrective actions, and prevention measures for MediCore hospital management platform.

---

## Incident 1: Unauthorized Clinical Record Access

### Description
A patient attempts to access another patient's medical records by modifying the patient ID in API requests (IDOR vulnerability).

### Reproduction Steps
1. Login as `patient1@medicore.local`
2. Note your patient ID from the profile response
3. Attempt to access another patient's records: `GET /api/v1/patients/{other-patient-id}`
4. Attempt to access their encounters: `GET /api/v1/encounters?patientId={other-patient-id}`

### Expected Result
- API returns `403 Forbidden` with message "Access denied"
- Audit log records the unauthorized access attempt

### Root Cause
Without resource-level authorization, the API would return any patient's data to any authenticated user.

### Corrective Action
- Implemented resource-level authorization middleware
- Patient endpoints verify that the requesting user owns the patient record
- Audit logs capture all access attempts with outcome (SUCCESS/DENIED)

### Regression Test
```typescript
// test: cross-patient access is blocked
it('should deny patient access to another patient records', async () => {
  const res = await request(app)
    .get(`/api/v1/patients/${otherPatientId}`)
    .set('Authorization', `Bearer ${patient1Token}`);
  expect(res.status).toBe(403);
});
```

### Prevention
- All resource endpoints include ownership checks
- Audit logging captures denied access attempts
- Regular security testing validates IDOR protection

---

## Incident 2: Appointment Double-Booking Conflict

### Description
Two patients simultaneously book the same time slot with the same doctor, resulting in a scheduling conflict.

### Reproduction Steps
1. Identify Doctor Smith's available slot: Nov 28, 10:00-10:30
2. Send two concurrent booking requests for the same slot
3. Verify only one succeeds

### Expected Result
- First request succeeds with status 201
- Second request fails with `409 APPOINTMENT_CONFLICT`

### Root Cause
Without database-level concurrency control, race conditions allow both bookings to pass the application-level availability check simultaneously.

### Corrective Action
- Appointment creation uses PostgreSQL transactions with row-level locking
- Database query checks for overlapping time ranges atomically
- Idempotency keys prevent duplicate submissions

### Regression Test
```typescript
// test: concurrent booking for same slot
it('should prevent concurrent double booking', async () => {
  const [res1, res2] = await Promise.all([
    createAppointment(slotData),
    createAppointment(slotData),
  ]);
  const successes = [res1, res2].filter(r => r.status === 201);
  const conflicts = [res1, res2].filter(r => r.status === 409);
  expect(successes).toHaveLength(1);
  expect(conflicts).toHaveLength(1);
});
```

### Prevention
- PostgreSQL transaction isolation for all booking operations
- Idempotency key support on booking endpoint
- Application-level and database-level conflict checks

---

## Incident 3: Delayed Notification Delivery

### Description
Appointment confirmation emails are not being delivered due to background worker failure.

### Reproduction Steps
1. Book an appointment as a patient
2. Check the notification_jobs table for PENDING status
3. Simulate worker crash by stopping the worker container
4. Verify notifications remain in PENDING state

### Expected Result
- Notifications queue properly in BullMQ
- When worker restarts, pending jobs are processed
- Failed jobs retry up to max_attempts (3)
- Failed jobs are logged with error_message

### Root Cause
Worker crash during job processing left notifications undelivered.

### Corrective Action
- BullMQ configured with automatic retry (3 attempts, exponential backoff)
- Worker health check in Docker Compose
- Failed job error tracking in notification_jobs table
- Worker auto-restarts via Docker `restart: unless-stopped`

### Prevention
- Idempotent notification processing
- Dead letter queue for permanently failed jobs
- Health monitoring for worker processes

---

## Incident 4: Database Connection Outage

### Description
PostgreSQL becomes unavailable, causing cascading service failures.

### Reproduction Steps
1. Start the application normally
2. Stop the PostgreSQL container: `docker compose stop postgres`
3. Attempt API requests
4. Verify graceful error handling

### Expected Result
- API returns `503 Service Unavailable` on the `/ready` endpoint
- API returns meaningful error messages (not stack traces)
- When PostgreSQL restarts, services recover automatically
- No data corruption occurs

### Root Cause
Database connectivity loss without graceful degradation.

### Corrective Action
- `/ready` endpoint checks database connectivity
- Prisma connection pool configured with retry
- Error handler returns safe error messages without internal details
- Graceful shutdown handles SIGTERM properly

### Prevention
- Database health checks in Docker Compose
- Connection pool configuration
- Circuit breaker pattern for database calls
- Database backup and restore procedures

---

## Incident 5: Incorrect Laboratory Result Association

### Description
A lab result is recorded against the wrong patient's lab order due to a UI error or API misuse.

### Reproduction Steps
1. Create lab orders for Patient A and Patient B
2. Attempt to record a result for Patient B's order item ID against Patient A's order
3. Verify the system prevents the cross-association

### Expected Result
- API validates that the lab order item belongs to the correct order
- Result entry is rejected if the chain `result → orderItem → order → patient` is inconsistent
- Audit log captures the attempted incorrect association

### Root Cause
Without chain validation, any valid labOrderItemId would be accepted regardless of patient ownership.

### Corrective Action
- Lab result creation validates the full chain: labOrderItemId → labOrder → patient
- Foreign key constraints prevent orphaned results
- Audit logging tracks all result modifications

### Prevention
- Full chain validation on result entry
- Database foreign keys maintain referential integrity
- Lab technician UI pre-filters results by order
- Validation tests for cross-patient result association
