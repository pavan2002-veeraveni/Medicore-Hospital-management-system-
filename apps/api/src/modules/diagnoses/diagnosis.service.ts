// =============================================================================
// MediCore API - Diagnosis Service
// =============================================================================

import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import {
  NotFoundError,
  InvalidStateTransitionError,
} from '../../middleware/errorHandler';
import type { CreateDiagnosisInput, DiagnosisQueryInput } from './diagnosis.schemas';

export class DiagnosisService {
  /**
   * Create a new diagnosis for an in-progress encounter
   */
  async create(input: CreateDiagnosisInput, diagnosedByUserId: string) {
    const encounter = await prisma.encounter.findUnique({
      where: { id: input.encounterId },
    });

    if (!encounter) {
      throw new NotFoundError('Encounter not found');
    }

    if (encounter.status !== 'IN_PROGRESS') {
      throw new InvalidStateTransitionError(
        `Cannot add diagnosis to an encounter in ${encounter.status} status`
      );
    }

    return prisma.diagnosis.create({
      data: {
        encounterId: input.encounterId,
        code: input.code,
        description: input.description,
        type: input.type,
        severity: input.severity,
        notes: input.notes,
        diagnosedBy: diagnosedByUserId,
      },
      include: {
        encounter: {
          select: {
            id: true,
            patientId: true,
            doctorId: true,
            status: true,
            type: true,
            startedAt: true,
          },
        },
      },
    });
  }

  /**
   * Find all diagnoses for a given encounter
   */
  async findByEncounter(encounterId: string) {
    const encounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
      select: { id: true },
    });

    if (!encounter) {
      throw new NotFoundError('Encounter not found');
    }

    return prisma.diagnosis.findMany({
      where: { encounterId },
      orderBy: { diagnosedAt: 'desc' },
    });
  }

  /**
   * Find all diagnoses for a patient across all encounters
   */
  async findByPatient(patientId: string, query: DiagnosisQueryInput) {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true },
    });

    if (!patient) {
      throw new NotFoundError('Patient not found');
    }

    const where: Prisma.DiagnosisWhereInput = {
      encounter: {
        patientId,
      },
    };

    if (query.type) {
      where.type = query.type;
    }

    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      prisma.diagnosis.findMany({
        where,
        include: {
          encounter: {
            select: {
              id: true,
              type: true,
              status: true,
              startedAt: true,
              completedAt: true,
              doctor: {
                include: {
                  user: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                    },
                  },
                  department: {
                    select: {
                      id: true,
                      name: true,
                      code: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { diagnosedAt: 'desc' },
        skip,
        take: query.limit,
      }),
      prisma.diagnosis.count({ where }),
    ]);

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
    };
  }
}

export const diagnosisService = new DiagnosisService();
