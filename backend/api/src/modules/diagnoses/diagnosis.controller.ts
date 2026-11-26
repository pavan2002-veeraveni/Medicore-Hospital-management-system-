// =============================================================================
// MediCore API - Diagnosis Controller
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { diagnosisService } from './diagnosis.service';
import {
  successResponse,
  createdResponse,
  paginatedResponse,
} from '../../utils/apiResponse';
import type { DiagnosisQueryInput } from './diagnosis.schemas';

export class DiagnosisController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const diagnosis = await diagnosisService.create(req.body, req.user!.userId);
      createdResponse(res, diagnosis, 'Diagnosis created successfully');
    } catch (error) {
      next(error);
    }
  }

  async findByEncounter(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const diagnoses = await diagnosisService.findByEncounter(req.params.encounterId);
      successResponse(res, diagnoses, 'Encounter diagnoses retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async findByPatient(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as DiagnosisQueryInput;
      const result = await diagnosisService.findByPatient(req.params.patientId, query);
      paginatedResponse(
        res,
        result.items,
        result.total,
        result.page,
        result.limit,
        'Patient diagnoses retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }
}

export const diagnosisController = new DiagnosisController();
