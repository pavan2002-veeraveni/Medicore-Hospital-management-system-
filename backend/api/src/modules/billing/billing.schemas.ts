// =============================================================================
// MediCore API - Billing Module Schemas (Zod)
// =============================================================================

import { z } from 'zod';

export const INVOICE_ITEM_CATEGORIES = [
  'CONSULTATION',
  'LAB_TEST',
  'MEDICATION',
  'PROCEDURE',
] as const;

export const INVOICE_STATUSES = [
  'DRAFT',
  'ISSUED',
  'PAID',
  'PARTIALLY_PAID',
  'CANCELLED',
  'OVERDUE',
] as const;

export const UPDATABLE_INVOICE_STATUSES = ['ISSUED', 'CANCELLED'] as const;

export const invoiceItemSchema = z.object({
  description: z.string().min(1, 'Item description is required').max(500),
  category: z.enum(INVOICE_ITEM_CATEGORIES),
  quantity: z.number().int().min(1, 'Quantity must be at least 1').default(1),
  unitPrice: z.number().min(0, 'Unit price cannot be negative'),
  referenceId: z.string().uuid('Invalid reference ID').optional(),
  referenceType: z.string().max(50).optional(),
});

export const createInvoiceSchema = z.object({
  patientId: z.string().uuid('Invalid patient ID'),
  items: z.array(invoiceItemSchema).min(1, 'At least one invoice item is required'),
  taxRate: z
    .number()
    .min(0, 'Tax rate cannot be negative')
    .max(100, 'Tax rate cannot exceed 100%')
    .default(0),
  discountAmount: z.number().min(0, 'Discount amount cannot be negative').default(0),
  notes: z.string().max(2000).optional(),
  dueDate: z.coerce.date().optional(),
});

export const updateInvoiceSchema = z.object({
  status: z.enum(UPDATABLE_INVOICE_STATUSES).optional(),
  notes: z.string().max(2000).optional(),
});

export const invoiceActionNotesSchema = z.object({
  notes: z.string().max(2000).optional(),
});

export const invoiceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  patientId: z.string().uuid('Invalid patient ID').optional(),
  status: z.enum(INVOICE_STATUSES).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export const invoiceIdParamSchema = z.object({
  id: z.string().uuid('Invalid invoice ID'),
});

export const patientBillingParamSchema = z.object({
  patientId: z.string().uuid('Invalid patient ID'),
});

export type InvoiceItemCategory = (typeof INVOICE_ITEM_CATEGORIES)[number];
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type InvoiceQueryInput = z.infer<typeof invoiceQuerySchema>;
