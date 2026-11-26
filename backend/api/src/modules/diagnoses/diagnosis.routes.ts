// =============================================================================
// MediCore API - Diagnosis Routes
// =============================================================================

import { Router } from 'express';
import { diagnosisController } from './diagnosis.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { auditMiddleware } from '../../middleware/audit';
import {
  createDiagnosisSchema,
  encounterIdParamSchema,
  patientIdParamSchema,
  diagnosisQuerySchema,
} from './diagnosis.schemas';

const router = Router();

// All diagnosis routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/v1/diagnoses:
 *   post:
 *     summary: Record a clinical diagnosis for an encounter
 *     tags: [Diagnoses]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [encounterId, code, description]
 *             properties:
 *               encounterId: { type: string, format: uuid }
 *               code: { type: string, maxLength: 20 }
 *               description: { type: string, maxLength: 500 }
 *               type: { type: string, enum: [PRIMARY, SECONDARY, DIFFERENTIAL], default: PRIMARY }
 *               severity: { type: string, enum: [MILD, MODERATE, SEVERE] }
 *               notes: { type: string }
 *     responses:
 *       201: { description: Diagnosis created successfully }
 *       404: { description: Encounter not found }
 *       422: { description: Encounter is not in progress }
 */
router.post(
  '/',
  authorize('DOCTOR'),
  validate({ body: createDiagnosisSchema }),
  auditMiddleware('CREATE', 'DIAGNOSIS'),
  diagnosisController.create
);

/**
 * @swagger
 * /api/v1/diagnoses/encounter/{encounterId}:
 *   get:
 *     summary: Get diagnoses for a specific encounter
 *     tags: [Diagnoses]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: encounterId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Encounter diagnoses retrieved successfully }
 *       404: { description: Encounter not found }
 */
router.get(
  '/encounter/:encounterId',
  authorize('DOCTOR', 'NURSE'),
  validate({ params: encounterIdParamSchema }),
  diagnosisController.findByEncounter
);

/**
 * @swagger
 * /api/v1/diagnoses/patient/{patientId}:
 *   get:
 *     summary: Get all diagnoses for a patient across encounters
 *     tags: [Diagnoses]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [PRIMARY, SECONDARY, DIFFERENTIAL] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Patient diagnoses retrieved successfully }
 *       404: { description: Patient not found }
 */
router.get(
  '/patient/:patientId',
  authorize('DOCTOR'),
  validate({ params: patientIdParamSchema, query: diagnosisQuerySchema }),
  diagnosisController.findByPatient
);

export default router;
