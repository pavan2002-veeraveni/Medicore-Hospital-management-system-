// =============================================================================
// MediCore API - Billing Routes
// =============================================================================

import { Router } from 'express';
import { billingController } from './billing.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  createInvoiceSchema,
  invoiceActionNotesSchema,
  invoiceIdParamSchema,
  invoiceQuerySchema,
  patientBillingParamSchema,
  updateInvoiceSchema,
} from './billing.schemas';

const router = Router();

router.use(authenticate);

/**
 * @swagger
 * /api/v1/billing:
 *   post:
 *     summary: Create a draft invoice
 *     tags: [Billing]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Invoice created successfully }
 */
router.post(
  '/',
  authorize('BILLING_OFFICER', 'HOSPITAL_ADMIN'),
  validate({ body: createInvoiceSchema }),
  billingController.create.bind(billingController)
);

/**
 * @swagger
 * /api/v1/billing:
 *   get:
 *     summary: List invoices (patients see own only)
 *     tags: [Billing]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Invoices retrieved successfully }
 */
router.get(
  '/',
  authorize('BILLING_OFFICER', 'HOSPITAL_ADMIN', 'PATIENT'),
  validate({ query: invoiceQuerySchema }),
  billingController.findAll.bind(billingController)
);

/**
 * @swagger
 * /api/v1/billing/patient/{patientId}:
 *   get:
 *     summary: Get patient billing summary
 *     tags: [Billing]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Patient billing summary retrieved }
 */
router.get(
  '/patient/:patientId',
  authorize('BILLING_OFFICER', 'HOSPITAL_ADMIN', 'PATIENT'),
  validate({ params: patientBillingParamSchema }),
  billingController.getPatientBilling.bind(billingController)
);

/**
 * @swagger
 * /api/v1/billing/{id}:
 *   get:
 *     summary: Get invoice by ID
 *     tags: [Billing]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Invoice retrieved }
 *       403: { description: Forbidden }
 *       404: { description: Invoice not found }
 */
router.get(
  '/:id',
  authorize('BILLING_OFFICER', 'HOSPITAL_ADMIN', 'PATIENT'),
  validate({ params: invoiceIdParamSchema }),
  billingController.findById.bind(billingController)
);

router.patch(
  '/:id',
  authorize('BILLING_OFFICER', 'HOSPITAL_ADMIN'),
  validate({ params: invoiceIdParamSchema, body: updateInvoiceSchema }),
  billingController.update.bind(billingController)
);

router.patch(
  '/:id/issue',
  authorize('BILLING_OFFICER'),
  validate({ params: invoiceIdParamSchema, body: invoiceActionNotesSchema }),
  billingController.issue.bind(billingController)
);

router.patch(
  '/:id/cancel',
  authorize('BILLING_OFFICER', 'HOSPITAL_ADMIN'),
  validate({ params: invoiceIdParamSchema, body: invoiceActionNotesSchema }),
  billingController.cancel.bind(billingController)
);

export default router;
