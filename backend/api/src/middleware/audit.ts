// =============================================================================
// MediCore API - Audit Logging Middleware
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export interface AuditContext {
  action: string;
  resourceType: string;
  resourceId?: string;
  outcome?: string;
  reason?: string;
  metadata?: Record<string, any>;
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(
  req: Request,
  context: AuditContext
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: req.user?.userId || null,
        action: context.action,
        resourceType: context.resourceType,
        resourceId: context.resourceId,
        outcome: context.outcome || 'SUCCESS',
        reason: context.reason,
        metadata: context.metadata || {},
        requestId: req.requestId,
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
      },
    });
  } catch (error) {
    // Never let audit logging failure break the request
    logger.error({ error, context }, 'Failed to create audit log');
  }
}

/**
 * Middleware to automatically audit specific actions
 */
export function auditMiddleware(action: string, resourceType: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Capture the original json method to intercept response
    const originalJson = res.json.bind(res);

    res.json = function (body: any): Response {
      // Log successful operations
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const resourceId = req.params.id || body?.data?.id;
        createAuditLog(req, {
          action,
          resourceType,
          resourceId,
          outcome: 'SUCCESS',
        }).catch(() => {}); // Fire and forget
      }

      return originalJson(body);
    };

    next();
  };
}
