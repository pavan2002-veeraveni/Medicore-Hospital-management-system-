// =============================================================================
// MediCore API - User Routes
// =============================================================================

import { Router } from 'express';
import {
  userController,
  userQuerySchema,
  userIdParamSchema,
  updateUserSchema,
} from './user.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const router = Router();

/**
 * @swagger
 * /api/v1/users:
 *   get:
 *     summary: List users (HOSPITAL_ADMIN only)
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: role
 *         schema: { type: string }
 *       - in: query
 *         name: isActive
 *         schema: { type: boolean }
 *     responses:
 *       200: { description: Users retrieved successfully }
 *       403: { description: Forbidden }
 */
router.get(
  '/',
  authenticate,
  authorize('HOSPITAL_ADMIN'),
  validate({ query: userQuerySchema }),
  (req, res, next) => userController.findAll(req, res, next)
);

/**
 * @swagger
 * /api/v1/users/{id}:
 *   get:
 *     summary: Get user by ID (HOSPITAL_ADMIN or own profile)
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: User retrieved successfully }
 *       403: { description: Forbidden }
 *       404: { description: User not found }
 */
router.get(
  '/:id',
  authenticate,
  validate({ params: userIdParamSchema }),
  (req, res, next) => userController.findById(req, res, next)
);

/**
 * @swagger
 * /api/v1/users/{id}:
 *   put:
 *     summary: Update user details (HOSPITAL_ADMIN only)
 *     tags: [Users]
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
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               phone: { type: string }
 *               isActive: { type: boolean }
 *               emailVerified: { type: boolean }
 *               roles: { type: array, items: { type: string } }
 *     responses:
 *       200: { description: User updated successfully }
 *       404: { description: User not found }
 */
router.put(
  '/:id',
  authenticate,
  authorize('HOSPITAL_ADMIN'),
  validate({ params: userIdParamSchema, body: updateUserSchema }),
  (req, res, next) => userController.update(req, res, next)
);

/**
 * @swagger
 * /api/v1/users/{id}/deactivate:
 *   patch:
 *     summary: Deactivate a user account (HOSPITAL_ADMIN only)
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: User deactivated successfully }
 *       404: { description: User not found }
 */
router.patch(
  '/:id/deactivate',
  authenticate,
  authorize('HOSPITAL_ADMIN'),
  validate({ params: userIdParamSchema }),
  (req, res, next) => userController.deactivate(req, res, next)
);

export default router;
