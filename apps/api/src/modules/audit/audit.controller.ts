// =============================================================================
// MediCore API - Audit Controller
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { paginatedResponse } from '../../utils/apiResponse';

export const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().trim().min(1).optional(),
  resourceType: z.string().trim().min(1).optional(),
  actorId: z.string().uuid('Invalid actor ID').optional(),
  outcome: z.string().trim().min(1).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  dateRange: z.union([
    z.string().trim().min(1),
    z.object({
      start: z.coerce.date().optional(),
      end: z.coerce.date().optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
    }),
  ]).optional(),
});

export class AuditController {
  async getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = auditQuerySchema.parse(req.query);
      const { page, limit, action, resourceType, actorId, outcome } = parsed;
      const skip = (page - 1) * limit;

      let startDate = parsed.startDate;
      let endDate = parsed.endDate;

      if (parsed.dateRange) {
        if (typeof parsed.dateRange === 'string') {
          const [rawStart, rawEnd] = parsed.dateRange.split(',').map(s => s.trim());
          if (rawStart && !startDate) {
            const d = new Date(rawStart);
            if (!Number.isNaN(d.getTime())) startDate = d;
          }
          if (rawEnd && !endDate) {
            const d = new Date(rawEnd);
            if (!Number.isNaN(d.getTime())) endDate = d;
          }
        } else {
          startDate = startDate ?? parsed.dateRange.start ?? parsed.dateRange.from;
          endDate = endDate ?? parsed.dateRange.end ?? parsed.dateRange.to;
        }
      }

      const where: Record<string, any> = {};
      if (action) where.action = action;
      if (resourceType) where.resourceType = resourceType;
      if (actorId) where.actorId = actorId;
      if (outcome) where.outcome = outcome;

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = startDate;
        if (endDate) where.createdAt.lte = endDate;
      }

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            actor: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        }),
        prisma.auditLog.count({ where }),
      ]);

      paginatedResponse(
        res,
        logs,
        total,
        page,
        limit,
        'Audit logs retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }
}

export const auditController = new AuditController();
