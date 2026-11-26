// =============================================================================
// MediCore API - User Controller
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { paginatedResponse, successResponse } from '../../utils/apiResponse';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../middleware/errorHandler';
import { createAuditLog } from '../../middleware/audit';

export const userQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).optional(),
  role: z.string().trim().min(1).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export const userIdParamSchema = z.object({
  id: z.string().uuid('Invalid user ID'),
});

export const updateUserSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().max(20).optional().nullable(),
  isActive: z.boolean().optional(),
  emailVerified: z.boolean().optional(),
  roles: z
    .array(
      z.enum([
        'PATIENT',
        'RECEPTIONIST',
        'DOCTOR',
        'NURSE',
        'LAB_TECHNICIAN',
        'BILLING_OFFICER',
        'HOSPITAL_ADMIN',
      ])
    )
    .min(1)
    .optional(),
});

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  isActive: true,
  emailVerified: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  userRoles: {
    include: {
      role: {
        select: {
          id: true,
          name: true,
          description: true,
        },
      },
    },
  },
};

function formatUser(user: any) {
  const { userRoles, ...rest } = user;
  return {
    ...rest,
    roles: Array.isArray(userRoles) ? userRoles.map((ur: any) => ur.role.name) : [],
  };
}

export class UserController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page, limit, search, role, isActive } = userQuerySchema.parse(req.query);
      const skip = (page - 1) * limit;

      const where: Record<string, any> = {};
      if (isActive !== undefined) {
        where.isActive = isActive;
      }
      if (role) {
        where.userRoles = {
          some: {
            role: { name: role },
          },
        };
      }
      if (search) {
        where.OR = [
          { email: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: SAFE_USER_SELECT,
        }),
        prisma.user.count({ where }),
      ]);

      paginatedResponse(
        res,
        users.map(formatUser),
        total,
        page,
        limit,
        'Users retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const isAdmin = req.user?.roles.includes('HOSPITAL_ADMIN');
      const isOwn = req.user?.userId === id;

      if (!isAdmin && !isOwn) {
        throw new ForbiddenError('You do not have permission to view this user');
      }

      const user = await prisma.user.findUnique({
        where: { id },
        select: SAFE_USER_SELECT,
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      successResponse(res, formatUser(user), 'User retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const input = updateUserSchema.parse(req.body);

      if (Object.keys(input).length === 0) {
        throw new ValidationError('At least one field must be provided to update');
      }

      const existing = await prisma.user.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!existing) {
        throw new NotFoundError('User not found');
      }

      const updatedUser = await prisma.$transaction(async (tx) => {
        if (input.roles) {
          const roleRecords = await Promise.all(
            input.roles.map(async (roleName) => {
              let role = await tx.role.findUnique({ where: { name: roleName } });
              if (!role) {
                role = await tx.role.create({
                  data: { name: roleName, description: `${roleName} role`, isSystem: true },
                });
              }
              return role;
            })
          );

          await tx.userRole.deleteMany({ where: { userId: id } });
          await tx.userRole.createMany({
            data: roleRecords.map((role) => ({
              userId: id,
              roleId: role.id,
            })),
          });
        }

        return tx.user.update({
          where: { id },
          data: {
            ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
            ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
            ...(input.phone !== undefined ? { phone: input.phone } : {}),
            ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
            ...(input.emailVerified !== undefined ? { emailVerified: input.emailVerified } : {}),
          },
          select: SAFE_USER_SELECT,
        });
      });

      await createAuditLog(req, {
        action: 'UPDATE',
        resourceType: 'USER',
        resourceId: id,
        metadata: { updatedFields: Object.keys(input) },
      });

      successResponse(res, formatUser(updatedUser), 'User updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async deactivate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      if (req.user?.userId === id) {
        throw new ConflictError('You cannot deactivate your own account');
      }

      const existing = await prisma.user.findUnique({
        where: { id },
        select: { id: true, isActive: true },
      });

      if (!existing) {
        throw new NotFoundError('User not found');
      }

      const deactivatedUser = await prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id },
          data: { isActive: false },
          select: SAFE_USER_SELECT,
        });

        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: {
            revokedAt: new Date(),
            revokedBy: 'ADMIN_DEACTIVATION',
          },
        });

        return user;
      });

      await createAuditLog(req, {
        action: 'DEACTIVATE',
        resourceType: 'USER',
        resourceId: id,
      });

      successResponse(
        res,
        formatUser(deactivatedUser),
        'User deactivated successfully'
      );
    } catch (error) {
      next(error);
    }
  }
}

export const userController = new UserController();
