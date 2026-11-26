// =============================================================================
// MediCore API - Laboratory Module Schemas (Zod)
// =============================================================================

import { z } from 'zod';

export const LAB_ORDER_STATUSES = [
  'ORDERED',
  'SPECIMEN_COLLECTED',
  'PROCESSING',
  'COMPLETED',
  'CANCELLED',
] as const;

export const LAB_ORDER_ITEM_STATUSES = [
  'PENDING',
  'SPECIMEN_COLLECTED',
  'PROCESSING',
  'COMPLETED',
  'CANCELLED',
] as const;

export const LAB_ORDER_PRIORITIES = ['ROUTINE', 'URGENT', 'STAT'] as const;

export const ABNORMAL_FLAGS = ['HIGH', 'LOW', 'CRITICAL'] as const;

export type LabOrderStatus = (typeof LAB_ORDER_STATUSES)[number];
export type LabOrderItemStatus = (typeof LAB_ORDER_ITEM_STATUSES)[number];
export type LabOrderPriority = (typeof LAB_ORDER_PRIORITIES)[number];
export type AbnormalFlag = (typeof ABNORMAL_FLAGS)[number];

const labTestBaseSchema = z.object({
  name: z.string().trim().min(1, 'Test name is required').max(255),
  code: z
    .string()
    .trim()
    .min(1, 'Test code is required')
    .max(20)
    .transform((val) => val.toUpperCase()),
  category: z.string().trim().min(1, 'Category is required').max(100),
  description: z.string().trim().optional().nullable(),
  unit: z.string().trim().max(50).optional().nullable(),
  referenceMin: z.number().finite().optional().nullable(),
  referenceMax: z.number().finite().optional().nullable(),
  referenceRange: z.string().trim().max(100).optional().nullable(),
  sampleType: z.string().trim().max(50).optional().nullable(),
  turnaroundHours: z
    .number()
    .int('Turnaround hours must be an integer')
    .positive('Turnaround hours must be greater than 0')
    .optional()
    .nullable(),
  price: z.number().nonnegative('Price cannot be negative').optional().nullable(),
  isActive: z.boolean().optional(),
});

const validateReferenceRangeOrder = (
  data: { referenceMin?: number | null; referenceMax?: number | null },
  ctx: z.RefinementCtx
) => {
  if (
    data.referenceMin !== undefined &&
    data.referenceMin !== null &&
    data.referenceMax !== undefined &&
    data.referenceMax !== null &&
    data.referenceMin > data.referenceMax
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'referenceMin cannot be greater than referenceMax',
      path: ['referenceMin'],
    });
  }
};

export const createLabTestSchema = labTestBaseSchema.superRefine(validateReferenceRangeOrder);

export const updateLabTestSchema = labTestBaseSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  })
  .superRefine(validateReferenceRangeOrder);

export const labTestQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: z.string().trim().min(1).max(100).optional(),
  isActive: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
  search: z.string().trim().min(1).max(100).optional(),
});

const labOrderItemInputSchema = z.union([
  z.string().uuid('Invalid test ID').transform((testId) => ({ testId })),
  z.object({
    testId: z.string().uuid('Invalid test ID'),
  }),
]);

export const createLabOrderSchema = z.object({
  patientId: z.string().uuid('Invalid patient ID'),
  encounterId: z.string().uuid('Invalid encounter ID').optional().nullable(),
  items: z
    .array(labOrderItemInputSchema)
    .min(1, 'At least one lab test item is required')
    .max(50, 'Cannot order more than 50 tests in a single order'),
  priority: z.enum(LAB_ORDER_PRIORITIES).default('ROUTINE'),
  clinicalNotes: z.string().trim().max(2000).optional().nullable(),
});

export const updateLabOrderStatusSchema = z.object({
  status: z.enum(LAB_ORDER_STATUSES),
  notes: z.string().trim().max(1000).optional(),
});

export const labOrderQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  patientId: z.string().uuid('Invalid patient ID').optional(),
  encounterId: z.string().uuid('Invalid encounter ID').optional(),
  status: z.enum(LAB_ORDER_STATUSES).optional(),
  priority: z.enum(LAB_ORDER_PRIORITIES).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

export const updateLabOrderItemStatusSchema = z.object({
  status: z.enum(LAB_ORDER_ITEM_STATUSES).default('SPECIMEN_COLLECTED'),
  notes: z.string().trim().max(1000).optional(),
});

export const collectSpecimensSchema = z.object({
  itemIds: z.array(z.string().uuid('Invalid lab order item ID')).min(1).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const labResultSchema = z.object({
  labOrderItemId: z.string().uuid('Invalid lab order item ID'),
  value: z.string().trim().min(1, 'Result value is required').max(255),
  numericValue: z.number().finite().optional().nullable(),
  unit: z.string().trim().max(50).optional().nullable(),
  referenceRange: z.string().trim().max(100).optional().nullable(),
  isAbnormal: z.boolean().optional(),
  abnormalFlag: z.enum(ABNORMAL_FLAGS).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const idParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

export const orderItemParamSchema = z.object({
  id: z.string().uuid('Invalid lab order ID'),
  itemId: z.string().uuid('Invalid lab order item ID'),
});

export const resultIdParamSchema = z.object({
  resultId: z.string().uuid('Invalid lab result ID'),
});

export type CreateLabTestInput = z.infer<typeof createLabTestSchema>;
export type UpdateLabTestInput = z.infer<typeof updateLabTestSchema>;
export type LabTestQueryInput = z.infer<typeof labTestQuerySchema>;
export type CreateLabOrderInput = z.infer<typeof createLabOrderSchema>;
export type UpdateLabOrderStatusInput = z.infer<typeof updateLabOrderStatusSchema>;
export type LabOrderQueryInput = z.infer<typeof labOrderQuerySchema>;
export type UpdateLabOrderItemStatusInput = z.infer<typeof updateLabOrderItemStatusSchema>;
export type CollectSpecimensInput = z.infer<typeof collectSpecimensSchema>;
export type LabResultInput = z.infer<typeof labResultSchema>;
