// =============================================================================
// MediCore API - Payment Schemas
// =============================================================================

import { z } from 'zod';

export const createPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'INSURANCE']),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

export const paymentQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  invoiceId: z.string().uuid().optional(),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
