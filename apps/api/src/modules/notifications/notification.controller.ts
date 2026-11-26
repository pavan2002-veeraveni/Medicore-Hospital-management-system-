// =============================================================================
// MediCore API - Notification Controller
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { notificationService } from './notification.service';
import { paginatedResponse, successResponse } from '../../utils/apiResponse';

export const notificationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  isRead: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  type: z.string().trim().min(1).optional(),
});

export const notificationIdParamSchema = z.object({
  id: z.string().uuid('Invalid notification ID'),
});

export class NotificationController {
  async findByUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const query = notificationQuerySchema.parse(req.query);

      const result = await notificationService.findByUser(userId, query);

      paginatedResponse(
        res,
        result.notifications,
        result.total,
        result.page,
        result.limit,
        'Notifications retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async markAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const notification = await notificationService.markAsRead(req.params.id, userId);

      successResponse(res, notification, 'Notification marked as read');
    } catch (error) {
      next(error);
    }
  }

  async markAllAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const result = await notificationService.markAllAsRead(userId);

      successResponse(res, result, 'All notifications marked as read');
    } catch (error) {
      next(error);
    }
  }

  async getUnreadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const unreadCount = await notificationService.getUnreadCount(userId);

      successResponse(
        res,
        { unreadCount },
        'Unread notification count retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }
}

export const notificationController = new NotificationController();
