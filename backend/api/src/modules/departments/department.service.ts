// =============================================================================
// MediCore API - Department Service
// =============================================================================

import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import {
  ConflictError,
  InvalidStateTransitionError,
  NotFoundError,
} from '../../middleware/errorHandler';
import type {
  CreateDepartmentInput,
  DepartmentQueryInput,
  UpdateDepartmentInput,
} from './department.schemas';

export class DepartmentService {
  /**
   * Create a new department
   */
  async create(input: CreateDepartmentInput) {
    const existing = await prisma.department.findFirst({
      where: {
        OR: [
          { name: { equals: input.name, mode: 'insensitive' } },
          { code: { equals: input.code, mode: 'insensitive' } },
        ],
      },
    });

    if (existing) {
      if (existing.code.toLowerCase() === input.code.toLowerCase()) {
        throw new ConflictError('A department with this code already exists');
      }
      throw new ConflictError('A department with this name already exists');
    }

    if (input.headId) {
      const headStaff = await prisma.staff.findUnique({
        where: { id: input.headId },
      });
      if (!headStaff) {
        throw new NotFoundError('Department head staff member not found');
      }
    }

    return prisma.department.create({
      data: {
        name: input.name,
        code: input.code,
        description: input.description,
        headId: input.headId ?? null,
        isActive: input.isActive ?? true,
      },
      include: {
        _count: {
          select: { staff: true },
        },
      },
    });
  }

  /**
   * List departments with pagination and filtering
   */
  async findAll(query: DepartmentQueryInput) {
    const {
      page = 1,
      limit = 20,
      isActive,
      search,
      sortBy = 'name',
      order = 'asc',
    } = query;

    const where: Prisma.DepartmentWhereInput = {};

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.department.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: order },
        include: {
          _count: {
            select: { staff: true },
          },
        },
      }),
      prisma.department.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
    };
  }

  /**
   * Find a department by ID
   */
  async findById(id: string) {
    const department = await prisma.department.findUnique({
      where: { id },
      include: {
        _count: {
          select: { staff: true },
        },
        staff: {
          where: { isActive: true },
          select: {
            id: true,
            employeeId: true,
            specialization: true,
            qualification: true,
            isActive: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!department) {
      throw new NotFoundError('Department not found');
    }

    return department;
  }

  /**
   * Update a department
   */
  async update(id: string, input: UpdateDepartmentInput) {
    const existing = await prisma.department.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Department not found');
    }

    if (input.name || input.code) {
      const orConditions: Prisma.DepartmentWhereInput[] = [];
      if (input.name) {
        orConditions.push({ name: { equals: input.name, mode: 'insensitive' } });
      }
      if (input.code) {
        orConditions.push({ code: { equals: input.code, mode: 'insensitive' } });
      }

      const duplicate = await prisma.department.findFirst({
        where: {
          id: { not: id },
          OR: orConditions,
        },
      });

      if (duplicate) {
        if (input.code && duplicate.code.toLowerCase() === input.code.toLowerCase()) {
          throw new ConflictError('A department with this code already exists');
        }
        throw new ConflictError('A department with this name already exists');
      }
    }

    if (input.headId) {
      const headStaff = await prisma.staff.findUnique({
        where: { id: input.headId },
      });
      if (!headStaff) {
        throw new NotFoundError('Department head staff member not found');
      }
    }

    return prisma.department.update({
      where: { id },
      data: {
        name: input.name,
        code: input.code,
        description: input.description,
        headId: input.headId,
        isActive: input.isActive,
      },
      include: {
        _count: {
          select: { staff: true },
        },
      },
    });
  }

  /**
   * Deactivate (soft delete) a department
   */
  async delete(id: string) {
    const existing = await prisma.department.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Department not found');
    }

    const activeStaffCount = await prisma.staff.count({
      where: { departmentId: id, isActive: true },
    });

    if (activeStaffCount > 0) {
      throw new InvalidStateTransitionError(
        'Cannot deactivate a department that has active staff members'
      );
    }

    return prisma.department.update({
      where: { id },
      data: { isActive: false },
      include: {
        _count: {
          select: { staff: true },
        },
      },
    });
  }
}

export const departmentService = new DepartmentService();
