// =============================================================================
// MediCore API - Department Module Schemas (Zod)
// =============================================================================

import { z } from 'zod';

const booleanQueryParam = z.preprocess((val) => {
  if (val === 'true') return true;
  if (val === 'false') return false;
  return val;
}, z.boolean().optional());

export const createDepartmentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Department name is required')
    .max(100, 'Department name must be at most 100 characters'),
  code: z
    .string()
    .trim()
    .min(1, 'Department code is required')
    .max(20, 'Department code must be at most 20 characters')
    .transform((val) => val.toUpperCase()),
  description: z.string().trim().optional(),
  headId: z.string().uuid('Invalid head staff ID').nullable().optional(),
  isActive: z.boolean().optional(),
});

export const updateDepartmentSchema = createDepartmentSchema.partial();

export const departmentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  isActive: booleanQueryParam,
  search: z.string().trim().optional(),
  sortBy: z.enum(['createdAt', 'name', 'code']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

export const departmentIdParamSchema = z.object({
  id: z.string().uuid('Invalid department ID'),
});

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
export type DepartmentQueryInput = z.infer<typeof departmentQuerySchema>;
