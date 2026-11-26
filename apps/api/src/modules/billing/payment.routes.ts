// =============================================================================
// MediCore API - Payment Routes
// =============================================================================

import { Router } from 'express';
import { z } from 'zod';
import { paymentController } from './payment.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createPaymentSchema, paymentQuerySchema } from './payment.schemas';

const router = Router();
const invoiceParamSchema = z.object({ invoiceId: z.string().uuid('Invalid invoice ID') });

router.use(authenticate);

router.post(
  '/',
  authorize('BILLING_OFFICER'),
  validate({ body: createPaymentSchema }),
  paymentController.create.bind(paymentController)
);

router.get(
  '/',
  authorize('BILLING_OFFICER', 'HOSPITAL_ADMIN'),
  validate({ query: paymentQuerySchema }),
  paymentController.findAll.bind(paymentController)
);

router.get(
  '/invoice/:invoiceId',
  authorize('BILLING_OFFICER', 'HOSPITAL_ADMIN', 'PATIENT'),
  validate({ params: invoiceParamSchema }),
  paymentController.findByInvoice.bind(paymentController)
);

export default router;
