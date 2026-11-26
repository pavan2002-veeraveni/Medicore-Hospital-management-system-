// =============================================================================
// MediCore API - Prescription Schemas
// =============================================================================

import { z } from 'zod';

export const prescriptionItemSchema = z.object({
  medicationId: z.string().uuid(),
  dosage: z.string().min(1).max(100),
  frequency: z.string().min(1).max(100),
  duration: z.string().min(1).max(100),
  route: z.string().optional(),
  instructions: z.string().optional(),
  quantity: z.number().int().positive().optional(),
});

export const createPrescriptionSchema = z.object({
  encounterId: z.string().uuid(),
  patientId: z.string().uuid(),
  notes: z.string().optional(),
  items: z.array(prescriptionItemSchema).min(1),
});

export const updatePrescriptionStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'DISPENSED', 'CANCELLED']),
});

export const prescriptionQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  patientId: z.string().uuid().optional(),
  encounterId: z.string().uuid().optional(),
  status: z.string().optional(),
  prescriberId: z.string().uuid().optional(),
});

export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>;
