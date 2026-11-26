// =============================================================================
// MediCore API - Payment Controller
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { paymentService } from './payment.service';
import { successResponse, createdResponse, paginatedResponse } from '../../utils/apiResponse';
import { createAuditLog } from '../../middleware/audit';

export class PaymentController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payment = await paymentService.create(req.body, req.user!.userId);
      await createAuditLog(req, {
        action: 'CREATE',
        resourceType: 'PAYMENT',
        resourceId: payment.id,
        metadata: { invoiceId: payment.invoiceId, amount: payment.amount, method: payment.method },
      });
      createdResponse(res, payment, 'Payment recorded successfully');
    } catch (error) {
      next(error);
    }
  }

  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = Number(req.query.page || 1);
      const limit = Number(req.query.limit || 20);
      const invoiceId = typeof req.query.invoiceId === 'string' ? req.query.invoiceId : undefined;
      const result = await paymentService.findAll(page, limit, invoiceId);
      paginatedResponse(res, result.payments, result.total, result.page, result.limit, 'Payments retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async findByInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payments = await paymentService.findByInvoice(req.params.invoiceId, req.user);
      successResponse(res, payments, 'Payments retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const paymentController = new PaymentController();
