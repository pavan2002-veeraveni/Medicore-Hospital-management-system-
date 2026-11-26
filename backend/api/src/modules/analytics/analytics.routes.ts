// =============================================================================
// MediCore API - FastAPI Analytics BFF Proxy Routes
// =============================================================================
// Enforces JWT authentication + HOSPITAL_ADMIN RBAC + audit logging before
// forwarding requests to the internal Python FastAPI analytics service with X-API-Key.

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { auditMiddleware } from '../../middleware/audit';
import { AppError } from '../../middleware/errorHandler';
import { successResponse } from '../../utils/apiResponse';
import { config } from '../../config/environment';
import { logger } from '../../utils/logger';

const router = Router();
router.use(authenticate, authorize('HOSPITAL_ADMIN'));

const ALLOWED_ENDPOINTS = new Set([
  'appointment-utilization',
  'waiting-times',
  'lab-turnaround',
  'patient-population',
]);

router.get(
  '/:metric',
  auditMiddleware('READ', 'ANALYTICS'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { metric } = req.params;
      if (!ALLOWED_ENDPOINTS.has(metric)) {
        throw new AppError(`Unknown analytics metric: ${metric}`, 404, 'NOT_FOUND');
      }

      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(req.query)) {
        if (typeof v === 'string' && v.length > 0) qs.set(k, v);
      }
      const querySuffix = qs.toString() ? `?${qs.toString()}` : '';
      const targetUrl = `${config.analyticsUrl.replace(/\/$/, '')}/api/v1/analytics/${metric}${querySuffix}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const upstream = await fetch(targetUrl, {
          headers: { 'X-API-Key': config.analyticsApiKey },
          signal: controller.signal,
        });
        if (!upstream.ok) {
          logger.warn({ status: upstream.status, metric }, 'Upstream analytics service returned non-OK status');
          throw new AppError(
            `Analytics service returned status ${upstream.status}`,
            502,
            'ANALYTICS_UPSTREAM_ERROR'
          );
        }
        const data = await upstream.json();
        return successResponse(res, data, 'Analytics data retrieved');
      } catch (err: any) {
        if (err instanceof AppError) throw err;
        const msg = err?.name === 'AbortError' ? 'Analytics service timed out' : 'Analytics service unavailable';
        logger.error({ err: err?.message, targetUrl }, msg);
        throw new AppError(msg, 503, 'ANALYTICS_UNAVAILABLE');
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      next(error);
    }
  }
);

export default router;
