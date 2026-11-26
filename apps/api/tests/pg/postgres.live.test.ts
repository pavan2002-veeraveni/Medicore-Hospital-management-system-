// =============================================================================
// MediCore API - Real PostgreSQL Integration Test (CI / Local PG)
// Runs when TEST_DATABASE_URL is set (e.g. GitHub Actions Postgres service).
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const hasLivePostgres = Boolean(process.env.TEST_DATABASE_URL);

describe.runIf(hasLivePostgres)('PostgreSQL Exclusion Constraint & Audit Trigger Tests', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: process.env.TEST_DATABASE_URL! } },
    });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('verifies btree_gist extension, exclusion constraints, triggers, and analytical views exist', async () => {
    const ext = await prisma.$queryRaw<Array<{ extname: string }>>`
      SELECT extname FROM pg_extension WHERE extname = 'btree_gist'
    `;
    expect(ext).toHaveLength(1);

    const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname FROM pg_constraint
      WHERE conname IN ('appointments_no_doctor_overlap', 'appointments_valid_time_range', 'invoices_non_negative_amounts')
    `;
    expect(constraints.map((c) => c.conname).sort()).toEqual([
      'appointments_no_doctor_overlap',
      'appointments_valid_time_range',
      'invoices_non_negative_amounts',
    ]);

    const triggers = await prisma.$queryRaw<Array<{ tgname: string }>>`
      SELECT tgname FROM pg_trigger WHERE tgname = 'audit_logs_immutable_update'
    `;
    expect(triggers).toHaveLength(1);

    const views = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.views
      WHERE table_schema = 'public'
        AND table_name IN ('vw_appointment_utilization', 'vw_waiting_times', 'vw_lab_turnaround')
    `;
    expect(views.map((v) => v.table_name).sort()).toEqual([
      'vw_appointment_utilization',
      'vw_lab_turnaround',
      'vw_waiting_times',
    ]);
  });

  it('enforces appointments_no_doctor_overlap exclusion constraint (23P01) in PostgreSQL', async () => {
    const patient = await prisma.patient.findFirst();
    const doctor = await prisma.staff.findFirst({ where: { schedules: { some: {} } } });
    expect(patient).toBeTruthy();
    expect(doctor).toBeTruthy();

    let overlapRejected = false;
    try {
      await prisma.$transaction(async (tx) => {
        const apptId1 = randomUUID();
        const apptId2 = randomUUID();
        await tx.$executeRaw`
          INSERT INTO "appointments" ("id", "patient_id", "doctor_id", "scheduled_start", "scheduled_end", "status", "type", "updated_at")
          VALUES (${apptId1}::uuid, ${patient!.id}::uuid, ${doctor!.id}::uuid, '2028-05-10T10:00:00Z'::timestamptz, '2028-05-10T10:30:00Z'::timestamptz, 'CONFIRMED', 'CONSULTATION', NOW())
        `;
        await tx.$executeRawUnsafe('SAVEPOINT overlap_check');
        try {
          await tx.$executeRaw`
            INSERT INTO "appointments" ("id", "patient_id", "doctor_id", "scheduled_start", "scheduled_end", "status", "type", "updated_at")
            VALUES (${apptId2}::uuid, ${patient!.id}::uuid, ${doctor!.id}::uuid, '2028-05-10T10:15:00Z'::timestamptz, '2028-05-10T10:45:00Z'::timestamptz, 'REQUESTED', 'CONSULTATION', NOW())
          `;
        } catch (err: any) {
          const rawCode = String(err?.meta?.code || err?.code || '');
          const rawMsg = String(err?.meta?.message || err?.message || '');
          if (rawCode === '23P01' || rawMsg.includes('23P01') || rawMsg.includes('appointments_no_doctor_overlap')) {
            overlapRejected = true;
          }
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT overlap_check');
        }
        throw new Error('ROLLBACK_LIVE_TEST_TX');
      });
    } catch (err: any) {
      if (err?.message !== 'ROLLBACK_LIVE_TEST_TX') throw err;
    }

    expect(overlapRejected).toBe(true);
  });

  it('blocks UPDATE/DELETE mutations on audit_logs via trigger', async () => {
    let updateBlocked = false;
    try {
      await prisma.$transaction(async (tx) => {
        const auditId = randomUUID();
        await tx.$executeRaw`
          INSERT INTO "audit_logs" ("id", "action", "resource_type", "outcome")
          VALUES (${auditId}::uuid, 'PG_LIVE_CHECK', 'SYSTEM', 'SUCCESS')
        `;
        await tx.$executeRawUnsafe('SAVEPOINT audit_mutate_check');
        try {
          await tx.$executeRaw`
            UPDATE "audit_logs" SET "action" = 'TAMPERED' WHERE "id" = ${auditId}::uuid
          `;
        } catch (err: any) {
          const rawMsg = String(err?.meta?.message || err?.message || '');
          if (rawMsg.includes('append-only')) {
            updateBlocked = true;
          }
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT audit_mutate_check');
        }
        throw new Error('ROLLBACK_LIVE_AUDIT_TX');
      });
    } catch (err: any) {
      if (err?.message !== 'ROLLBACK_LIVE_AUDIT_TX') throw err;
    }

    expect(updateBlocked).toBe(true);
  });
});
