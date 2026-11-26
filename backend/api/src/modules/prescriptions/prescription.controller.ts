// =============================================================================
// MediCore API - Prescription Controller
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { prescriptionService } from './prescription.service';
import { successResponse, createdResponse, paginatedResponse } from '../../utils/apiResponse';
import { createAuditLog } from '../../middleware/audit';
import { ForbiddenError } from '../../middleware/errorHandler';

export class PrescriptionController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const prescription = await prescriptionService.create(req.body, req.user!.userId);
      await createAuditLog(req, {
        action: 'CREATE',
        resourceType: 'PRESCRIPTION',
        resourceId: prescription.id,
        metadata: { patientId: prescription.patientId, encounterId: prescription.encounterId },
      });
      createdResponse(res, prescription, 'Prescription created successfully');
    } catch (error) {
      next(error);
    }
  }

  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, ...filters } = req.query as any;
      const isClinicalStaff =
        req.user!.roles.includes('DOCTOR') || req.user!.roles.includes('NURSE');

      if (!isClinicalStaff && req.user!.roles.includes('PATIENT')) {
        const { prisma } = await import('../../config/database');
        const patient = await prisma.patient.findUnique({ where: { userId: req.user!.userId } });
        if (!patient) {
          paginatedResponse(res, [], 0, +page, +limit);
          return;
        }
        if (filters.patientId && filters.patientId !== patient.id) {
          throw new ForbiddenError('Patients can only view their own prescriptions');
        }
        filters.patientId = patient.id;
      }

      const { data, total } = await prescriptionService.findAll(+page, +limit, filters);
      paginatedResponse(res, data, total, +page, +limit, 'Prescriptions retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const prescription = await prescriptionService.findById(req.params.id, req.user);
      await createAuditLog(req, { action: 'READ', resourceType: 'PRESCRIPTION', resourceId: prescription.id });
      successResponse(res, prescription, 'Prescription retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const prescription = await prescriptionService.updateStatus(req.params.id, req.body.status);
      await createAuditLog(req, {
        action: 'UPDATE_STATUS',
        resourceType: 'PRESCRIPTION',
        resourceId: prescription.id,
        metadata: { status: req.body.status },
      });
      successResponse(res, prescription, 'Prescription status updated');
    } catch (error) {
      next(error);
    }
  }

  async getMedications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const medications = await prescriptionService.getMedicationCatalog(search);
      successResponse(res, medications, 'Medication catalog retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const prescriptionController = new PrescriptionController();
