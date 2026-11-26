// =============================================================================
// MediCore API - Prescription Routes
// =============================================================================

import { Router } from 'express';
import { z } from 'zod';
import { prescriptionController } from './prescription.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  createPrescriptionSchema,
  prescriptionQuerySchema,
  updatePrescriptionStatusSchema,
} from './prescription.schemas';

const router = Router();
const idParamSchema = z.object({ id: z.string().uuid('Invalid prescription ID') });

router.use(authenticate);

router.get(
  '/medications',
  authorize('DOCTOR', 'NURSE', 'HOSPITAL_ADMIN'),
  prescriptionController.getMedications.bind(prescriptionController)
);

router.post(
  '/',
  authorize('DOCTOR'),
  validate({ body: createPrescriptionSchema }),
  prescriptionController.create.bind(prescriptionController)
);

router.get(
  '/',
  authorize('DOCTOR', 'NURSE', 'PATIENT'),
  validate({ query: prescriptionQuerySchema }),
  prescriptionController.findAll.bind(prescriptionController)
);

router.get(
  '/:id',
  authorize('DOCTOR', 'NURSE', 'PATIENT'),
  validate({ params: idParamSchema }),
  prescriptionController.findById.bind(prescriptionController)
);

router.patch(
  '/:id/status',
  authorize('DOCTOR', 'NURSE'),
  validate({ params: idParamSchema, body: updatePrescriptionStatusSchema }),
  prescriptionController.updateStatus.bind(prescriptionController)
);

export default router;
