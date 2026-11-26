// =============================================================================
// MediCore API - Encounter Routes
// =============================================================================

import { Router } from 'express';
import { encounterController } from './encounter.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { auditMiddleware } from '../../middleware/audit';
import {
  createEncounterSchema,
  updateEncounterSchema,
  vitalSignSchema,
  encounterQuerySchema,
  encounterIdParamSchema,
} from './encounter.schemas';

const router = Router();

// All encounter routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/v1/encounters:
 *   post:
 *     summary: Create a new clinical encounter
 *     tags: [Encounters]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patientId]
 *             properties:
 *               patientId: { type: string, format: uuid }
 *               appointmentId: { type: string, format: uuid }
 *               type: { type: string, enum: [OUTPATIENT, INPATIENT, EMERGENCY], default: OUTPATIENT }
 *               chiefComplaint: { type: string }
 *               clinicalNotes: { type: string }
 *     responses:
 *       201: { description: Encounter created successfully }
 *       403: { description: Forbidden }
 *       404: { description: Patient or appointment not found }
 */
router.post(
  '/',
  authorize('DOCTOR'),
  validate({ body: createEncounterSchema }),
  auditMiddleware('CREATE', 'ENCOUNTER'),
  encounterController.create
);

/**
 * @swagger
 * /api/v1/encounters:
 *   get:
 *     summary: List clinical encounters with filters
 *     tags: [Encounters]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: patientId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: doctorId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [IN_PROGRESS, COMPLETED] }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [OUTPATIENT, INPATIENT, EMERGENCY] }
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Encounters retrieved successfully }
 */
router.get(
  '/',
  authorize('DOCTOR', 'NURSE'),
  validate({ query: encounterQuerySchema }),
  encounterController.findAll
);

/**
 * @swagger
 * /api/v1/encounters/{id}:
 *   get:
 *     summary: Get encounter details including vitals, diagnoses, prescriptions, and lab orders
 *     tags: [Encounters]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Encounter retrieved successfully }
 *       404: { description: Encounter not found }
 */
router.get(
  '/:id',
  authorize('DOCTOR', 'NURSE'),
  validate({ params: encounterIdParamSchema }),
  encounterController.findById
);

/**
 * @swagger
 * /api/v1/encounters/{id}:
 *   patch:
 *     summary: Update encounter clinical notes or status
 *     tags: [Encounters]
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
 *               clinicalNotes: { type: string }
 *               status: { type: string, enum: [IN_PROGRESS, COMPLETED] }
 *     responses:
 *       200: { description: Encounter updated successfully }
 *       404: { description: Encounter not found }
 *       422: { description: Invalid state transition }
 */
router.patch(
  '/:id',
  authorize('DOCTOR'),
  validate({ params: encounterIdParamSchema, body: updateEncounterSchema }),
  auditMiddleware('UPDATE', 'ENCOUNTER'),
  encounterController.update
);

/**
 * @swagger
 * /api/v1/encounters/{id}/vitals:
 *   post:
 *     summary: Record vital signs for an encounter
 *     tags: [Encounters]
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
 *               temperature: { type: number }
 *               bpSystolic: { type: integer }
 *               bpDiastolic: { type: integer }
 *               heartRate: { type: integer }
 *               respiratoryRate: { type: integer }
 *               oxygenSaturation: { type: number }
 *               weight: { type: number }
 *               height: { type: number }
 *               notes: { type: string }
 *     responses:
 *       201: { description: Vital signs recorded successfully }
 *       404: { description: Encounter not found }
 *       422: { description: Encounter is not in progress }
 */
router.post(
  '/:id/vitals',
  authorize('DOCTOR', 'NURSE'),
  validate({ params: encounterIdParamSchema, body: vitalSignSchema }),
  auditMiddleware('CREATE', 'VITAL_SIGN'),
  encounterController.addVitalSigns
);

/**
 * @swagger
 * /api/v1/encounters/{id}/complete:
 *   patch:
 *     summary: Mark an encounter as completed
 *     tags: [Encounters]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Encounter completed successfully }
 *       404: { description: Encounter not found }
 *       422: { description: Invalid state transition }
 */
router.patch(
  '/:id/complete',
  authorize('DOCTOR'),
  validate({ params: encounterIdParamSchema }),
  auditMiddleware('COMPLETE', 'ENCOUNTER'),
  encounterController.complete
);

export default router;
