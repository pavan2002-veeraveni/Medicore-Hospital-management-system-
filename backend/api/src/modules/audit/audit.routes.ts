// =============================================================================
// MediCore API - Audit Routes
// =============================================================================

import { Router } from 'express';
import { auditController, auditQuerySchema } from './audit.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const router = Router();

/**
 * @swagger
 * /api/v1/audit-logs:
 *   get:
 *     summary: Get paginated audit logs (HOSPITAL_ADMIN only)
 *     tags: [Audit]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: action
 *         schema: { type: string }
 *       - in: query
 *         name: resourceType
 *         schema: { type: string }
 *       - in: query
 *         name: actorId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: dateRange
 *         schema: { type: string, description: "Comma-separated start,end ISO dates" }
 *     responses:
 *       200: { description: Audit logs retrieved successfully }
 *       403: { description: Forbidden }
 */
router.get(
  '/',
  authenticate,
  authorize('HOSPITAL_ADMIN'),
  validate({ query: auditQuerySchema }),
  (req, res, next) => auditController.getAuditLogs(req, res, next)
);

export default router;
