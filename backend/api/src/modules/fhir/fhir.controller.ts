// =============================================================================
// MediCore API - FHIR Controller
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { fhirService } from './fhir.service';
import {
  createdResponse,
  paginatedResponse,
  successResponse,
} from '../../utils/apiResponse';
import { createAuditLog } from '../../middleware/audit';

export const fhirIdParamSchema = z.object({
  id: z.string().uuid('Invalid resource ID'),
});

export const fhirSyncQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  resourceType: z.string().trim().min(1).optional(),
  direction: z.enum(['IMPORT', 'EXPORT']).optional(),
  status: z.enum(['PENDING', 'SUCCESS', 'FAILED']).optional(),
  localId: z.string().trim().min(1).optional(),
});

export class FhirController {
  async exportPatient(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await fhirService.exportResource('Patient', req.params.id);

      await createAuditLog(req, {
        action: 'EXPORT',
        resourceType: 'FHIR_PATIENT',
        resourceId: req.params.id,
        metadata: { syncRecordId: result.syncRecord?.id },
      });

      successResponse(res, result.resource, 'FHIR Patient exported successfully');
    } catch (error) {
      next(error);
    }
  }

  async importPatient(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await fhirService.importResource('Patient', req.body);

      await createAuditLog(req, {
        action: 'IMPORT',
        resourceType: 'FHIR_PATIENT',
        resourceId: result.patient.id,
        metadata: { syncRecordId: result.syncRecord?.id },
      });

      createdResponse(res, result, 'FHIR Patient imported successfully');
    } catch (error) {
      next(error);
    }
  }

  async exportAppointment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await fhirService.exportResource('Appointment', req.params.id);

      await createAuditLog(req, {
        action: 'EXPORT',
        resourceType: 'FHIR_APPOINTMENT',
        resourceId: req.params.id,
        metadata: { syncRecordId: result.syncRecord?.id },
      });

      successResponse(res, result.resource, 'FHIR Appointment exported successfully');
    } catch (error) {
      next(error);
    }
  }

  async exportEncounter(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await fhirService.exportResource('Encounter', req.params.id);

      await createAuditLog(req, {
        action: 'EXPORT',
        resourceType: 'FHIR_ENCOUNTER',
        resourceId: req.params.id,
        metadata: { syncRecordId: result.syncRecord?.id },
      });

      successResponse(res, result.resource, 'FHIR Encounter exported successfully');
    } catch (error) {
      next(error);
    }
  }

  async exportObservation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await fhirService.exportResource('Observation', req.params.id);

      await createAuditLog(req, {
        action: 'EXPORT',
        resourceType: 'FHIR_OBSERVATION',
        resourceId: req.params.id,
        metadata: { syncRecordId: result.syncRecord?.id },
      });

      successResponse(res, result.resource, 'FHIR Observation exported successfully');
    } catch (error) {
      next(error);
    }
  }

  async getSyncRecords(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = fhirSyncQuerySchema.parse(req.query);
      const result = await fhirService.getSyncRecords(query);

      paginatedResponse(
        res,
        result.records,
        result.total,
        result.page,
        result.limit,
        'FHIR sync records retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }
}

export const fhirController = new FhirController();
