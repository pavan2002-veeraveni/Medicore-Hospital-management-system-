// =============================================================================
// MediCore API - Staff Routes
// =============================================================================

import { Router } from 'express';
import { staffController } from './staff.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  createStaffSchema,
  doctorQuerySchema,
  staffDepartmentParamSchema,
  staffIdParamSchema,
  staffQuerySchema,
  updateStaffSchema,
} from './staff.schemas';

const router = Router();

/**
 * @swagger
 * /api/v1/staff:
 *   post:
 *     summary: Create a new staff record
 *     tags: [Staff]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Staff member created successfully }
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: User or department not found }
 *       409: { description: Conflict - duplicate employee ID or user already linked }
 */
router.post(
  '/',
  authenticate,
  authorize('HOSPITAL_ADMIN'),
  validate({ body: createStaffSchema }),
  staffController.create
);

/**
 * @swagger
 * /api/v1/staff:
 *   get:
 *     summary: List staff members with filtering and pagination
 *     tags: [Staff]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Staff members retrieved successfully }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 */
router.get(
  '/',
  authenticate,
  authorize('HOSPITAL_ADMIN', 'RECEPTIONIST'),
  validate({ query: staffQuerySchema }),
  staffController.findAll
);

/**
 * @swagger
 * /api/v1/staff/doctors:
 *   get:
 *     summary: List active doctors for appointment booking
 *     tags: [Staff]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Doctors retrieved successfully }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 */
router.get(
  '/doctors',
  authenticate,
  authorize('HOSPITAL_ADMIN', 'RECEPTIONIST', 'PATIENT', 'DOCTOR', 'NURSE'),
  validate({ query: doctorQuerySchema }),
  staffController.getDoctors
);

/**
 * @swagger
 * /api/v1/staff/department/{departmentId}:
 *   get:
 *     summary: List staff members in a specific department
 *     tags: [Staff]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Department staff members retrieved successfully }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Department not found }
 */
router.get(
  '/department/:departmentId',
  authenticate,
  authorize('HOSPITAL_ADMIN', 'RECEPTIONIST'),
  validate({ params: staffDepartmentParamSchema, query: staffQuerySchema }),
  staffController.findByDepartment
);

/**
 * @swagger
 * /api/v1/staff/{id}:
 *   get:
 *     summary: Get a staff record by ID (Hospital Admin or own staff record)
 *     tags: [Staff]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Staff member retrieved successfully }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Staff member not found }
 */
router.get(
  '/:id',
  authenticate,
  validate({ params: staffIdParamSchema }),
  staffController.findById
);

/**
 * @swagger
 * /api/v1/staff/{id}:
 *   put:
 *     summary: Update a staff record
 *     tags: [Staff]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Staff member updated successfully }
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Staff member or department not found }
 *       409: { description: Conflict - duplicate employee ID }
 */
router.put(
  '/:id',
  authenticate,
  authorize('HOSPITAL_ADMIN'),
  validate({ params: staffIdParamSchema, body: updateStaffSchema }),
  staffController.update
);

export default router;
