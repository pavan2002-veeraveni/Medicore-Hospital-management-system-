// =============================================================================
// MediCore API - Consent Routes
// =============================================================================

import { Router } from 'express';
import { consentController } from './consent.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  createConsentSchema,
  revokeConsentSchema,
  consentQuerySchema,
  consentIdParamSchema,
} from './consent.schemas';

const router = Router();

/**
 * @swagger
 * /api/v1/consents:
 *   post:
 *     summary: Grant a patient consent
 *     tags: [Consents]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patientId, category, purpose]
 *             properties:
 *               patientId: { type: string, format: uuid }
 *               category: { type: string, enum: [TREATMENT, DATA_SHARING, RESEARCH, COMMUNICATION] }
 *               purpose: { type: string }
 *               expiresAt: { type: string, format: date-time }
 *     responses:
 *       201: { description: Consent granted successfully }
 *       403: { description: Forbidden }
 */
router.post(
  '/',
  authenticate,
  authorize('PATIENT', 'HOSPITAL_ADMIN'),
  validate({ body: createConsentSchema }),
  (req, res, next) => consentController.grant(req, res, next)
);

/**
 * @swagger
 * /api/v1/consents:
 *   get:
 *     summary: List consent records
 *     tags: [Consents]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: patientId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [TREATMENT, DATA_SHARING, RESEARCH, COMMUNICATION] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [GRANTED, REVOKED, EXPIRED] }
 *     responses:
 *       200: { description: Consents retrieved successfully }
 */
router.get(
  '/',
  authenticate,
  authorize('PATIENT', 'HOSPITAL_ADMIN'),
  validate({ query: consentQuerySchema }),
  (req, res, next) => consentController.findByPatient(req, res, next)
);

/**
 * @swagger
 * /api/v1/consents/{id}/revoke:
 *   patch:
 *     summary: Revoke a patient consent
 *     tags: [Consents]
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
 *             required: [reason]
 *             properties:
 *               reason: { type: string }
 *     responses:
 *       200: { description: Consent revoked successfully }
 *       403: { description: Forbidden }
 *       404: { description: Consent not found }
 */
router.patch(
  '/:id/revoke',
  authenticate,
  authorize('PATIENT'),
  validate({ params: consentIdParamSchema, body: revokeConsentSchema }),
  (req, res, next) => consentController.revoke(req, res, next)
);

export default router;
