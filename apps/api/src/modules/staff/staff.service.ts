// =============================================================================
// MediCore API - Staff Service
// =============================================================================

import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../middleware/errorHandler';
import type {
  CreateStaffInput,
  DoctorQueryInput,
  StaffQueryInput,
  UpdateStaffInput,
} from './staff.schemas';

const staffInclude = {
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      isActive: true,
      userRoles: {
        include: {
          role: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  },
  department: {
    select: {
      id: true,
      name: true,
      code: true,
      isActive: true,
    },
  },
} satisfies Prisma.StaffInclude;

export class StaffService {
  /**
   * Create a new staff record linked to an existing user and department
   */
  async create(input: CreateStaffInput) {
    const [user, existingStaffForUser, existingEmployee, department] =
      await Promise.all([
        prisma.user.findUnique({ where: { id: input.userId } }),
        prisma.staff.findUnique({ where: { userId: input.userId } }),
        prisma.staff.findUnique({ where: { employeeId: input.employeeId } }),
        prisma.department.findUnique({ where: { id: input.departmentId } }),
      ]);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (existingStaffForUser) {
      throw new ConflictError('A staff profile already exists for this user');
    }

    if (existingEmployee) {
      throw new ConflictError('A staff member with this employee ID already exists');
    }

    if (!department) {
      throw new NotFoundError('Department not found');
    }

    if (!department.isActive) {
      throw new ValidationError('Cannot assign staff to an inactive department');
    }

    const staff = await prisma.staff.create({
      data: {
        userId: input.userId,
        employeeId: input.employeeId,
        departmentId: input.departmentId,
        specialization: input.specialization,
        qualification: input.qualification,
        licenseNumber: input.licenseNumber,
        joiningDate: input.joiningDate,
      },
      include: staffInclude,
    });

    return this.formatStaffResponse(staff);
  }

  /**
   * Find a staff member by ID
   */
  async findById(id: string) {
    const staff = await prisma.staff.findUnique({
      where: { id },
      include: {
        ...staffInclude,
        schedules: {
          where: { isActive: true },
          orderBy: { dayOfWeek: 'asc' },
        },
      },
    });

    if (!staff) {
      throw new NotFoundError('Staff member not found');
    }

    return this.formatStaffResponse(staff);
  }

  /**
   * Find all staff members with pagination, filtering, and department info
   */
  async findAll(query: StaffQueryInput) {
    const {
      page = 1,
      limit = 20,
      departmentId,
      specialization,
      isActive,
      sortBy = 'createdAt',
      order = 'desc',
      search,
    } = query;

    const where: Prisma.StaffWhereInput = {};

    if (departmentId) {
      where.departmentId = departmentId;
    }

    if (specialization) {
      where.specialization = {
        contains: specialization,
        mode: 'insensitive',
      };
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (search) {
      where.OR = [
        { employeeId: { contains: search, mode: 'insensitive' } },
        { specialization: { contains: search, mode: 'insensitive' } },
        { qualification: { contains: search, mode: 'insensitive' } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.staff.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: order },
        include: staffInclude,
      }),
      prisma.staff.count({ where }),
    ]);

    return {
      items: items.map((item) => this.formatStaffResponse(item)),
      total,
      page,
      limit,
    };
  }

  /**
   * Update a staff member record
   */
  async update(id: string, input: UpdateStaffInput) {
    const existing = await prisma.staff.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Staff member not found');
    }

    if (input.employeeId && input.employeeId !== existing.employeeId) {
      const duplicateEmployee = await prisma.staff.findUnique({
        where: { employeeId: input.employeeId },
      });
      if (duplicateEmployee) {
        throw new ConflictError('A staff member with this employee ID already exists');
      }
    }

    if (input.departmentId && input.departmentId !== existing.departmentId) {
      const department = await prisma.department.findUnique({
        where: { id: input.departmentId },
      });
      if (!department) {
        throw new NotFoundError('Department not found');
      }
      if (!department.isActive) {
        throw new ValidationError('Cannot assign staff to an inactive department');
      }
    }

    const updated = await prisma.staff.update({
      where: { id },
      data: {
        employeeId: input.employeeId,
        departmentId: input.departmentId,
        specialization: input.specialization,
        qualification: input.qualification,
        licenseNumber: input.licenseNumber,
        joiningDate: input.joiningDate,
        isActive: input.isActive,
      },
      include: staffInclude,
    });

    return this.formatStaffResponse(updated);
  }

  /**
   * Find staff members belonging to a specific department
   */
  async findByDepartment(
    departmentId: string,
    query: Partial<StaffQueryInput> = {}
  ) {
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
    });

    if (!department) {
      throw new NotFoundError('Department not found');
    }

    return this.findAll({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      departmentId,
      specialization: query.specialization,
      isActive: query.isActive,
      sortBy: query.sortBy ?? 'createdAt',
      order: query.order ?? 'desc',
      search: query.search,
    });
  }

  /**
   * Get active staff members who have the DOCTOR role (for appointment booking)
   */
  async getDoctors(query: Partial<DoctorQueryInput> = {}) {
    const {
      page = 1,
      limit = 20,
      departmentId,
      specialization,
      search,
    } = query;

    const where: Prisma.StaffWhereInput = {
      isActive: true,
      user: {
        isActive: true,
        userRoles: {
          some: {
            role: {
              name: 'DOCTOR',
            },
          },
        },
      },
    };

    if (departmentId) {
      where.departmentId = departmentId;
    }

    if (specialization) {
      where.specialization = {
        contains: specialization,
        mode: 'insensitive',
      };
    }

    if (search) {
      where.AND = [
        {
          OR: [
            { specialization: { contains: search, mode: 'insensitive' } },
            { qualification: { contains: search, mode: 'insensitive' } },
            { user: { firstName: { contains: search, mode: 'insensitive' } } },
            { user: { lastName: { contains: search, mode: 'insensitive' } } },
          ],
        },
      ];
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.staff.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          ...staffInclude,
          schedules: {
            where: { isActive: true },
            orderBy: { dayOfWeek: 'asc' },
          },
        },
      }),
      prisma.staff.count({ where }),
    ]);

    return {
      items: items.map((item) => this.formatStaffResponse(item)),
      total,
      page,
      limit,
    };
  }

  /**
   * Flatten user roles into a clean roles array on the staff response
   */
  private formatStaffResponse<
    T extends {
      user: {
        userRoles: Array<{ role: { name: string } }>;
        [key: string]: any;
      };
      [key: string]: any;
    },
  >(staff: T) {
    const { userRoles, ...userFields } = staff.user;
    return {
      ...staff,
      user: {
        ...userFields,
        roles: userRoles.map((ur) => ur.role.name),
      },
    };
  }
}

export const staffService = new StaffService();
