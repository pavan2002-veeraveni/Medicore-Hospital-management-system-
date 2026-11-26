// =============================================================================
// MediCore API - Laboratory Test Catalog Routes
// =============================================================================

import { Router } from 'express';
import { laboratoryController } from './laboratory.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  createLabTestSchema,
  idParamSchema,
  labTestQuerySchema,
  updateLabTestSchema,
} from './laboratory.schemas';

const router = Router();

/**
 * @swagger
 * /api/v1/laboratories:
 *   get:
 *     summary: List laboratory tests in catalog
 *     tags: [Laboratory]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: isActive
 *         schema: { type: boolean }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200: { description: Laboratory tests retrieved successfully }
 *       401: { description: Unauthorized }
 */
router.get(
  '/',
  authenticate,
  validate({ query: labTestQuerySchema }),
  laboratoryController.getLabTests
);

/**
 * @swagger
 * /api/v1/laboratories/{id}:
 *   get:
 *     summary: Get laboratory test details by ID
 *     tags: [Laboratory]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Laboratory test retrieved successfully }
 *       404: { description: Laboratory test not found }
 */
router.get(
  '/:id',
  authenticate,
  validate({ params: idParamSchema }),
  laboratoryController.getLabTestById
);

/**
 * @swagger
 * /api/v1/laboratories:
 *   post:
 *     summary: Create a new laboratory test in the catalog
 *     tags: [Laboratory]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, code, category]
 *             properties:
 *               name: { type: string }
 *               code: { type: string }
 *               category: { type: string }
 *               description: { type: string }
 *               unit: { type: string }
 *               referenceMin: { type: number }
 *               referenceMax: { type: number }
 *               referenceRange: { type: string }
 *               sampleType: { type: string }
 *               turnaroundHours: { type: integer }
 *               price: { type: number }
 *     responses:
 *       201: { description: Laboratory test created successfully }
 *       403: { description: Forbidden }
 *       409: { description: Duplicate test code }
 */
router.post(
  '/',
  authenticate,
  authorize('HOSPITAL_ADMIN', 'LAB_TECHNICIAN'),
  validate({ body: createLabTestSchema }),
  laboratoryController.createLabTest
);

/**
 * @swagger
 * /api/v1/laboratories/{id}:
 *   put:
 *     summary: Update a laboratory test in the catalog
 *     tags: [Laboratory]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Laboratory test updated successfully }
 *       403: { description: Forbidden }
 *       404: { description: Laboratory test not found }
 */
router.put(
  '/:id',
  authenticate,
  authorize('HOSPITAL_ADMIN'),
  validate({ params: idParamSchema, body: updateLabTestSchema }),
  laboratoryController.updateLabTest
);

/**
 * @swagger
 * /api/v1/laboratories/{id}:
 *   delete:
 *     summary: Deactivate or delete a laboratory test from the catalog
 *     tags: [Laboratory]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Laboratory test removed successfully }
 *       403: { description: Forbidden }
 *       404: { description: Laboratory test not found }
 */
router.delete(
  '/:id',
  authenticate,
  authorize('HOSPITAL_ADMIN'),
  validate({ params: idParamSchema }),
  laboratoryController.deleteLabTest
);

export default router;
