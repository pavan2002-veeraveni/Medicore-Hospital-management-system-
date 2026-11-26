// =============================================================================
// MediCore API - Staff Controller
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { staffService } from './staff.service';
import {
  createdResponse,
  paginatedResponse,
  successResponse,
} from '../../utils/apiResponse';
import { createAuditLog } from '../../middleware/audit';
import { ForbiddenError } from '../../middleware/errorHandler';
import type { DoctorQueryInput, StaffQueryInput } from './staff.schemas';

export class StaffController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const staff = await staffService.create(req.body);

      await createAuditLog(req, {
        action: 'CREATE',
        resourceType: 'STAFF',
        resourceId: staff.id,
        metadata: {
          employeeId: staff.employeeId,
          departmentId: staff.departmentId,
        },
      });

      createdResponse(res, staff, 'Staff member created successfully');
    } catch (error) {
      next(error);
    }
  }

  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as StaffQueryInput;
      const result = await staffService.findAll(query);

      paginatedResponse(
        res,
        result.items,
        result.total,
        result.page,
        result.limit,
        'Staff members retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async getDoctors(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as DoctorQueryInput;
      const result = await staffService.getDoctors(query);

      paginatedResponse(
        res,
        result.items,
        result.total,
        result.page,
        result.limit,
        'Doctors retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async findByDepartment(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const query = req.query as unknown as StaffQueryInput;
      const result = await staffService.findByDepartment(
        req.params.departmentId,
        query
      );

      paginatedResponse(
        res,
        result.items,
        result.total,
        result.page,
        result.limit,
        'Department staff members retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const staff = await staffService.findById(req.params.id);

      const isAdmin = req.user?.roles.includes('HOSPITAL_ADMIN') ?? false;
      const isOwnRecord = staff.userId === req.user?.userId;

      if (!isAdmin && !isOwnRecord) {
        throw new ForbiddenError('You do not have permission to view this staff record');
      }

      successResponse(res, staff, 'Staff member retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const staff = await staffService.update(req.params.id, req.body);

      await createAuditLog(req, {
        action: 'UPDATE',
        resourceType: 'STAFF',
        resourceId: staff.id,
        metadata: { updatedFields: Object.keys(req.body) },
      });

      successResponse(res, staff, 'Staff member updated successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const staffController = new StaffController();
