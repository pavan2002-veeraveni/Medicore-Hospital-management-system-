// =============================================================================
// MediCore API - Encounter Controller
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { encounterService } from './encounter.service';
import {
  successResponse,
  createdResponse,
  paginatedResponse,
} from '../../utils/apiResponse';
import type { EncounterQueryInput } from './encounter.schemas';

export class EncounterController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const encounter = await encounterService.create(req.body, req.user!.userId);
      createdResponse(res, encounter, 'Encounter created successfully');
    } catch (error) {
      next(error);
    }
  }

  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as EncounterQueryInput;
      const result = await encounterService.findAll(query);
      paginatedResponse(
        res,
        result.items,
        result.total,
        result.page,
        result.limit,
        'Encounters retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const encounter = await encounterService.findById(req.params.id);
      successResponse(res, encounter, 'Encounter retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const encounter = await encounterService.update(req.params.id, req.body);
      successResponse(res, encounter, 'Encounter updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async addVitalSigns(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const vitalSign = await encounterService.addVitalSigns(
        req.params.id,
        req.body,
        req.user!.userId
      );
      createdResponse(res, vitalSign, 'Vital signs recorded successfully');
    } catch (error) {
      next(error);
    }
  }

  async complete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const encounter = await encounterService.complete(req.params.id);
      successResponse(res, encounter, 'Encounter completed successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const encounterController = new EncounterController();
