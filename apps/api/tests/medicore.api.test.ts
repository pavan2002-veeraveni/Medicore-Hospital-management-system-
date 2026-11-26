// =============================================================================
// MediCore API - Comprehensive Integration & Security Test Suite
// Covers all 20 mandatory test scenarios across all 13 modules
// =============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { InMemoryStore } from './helpers/inMemoryPrisma';

// Hoisted stateful Prisma test store so app & services share the exact same DB
const { store } = vi.hoisted(() => {
  return { store: new (class { instance: any = null; })() };
});

vi.mock('../src/config/database', async () => {
  const { InMemoryStore: Store } = await import('./helpers/inMemoryPrisma');
  const mem = new Store();
  store.instance = mem;
  return { prisma: mem.client };
});

import { createApp } from '../src/app';
import { dispatchNotificationJob } from '../src/jobs/queues';
import { FhirClient, FhirGatewayTimeoutError } from '../src/integrations/fhir.client';

const app = createApp();

// Helper to register & login synthetic test accounts quickly
async function createTestUser(opts: {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  password?: string;
}) {
  const res = await request(app).post('/api/v1/auth/register').send({
    email: opts.email,
    password: opts.password || 'Password123!',
    firstName: opts.firstName,
    lastName: opts.lastName,
    role: opts.role,
  });
  return {
    token: res.body.data.accessToken as string,
    refreshToken: res.body.data.refreshToken as string,
    user: res.body.data.user,
  };
}

describe('MediCore API - All 20 Mandatory Scenarios & Module Tests', () => {
  beforeEach(() => {
    if (store.instance) {
      store.instance.reset();
    }
  });

  // ===========================================================================
  // SCENARIO 1 & 2: Patient Registration & Duplicate Detection
  // ===========================================================================
  it('1 & 2. Registers a valid patient and rejects duplicate registration', async () => {
    const receptionist = await createTestUser({
      email: 'recep1@medicore.local',
      firstName: 'David',
      lastName: 'Brown',
      role: 'RECEPTIONIST',
    });
    const patientUser = await createTestUser({
      email: 'pat1@medicore.local',
      firstName: 'Alice',
      lastName: 'Johnson',
      role: 'PATIENT',
    });
    const patientUser2 = await createTestUser({
      email: 'pat1b@medicore.local',
      firstName: 'Alice',
      lastName: 'Johnson',
      role: 'PATIENT',
    });

    // Valid patient profile registration
    const createRes = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${receptionist.token}`)
      .send({
        userId: patientUser.user.id,
        dateOfBirth: '1990-05-14',
        gender: 'FEMALE',
        bloodType: 'O+',
        city: 'Springfield',
        medicalNotes: 'Confidential clinical note',
        emergencyContact: {
          firstName: 'Bob',
          lastName: 'Johnson',
          relationship: 'Spouse',
          phone: '555-0199',
        },
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.registrationNumber).toMatch(/^MED-\d{6}$/);

    // Duplicate for same userId -> 409
    const dupUserRes = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${receptionist.token}`)
      .send({
        userId: patientUser.user.id,
        dateOfBirth: '1990-05-14',
        gender: 'FEMALE',
      });
    expect(dupUserRes.status).toBe(409);

    // Duplicate by matching name + DOB -> 409
    const dupDemographicsRes = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${receptionist.token}`)
      .send({
        userId: patientUser2.user.id,
        dateOfBirth: '1990-05-14',
        gender: 'FEMALE',
      });
    expect(dupDemographicsRes.status).toBe(409);
  });

  // ===========================================================================
  // SCENARIO 3 & 4: Login, Refresh Token Rotation, Invalid Login
  // ===========================================================================
  it('3 & 4. Authenticates valid login, rotates refresh tokens, and rejects invalid login', async () => {
    const reg = await createTestUser({
      email: 'doc.auth@medicore.local',
      firstName: 'John',
      lastName: 'Smith',
      role: 'DOCTOR',
    });

    // Valid login
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'doc.auth@medicore.local', password: 'Password123!' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.accessToken).toBeTruthy();
    expect(loginRes.body.data.refreshToken).toBeTruthy();

    // Refresh token rotation
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh-token')
      .send({ refreshToken: loginRes.body.data.refreshToken });
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.refreshToken).not.toBe(loginRes.body.data.refreshToken);

    // Reusing already-rotated refresh token triggers security revocation
    const reuseRes = await request(app)
      .post('/api/v1/auth/refresh-token')
      .send({ refreshToken: loginRes.body.data.refreshToken });
    expect(reuseRes.status).toBe(401);

    // Invalid login
    const badLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'doc.auth@medicore.local', password: 'WrongPassword123!' });
    expect(badLogin.status).toBe(401);

    // Duplicate email registration rejected
    const dupReg = await request(app).post('/api/v1/auth/register').send({
      email: reg.user.email,
      password: 'Password123!',
      firstName: 'John',
      lastName: 'Smith',
    });
    expect(dupReg.status).toBe(409);
  });

  // ===========================================================================
  // SCENARIO 5 & 6 & 20: RBAC, Cross-Patient IDOR & Non-Clinical Masking
  // ===========================================================================
  it('5, 6 & 20. Enforces RBAC boundaries, blocks cross-patient IDOR, and masks clinical notes from non-clinical staff', async () => {
    const admin = await createTestUser({ email: 'admin@m.local', firstName: 'A', lastName: 'Min', role: 'HOSPITAL_ADMIN' });
    const receptionist = await createTestUser({ email: 'rec@m.local', firstName: 'R', lastName: 'Ec', role: 'RECEPTIONIST' });
    const pat1 = await createTestUser({ email: 'p1@m.local', firstName: 'Pat', lastName: 'One', role: 'PATIENT' });
    const pat2 = await createTestUser({ email: 'p2@m.local', firstName: 'Pat', lastName: 'Two', role: 'PATIENT' });

    const p1Res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${receptionist.token}`)
      .send({ userId: pat1.user.id, dateOfBirth: '1985-01-01', gender: 'MALE', medicalNotes: 'Sensitive Psychiatric History' });
    const p2Res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${receptionist.token}`)
      .send({ userId: pat2.user.id, dateOfBirth: '1992-02-02', gender: 'FEMALE', medicalNotes: 'Private Note' });

    const p1Id = p1Res.body.data.id;
    const p2Id = p2Res.body.data.id;

    // Unauthenticated access -> 401
    const unauthRes = await request(app).get(`/api/v1/patients/${p1Id}`);
    expect(unauthRes.status).toBe(401);

    // Patient 1 can view own profile via /patients/:id and /patients/me
    const ownRes = await request(app)
      .get(`/api/v1/patients/${p1Id}`)
      .set('Authorization', `Bearer ${pat1.token}`);
    expect(ownRes.status).toBe(200);
    expect(ownRes.body.data.medicalNotes).toBe('Sensitive Psychiatric History');

    // Cross-patient IDOR -> 403
    const idorRes = await request(app)
      .get(`/api/v1/patients/${p2Id}`)
      .set('Authorization', `Bearer ${pat1.token}`);
    expect(idorRes.status).toBe(403);

    // Receptionist can view demographics, NOT medicalNotes
    const recRead = await request(app)
      .get(`/api/v1/patients/${p1Id}`)
      .set('Authorization', `Bearer ${receptionist.token}`);
    expect(recRead.status).toBe(200);
    expect(recRead.body.data.medicalNotes).toBeUndefined();

    // Hospital Admin cannot access clinical encounters -> 403
    const adminEncounters = await request(app)
      .get('/api/v1/encounters')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(adminEncounters.status).toBe(403);
  });

  // ===========================================================================
  // SCENARIO 7, 8, 9, 10: Appointment Engine, Concurrency, Cancellation & Transitions
  // ===========================================================================
  it('7, 8, 9 & 10. Prevents overlapping concurrent bookings, enforces schedule, cancellation & state machine', async () => {
    const admin = await createTestUser({ email: 'adm.ap@m.local', firstName: 'Ad', lastName: 'Min', role: 'HOSPITAL_ADMIN' });
    const recep = await createTestUser({ email: 'rec.ap@m.local', firstName: 'Re', lastName: 'Cep', role: 'RECEPTIONIST' });
    const docUser = await createTestUser({ email: 'doc.ap@m.local', firstName: 'Dr', lastName: 'House', role: 'DOCTOR' });
    const pat1User = await createTestUser({ email: 'pat1.ap@m.local', firstName: 'P1', lastName: 'User', role: 'PATIENT' });
    const pat2User = await createTestUser({ email: 'pat2.ap@m.local', firstName: 'P2', lastName: 'User', role: 'PATIENT' });

    // Create department + doctor staff + schedule
    const deptRes = await request(app)
      .post('/api/v1/departments')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Cardiology', code: 'CARD' });
    expect(deptRes.status).toBe(201);

    const staffRes = await request(app)
      .post('/api/v1/staff')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        userId: docUser.user.id,
        employeeId: 'EMP-9001',
        departmentId: deptRes.body.data.id,
        specialization: 'Cardiology',
        joiningDate: '2024-01-01',
      });
    expect(staffRes.status).toBe(201);
    const doctorId = staffRes.body.data.id;

    // Seed DoctorSchedule for Monday (dayOfWeek = 1) 09:00-17:00 UTC
    await store.instance.client.doctorSchedule.create({
      data: {
        staffId: doctorId,
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '17:00',
        slotDuration: 30,
        validFrom: new Date('2024-01-01T00:00:00.000Z'),
      },
    });

    const p1 = (await request(app).post('/api/v1/patients').set('Authorization', `Bearer ${recep.token}`).send({ userId: pat1User.user.id, dateOfBirth: '1990-01-01', gender: 'MALE' })).body.data;
    const p2 = (await request(app).post('/api/v1/patients').set('Authorization', `Bearer ${recep.token}`).send({ userId: pat2User.user.id, dateOfBirth: '1991-01-01', gender: 'FEMALE' })).body.data;

    // Next Monday UTC: 2026-11-30 is Monday (getUTCDay() === 1)
    const startIso = '2026-11-30T10:00:00.000Z';
    const endIso = '2026-11-30T10:30:00.000Z';

    // Invalid appointment: outside doctor schedule (22:00 UTC) -> 409
    const outsideRes = await request(app)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${recep.token}`)
      .send({
        patientId: p1.id,
        doctorId,
        scheduledStart: '2026-11-30T22:00:00.000Z',
        scheduledEnd: '2026-11-30T22:30:00.000Z',
        type: 'CONSULTATION',
      });
    expect(outsideRes.status).toBe(409);

    // Invalid appointment: end <= start -> 400
    const badRangeRes = await request(app)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${recep.token}`)
      .send({
        patientId: p1.id,
        doctorId,
        scheduledStart: endIso,
        scheduledEnd: startIso,
      });
    expect(badRangeRes.status).toBe(400);

    // Scenario 8: Concurrent double-booking for the exact same doctor slot
    const [b1, b2] = await Promise.all([
      request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${pat1User.token}`)
        .send({ patientId: p1.id, doctorId, scheduledStart: startIso, scheduledEnd: endIso, type: 'CONSULTATION', idempotencyKey: 'idem-slot-1' }),
      request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${pat2User.token}`)
        .send({ patientId: p2.id, doctorId, scheduledStart: startIso, scheduledEnd: endIso, type: 'CONSULTATION', idempotencyKey: 'idem-slot-2' }),
    ]);

    const statuses = [b1.status, b2.status].sort();
    expect(statuses).toEqual([201, 409]);

    const winningId = b1.status === 201 ? b1.body.data.id : b2.body.data.id;
    const winningKey = b1.status === 201 ? 'idem-slot-1' : 'idem-slot-2';

    // Idempotent replay returns same appointment
    const replayRes = await request(app)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${recep.token}`)
      .send({ patientId: b1.status === 201 ? p1.id : p2.id, doctorId, scheduledStart: startIso, scheduledEnd: endIso, idempotencyKey: winningKey });
    expect(replayRes.status).toBe(201);
    expect(replayRes.body.data.id).toBe(winningId);

    // Scenario 10: Invalid workflow transition (REQUESTED -> COMPLETED) rejected with 422
    const invalidTrans = await request(app)
      .patch(`/api/v1/appointments/${winningId}/complete`)
      .set('Authorization', `Bearer ${docUser.token}`);
    expect(invalidTrans.status).toBe(422);

    // Valid transition: confirm -> check-in -> start -> complete
    const confRes = await request(app)
      .patch(`/api/v1/appointments/${winningId}/confirm`)
      .set('Authorization', `Bearer ${recep.token}`);
    expect(confRes.status).toBe(200);
    expect(confRes.body.data.status).toBe('CONFIRMED');

    // Scenario 9: Cancel another appointment frees the slot
    const slot2Start = '2026-11-30T11:00:00.000Z';
    const slot2End = '2026-11-30T11:30:00.000Z';
    const secondAppt = await request(app)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${recep.token}`)
      .send({ patientId: p2.id, doctorId, scheduledStart: slot2Start, scheduledEnd: slot2End });
    expect(secondAppt.status).toBe(201);

    const cancelRes = await request(app)
      .patch(`/api/v1/appointments/${secondAppt.body.data.id}/cancel`)
      .set('Authorization', `Bearer ${recep.token}`)
      .send({ reason: 'Schedule change' });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe('CANCELLED');

    // Cancelled slot can now be rebooked!
    const rebookRes = await request(app)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${recep.token}`)
      .send({ patientId: p2.id, doctorId, scheduledStart: slot2Start, scheduledEnd: slot2End });
    expect(rebookRes.status).toBe(201);
  });

  // ===========================================================================
  // SCENARIO 11 & 12: Prescriptions, Encounters & Laboratory Result Association
  // ===========================================================================
  it('11 & 12. Validates prescriptions and enforces lab order-to-patient result association', async () => {
    const admin = await createTestUser({ email: 'adm.cl@m.local', firstName: 'A', lastName: 'D', role: 'HOSPITAL_ADMIN' });
    const recep = await createTestUser({ email: 'rec.cl@m.local', firstName: 'R', lastName: 'E', role: 'RECEPTIONIST' });
    const doc = await createTestUser({ email: 'doc.cl@m.local', firstName: 'J', lastName: 'S', role: 'DOCTOR' });
    const nurse = await createTestUser({ email: 'nur.cl@m.local', firstName: 'M', lastName: 'W', role: 'NURSE' });
    const labTech = await createTestUser({ email: 'lab.cl@m.local', firstName: 'L', lastName: 'T', role: 'LAB_TECHNICIAN' });
    const patA = await createTestUser({ email: 'pa.cl@m.local', firstName: 'PA', lastName: 'A', role: 'PATIENT' });
    const patB = await createTestUser({ email: 'pb.cl@m.local', firstName: 'PB', lastName: 'B', role: 'PATIENT' });

    const dept = (await request(app).post('/api/v1/departments').set('Authorization', `Bearer ${admin.token}`).send({ name: 'GenMed', code: 'GENM' })).body.data;
    await request(app).post('/api/v1/staff').set('Authorization', `Bearer ${admin.token}`).send({
      userId: doc.user.id, employeeId: 'EMP-DOC1', departmentId: dept.id, joiningDate: '2024-01-01',
    });

    const patientA = (await request(app).post('/api/v1/patients').set('Authorization', `Bearer ${recep.token}`).send({ userId: patA.user.id, dateOfBirth: '1988-01-01', gender: 'FEMALE' })).body.data;
    const patientB = (await request(app).post('/api/v1/patients').set('Authorization', `Bearer ${recep.token}`).send({ userId: patB.user.id, dateOfBirth: '1989-01-01', gender: 'MALE' })).body.data;

    const med = await store.instance.client.medicationCatalog.create({
      data: { name: 'Amoxicillin 500mg', genericName: 'Amoxicillin', form: 'CAPSULE', strength: '500mg' },
    });
    const testDef = (await request(app).post('/api/v1/laboratories').set('Authorization', `Bearer ${admin.token}`).send({
      name: 'Glucose Fasting', code: 'GLU-F', category: 'Biochemistry', unit: 'mg/dL', referenceMin: 70, referenceMax: 100,
    })).body.data;

    const encRes = await request(app)
      .post('/api/v1/encounters')
      .set('Authorization', `Bearer ${doc.token}`)
      .send({ patientId: patientA.id, type: 'OUTPATIENT', chiefComplaint: 'Fatigue' });
    expect(encRes.status).toBe(201);
    const encId = encRes.body.data.id;

    // Nurse records vital signs
    const vitalsRes = await request(app)
      .post(`/api/v1/encounters/${encId}/vitals`)
      .set('Authorization', `Bearer ${nurse.token}`)
      .send({ temperature: 37.0, bpSystolic: 120, bpDiastolic: 80, heartRate: 75, weight: 70, height: 175 });
    expect(vitalsRes.status).toBe(201);
    expect(vitalsRes.body.data.bmi).toBeCloseTo(22.86, 1);

    // Nurse cannot create prescription -> 403
    const nurseRx = await request(app)
      .post('/api/v1/prescriptions')
      .set('Authorization', `Bearer ${nurse.token}`)
      .send({ encounterId: encId, patientId: patientA.id, items: [{ medicationId: med.id, dosage: '500mg', frequency: 'BID', duration: '7d' }] });
    expect(nurseRx.status).toBe(403);

    // Doctor creates valid prescription -> 201
    const docRx = await request(app)
      .post('/api/v1/prescriptions')
      .set('Authorization', `Bearer ${doc.token}`)
      .send({ encounterId: encId, patientId: patientA.id, items: [{ medicationId: med.id, dosage: '500mg', frequency: 'BID', duration: '7d' }] });
    expect(docRx.status).toBe(201);

    // Create Lab Orders for Patient A and Patient B
    const orderA = (await request(app).post('/api/v1/lab-orders').set('Authorization', `Bearer ${doc.token}`).send({
      patientId: patientA.id, encounterId: encId, items: [{ testId: testDef.id }],
    })).body.data;
    const orderB = (await request(app).post('/api/v1/lab-orders').set('Authorization', `Bearer ${doc.token}`).send({
      patientId: patientB.id, items: [{ testId: testDef.id }],
    })).body.data;

    // Collect specimens for both orders
    await request(app).post(`/api/v1/lab-orders/${orderA.id}/collect`).set('Authorization', `Bearer ${labTech.token}`).send({});
    await request(app).post(`/api/v1/lab-orders/${orderB.id}/collect`).set('Authorization', `Bearer ${labTech.token}`).send({});

    // Scenario 12: Cross-order result association rejected! (Patient B's item posted under Order A)
    const crossAssocRes = await request(app)
      .post(`/api/v1/lab-orders/${orderA.id}/results`)
      .set('Authorization', `Bearer ${labTech.token}`)
      .send({ labOrderItemId: orderB.items[0].id, value: '140', numericValue: 140 });
    expect(crossAssocRes.status).toBe(400);

    // Correct association auto-flags abnormal HIGH (140 > referenceMax 100)
    const validLabRes = await request(app)
      .post(`/api/v1/lab-orders/${orderA.id}/results`)
      .set('Authorization', `Bearer ${labTech.token}`)
      .send({ labOrderItemId: orderA.items[0].id, value: '140', numericValue: 140 });
    expect(validLabRes.status).toBe(201);
    expect(validLabRes.body.data.isAbnormal).toBe(true);
    expect(validLabRes.body.data.abnormalFlag).toBe('HIGH');

    // Lab Tech cannot create diagnoses -> 403
    const labDiag = await request(app)
      .post('/api/v1/diagnoses')
      .set('Authorization', `Bearer ${labTech.token}`)
      .send({ encounterId: encId, code: 'E11.9', description: 'Synthetic test code' });
    expect(labDiag.status).toBe(403);
  });

  // ===========================================================================
  // SCENARIO 13, 14, 17: Consent Revocation, Audit Trail & FHIR Validation
  // ===========================================================================
  it('13, 14 & 17. Enforces consent revocation on FHIR export, logs audit trail, and rejects invalid FHIR payloads', async () => {
    const admin = await createTestUser({ email: 'adm.co@m.local', firstName: 'A', lastName: 'D', role: 'HOSPITAL_ADMIN' });
    const recep = await createTestUser({ email: 'rec.co@m.local', firstName: 'R', lastName: 'E', role: 'RECEPTIONIST' });
    const patUser = await createTestUser({ email: 'pat.co@m.local', firstName: 'C', lastName: 'O', role: 'PATIENT' });

    const patient = (await request(app).post('/api/v1/patients').set('Authorization', `Bearer ${recep.token}`).send({
      userId: patUser.user.id, dateOfBirth: '1980-03-15', gender: 'FEMALE',
    })).body.data;

    // Export without DATA_SHARING consent -> 403 CONSENT_REQUIRED
    const blockedExport = await request(app)
      .get(`/api/v1/fhir/Patient/${patient.id}/export`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(blockedExport.status).toBe(403);
    expect(blockedExport.body.error.code).toBe('CONSENT_REQUIRED');

    // Patient grants DATA_SHARING consent
    const consentRes = await request(app)
      .post('/api/v1/consents')
      .set('Authorization', `Bearer ${patUser.token}`)
      .send({ patientId: patient.id, category: 'DATA_SHARING', purpose: 'FHIR Export' });
    expect(consentRes.status).toBe(201);

    // Export now succeeds -> 200 FHIR R4 Patient
    const okExport = await request(app)
      .get(`/api/v1/fhir/Patient/${patient.id}/export`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(okExport.status).toBe(200);
    expect(okExport.body.data.resourceType).toBe('Patient');

    // Patient revokes consent
    const revokeRes = await request(app)
      .patch(`/api/v1/consents/${consentRes.body.data.id}/revoke`)
      .set('Authorization', `Bearer ${patUser.token}`)
      .send({ reason: 'Patient opted out of data sharing' });
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.data.status).toBe('REVOKED');

    // Future export is blocked again!
    const postRevokeExport = await request(app)
      .get(`/api/v1/fhir/Patient/${patient.id}/export`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(postRevokeExport.status).toBe(403);

    // Scenario 17: Invalid FHIR import resource -> 400
    const badFhir = await request(app)
      .post('/api/v1/fhir/Patient/import')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ resourceType: 'Observation', id: 'bad' });
    expect(badFhir.status).toBe(400);

    // Scenario 14: Audit logs captured and restricted to HOSPITAL_ADMIN
    const patAudit = await request(app)
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${patUser.token}`);
    expect(patAudit.status).toBe(403);

    const adminAudit = await request(app)
      .get('/api/v1/audit-logs?limit=50')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(adminAudit.status).toBe(200);
    expect(adminAudit.body.data.length).toBeGreaterThan(0);
  });

  // ===========================================================================
  // SCENARIO 15 & 16: Notification Idempotency & FHIR Timeout/Retry
  // ===========================================================================
  it('15 & 16. Deduplicates duplicate notifications and enforces FHIR client timeout & retries', async () => {
    const user = await createTestUser({ email: 'notif@m.local', firstName: 'N', lastName: 'O', role: 'PATIENT' });

    const first = await dispatchNotificationJob({
      type: 'APPOINTMENT_CONFIRMATION',
      recipientId: user.user.id,
      recipientEmail: user.user.email,
      channel: 'email',
      subject: 'Confirmed',
      body: 'Your appointment is confirmed',
      idempotencyKey: 'unique-notif-key-123',
    });
    expect(first.deduplicated).toBe(false);
    expect(first.job.status).toBe('SENT');

    const duplicate = await dispatchNotificationJob({
      type: 'APPOINTMENT_CONFIRMATION',
      recipientId: user.user.id,
      recipientEmail: user.user.email,
      channel: 'email',
      subject: 'Confirmed',
      body: 'Your appointment is confirmed',
      idempotencyKey: 'unique-notif-key-123',
    });
    expect(duplicate.deduplicated).toBe(true);
    expect(duplicate.job.id).toBe(first.job.id);
    expect(store.instance.tables.notificationJob).toHaveLength(1);

    // Scenario 16: FHIR external timeout triggers retryAttempts and FhirGatewayTimeoutError (504)
    let calls = 0;
    const slowFetch: typeof fetch = (_url, init) => {
      calls++;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    };

    const client = new FhirClient({
      baseUrl: 'https://fhir.example.invalid/r4',
      timeoutMs: 25,
      retryAttempts: 2,
      retryDelayMs: 5,
      fetchFn: slowFetch,
    });

    await expect(client.pushResource('Patient', { id: 'p-1' })).rejects.toBeInstanceOf(FhirGatewayTimeoutError);
    expect(calls).toBe(2);
  });

  // ===========================================================================
  // SCENARIO 18 & 19: Database Outage Handling & Billing/Payment Validation
  // ===========================================================================
  it('18 & 19. Handles invalid billing requests, sandbox payments, and database outages safely', async () => {
    const recep = await createTestUser({ email: 'rec.bi@m.local', firstName: 'R', lastName: 'B', role: 'RECEPTIONIST' });
    const billing = await createTestUser({ email: 'bil.bi@m.local', firstName: 'B', lastName: 'O', role: 'BILLING_OFFICER' });
    const patUser = await createTestUser({ email: 'pat.bi@m.local', firstName: 'P', lastName: 'B', role: 'PATIENT' });

    const patient = (await request(app).post('/api/v1/patients').set('Authorization', `Bearer ${recep.token}`).send({
      userId: patUser.user.id, dateOfBirth: '1987-07-07', gender: 'MALE',
    })).body.data;

    // Invalid billing request: discount > subtotal -> 400
    const badInvoice = await request(app)
      .post('/api/v1/billing')
      .set('Authorization', `Bearer ${billing.token}`)
      .send({
        patientId: patient.id,
        items: [{ description: 'Visit', category: 'CONSULTATION', quantity: 1, unitPrice: 100 }],
        discountAmount: 200,
      });
    expect(badInvoice.status).toBe(400);

    // Valid draft invoice
    const invRes = await request(app)
      .post('/api/v1/billing')
      .set('Authorization', `Bearer ${billing.token}`)
      .send({
        patientId: patient.id,
        items: [{ description: 'Visit', category: 'CONSULTATION', quantity: 1, unitPrice: 100 }],
        taxRate: 10,
      });
    expect(invRes.status).toBe(201);
    expect(invRes.body.data.totalAmount).toBe(110);
    const invId = invRes.body.data.id;

    // Cannot pay DRAFT invoice -> 400
    const payDraft = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${billing.token}`)
      .send({ invoiceId: invId, amount: 50, method: 'CARD' });
    expect(payDraft.status).toBe(400);

    // Issue invoice then pay in two installments (PARTIALLY_PAID -> PAID)
    await request(app).patch(`/api/v1/billing/${invId}/issue`).set('Authorization', `Bearer ${billing.token}`).send({});
    const pay1 = await request(app).post('/api/v1/payments').set('Authorization', `Bearer ${billing.token}`).send({ invoiceId: invId, amount: 60, method: 'CARD' });
    expect(pay1.status).toBe(201);

    // Overpayment rejected -> 400
    const overPay = await request(app).post('/api/v1/payments').set('Authorization', `Bearer ${billing.token}`).send({ invoiceId: invId, amount: 100, method: 'CARD' });
    expect(overPay.status).toBe(400);

    const pay2 = await request(app).post('/api/v1/payments').set('Authorization', `Bearer ${billing.token}`).send({ invoiceId: invId, amount: 50, method: 'CASH' });
    expect(pay2.status).toBe(201);

    const finalInv = await request(app).get(`/api/v1/invoices/${invId}`).set('Authorization', `Bearer ${patUser.token}`);
    expect(finalInv.status).toBe(200);
    expect(finalInv.body.data.status).toBe('PAID');

    // Scenario 18: Database outage -> /ready returns 503 and API errors never leak stack traces
    store.instance.simulateDbFailure = true;
    const readyFail = await request(app).get('/ready');
    expect(readyFail.status).toBe(503);
    expect(readyFail.body.data.checks.database).toBe('DOWN');

    const apiFail = await request(app)
      .get('/api/v1/departments')
      .set('Authorization', `Bearer ${billing.token}`);
    expect(apiFail.status).toBe(500);
    expect(JSON.stringify(apiFail.body)).not.toContain('ECONNREFUSED');
    expect(apiFail.body.error.code).toBe('INTERNAL_ERROR');

    // Recover DB and check /health, /ready, and /api-docs.json
    store.instance.simulateDbFailure = false;
    const healthRes = await request(app).get('/health');
    expect(healthRes.status).toBe(200);
    expect(healthRes.body.data.status).toBe('UP');

    const readyOk = await request(app).get('/ready');
    expect(readyOk.status).toBe(200);
    expect(readyOk.body.data.checks.database).toBe('UP');

    const swaggerRes = await request(app).get('/api-docs.json');
    expect(swaggerRes.status).toBe(200);
    expect(swaggerRes.body.openapi).toBe('3.0.0');
  });

  // ===========================================================================
  // ADDITIONAL COVERAGE: Notifications Endpoints & Reschedule / Encounter Lifecycle
  // ===========================================================================
  it('21. Supports notification inbox lifecycle and appointment rescheduling within schedule', async () => {
    const admin = await createTestUser({ email: 'adm.ex@m.local', firstName: 'A', lastName: 'E', role: 'HOSPITAL_ADMIN' });
    const recep = await createTestUser({ email: 'rec.ex@m.local', firstName: 'R', lastName: 'E', role: 'RECEPTIONIST' });
    const doc = await createTestUser({ email: 'doc.ex@m.local', firstName: 'D', lastName: 'E', role: 'DOCTOR' });
    const pat = await createTestUser({ email: 'pat.ex@m.local', firstName: 'P', lastName: 'E', role: 'PATIENT' });

    const dept = (await request(app).post('/api/v1/departments').set('Authorization', `Bearer ${admin.token}`).send({ name: 'Neurology', code: 'NEUR' })).body.data;
    const doctor = (await request(app).post('/api/v1/staff').set('Authorization', `Bearer ${admin.token}`).send({
      userId: doc.user.id, employeeId: 'EMP-NEUR1', departmentId: dept.id, joiningDate: '2024-01-01',
    })).body.data;
    await store.instance.client.doctorSchedule.create({
      data: { staffId: doctor.id, dayOfWeek: 1, startTime: '09:00', endTime: '17:00', slotDuration: 30, validFrom: new Date('2024-01-01T00:00:00.000Z') },
    });
    const patient = (await request(app).post('/api/v1/patients').set('Authorization', `Bearer ${recep.token}`).send({
      userId: pat.user.id, dateOfBirth: '1995-05-05', gender: 'FEMALE',
    })).body.data;

    const slotsRes = await request(app)
      .get(`/api/v1/appointments/available-slots?doctorId=${doctor.id}&date=2026-11-30`)
      .set('Authorization', `Bearer ${pat.token}`);
    expect(slotsRes.status).toBe(200);
    expect(slotsRes.body.data.length).toBeGreaterThan(0);

    const bookRes = await request(app)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${pat.token}`)
      .send({ patientId: patient.id, doctorId: doctor.id, scheduledStart: '2026-11-30T09:00:00.000Z', scheduledEnd: '2026-11-30T09:30:00.000Z' });
    expect(bookRes.status).toBe(201);
    const apptId = bookRes.body.data.id;

    // Reschedule within schedule
    const reschedRes = await request(app)
      .patch(`/api/v1/appointments/${apptId}/reschedule`)
      .set('Authorization', `Bearer ${pat.token}`)
      .send({ newStart: '2026-11-30T14:00:00.000Z', newEnd: '2026-11-30T14:30:00.000Z', reason: 'Afternoon preferred' });
    expect(reschedRes.status).toBe(200);

    // Confirm triggers sandbox email + in-app notification
    const confirmRes = await request(app)
      .patch(`/api/v1/appointments/${apptId}/confirm`)
      .set('Authorization', `Bearer ${recep.token}`);
    expect(confirmRes.status).toBe(200);

    const unreadRes = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${pat.token}`);
    expect(unreadRes.status).toBe(200);
    expect(unreadRes.body.data.unreadCount).toBe(1);

    const markAllRes = await request(app)
      .patch('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${pat.token}`);
    expect(markAllRes.status).toBe(200);
    expect(markAllRes.body.data.updatedCount).toBe(1);
  });
});
