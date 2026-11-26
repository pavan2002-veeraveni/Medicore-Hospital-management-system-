// =============================================================================
// MediCore API - Appointment Service (State Machine & Conflict Prevention)
// =============================================================================

import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import {
  AppointmentConflictError,
  ForbiddenError,
  InvalidStateTransitionError,
  NotFoundError,
  ValidationError,
} from '../../middleware/errorHandler';
import type { JwtPayload } from '../../middleware/auth';
import { dispatchNotificationJob } from '../../jobs/queues';
import type {
  AppointmentQueryInput,
  AppointmentStatus,
  CreateAppointmentInput,
} from './appointment.schemas';

export interface AuditMeta {
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AvailableSlot {
  startTime: string;
  endTime: string;
  durationMinutes: number;
}

/**
 * Deterministic appointment workflow state machine.
 * Maps each status to its valid next statuses.
 */
export const VALID_TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  REQUESTED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

/** Statuses that occupy a doctor/patient time slot and prevent double-booking. */
const BLOCKING_STATUSES: AppointmentStatus[] = [
  'REQUESTED',
  'CONFIRMED',
  'CHECKED_IN',
  'IN_PROGRESS',
  'COMPLETED',
];

const STAFF_ROLES = new Set([
  'HOSPITAL_ADMIN',
  'DOCTOR',
  'NURSE',
  'RECEPTIONIST',
  'LAB_TECHNICIAN',
  'BILLING_OFFICER',
]);

const APPOINTMENT_INCLUDE = {
  patient: {
    select: {
      id: true,
      userId: true,
      registrationNumber: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
    },
  },
  doctor: {
    select: {
      id: true,
      userId: true,
      employeeId: true,
      departmentId: true,
      specialization: true,
      department: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  },
} as const;

function isPatientOnly(roles: string[]): boolean {
  return roles.includes('PATIENT') && !roles.some((role) => STAFF_ROLES.has(role));
}

function parseTimeToMinutes(timeStr: string): number {
  const [hoursStr, minutesStr] = timeStr.split(':');
  return Number(hoursStr) * 60 + Number(minutesStr);
}

function getUtcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function parseUtcCalendarDate(dateStr: string): Date {
  const parsed = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || !parsed.toISOString().startsWith(dateStr)) {
    throw new ValidationError('Invalid date format; expected YYYY-MM-DD');
  }
  return parsed;
}

export class AppointmentService {
  /**
   * Create a new appointment atomically with idempotency, doctor schedule,
   * and overlap conflict checks inside a serializable transaction.
   */
  async create(
    data: CreateAppointmentInput,
    requestingUserId: string,
    auditMeta?: AuditMeta
  ) {
    // 1. Check idempotency key first before starting write work
    if (data.idempotencyKey) {
      const existing = await prisma.appointment.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
        include: APPOINTMENT_INCLUDE,
      });
      if (existing) {
        return existing;
      }
    }

    const scheduledStart = new Date(data.scheduledStart);
    const scheduledEnd = new Date(data.scheduledEnd);
    if (
      Number.isNaN(scheduledStart.getTime()) ||
      Number.isNaN(scheduledEnd.getTime()) ||
      scheduledEnd <= scheduledStart
    ) {
      throw new ValidationError('scheduledEnd must be a valid datetime after scheduledStart');
    }

    return this.runSerializableTransaction(async (tx) => {
      // Re-check idempotency key inside transaction to guard concurrent replays
      if (data.idempotencyKey) {
        const existingInTx = await tx.appointment.findUnique({
          where: { idempotencyKey: data.idempotencyKey },
          include: APPOINTMENT_INCLUDE,
        });
        if (existingInTx) {
          return existingInTx;
        }
      }

      // 2. Verify doctor exists and is active
      const doctor = await this.verifyActiveDoctor(tx, data.doctorId);

      // Verify patient exists and is active
      const patient = await tx.patient.findUnique({
        where: { id: data.patientId },
        include: { user: { select: { isActive: true } } },
      });
      if (!patient) {
        throw new NotFoundError('Patient not found');
      }
      if (!patient.isActive || !patient.user.isActive) {
        throw new ValidationError('Patient account is inactive');
      }

      // 3. Check doctor availability against DoctorSchedule
      await this.assertDoctorAvailable(tx, data.doctorId, scheduledStart, scheduledEnd);

      // 4. Check for overlapping conflicting appointments
      await this.assertNoConflicts(
        tx,
        data.doctorId,
        data.patientId,
        scheduledStart,
        scheduledEnd
      );

      // 5. Create appointment atomically with initial status REQUESTED
      const appointment = await tx.appointment.create({
        data: {
          patientId: data.patientId,
          doctorId: data.doctorId,
          departmentId: doctor.departmentId,
          scheduledStart,
          scheduledEnd,
          status: 'REQUESTED',
          type: data.type,
          reason: data.reason,
          notes: data.notes,
          idempotencyKey: data.idempotencyKey,
        },
        include: APPOINTMENT_INCLUDE,
      });

      await this.recordAuditLog(tx, {
        actorId: requestingUserId,
        action: 'APPOINTMENT_CREATED',
        resourceId: appointment.id,
        reason: data.reason,
        metadata: {
          newStatus: 'REQUESTED',
          patientId: data.patientId,
          doctorId: data.doctorId,
          scheduledStart: scheduledStart.toISOString(),
          scheduledEnd: scheduledEnd.toISOString(),
          type: data.type,
        },
        auditMeta,
      });

      return appointment;
    });
  }

  /**
   * Retrieve a single appointment by ID with optional patient ownership enforcement.
   */
  async findById(id: string, user?: JwtPayload) {
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: APPOINTMENT_INCLUDE,
    });

    if (!appointment) {
      throw new NotFoundError('Appointment not found');
    }

    if (user && isPatientOnly(user.roles) && appointment.patient.userId !== user.userId) {
      throw new ForbiddenError('You do not have permission to view this appointment');
    }

    return appointment;
  }

  /**
   * Retrieve paginated appointments with filtering and role-based scoping.
   */
  async findAll(query: AppointmentQueryInput, user?: JwtPayload) {
    const where: Prisma.AppointmentWhereInput = {};

    if (user && isPatientOnly(user.roles)) {
      const patient = await prisma.patient.findUnique({
        where: { userId: user.userId },
        select: { id: true },
      });

      if (!patient) {
        return { appointments: [], total: 0, page: query.page, limit: query.limit };
      }

      if (query.patientId && query.patientId !== patient.id) {
        throw new ForbiddenError('Patients can only view their own appointments');
      }

      where.patientId = patient.id;
    } else if (query.patientId) {
      where.patientId = query.patientId;
    }

    if (query.doctorId) {
      where.doctorId = query.doctorId;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.type) {
      where.type = query.type;
    }

    if (query.dateFrom || query.dateTo) {
      where.scheduledStart = {};
      if (query.dateFrom) {
        where.scheduledStart.gte = /^\d{4}-\d{2}-\d{2}$/.test(query.dateFrom)
          ? new Date(`${query.dateFrom}T00:00:00.000Z`)
          : new Date(query.dateFrom);
      }
      if (query.dateTo) {
        where.scheduledStart.lte = /^\d{4}-\d{2}-\d{2}$/.test(query.dateTo)
          ? new Date(`${query.dateTo}T23:59:59.999Z`)
          : new Date(query.dateTo);
      }
    }

    const skip = (query.page - 1) * query.limit;

    const [appointments, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
        include: APPOINTMENT_INCLUDE,
        orderBy: { [query.sortBy]: query.order },
        skip,
        take: query.limit,
      }),
      prisma.appointment.count({ where }),
    ]);

    return {
      appointments,
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /**
   * Confirm a requested appointment (REQUESTED -> CONFIRMED).
   */
  async confirm(id: string, actorId?: string, auditMeta?: AuditMeta) {
    const updated = await this.transitionStatus(id, 'CONFIRMED', {
      actorId,
      auditAction: 'APPOINTMENT_CONFIRMED',
      auditMeta,
    });
    await dispatchNotificationJob({
      type: 'APPOINTMENT_CONFIRMATION',
      recipientId: updated.patient.userId,
      recipientEmail: updated.patient.user.email,
      recipientPhone: updated.patient.user.phone || undefined,
      channel: 'email',
      subject: 'Appointment Confirmed - MediCore',
      body: `Your appointment with Dr. ${updated.doctor.user.firstName} ${updated.doctor.user.lastName} on ${updated.scheduledStart.toISOString()} is confirmed.`,
      idempotencyKey: `appt-confirm-${updated.id}`,
    }).catch(() => {});
    return updated;
  }

  /**
   * Check in a confirmed appointment (CONFIRMED -> CHECKED_IN) and record checkedInAt.
   */
  async checkIn(id: string, actorId?: string, auditMeta?: AuditMeta) {
    const checkedInAt = new Date();
    return this.transitionStatus(id, 'CHECKED_IN', {
      actorId,
      extraData: { checkedInAt },
      auditAction: 'APPOINTMENT_CHECKED_IN',
      extraMetadata: { checkedInAt: checkedInAt.toISOString() },
      auditMeta,
    });
  }

  /**
   * Start clinical encounter for a checked-in appointment (CHECKED_IN -> IN_PROGRESS).
   */
  async startEncounter(id: string, actorId?: string, auditMeta?: AuditMeta) {
    return this.transitionStatus(id, 'IN_PROGRESS', {
      actorId,
      auditAction: 'APPOINTMENT_STARTED',
      auditMeta,
    });
  }

  /**
   * Complete an in-progress appointment (IN_PROGRESS -> COMPLETED).
   */
  async complete(id: string, actorId?: string, auditMeta?: AuditMeta) {
    return this.transitionStatus(id, 'COMPLETED', {
      actorId,
      auditAction: 'APPOINTMENT_COMPLETED',
      auditMeta,
    });
  }

  /**
   * Cancel an appointment (only allowed from REQUESTED or CONFIRMED).
   */
  async cancel(
    id: string,
    reason: string,
    cancelledBy: string,
    auditMeta?: AuditMeta,
    user?: JwtPayload
  ) {
    if (!reason || !reason.trim()) {
      throw new ValidationError('Cancellation reason is required');
    }

    const cancelledAt = new Date();
    const updated = await this.transitionStatus(id, 'CANCELLED', {
      actorId: cancelledBy,
      reason: reason.trim(),
      extraData: {
        cancelledAt,
        cancelledBy,
        cancellationReason: reason.trim(),
      },
      auditAction: 'APPOINTMENT_CANCELLED',
      extraMetadata: {
        cancelledAt: cancelledAt.toISOString(),
        cancelledBy,
      },
      auditMeta,
      user,
    });
    await dispatchNotificationJob({
      type: 'APPOINTMENT_CANCELLATION',
      recipientId: updated.patient.userId,
      recipientEmail: updated.patient.user.email,
      channel: 'email',
      subject: 'Appointment Cancelled - MediCore',
      body: `Your appointment scheduled for ${updated.scheduledStart.toISOString()} has been cancelled. Reason: ${reason.trim()}`,
      idempotencyKey: `appt-cancel-${updated.id}`,
    }).catch(() => {});
    return updated;
  }

  /**
   * Mark a confirmed appointment as no-show (CONFIRMED -> NO_SHOW).
   */
  async markNoShow(id: string, actorId?: string, auditMeta?: AuditMeta) {
    return this.transitionStatus(id, 'NO_SHOW', {
      actorId,
      auditAction: 'APPOINTMENT_NO_SHOW',
      auditMeta,
    });
  }

  /**
   * Reschedule an appointment (only allowed from REQUESTED or CONFIRMED).
   * Re-validates doctor availability and time-slot conflicts inside a transaction.
   */
  async reschedule(
    id: string,
    newStart: string | Date,
    newEnd: string | Date,
    reason?: string,
    actorId?: string,
    auditMeta?: AuditMeta,
    user?: JwtPayload
  ) {
    const start = new Date(newStart);
    const end = new Date(newEnd);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new ValidationError('newEnd must be a valid datetime after newStart');
    }

    return this.runSerializableTransaction(async (tx) => {
      const existing = await tx.appointment.findUnique({
        where: { id },
        include: {
          patient: { select: { userId: true } },
        },
      });

      if (!existing) {
        throw new NotFoundError('Appointment not found');
      }

      if (user && isPatientOnly(user.roles) && existing.patient.userId !== user.userId) {
        throw new ForbiddenError('Patients can only reschedule their own appointments');
      }

      if (existing.status !== 'REQUESTED' && existing.status !== 'CONFIRMED') {
        throw new InvalidStateTransitionError(
          `Cannot reschedule appointment in ${existing.status} status; only REQUESTED or CONFIRMED appointments can be rescheduled`
        );
      }

      await this.verifyActiveDoctor(tx, existing.doctorId);
      await this.assertDoctorAvailable(tx, existing.doctorId, start, end);
      await this.assertNoConflicts(tx, existing.doctorId, existing.patientId, start, end, id);

      const updated = await tx.appointment.update({
        where: { id },
        data: {
          scheduledStart: start,
          scheduledEnd: end,
        },
        include: APPOINTMENT_INCLUDE,
      });

      await this.recordAuditLog(tx, {
        actorId: actorId ?? null,
        action: 'APPOINTMENT_RESCHEDULED',
        resourceId: id,
        reason,
        metadata: {
          status: existing.status,
          previousStart: existing.scheduledStart.toISOString(),
          previousEnd: existing.scheduledEnd.toISOString(),
          newStart: start.toISOString(),
          newEnd: end.toISOString(),
        },
        auditMeta,
      });

      return updated;
    });
  }

  /**
   * Calculate available booking slots for a doctor on a given YYYY-MM-DD date
   * from active DoctorSchedule blocks minus existing non-cancelled/non-no-show appointments.
   */
  async getAvailableSlots(doctorId: string, date: string): Promise<AvailableSlot[]> {
    const dayStart = parseUtcCalendarDate(date);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const dayOfWeek = dayStart.getUTCDay();

    const doctor = await prisma.staff.findUnique({
      where: { id: doctorId },
      include: { user: { select: { isActive: true } } },
    });

    if (!doctor) {
      throw new NotFoundError('Doctor not found');
    }
    if (!doctor.isActive || !doctor.user.isActive) {
      return [];
    }

    const [schedules, existingAppointments] = await Promise.all([
      prisma.doctorSchedule.findMany({
        where: {
          staffId: doctorId,
          dayOfWeek,
          isActive: true,
          validFrom: { lte: dayStart },
          OR: [{ validUntil: null }, { validUntil: { gte: dayStart } }],
        },
        orderBy: { startTime: 'asc' },
      }),
      prisma.appointment.findMany({
        where: {
          doctorId,
          status: { in: BLOCKING_STATUSES },
          scheduledStart: { lt: dayEnd },
          scheduledEnd: { gt: dayStart },
        },
        select: {
          scheduledStart: true,
          scheduledEnd: true,
        },
      }),
    ]);

    const slots: AvailableSlot[] = [];
    const seenStarts = new Set<number>();

    for (const schedule of schedules) {
      const startMinutes = parseTimeToMinutes(schedule.startTime);
      const endMinutes = parseTimeToMinutes(schedule.endTime);
      const slotDuration = schedule.slotDuration > 0 ? schedule.slotDuration : 30;

      for (let m = startMinutes; m + slotDuration <= endMinutes; m += slotDuration) {
        const slotStart = new Date(dayStart.getTime() + m * 60 * 1000);
        const slotEnd = new Date(dayStart.getTime() + (m + slotDuration) * 60 * 1000);

        const isOccupied = existingAppointments.some(
          (appt) => slotStart < appt.scheduledEnd && slotEnd > appt.scheduledStart
        );

        if (!isOccupied && !seenStarts.has(slotStart.getTime())) {
          seenStarts.add(slotStart.getTime());
          slots.push({
            startTime: slotStart.toISOString(),
            endTime: slotEnd.toISOString(),
            durationMinutes: slotDuration,
          });
        }
      }
    }

    return slots.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  /**
   * Shared transactional state-machine transition executor with audit logging.
   */
  private async transitionStatus(
    id: string,
    targetStatus: AppointmentStatus,
    options: {
      actorId?: string;
      reason?: string;
      extraData?: Prisma.AppointmentUpdateInput;
      auditAction: string;
      extraMetadata?: Record<string, unknown>;
      auditMeta?: AuditMeta;
      user?: JwtPayload;
    }
  ) {
    return this.runSerializableTransaction(async (tx) => {
      const existing = await tx.appointment.findUnique({
        where: { id },
        include: {
          patient: { select: { userId: true } },
        },
      });

      if (!existing) {
        throw new NotFoundError('Appointment not found');
      }

      if (
        options.user &&
        isPatientOnly(options.user.roles) &&
        existing.patient.userId !== options.user.userId
      ) {
        throw new ForbiddenError('You do not have permission to modify this appointment');
      }

      const currentStatus = existing.status as AppointmentStatus;
      const allowedTargets = VALID_TRANSITIONS[currentStatus] ?? [];

      if (!allowedTargets.includes(targetStatus)) {
        throw new InvalidStateTransitionError(
          `Cannot transition appointment from ${currentStatus} to ${targetStatus}`
        );
      }

      const updated = await tx.appointment.update({
        where: { id },
        data: {
          status: targetStatus,
          ...(options.extraData ?? {}),
        },
        include: APPOINTMENT_INCLUDE,
      });

      await this.recordAuditLog(tx, {
        actorId: options.actorId ?? null,
        action: options.auditAction,
        resourceId: id,
        reason: options.reason,
        metadata: {
          previousStatus: currentStatus,
          newStatus: targetStatus,
          ...(options.extraMetadata ?? {}),
        },
        auditMeta: options.auditMeta,
      });

      return updated;
    });
  }

  /**
   * Execute a callback inside a serializable transaction and translate
   * PostgreSQL serialization failures (P2034) into AppointmentConflictError.
   */
  private async runSerializableTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null) {
        const errObj = error as { code?: string; message?: string; meta?: { code?: string } };
        if (
          errObj.code === 'P2034' ||
          errObj.meta?.code === '23P01' ||
          (typeof errObj.message === 'string' &&
            (errObj.message.includes('appointments_no_doctor_overlap') ||
              errObj.message.includes('23P01')))
        ) {
          throw new AppointmentConflictError(
            'Appointment slot conflicted with a concurrent booking; please retry'
          );
        }
      }
      throw error;
    }
  }

  private async verifyActiveDoctor(tx: Prisma.TransactionClient, doctorId: string) {
    const doctor = await tx.staff.findUnique({
      where: { id: doctorId },
      include: { user: { select: { isActive: true } } },
    });

    if (!doctor) {
      throw new NotFoundError('Doctor not found');
    }
    if (!doctor.isActive || !doctor.user.isActive) {
      throw new ValidationError('Doctor is not currently active');
    }

    return doctor;
  }

  private async assertDoctorAvailable(
    tx: Prisma.TransactionClient,
    doctorId: string,
    start: Date,
    end: Date
  ): Promise<void> {
    const startDateOnly = getUtcDateOnly(start);
    const endDateOnly = getUtcDateOnly(end);
    const isExactNextMidnight =
      endDateOnly.getTime() === startDateOnly.getTime() + 24 * 60 * 60 * 1000 &&
      end.getUTCHours() === 0 &&
      end.getUTCMinutes() === 0 &&
      end.getUTCSeconds() === 0 &&
      end.getUTCMilliseconds() === 0;

    if (startDateOnly.getTime() !== endDateOnly.getTime() && !isExactNextMidnight) {
      throw new AppointmentConflictError(
        'Appointment cannot span across multiple days outside doctor schedule'
      );
    }

    const startMinutes =
      start.getUTCHours() * 60 +
      start.getUTCMinutes() +
      (start.getUTCSeconds() > 0 || start.getUTCMilliseconds() > 0 ? 1 : 0);
    const endMinutes = isExactNextMidnight
      ? 24 * 60
      : end.getUTCHours() * 60 +
        end.getUTCMinutes() +
        (end.getUTCSeconds() > 0 || end.getUTCMilliseconds() > 0 ? 1 : 0);

    const schedules = await tx.doctorSchedule.findMany({
      where: {
        staffId: doctorId,
        dayOfWeek: start.getUTCDay(),
        isActive: true,
        validFrom: { lte: startDateOnly },
        OR: [{ validUntil: null }, { validUntil: { gte: startDateOnly } }],
      },
    });

    const isCovered = schedules.some((schedule) => {
      const schedStart = parseTimeToMinutes(schedule.startTime);
      const schedEnd = parseTimeToMinutes(schedule.endTime);
      return startMinutes >= schedStart && endMinutes <= schedEnd;
    });

    if (!isCovered) {
      throw new AppointmentConflictError(
        'Doctor is not available during the requested time slot'
      );
    }
  }

  private async assertNoConflicts(
    tx: Prisma.TransactionClient,
    doctorId: string,
    patientId: string,
    start: Date,
    end: Date,
    excludeAppointmentId?: string
  ): Promise<void> {
    const excludeFilter = excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {};

    const doctorConflict = await tx.appointment.findFirst({
      where: {
        ...excludeFilter,
        doctorId,
        status: { in: BLOCKING_STATUSES },
        scheduledStart: { lt: end },
        scheduledEnd: { gt: start },
      },
      select: { id: true },
    });

    if (doctorConflict) {
      throw new AppointmentConflictError(
        'Doctor already has a conflicting appointment in this time range'
      );
    }

    const patientConflict = await tx.appointment.findFirst({
      where: {
        ...excludeFilter,
        patientId,
        status: { in: BLOCKING_STATUSES },
        scheduledStart: { lt: end },
        scheduledEnd: { gt: start },
      },
      select: { id: true },
    });

    if (patientConflict) {
      throw new AppointmentConflictError(
        'Patient already has a conflicting appointment in this time range'
      );
    }
  }

  private async recordAuditLog(
    tx: Prisma.TransactionClient,
    params: {
      actorId: string | null;
      action: string;
      resourceId: string;
      reason?: string;
      metadata?: Record<string, unknown>;
      auditMeta?: AuditMeta;
    }
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorId: params.actorId,
        action: params.action,
        resourceType: 'APPOINTMENT',
        resourceId: params.resourceId,
        outcome: 'SUCCESS',
        reason: params.reason ?? null,
        metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
        requestId: params.auditMeta?.requestId ?? null,
        ipAddress: params.auditMeta?.ipAddress ?? null,
        userAgent: params.auditMeta?.userAgent ?? null,
      },
    });
  }
}

export const appointmentService = new AppointmentService();
