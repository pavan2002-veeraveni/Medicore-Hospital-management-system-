// =============================================================================
// MediCore API - Consent Module Schemas (Zod)
// =============================================================================

import { z } from 'zod';

export const consentCategoryEnum = z.enum([
  'TREATMENT',
  'DATA_SHARING',
  'RESEARCH',
  'COMMUNICATION',
]);

export const consentStatusEnum = z.enum(['GRANTED', 'REVOKED', 'EXPIRED']);

export const createConsentSchema = z.object({
  patientId: z.string().uuid('Invalid patient ID'),
  category: consentCategoryEnum,
  purpose: z.string().trim().min(1, 'Purpose is required').max(255),
  expiresAt: z.coerce.date().optional().nullable(),
});

export const revokeConsentSchema = z.object({
  reason: z.string().trim().min(1, 'Revocation reason is required').max(1000),
});

export const consentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  patientId: z.string().uuid('Invalid patient ID').optional(),
  category: consentCategoryEnum.optional(),
  status: consentStatusEnum.optional(),
});

export const consentIdParamSchema = z.object({
  id: z.string().uuid('Invalid consent ID'),
});

export type ConsentCategory = z.infer<typeof consentCategoryEnum>;
export type ConsentStatus = z.infer<typeof consentStatusEnum>;
export type CreateConsentInput = z.infer<typeof createConsentSchema>;
export type RevokeConsentInput = z.infer<typeof revokeConsentSchema>;
export type ConsentQueryInput = z.infer<typeof consentQuerySchema>;
