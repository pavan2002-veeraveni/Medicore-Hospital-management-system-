// =============================================================================
// MediCore API - Encounter Module Schemas (Zod)
// =============================================================================

import { z } from 'zod';

export const encounterTypeEnum = z.enum(['OUTPATIENT', 'INPATIENT', 'EMERGENCY']);
export const encounterStatusEnum = z.enum(['IN_PROGRESS', 'COMPLETED']);

export const encounterIdParamSchema = z.object({
  id: z.string().uuid('Invalid encounter ID'),
});

export const createEncounterSchema = z.object({
  patientId: z.string().uuid('Invalid patient ID'),
  appointmentId: z.string().uuid('Invalid appointment ID').optional(),
  type: encounterTypeEnum.default('OUTPATIENT'),
  chiefComplaint: z.string().trim().max(2000, 'Chief complaint must be at most 2000 characters').optional(),
  clinicalNotes: z.string().trim().max(10000, 'Clinical notes must be at most 10000 characters').optional(),
});

export const updateEncounterSchema = z.object({
  clinicalNotes: z.string().trim().max(10000, 'Clinical notes must be at most 10000 characters').optional(),
  status: encounterStatusEnum.optional(),
});

export const vitalSignSchema = z.object({
  temperature: z.number().min(25, 'Temperature must be at least 25°C').max(46, 'Temperature must be at most 46°C').optional(),
  bpSystolic: z.number().int('Systolic BP must be an integer').min(30).max(300).optional(),
  bpDiastolic: z.number().int('Diastolic BP must be an integer').min(20).max(200).optional(),
  heartRate: z.number().int('Heart rate must be an integer').min(20).max(300).optional(),
  respiratoryRate: z.number().int('Respiratory rate must be an integer').min(4).max(80).optional(),
  oxygenSaturation: z.number().min(0).max(100).optional(),
  weight: z.number().positive('Weight must be positive').max(700).optional(),
  height: z.number().positive('Height must be positive').max(300).optional(),
  notes: z.string().trim().max(2000, 'Notes must be at most 2000 characters').optional(),
}).refine(
  (data) =>
    data.temperature !== undefined ||
    data.bpSystolic !== undefined ||
    data.bpDiastolic !== undefined ||
    data.heartRate !== undefined ||
    data.respiratoryRate !== undefined ||
    data.oxygenSaturation !== undefined ||
    data.weight !== undefined ||
    data.height !== undefined ||
    data.notes !== undefined,
  { message: 'At least one vital sign measurement or note must be provided' }
);

export const encounterQuerySchema = z.object({
  patientId: z.string().uuid('Invalid patient ID').optional(),
  doctorId: z.string().uuid('Invalid doctor ID').optional(),
  status: encounterStatusEnum.optional(),
  type: encounterTypeEnum.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateEncounterInput = z.infer<typeof createEncounterSchema>;
export type UpdateEncounterInput = z.infer<typeof updateEncounterSchema>;
export type VitalSignInput = z.infer<typeof vitalSignSchema>;
export type EncounterQueryInput = z.infer<typeof encounterQuerySchema>;
