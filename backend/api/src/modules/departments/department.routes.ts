// =============================================================================
// MediCore API - Department Routes
// =============================================================================

import { Router } from 'express';
import { departmentController } from './department.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  createDepartmentSchema,
  departmentIdParamSchema,
  departmentQuerySchema,
  updateDepartmentSchema,
} from './department.schemas';

const router = Router();

/**
 * @swagger
 * /api/v1/departments:
 *   get:
 *     summary: List departments with pagination and filtering
 *     tags: [Departments]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Departments retrieved successfully }
 *       401: { description: Unauthorized }
 */
router.get(
  '/',
  authenticate,
  validate({ query: departmentQuerySchema }),
  departmentController.findAll
);

/**
 * @swagger
 * /api/v1/departments/{id}:
 *   get:
 *     summary: Get a department by ID
 *     tags: [Departments]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Department retrieved successfully }
 *       401: { description: Unauthorized }
 *       404: { description: Department not found }
 */
router.get(
  '/:id',
  authenticate,
  validate({ params: departmentIdParamSchema }),
  departmentController.findById
);

/**
 * @swagger
 * /api/v1/departments:
 *   post:
 *     summary: Create a new department
 *     tags: [Departments]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Department created successfully }
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       409: { description: Conflict - duplicate name or code }
 */
router.post(
  '/',
  authenticate,
  authorize('HOSPITAL_ADMIN'),
  validate({ body: createDepartmentSchema }),
  departmentController.create
);

/**
 * @swagger
 * /api/v1/departments/{id}:
 *   put:
 *     summary: Update a department
 *     tags: [Departments]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Department updated successfully }
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Department not found }
 *       409: { description: Conflict - duplicate name or code }
 */
router.put(
  '/:id',
  authenticate,
  authorize('HOSPITAL_ADMIN'),
  validate({ params: departmentIdParamSchema, body: updateDepartmentSchema }),
  departmentController.update
);

/**
 * @swagger
 * /api/v1/departments/{id}:
 *   delete:
 *     summary: Deactivate a department
 *     tags: [Departments]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Department deactivated successfully }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Department not found }
 *       422: { description: Cannot deactivate department with active staff }
 */
router.delete(
  '/:id',
  authenticate,
  authorize('HOSPITAL_ADMIN'),
  validate({ params: departmentIdParamSchema }),
  departmentController.delete
);

export default router;
