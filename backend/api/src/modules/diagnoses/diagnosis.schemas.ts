// =============================================================================
// MediCore API - Diagnosis Module Schemas (Zod)
// =============================================================================

import { z } from 'zod';

export const diagnosisTypeEnum = z.enum(['PRIMARY', 'SECONDARY', 'DIFFERENTIAL']);
export const diagnosisSeverityEnum = z.enum(['MILD', 'MODERATE', 'SEVERE']);

export const createDiagnosisSchema = z.object({
  encounterId: z.string().uuid('Invalid encounter ID'),
  code: z
    .string()
    .trim()
    .min(1, 'Diagnosis code is required')
    .max(20, 'Diagnosis code must be at most 20 characters'),
  description: z
    .string()
    .trim()
    .min(1, 'Diagnosis description is required')
    .max(500, 'Diagnosis description must be at most 500 characters'),
  type: diagnosisTypeEnum.default('PRIMARY'),
  severity: diagnosisSeverityEnum.optional(),
  notes: z.string().trim().max(5000, 'Notes must be at most 5000 characters').optional(),
});

export const encounterIdParamSchema = z.object({
  encounterId: z.string().uuid('Invalid encounter ID'),
});

export const patientIdParamSchema = z.object({
  patientId: z.string().uuid('Invalid patient ID'),
});

export const diagnosisQuerySchema = z.object({
  type: diagnosisTypeEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateDiagnosisInput = z.infer<typeof createDiagnosisSchema>;
export type DiagnosisQueryInput = z.infer<typeof diagnosisQuerySchema>;
