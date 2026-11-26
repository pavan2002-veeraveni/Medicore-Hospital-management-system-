// =============================================================================
// MediCore API - Patient Controller
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { patientService } from './patient.service';
import {
  successResponse,
  createdResponse,
  paginatedResponse,
} from '../../utils/apiResponse';
import { ForbiddenError, NotFoundError } from '../../middleware/errorHandler';
import { createAuditLog } from '../../middleware/audit';
import { prisma } from '../../config/database';
import type { PatientQueryInput } from './patient.schemas';

const STAFF_READ_ROLES = ['DOCTOR', 'NURSE', 'RECEPTIONIST', 'HOSPITAL_ADMIN'];
const CLINICAL_ROLES = ['DOCTOR', 'NURSE'];

function sanitizePatientRecord<T extends Record<string, any>>(
  patient: T,
  userRoles: string[],
  isOwner: boolean
): T {
  const canViewClinical =
    isOwner || userRoles.some((role) => CLINICAL_ROLES.includes(role));

  if (canViewClinical) {
    return patient;
  }

  // Receptionist and Hospital Admin do not get unrestricted clinical notes/allergies
  const { medicalNotes: _notes, allergies: _allergies, ...demographicsOnly } = patient;
  return demographicsOnly as T;
}

export class PatientController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const targetUserId = req.body.userId || req.user!.userId;
      const patient = await patientService.create(targetUserId, req.body);

      await createAuditLog(req, {
        action: 'CREATE',
        resourceType: 'PATIENT',
        resourceId: patient.id,
        metadata: { registrationNumber: patient.registrationNumber },
      });

      createdResponse(res, patient, 'Patient created successfully');
    } catch (error) {
      next(error);
    }
  }

  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const patient = await prisma.patient.findUnique({
        where: { userId: req.user!.userId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
              isActive: true,
              emailVerified: true,
            },
          },
          contacts: {
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          },
        },
      });

      if (!patient) {
        throw new NotFoundError('Patient profile not found for current user');
      }

      successResponse(res, patient, 'Patient profile retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as PatientQueryInput;
      const { patients, total, page, limit } = await patientService.findAll(query);

      const userRoles = req.user?.roles || [];
      const sanitized = patients.map((p) =>
        sanitizePatientRecord(p, userRoles, p.userId === req.user?.userId)
      );

      paginatedResponse(
        res,
        sanitized,
        total,
        page,
        limit,
        'Patients retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const patient = await patientService.findById(req.params.id);

      const userRoles = req.user?.roles || [];
      const isStaff = userRoles.some((role) => STAFF_READ_ROLES.includes(role));
      const isOwner = patient.userId === req.user?.userId;

      if (!isStaff && !isOwner) {
        await createAuditLog(req, {
          action: 'READ_DENIED',
          resourceType: 'PATIENT',
          resourceId: patient.id,
          outcome: 'DENIED',
          reason: 'Unauthorized cross-patient record access attempt',
        });
        throw new ForbiddenError('You do not have permission to view this patient record');
      }

      await createAuditLog(req, {
        action: 'READ',
        resourceType: 'PATIENT',
        resourceId: patient.id,
      });

      successResponse(
        res,
        sanitizePatientRecord(patient, userRoles, isOwner),
        'Patient retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const patient = await patientService.update(
        req.params.id,
        req.body,
        req.user!.userId,
        req.user!.roles
      );

      await createAuditLog(req, {
        action: 'UPDATE',
        resourceType: 'PATIENT',
        resourceId: patient.id,
      });

      successResponse(res, patient, 'Patient updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async searchPatients(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const term = ((req.query.q || req.query.search || req.query.term) as string) || '';
      const limit = req.query.limit ? Number(req.query.limit) : 20;

      const patients = await patientService.search(term, limit);
      const userRoles = req.user?.roles || [];
      const sanitized = patients.map((p) =>
        sanitizePatientRecord(p, userRoles, p.userId === req.user?.userId)
      );

      successResponse(res, sanitized, 'Patients retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const patientController = new PatientController();
