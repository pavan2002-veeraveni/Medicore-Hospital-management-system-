// =============================================================================
// MediCore API - Consent Controller
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { consentService } from './consent.service';
import {
  createdResponse,
  paginatedResponse,
  successResponse,
} from '../../utils/apiResponse';
import { ForbiddenError, NotFoundError } from '../../middleware/errorHandler';
import { createAuditLog } from '../../middleware/audit';
import type { ConsentQueryInput } from './consent.schemas';

export class ConsentController {
  private isAdmin(req: Request): boolean {
    return Boolean(req.user?.roles.includes('HOSPITAL_ADMIN'));
  }

  private async getPatientForUser(userId: string) {
    const patient = await prisma.patient.findUnique({
      where: { userId },
      select: { id: true, userId: true },
    });

    if (!patient) {
      throw new NotFoundError('Patient profile not found for current user');
    }

    return patient;
  }

  async grant(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actorId = req.user!.userId;

      if (!this.isAdmin(req)) {
        const ownPatient = await this.getPatientForUser(actorId);
        if (ownPatient.id !== req.body.patientId) {
          throw new ForbiddenError('Patients can only grant consent for their own profile');
        }
      }

      const consent = await consentService.grant(req.body, actorId);

      await createAuditLog(req, {
        action: 'CREATE',
        resourceType: 'CONSENT',
        resourceId: consent?.id,
        metadata: {
          patientId: req.body.patientId,
          category: req.body.category,
          purpose: req.body.purpose,
        },
      });

      createdResponse(res, consent, 'Consent granted successfully');
    } catch (error) {
      next(error);
    }
  }

  async findByPatient(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as ConsentQueryInput;

      if (!this.isAdmin(req)) {
        const ownPatient = await this.getPatientForUser(req.user!.userId);
        if (query.patientId && query.patientId !== ownPatient.id) {
          throw new ForbiddenError('Patients can only view their own consent records');
        }
        query.patientId = ownPatient.id;
      }

      const result = await consentService.findByPatient(query);

      paginatedResponse(
        res,
        result.consents,
        result.total,
        result.page,
        result.limit,
        'Consents retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async revoke(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actorId = req.user!.userId;
      const existing = await consentService.findById(req.params.id);

      if (existing.patient.userId !== actorId) {
        throw new ForbiddenError('You can only revoke your own consent records');
      }

      const consent = await consentService.revoke(
        req.params.id,
        actorId,
        req.body.reason
      );

      await createAuditLog(req, {
        action: 'UPDATE',
        resourceType: 'CONSENT',
        resourceId: req.params.id,
        reason: req.body.reason,
        metadata: {
          status: 'REVOKED',
          patientId: existing.patientId,
        },
      });

      successResponse(res, consent, 'Consent revoked successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const consentController = new ConsentController();
