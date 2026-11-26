// =============================================================================
// MediCore API - Department Controller
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { departmentService } from './department.service';
import {
  createdResponse,
  paginatedResponse,
  successResponse,
} from '../../utils/apiResponse';
import { createAuditLog } from '../../middleware/audit';
import type { DepartmentQueryInput } from './department.schemas';

export class DepartmentController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const department = await departmentService.create(req.body);

      await createAuditLog(req, {
        action: 'CREATE',
        resourceType: 'DEPARTMENT',
        resourceId: department.id,
        metadata: { code: department.code, name: department.name },
      });

      createdResponse(res, department, 'Department created successfully');
    } catch (error) {
      next(error);
    }
  }

  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as DepartmentQueryInput;
      const result = await departmentService.findAll(query);

      paginatedResponse(
        res,
        result.items,
        result.total,
        result.page,
        result.limit,
        'Departments retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const department = await departmentService.findById(req.params.id);
      successResponse(res, department, 'Department retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const department = await departmentService.update(req.params.id, req.body);

      await createAuditLog(req, {
        action: 'UPDATE',
        resourceType: 'DEPARTMENT',
        resourceId: department.id,
        metadata: { updatedFields: Object.keys(req.body) },
      });

      successResponse(res, department, 'Department updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const department = await departmentService.delete(req.params.id);

      await createAuditLog(req, {
        action: 'DELETE',
        resourceType: 'DEPARTMENT',
        resourceId: department.id,
        metadata: { code: department.code, name: department.name },
      });

      successResponse(res, department, 'Department deactivated successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const departmentController = new DepartmentController();
