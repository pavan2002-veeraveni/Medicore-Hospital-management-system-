// =============================================================================
// MediCore API - FHIR Routes
// =============================================================================

import { Router } from 'express';
import {
  fhirController,
  fhirIdParamSchema,
  fhirSyncQuerySchema,
} from './fhir.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const router = Router();

/**
 * @swagger
 * /api/v1/fhir/Patient/{id}/export:
 *   get:
 *     summary: Export a patient record as a FHIR R4 Patient resource
 *     tags: [FHIR]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: FHIR Patient exported successfully }
 *       404: { description: Patient not found }
 */
router.get(
  '/Patient/:id/export',
  authenticate,
  authorize('HOSPITAL_ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'),
  validate({ params: fhirIdParamSchema }),
  (req, res, next) => fhirController.exportPatient(req, res, next)
);

/**
 * @swagger
 * /api/v1/fhir/Patient/import:
 *   post:
 *     summary: Import a FHIR R4 Patient resource into MediCore
 *     tags: [FHIR]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201: { description: FHIR Patient imported successfully }
 *       400: { description: Invalid FHIR resource }
 */
router.post(
  '/Patient/import',
  authenticate,
  authorize('HOSPITAL_ADMIN', 'RECEPTIONIST'),
  (req, res, next) => fhirController.importPatient(req, res, next)
);

/**
 * @swagger
 * /api/v1/fhir/Appointment/{id}/export:
 *   get:
 *     summary: Export an appointment record as a FHIR R4 Appointment resource
 *     tags: [FHIR]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: FHIR Appointment exported successfully }
 *       404: { description: Appointment not found }
 */
router.get(
  '/Appointment/:id/export',
  authenticate,
  authorize('HOSPITAL_ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'),
  validate({ params: fhirIdParamSchema }),
  (req, res, next) => fhirController.exportAppointment(req, res, next)
);

router.get(
  '/Encounter/:id/export',
  authenticate,
  authorize('HOSPITAL_ADMIN', 'DOCTOR', 'NURSE'),
  validate({ params: fhirIdParamSchema }),
  (req, res, next) => fhirController.exportEncounter(req, res, next)
);

router.get(
  '/Observation/:id/export',
  authenticate,
  authorize('HOSPITAL_ADMIN', 'DOCTOR', 'NURSE', 'LAB_TECHNICIAN'),
  validate({ params: fhirIdParamSchema }),
  (req, res, next) => fhirController.exportObservation(req, res, next)
);

/**
 * @swagger
 * /api/v1/fhir/sync-records:
 *   get:
 *     summary: List FHIR synchronization records
 *     tags: [FHIR]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: resourceType
 *         schema: { type: string }
 *       - in: query
 *         name: direction
 *         schema: { type: string, enum: [IMPORT, EXPORT] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PENDING, SUCCESS, FAILED] }
 *     responses:
 *       200: { description: FHIR sync records retrieved successfully }
 */
router.get(
  '/sync-records',
  authenticate,
  authorize('HOSPITAL_ADMIN', 'DOCTOR'),
  validate({ query: fhirSyncQuerySchema }),
  (req, res, next) => fhirController.getSyncRecords(req, res, next)
);

export default router;
