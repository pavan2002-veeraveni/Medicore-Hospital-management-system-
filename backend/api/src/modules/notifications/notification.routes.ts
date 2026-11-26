// =============================================================================
// MediCore API - Notification Routes
// =============================================================================

import { Router } from 'express';
import {
  notificationController,
  notificationQuerySchema,
  notificationIdParamSchema,
} from './notification.controller';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const router = Router();

/**
 * @swagger
 * /api/v1/notifications:
 *   get:
 *     summary: Get notifications for the authenticated user
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: isRead
 *         schema: { type: boolean }
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *     responses:
 *       200: { description: Notifications retrieved successfully }
 */
router.get(
  '/',
  authenticate,
  validate({ query: notificationQuerySchema }),
  (req, res, next) => notificationController.findByUser(req, res, next)
);

/**
 * @swagger
 * /api/v1/notifications/unread-count:
 *   get:
 *     summary: Get unread notification count for the authenticated user
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Unread count retrieved }
 */
router.get(
  '/unread-count',
  authenticate,
  (req, res, next) => notificationController.getUnreadCount(req, res, next)
);

/**
 * @swagger
 * /api/v1/notifications/read-all:
 *   patch:
 *     summary: Mark all notifications as read for the authenticated user
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: All notifications marked as read }
 */
router.patch(
  '/read-all',
  authenticate,
  (req, res, next) => notificationController.markAllAsRead(req, res, next)
);

/**
 * @swagger
 * /api/v1/notifications/{id}/read:
 *   patch:
 *     summary: Mark a specific notification as read
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Notification marked as read }
 *       403: { description: Forbidden }
 *       404: { description: Notification not found }
 */
router.patch(
  '/:id/read',
  authenticate,
  validate({ params: notificationIdParamSchema }),
  (req, res, next) => notificationController.markAsRead(req, res, next)
);

export default router;
