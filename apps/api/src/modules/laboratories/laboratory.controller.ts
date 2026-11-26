// =============================================================================
// MediCore API - Laboratory Controller
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { laboratoryService } from './laboratory.service';
import {
  createdResponse,
  paginatedResponse,
  successResponse,
} from '../../utils/apiResponse';
import { createAuditLog } from '../../middleware/audit';
import { UnauthorizedError } from '../../middleware/errorHandler';
import type {
  CollectSpecimensInput,
  CreateLabOrderInput,
  CreateLabTestInput,
  LabOrderQueryInput,
  LabResultInput,
  LabTestQueryInput,
  UpdateLabOrderItemStatusInput,
  UpdateLabOrderStatusInput,
  UpdateLabTestInput,
} from './laboratory.schemas';

function getRequester(req: Request) {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required');
  }
  return {
    userId: req.user.userId,
    roles: req.user.roles,
  };
}

export class LaboratoryController {
  // ===========================================================================
  // LAB TEST CATALOG HANDLERS
  // ===========================================================================

  async getLabTests(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as LabTestQueryInput;
      const { tests, total, page, limit } = await laboratoryService.findAllLabTests(query);
      paginatedResponse(res, tests, total, page, limit, 'Laboratory tests retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getLabTestById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const test = await laboratoryService.findLabTestById(req.params.id);
      successResponse(res, test, 'Laboratory test retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async createLabTest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = req.body as CreateLabTestInput;
      const labTest = await laboratoryService.createLabTest(input);

      await createAuditLog(req, {
        action: 'CREATE',
        resourceType: 'LAB_TEST',
        resourceId: labTest.id,
        metadata: { code: labTest.code, name: labTest.name, category: labTest.category },
      });

      createdResponse(res, labTest, 'Laboratory test created successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateLabTest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = req.body as UpdateLabTestInput;
      const labTest = await laboratoryService.updateLabTest(req.params.id, input);

      await createAuditLog(req, {
        action: 'UPDATE',
        resourceType: 'LAB_TEST',
        resourceId: labTest.id,
        metadata: { code: labTest.code, updatedFields: Object.keys(input) },
      });

      successResponse(res, labTest, 'Laboratory test updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async deleteLabTest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await laboratoryService.deleteLabTest(req.params.id);

      await createAuditLog(req, {
        action: 'DELETE',
        resourceType: 'LAB_TEST',
        resourceId: req.params.id,
        metadata: { deactivated: Boolean((result as any).deactivated) },
      });

      successResponse(res, result, 'Laboratory test removed successfully');
    } catch (error) {
      next(error);
    }
  }

  // ===========================================================================
  // LAB ORDER HANDLERS
  // ===========================================================================

  async createLabOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const requester = getRequester(req);
      const input = req.body as CreateLabOrderInput;
      const labOrder = await laboratoryService.createLabOrder(input, requester.userId);

      await createAuditLog(req, {
        action: 'CREATE',
        resourceType: 'LAB_ORDER',
        resourceId: labOrder.id,
        metadata: {
          patientId: labOrder.patientId,
          encounterId: labOrder.encounterId,
          priority: labOrder.priority,
          testIds: labOrder.items.map((item) => item.testId),
        },
      });

      createdResponse(res, labOrder, 'Lab order created successfully');
    } catch (error) {
      next(error);
    }
  }

  async getLabOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const requester = getRequester(req);
      const query = req.query as unknown as LabOrderQueryInput;
      const { orders, total, page, limit } = await laboratoryService.findAllLabOrders(
        query,
        requester
      );
      paginatedResponse(res, orders, total, page, limit, 'Lab orders retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getLabOrderById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const requester = getRequester(req);
      const labOrder = await laboratoryService.findLabOrderById(req.params.id, requester);

      await createAuditLog(req, {
        action: 'READ',
        resourceType: 'LAB_ORDER',
        resourceId: labOrder.id,
        metadata: { patientId: labOrder.patientId },
      });

      successResponse(res, labOrder, 'Lab order retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateLabOrderStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { status, notes } = req.body as UpdateLabOrderStatusInput;
      const updatedOrder = await laboratoryService.updateLabOrderStatus(req.params.id, status);

      await createAuditLog(req, {
        action: 'UPDATE_STATUS',
        resourceType: 'LAB_ORDER',
        resourceId: updatedOrder.id,
        metadata: {
          patientId: updatedOrder.patientId,
          status: updatedOrder.status,
          ...(notes ? { notes } : {}),
        },
      });

      successResponse(res, updatedOrder, 'Lab order status updated successfully');
    } catch (error) {
      next(error);
    }
  }

  // ===========================================================================
  // SPECIMEN COLLECTION HANDLERS
  // ===========================================================================

  async collectSpecimens(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { itemIds, notes } = (req.body || {}) as CollectSpecimensInput;
      const updatedOrder = await laboratoryService.collectSpecimens(req.params.id, itemIds);

      await createAuditLog(req, {
        action: 'COLLECT_SPECIMEN',
        resourceType: 'LAB_ORDER',
        resourceId: updatedOrder.id,
        metadata: {
          patientId: updatedOrder.patientId,
          itemIds: itemIds || updatedOrder.items.map((i) => i.id),
          ...(notes ? { notes } : {}),
        },
      });

      successResponse(res, updatedOrder, 'Specimens collected successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateLabOrderItemStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { status, notes } = req.body as UpdateLabOrderItemStatusInput;
      const updatedItem = await laboratoryService.updateLabOrderItemStatus(
        req.params.id,
        req.params.itemId,
        status
      );

      await createAuditLog(req, {
        action: 'UPDATE_ITEM_STATUS',
        resourceType: 'LAB_ORDER_ITEM',
        resourceId: updatedItem.id,
        metadata: {
          labOrderId: req.params.id,
          status: updatedItem.status,
          ...(notes ? { notes } : {}),
        },
      });

      successResponse(res, updatedItem, 'Lab order item status updated successfully');
    } catch (error) {
      next(error);
    }
  }

  // ===========================================================================
  // LAB RESULT HANDLERS
  // ===========================================================================

  async recordLabResult(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const requester = getRequester(req);
      const input = req.body as LabResultInput;
      const result = await laboratoryService.recordResult(
        input.labOrderItemId,
        input,
        requester.userId,
        req.params.id
      );

      await createAuditLog(req, {
        action: 'RECORD_RESULT',
        resourceType: 'LAB_RESULT',
        resourceId: result.id,
        metadata: {
          labOrderId: req.params.id,
          labOrderItemId: input.labOrderItemId,
          patientId: result.labOrderItem.labOrder.patientId,
          isAbnormal: result.isAbnormal,
          abnormalFlag: result.abnormalFlag,
        },
      });

      createdResponse(res, result, 'Lab result recorded successfully');
    } catch (error) {
      next(error);
    }
  }

  async validateLabResult(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const requester = getRequester(req);
      const result = await laboratoryService.validateResult(
        req.params.resultId,
        requester.userId
      );

      await createAuditLog(req, {
        action: 'VALIDATE_RESULT',
        resourceType: 'LAB_RESULT',
        resourceId: result.id,
        metadata: {
          labOrderId: result.labOrderItem.labOrderId,
          labOrderItemId: result.labOrderItemId,
          patientId: result.labOrderItem.labOrder.patientId,
          validatedBy: requester.userId,
        },
      });

      successResponse(res, result, 'Lab result validated successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const laboratoryController = new LaboratoryController();
