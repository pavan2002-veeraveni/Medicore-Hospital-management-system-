// =============================================================================
// MediCore API - Patient Module Schemas (Zod)
// =============================================================================

import { z } from 'zod';

export const genderEnum = z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']);

export const bloodTypeEnum = z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);

export const emergencyContactSchema = z.object({
  firstName: z.string().trim().min(1, 'Emergency contact first name is required').max(100),
  lastName: z.string().trim().min(1, 'Emergency contact last name is required').max(100),
  relationship: z.string().trim().min(1, 'Relationship is required').max(50),
  phone: z.string().trim().min(5, 'Emergency contact phone is required').max(20),
  email: z.string().trim().email('Invalid emergency contact email').max(255).optional().nullable(),
});

export const createPatientSchema = z.object({
  userId: z.string().uuid('Invalid user ID').optional(),
  registrationNumber: z
    .string()
    .trim()
    .regex(/^MED-\d{6}$/, 'Registration number must follow MED-XXXXXX format')
    .optional(),
  dateOfBirth: z.coerce
    .date({
      required_error: 'Date of birth is required',
      invalid_type_error: 'Invalid date of birth',
    })
    .refine((date) => date <= new Date(), 'Date of birth cannot be in the future'),
  gender: genderEnum,
  bloodType: bloodTypeEnum.optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  state: z.string().trim().max(100).optional().nullable(),
  postalCode: z.string().trim().max(20).optional().nullable(),
  country: z.string().trim().max(100).optional().nullable(),
  allergies: z.string().trim().max(2000).optional().nullable(),
  medicalNotes: z.string().trim().max(5000).optional().nullable(),
  emergencyContact: emergencyContactSchema.optional(),
});

export const updatePatientSchema = createPatientSchema
  .omit({ userId: true, registrationNumber: true })
  .partial();

export const patientQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
  limit: z.coerce.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').default(20),
  search: z.string().trim().max(100).optional(),
  gender: genderEnum.optional(),
  bloodType: bloodTypeEnum.optional(),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'registeredAt', 'dateOfBirth', 'registrationNumber'])
    .default('createdAt'),
  order: z.preprocess(
    (val) => (typeof val === 'string' ? val.toLowerCase() : val),
    z.enum(['asc', 'desc']).default('desc')
  ),
});

export const patientSearchQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(100).optional(),
    search: z.string().trim().min(1).max(100).optional(),
    term: z.string().trim().min(1).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .refine((data) => Boolean(data.q || data.search || data.term), {
    message: 'A search term (q, search, or term) is required',
  });

export const patientIdParamSchema = z.object({
  id: z.string().uuid('Invalid patient ID format'),
});

export type EmergencyContactInput = z.infer<typeof emergencyContactSchema>;
export type CreatePatientInput = z.infer<typeof createPatientSchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
export type PatientQueryInput = z.infer<typeof patientQuerySchema>;
export type PatientSearchQueryInput = z.infer<typeof patientSearchQuerySchema>;
export type PatientIdParamInput = z.infer<typeof patientIdParamSchema>;
