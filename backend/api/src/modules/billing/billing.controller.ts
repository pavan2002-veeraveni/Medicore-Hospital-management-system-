// =============================================================================
// MediCore API - Billing Controller
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { billingService } from './billing.service';
import { successResponse, createdResponse, paginatedResponse } from '../../utils/apiResponse';
import { createAuditLog } from '../../middleware/audit';
import { ForbiddenError } from '../../middleware/errorHandler';
import type { InvoiceQueryInput } from './billing.schemas';

export class BillingController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoice = await billingService.create(req.body);
      await createAuditLog(req, {
        action: 'CREATE',
        resourceType: 'INVOICE',
        resourceId: invoice.id,
        metadata: { invoiceNumber: invoice.invoiceNumber, patientId: invoice.patientId, totalAmount: invoice.totalAmount },
      });
      createdResponse(res, invoice, 'Invoice created successfully');
    } catch (error) {
      next(error);
    }
  }

  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as InvoiceQueryInput;

      // Patients can only list their own invoices
      if (req.user?.roles.includes('PATIENT') && !req.user.roles.includes('BILLING_OFFICER') && !req.user.roles.includes('HOSPITAL_ADMIN')) {
        const { prisma } = await import('../../config/database');
        const patient = await prisma.patient.findUnique({ where: { userId: req.user.userId }, select: { id: true } });
        if (!patient) {
          paginatedResponse(res, [], 0, query.page, query.limit, 'Invoices retrieved successfully');
          return;
        }
        if (query.patientId && query.patientId !== patient.id) {
          throw new ForbiddenError('Patients can only view their own invoices');
        }
        query.patientId = patient.id;
      }

      const result = await billingService.findAll(query);
      paginatedResponse(res, result.invoices, result.total, result.page, result.limit, 'Invoices retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoice = await billingService.findById(req.params.id, req.user);
      await createAuditLog(req, { action: 'READ', resourceType: 'INVOICE', resourceId: invoice.id });
      successResponse(res, invoice, 'Invoice retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async issue(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoice = await billingService.issue(req.params.id, req.user!.userId, req.body?.notes);
      await createAuditLog(req, { action: 'ISSUE', resourceType: 'INVOICE', resourceId: invoice.id });
      successResponse(res, invoice, 'Invoice issued successfully');
    } catch (error) {
      next(error);
    }
  }

  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoice = await billingService.cancel(req.params.id, req.body?.notes);
      await createAuditLog(req, { action: 'CANCEL', resourceType: 'INVOICE', resourceId: invoice.id });
      successResponse(res, invoice, 'Invoice cancelled successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoice = await billingService.update(req.params.id, req.body, req.user!.userId);
      await createAuditLog(req, { action: 'UPDATE', resourceType: 'INVOICE', resourceId: invoice.id });
      successResponse(res, invoice, 'Invoice updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async getPatientBilling(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const summary = await billingService.getPatientBilling(req.params.patientId, req.user);
      successResponse(res, summary, 'Patient billing summary retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const billingController = new BillingController();
