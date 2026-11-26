// =============================================================================
// MediCore API - Patient Routes
// =============================================================================

import { Router } from 'express';
import { patientController } from './patient.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  createPatientSchema,
  updatePatientSchema,
  patientQuerySchema,
  patientSearchQuerySchema,
  patientIdParamSchema,
} from './patient.schemas';

const router = Router();

/**
 * @swagger
 * /api/v1/patients:
 *   post:
 *     summary: Register a new patient record
 *     tags: [Patients]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [dateOfBirth, gender]
 *             properties:
 *               userId: { type: string, format: uuid }
 *               registrationNumber: { type: string, example: 'MED-000001' }
 *               dateOfBirth: { type: string, format: date, example: '1990-05-14' }
 *               gender: { type: string, enum: [MALE, FEMALE, OTHER, PREFER_NOT_TO_SAY] }
 *               bloodType: { type: string, enum: [A+, A-, B+, B-, AB+, AB-, O+, O-] }
 *               address: { type: string }
 *               city: { type: string }
 *               state: { type: string }
 *               postalCode: { type: string }
 *               country: { type: string }
 *               allergies: { type: string }
 *               medicalNotes: { type: string }
 *               emergencyContact:
 *                 type: object
 *                 required: [firstName, lastName, relationship, phone]
 *                 properties:
 *                   firstName: { type: string }
 *                   lastName: { type: string }
 *                   relationship: { type: string }
 *                   phone: { type: string }
 *                   email: { type: string, format: email }
 *     responses:
 *       201: { description: Patient created successfully }
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       409: { description: Duplicate patient or profile already exists }
 */
router.post(
  '/',
  authenticate,
  authorize('RECEPTIONIST', 'HOSPITAL_ADMIN', 'DOCTOR', 'NURSE', 'PATIENT'),
  validate({ body: createPatientSchema }),
  patientController.create
);

/**
 * @swagger
 * /api/v1/patients:
 *   get:
 *     summary: List patients with pagination, search, and filtering
 *     tags: [Patients]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: gender
 *         schema: { type: string, enum: [MALE, FEMALE, OTHER, PREFER_NOT_TO_SAY] }
 *       - in: query
 *         name: bloodType
 *         schema: { type: string, enum: [A+, A-, B+, B-, AB+, AB-, O+, O-] }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [createdAt, updatedAt, registeredAt, dateOfBirth, registrationNumber], default: createdAt }
 *       - in: query
 *         name: order
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *     responses:
 *       200: { description: Patients retrieved successfully }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 */
router.get(
  '/',
  authenticate,
  authorize('RECEPTIONIST', 'DOCTOR', 'NURSE', 'HOSPITAL_ADMIN', 'BILLING_OFFICER'),
  validate({ query: patientQuerySchema }),
  patientController.findAll
);

/**
 * @swagger
 * /api/v1/patients/search:
 *   get:
 *     summary: Search patients by name or registration number
 *     tags: [Patients]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Search term (can also be passed as search or term)
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 50, default: 20 }
 *     responses:
 *       200: { description: Matching patients retrieved }
 *       400: { description: Missing search term }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 */
router.get(
  '/me',
  authenticate,
  authorize('PATIENT'),
  patientController.getMe
);

router.get(
  '/search',
  authenticate,
  authorize('RECEPTIONIST', 'DOCTOR', 'NURSE'),
  validate({ query: patientSearchQuerySchema }),
  patientController.searchPatients
);

/**
 * @swagger
 * /api/v1/patients/{id}:
 *   get:
 *     summary: Get patient record by ID
 *     tags: [Patients]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Patient retrieved successfully }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Patient not found }
 */
router.get(
  '/:id',
  authenticate,
  authorize('PATIENT', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'HOSPITAL_ADMIN', 'BILLING_OFFICER', 'LAB_TECHNICIAN'),
  validate({ params: patientIdParamSchema }),
  patientController.findById
);

/**
 * @swagger
 * /api/v1/patients/{id}:
 *   put:
 *     summary: Update patient profile
 *     tags: [Patients]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               dateOfBirth: { type: string, format: date }
 *               gender: { type: string, enum: [MALE, FEMALE, OTHER, PREFER_NOT_TO_SAY] }
 *               bloodType: { type: string, enum: [A+, A-, B+, B-, AB+, AB-, O+, O-] }
 *               address: { type: string }
 *               city: { type: string }
 *               state: { type: string }
 *               postalCode: { type: string }
 *               country: { type: string }
 *               allergies: { type: string }
 *               medicalNotes: { type: string }
 *               emergencyContact:
 *                 type: object
 *                 required: [firstName, lastName, relationship, phone]
 *                 properties:
 *                   firstName: { type: string }
 *                   lastName: { type: string }
 *                   relationship: { type: string }
 *                   phone: { type: string }
 *                   email: { type: string, format: email }
 *     responses:
 *       200: { description: Patient updated successfully }
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Patient not found }
 */
router.put(
  '/:id',
  authenticate,
  authorize('PATIENT', 'HOSPITAL_ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE'),
  validate({ params: patientIdParamSchema, body: updatePatientSchema }),
  patientController.update
);

export default router;
