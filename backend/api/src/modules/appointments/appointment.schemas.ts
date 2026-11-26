// =============================================================================
// MediCore API - Appointment Module Schemas (Zod)
// =============================================================================

import { z } from 'zod';

export const APPOINTMENT_TYPES = [
  'CONSULTATION',
  'FOLLOW_UP',
  'PROCEDURE',
  'EMERGENCY',
] as const;

export const APPOINTMENT_STATUSES = [
  'REQUESTED',
  'CONFIRMED',
  'CHECKED_IN',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;

export const APPOINTMENT_SORT_FIELDS = [
  'scheduledStart',
  'createdAt',
  'updatedAt',
  'status',
  'priority',
] as const;

export const SORT_ORDERS = ['asc', 'desc'] as const;

const isoDatetimeSchema = z
  .string()
  .datetime({ offset: true, message: 'Must be a valid ISO 8601 datetime string' });

const dateOrDatetimeSchema = z
  .string()
  .refine(
    (val) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        const parsed = new Date(`${val}T00:00:00.000Z`);
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(val);
      }
      return z.string().datetime({ offset: true }).safeParse(val).success;
    },
    { message: 'Must be a valid YYYY-MM-DD date or ISO 8601 datetime string' }
  );

export const createAppointmentSchema = z
  .object({
    patientId: z.string().uuid('Invalid patientId format'),
    doctorId: z.string().uuid('Invalid doctorId format'),
    scheduledStart: isoDatetimeSchema,
    scheduledEnd: isoDatetimeSchema,
    type: z.enum(APPOINTMENT_TYPES).default('CONSULTATION'),
    reason: z.string().trim().min(1, 'Reason cannot be empty').max(2000).optional(),
    notes: z.string().trim().max(2000).optional(),
    idempotencyKey: z.string().trim().min(1, 'Idempotency key cannot be empty').max(100).optional(),
  })
  .refine((data) => new Date(data.scheduledEnd) > new Date(data.scheduledStart), {
    message: 'scheduledEnd must be after scheduledStart',
    path: ['scheduledEnd'],
  });

export const updateAppointmentSchema = z.object({
  status: z.enum(APPOINTMENT_STATUSES),
});

export const rescheduleSchema = z
  .object({
    newStart: isoDatetimeSchema,
    newEnd: isoDatetimeSchema,
    reason: z.string().trim().min(1, 'Reschedule reason cannot be empty').max(1000).optional(),
  })
  .refine((data) => new Date(data.newEnd) > new Date(data.newStart), {
    message: 'newEnd must be after newStart',
    path: ['newEnd'],
  });

export const cancelSchema = z.object({
  reason: z.string().trim().min(1, 'Cancellation reason is required').max(1000),
});

export const appointmentQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    patientId: z.string().uuid('Invalid patientId format').optional(),
    doctorId: z.string().uuid('Invalid doctorId format').optional(),
    status: z.enum(APPOINTMENT_STATUSES).optional(),
    dateFrom: dateOrDatetimeSchema.optional(),
    dateTo: dateOrDatetimeSchema.optional(),
    type: z.enum(APPOINTMENT_TYPES).optional(),
    sortBy: z.enum(APPOINTMENT_SORT_FIELDS).default('scheduledStart'),
    order: z.enum(SORT_ORDERS).default('asc'),
  })
  .refine(
    (data) => {
      if (!data.dateFrom || !data.dateTo) return true;
      const from = /^\d{4}-\d{2}-\d{2}$/.test(data.dateFrom)
        ? new Date(`${data.dateFrom}T00:00:00.000Z`)
        : new Date(data.dateFrom);
      const to = /^\d{4}-\d{2}-\d{2}$/.test(data.dateTo)
        ? new Date(`${data.dateTo}T23:59:59.999Z`)
        : new Date(data.dateTo);
      return from <= to;
    },
    {
      message: 'dateFrom must be before or equal to dateTo',
      path: ['dateTo'],
    }
  );

export const appointmentIdParamSchema = z.object({
  id: z.string().uuid('Invalid appointment ID format'),
});

export const availableSlotsQuerySchema = z.object({
  doctorId: z.string().uuid('Invalid doctorId format'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format')
    .refine(
      (val) => {
        const parsed = new Date(`${val}T00:00:00.000Z`);
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(val);
      },
      { message: 'Invalid calendar date' }
    ),
});

export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
export type RescheduleAppointmentInput = z.infer<typeof rescheduleSchema>;
export type CancelAppointmentInput = z.infer<typeof cancelSchema>;
export type AppointmentQueryInput = z.infer<typeof appointmentQuerySchema>;
export type AvailableSlotsQueryInput = z.infer<typeof availableSlotsQuerySchema>;
