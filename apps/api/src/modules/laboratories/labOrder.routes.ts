// =============================================================================
// MediCore API - Lab Orders & Results Routes
// =============================================================================

import { Router } from 'express';
import { laboratoryController } from './laboratory.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  collectSpecimensSchema,
  createLabOrderSchema,
  idParamSchema,
  labOrderQuerySchema,
  labResultSchema,
  orderItemParamSchema,
  resultIdParamSchema,
  updateLabOrderItemStatusSchema,
  updateLabOrderStatusSchema,
} from './laboratory.schemas';

const router = Router();

/**
 * @swagger
 * /api/v1/lab-orders:
 *   post:
 *     summary: Create a new lab order
 *     tags: [Lab Orders]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patientId, items]
 *             properties:
 *               patientId: { type: string, format: uuid }
 *               encounterId: { type: string, format: uuid }
 *               priority: { type: string, enum: [ROUTINE, URGENT, STAT] }
 *               clinicalNotes: { type: string }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [testId]
 *                   properties:
 *                     testId: { type: string, format: uuid }
 *     responses:
 *       201: { description: Lab order created successfully }
 *       403: { description: Forbidden }
 *       404: { description: Patient, encounter, or test not found }
 */
router.post(
  '/',
  authenticate,
  authorize('DOCTOR'),
  validate({ body: createLabOrderSchema }),
  laboratoryController.createLabOrder
);

/**
 * @swagger
 * /api/v1/lab-orders:
 *   get:
 *     summary: List lab orders
 *     tags: [Lab Orders]
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
 *         name: encounterId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ORDERED, SPECIMEN_COLLECTED, PROCESSING, COMPLETED, CANCELLED] }
 *       - in: query
 *         name: priority
 *         schema: { type: string, enum: [ROUTINE, URGENT, STAT] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200: { description: Lab orders retrieved successfully }
 *       403: { description: Forbidden }
 */
router.get(
  '/',
  authenticate,
  authorize('LAB_TECHNICIAN', 'DOCTOR', 'NURSE', 'HOSPITAL_ADMIN', 'PATIENT'),
  validate({ query: labOrderQuerySchema }),
  laboratoryController.getLabOrders
);

/**
 * @swagger
 * /api/v1/lab-orders/results/{resultId}/validate:
 *   patch:
 *     summary: Validate a recorded lab result
 *     tags: [Lab Orders]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: resultId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Lab result validated successfully }
 *       403: { description: Forbidden }
 *       404: { description: Lab result not found }
 *       409: { description: Lab result already validated }
 */
router.patch(
  '/results/:resultId/validate',
  authenticate,
  authorize('LAB_TECHNICIAN'),
  validate({ params: resultIdParamSchema }),
  laboratoryController.validateLabResult
);

/**
 * @swagger
 * /api/v1/lab-orders/{id}:
 *   get:
 *     summary: Get lab order by ID
 *     tags: [Lab Orders]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Lab order retrieved successfully }
 *       403: { description: Forbidden }
 *       404: { description: Lab order not found }
 */
router.get(
  '/:id',
  authenticate,
  authorize('LAB_TECHNICIAN', 'DOCTOR', 'PATIENT'),
  validate({ params: idParamSchema }),
  laboratoryController.getLabOrderById
);

/**
 * @swagger
 * /api/v1/lab-orders/{id}/status:
 *   patch:
 *     summary: Update lab order status
 *     tags: [Lab Orders]
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
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [ORDERED, SPECIMEN_COLLECTED, PROCESSING, COMPLETED, CANCELLED] }
 *               notes: { type: string }
 *     responses:
 *       200: { description: Lab order status updated successfully }
 *       422: { description: Invalid state transition }
 */
router.patch(
  '/:id/status',
  authenticate,
  authorize('LAB_TECHNICIAN'),
  validate({ params: idParamSchema, body: updateLabOrderStatusSchema }),
  laboratoryController.updateLabOrderStatus
);

/**
 * @swagger
 * /api/v1/lab-orders/{id}/collect:
 *   post:
 *     summary: Collect specimens for pending items in a lab order
 *     tags: [Lab Orders]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Specimens collected successfully }
 *       422: { description: Invalid state transition }
 */
router.post(
  '/:id/collect',
  authenticate,
  authorize('LAB_TECHNICIAN', 'NURSE'),
  validate({ params: idParamSchema, body: collectSpecimensSchema }),
  laboratoryController.collectSpecimens
);

/**
 * @swagger
 * /api/v1/lab-orders/{id}/items/{itemId}/status:
 *   patch:
 *     summary: Update status of an individual lab order item (specimen collection / processing)
 *     tags: [Lab Orders]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Lab order item status updated successfully }
 *       404: { description: Lab order item not found }
 *       422: { description: Invalid state transition }
 */
router.patch(
  '/:id/items/:itemId/status',
  authenticate,
  authorize('LAB_TECHNICIAN'),
  validate({ params: orderItemParamSchema, body: updateLabOrderItemStatusSchema }),
  laboratoryController.updateLabOrderItemStatus
);

/**
 * @swagger
 * /api/v1/lab-orders/{id}/results:
 *   post:
 *     summary: Record a lab result for a lab order item
 *     tags: [Lab Orders]
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
 *             required: [labOrderItemId, value]
 *             properties:
 *               labOrderItemId: { type: string, format: uuid }
 *               value: { type: string }
 *               numericValue: { type: number }
 *               unit: { type: string }
 *               referenceRange: { type: string }
 *               isAbnormal: { type: boolean }
 *               abnormalFlag: { type: string, enum: [HIGH, LOW, CRITICAL] }
 *               notes: { type: string }
 *     responses:
 *       201: { description: Lab result recorded successfully }
 *       400: { description: Validation error or patient/order mismatch }
 *       404: { description: Lab order item not found }
 *       409: { description: Result already recorded }
 */
router.post(
  '/:id/results',
  authenticate,
  authorize('LAB_TECHNICIAN'),
  validate({ params: idParamSchema, body: labResultSchema }),
  laboratoryController.recordLabResult
);

export default router;
