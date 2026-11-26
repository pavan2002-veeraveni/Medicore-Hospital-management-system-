// =============================================================================
// MediCore API - Auth Controller
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import { successResponse, createdResponse } from '../../utils/apiResponse';
import { createAuditLog } from '../../middleware/audit';

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.register(req.body, req.user?.roles);
      createdResponse(res, result, 'User registered successfully');
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip || req.socket.remoteAddress;

      const result = await authService.login(req.body, userAgent, ipAddress);
      successResponse(res, result, 'Login successful');
    } catch (error) {
      next(error);
    }
  }

  async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.refreshToken(req.body);
      successResponse(res, result, 'Token refreshed successfully');
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body;
      await authService.logout(refreshToken);

      if (req.user) {
        await createAuditLog(req, {
          action: 'LOGOUT',
          resourceType: 'AUTH',
          resourceId: req.user.userId,
        });
      }

      successResponse(res, null, 'Logged out successfully');
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await authService.changePassword(
        req.user!.userId,
        req.body.currentPassword,
        req.body.newPassword
      );
      await createAuditLog(req, {
        action: 'CHANGE_PASSWORD',
        resourceType: 'AUTH',
        resourceId: req.user!.userId,
      });
      successResponse(res, null, 'Password updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { prisma } = await import('../../config/database');
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          isActive: true,
          emailVerified: true,
          lastLoginAt: true,
          createdAt: true,
          patient: { select: { id: true, registrationNumber: true } },
          staff: { select: { id: true, employeeId: true, departmentId: true, specialization: true } },
          userRoles: {
            include: { role: { select: { name: true, description: true } } },
          },
        },
      });

      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      const profile = {
        ...user,
        roles: user.userRoles.map(ur => ur.role.name),
        patientId: user.patient?.id ?? null,
        staffId: user.staff?.id ?? null,
        userRoles: undefined,
      };

      successResponse(res, profile, 'Profile retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
