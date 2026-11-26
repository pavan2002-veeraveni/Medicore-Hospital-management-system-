// =============================================================================
// MediCore API - Staff Module Schemas (Zod)
// =============================================================================

import { z } from 'zod';

const booleanQueryParam = z.preprocess((val) => {
  if (val === 'true') return true;
  if (val === 'false') return false;
  return val;
}, z.boolean().optional());

export const createStaffSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  employeeId: z
    .string()
    .trim()
    .min(1, 'Employee ID is required')
    .max(20, 'Employee ID must be at most 20 characters'),
  departmentId: z.string().uuid('Invalid department ID'),
  specialization: z
    .string()
    .trim()
    .max(100, 'Specialization must be at most 100 characters')
    .optional(),
  qualification: z
    .string()
    .trim()
    .max(255, 'Qualification must be at most 255 characters')
    .optional(),
  licenseNumber: z
    .string()
    .trim()
    .max(50, 'License number must be at most 50 characters')
    .optional(),
  joiningDate: z.coerce.date({
    required_error: 'Joining date is required',
    invalid_type_error: 'Invalid joining date',
  }),
});

export const updateStaffSchema = createStaffSchema
  .omit({ userId: true })
  .partial()
  .extend({
    isActive: z.boolean().optional(),
  });

export const staffQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  departmentId: z.string().uuid('Invalid department ID').optional(),
  specialization: z.string().trim().optional(),
  isActive: booleanQueryParam,
  sortBy: z
    .enum(['createdAt', 'employeeId', 'joiningDate', 'specialization'])
    .default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().trim().optional(),
});

export const doctorQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  departmentId: z.string().uuid('Invalid department ID').optional(),
  specialization: z.string().trim().optional(),
  search: z.string().trim().optional(),
});

export const staffIdParamSchema = z.object({
  id: z.string().uuid('Invalid staff ID'),
});

export const staffDepartmentParamSchema = z.object({
  departmentId: z.string().uuid('Invalid department ID'),
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
export type StaffQueryInput = z.infer<typeof staffQuerySchema>;
export type DoctorQueryInput = z.infer<typeof doctorQuerySchema>;
