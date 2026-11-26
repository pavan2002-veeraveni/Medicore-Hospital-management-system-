// =============================================================================
// MediCore API - Lab Results Routes
// =============================================================================

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { laboratoryController } from './laboratory.controller';
import { resultIdParamSchema } from './laboratory.schemas';
import { paginatedResponse, successResponse } from '../../utils/apiResponse';
import { ForbiddenError, NotFoundError } from '../../middleware/errorHandler';

const router = Router();

const labResultQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  patientId: z.string().uuid('Invalid patientId format').optional(),
});

router.use(authenticate);

router.get('/', authorize('LAB_TECHNICIAN', 'DOCTOR', 'NURSE', 'PATIENT'), validate({ query: labResultQuerySchema }), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const skip = (page - 1) * limit;

    const where: Record<string, any> = {};
    const isPatientOnly =
      req.user!.roles.includes('PATIENT') &&
      !req.user!.roles.some((r) => ['LAB_TECHNICIAN', 'DOCTOR', 'NURSE', 'HOSPITAL_ADMIN'].includes(r));

    if (isPatientOnly) {
      where.labOrderItem = { labOrder: { patient: { userId: req.user!.userId } } };
    } else if (typeof req.query.patientId === 'string') {
      where.labOrderItem = { labOrder: { patientId: req.query.patientId } };
    }

    const [results, total] = await Promise.all([
      prisma.labResult.findMany({
        where,
        skip,
        take: limit,
        orderBy: { resultedAt: 'desc' },
        include: {
          labOrderItem: {
            include: {
              test: true,
              labOrder: {
                include: {
                  patient: {
                    include: {
                      user: { select: { firstName: true, lastName: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.labResult.count({ where }),
    ]);

    paginatedResponse(res, results, total, page, limit, 'Lab results retrieved successfully');
  } catch (error) {
    next(error);
  }
});

router.get(
  '/:resultId',
  authorize('LAB_TECHNICIAN', 'DOCTOR', 'NURSE', 'PATIENT'),
  validate({ params: resultIdParamSchema }),
  async (req, res, next) => {
    try {
      const result = await prisma.labResult.findUnique({
        where: { id: req.params.resultId },
        include: {
          labOrderItem: {
            include: {
              test: true,
              labOrder: {
                include: {
                  patient: {
                    select: { id: true, userId: true, registrationNumber: true },
                  },
                },
              },
            },
          },
        },
      });

      if (!result) throw new NotFoundError('Lab result not found');

      const isPatientOnly =
        req.user!.roles.includes('PATIENT') &&
        !req.user!.roles.some((r) => ['LAB_TECHNICIAN', 'DOCTOR', 'NURSE', 'HOSPITAL_ADMIN'].includes(r));

      if (isPatientOnly && result.labOrderItem.labOrder.patient.userId !== req.user!.userId) {
        throw new ForbiddenError('You do not have permission to view this lab result');
      }

      successResponse(res, result, 'Lab result retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/:resultId/validate',
  authorize('LAB_TECHNICIAN'),
  validate({ params: resultIdParamSchema }),
  laboratoryController.validateLabResult
);

export default router;
