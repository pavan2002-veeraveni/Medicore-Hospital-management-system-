// =============================================================================
// MediCore API - Encounter Service
// =============================================================================

import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  InvalidStateTransitionError,
} from '../../middleware/errorHandler';
import type {
  CreateEncounterInput,
  UpdateEncounterInput,
  VitalSignInput,
  EncounterQueryInput,
} from './encounter.schemas';

const ENCOUNTER_DETAIL_INCLUDE = {
  patient: {
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
    },
  },
  doctor: {
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
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
  appointment: true,
  vitalSigns: {
    orderBy: { recordedAt: 'desc' as const },
  },
  diagnoses: {
    orderBy: { diagnosedAt: 'desc' as const },
  },
  prescriptions: {
    include: {
      items: {
        include: {
          medication: true,
        },
      },
    },
    orderBy: { prescribedAt: 'desc' as const },
  },
  labOrders: {
    include: {
      items: {
        include: {
          test: true,
          result: true,
        },
      },
    },
    orderBy: { orderedAt: 'desc' as const },
  },
};

const ENCOUNTER_SUMMARY_INCLUDE = {
  patient: {
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  },
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
  appointment: {
    select: {
      id: true,
      scheduledStart: true,
      scheduledEnd: true,
      status: true,
      type: true,
    },
  },
};

const VALID_TRANSITIONS: Record<string, string[]> = {
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
};

const TERMINAL_APPOINTMENT_STATUSES = ['CANCELLED', 'NO_SHOW', 'COMPLETED'];

export class EncounterService {
  /**
   * Create a new clinical encounter, linking to an appointment if provided
   */
  async create(input: CreateEncounterInput, doctorUserId: string) {
    const doctorStaff = await prisma.staff.findUnique({
      where: { userId: doctorUserId },
    });

    if (!doctorStaff || !doctorStaff.isActive) {
      throw new ForbiddenError('Active doctor staff profile is required to start an encounter');
    }

    const patient = await prisma.patient.findUnique({
      where: { id: input.patientId },
    });

    if (!patient) {
      throw new NotFoundError('Patient not found');
    }

    if (input.appointmentId) {
      const appointment = await prisma.appointment.findUnique({
        where: { id: input.appointmentId },
      });

      if (!appointment) {
        throw new NotFoundError('Appointment not found');
      }

      if (appointment.patientId !== input.patientId) {
        throw new ValidationError('Appointment does not belong to the specified patient');
      }

      if (TERMINAL_APPOINTMENT_STATUSES.includes(appointment.status)) {
        throw new InvalidStateTransitionError(
          `Cannot start encounter for an appointment in ${appointment.status} status`
        );
      }

      return prisma.$transaction(async (tx) => {
        await tx.appointment.update({
          where: { id: appointment.id },
          data: { status: 'IN_PROGRESS' },
        });

        return tx.encounter.create({
          data: {
            patientId: input.patientId,
            doctorId: doctorStaff.id,
            appointmentId: appointment.id,
            status: 'IN_PROGRESS',
            type: input.type,
            chiefComplaint: input.chiefComplaint,
            clinicalNotes: input.clinicalNotes,
          },
          include: ENCOUNTER_SUMMARY_INCLUDE,
        });
      });
    }

    return prisma.encounter.create({
      data: {
        patientId: input.patientId,
        doctorId: doctorStaff.id,
        status: 'IN_PROGRESS',
        type: input.type,
        chiefComplaint: input.chiefComplaint,
        clinicalNotes: input.clinicalNotes,
      },
      include: ENCOUNTER_SUMMARY_INCLUDE,
    });
  }

  /**
   * Find an encounter by ID including vitals, diagnoses, prescriptions, and lab orders
   */
  async findById(id: string) {
    const encounter = await prisma.encounter.findUnique({
      where: { id },
      include: ENCOUNTER_DETAIL_INCLUDE,
    });

    if (!encounter) {
      throw new NotFoundError('Encounter not found');
    }

    return encounter;
  }

  /**
   * List encounters filtered by patient, doctor, status, type, and date range
   */
  async findAll(query: EncounterQueryInput) {
    const where: Prisma.EncounterWhereInput = {};

    if (query.patientId) {
      where.patientId = query.patientId;
    }

    if (query.doctorId) {
      where.doctorId = query.doctorId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.startDate || query.endDate) {
      where.startedAt = {};
      if (query.startDate) {
        where.startedAt.gte = query.startDate;
      }
      if (query.endDate) {
        where.startedAt.lte = query.endDate;
      }
    }

    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      prisma.encounter.findMany({
        where,
        include: ENCOUNTER_SUMMARY_INCLUDE,
        orderBy: { startedAt: 'desc' },
        skip,
        take: query.limit,
      }),
      prisma.encounter.count({ where }),
    ]);

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /**
   * Update encounter clinical notes and/or status with enforced state transitions
   */
  async update(id: string, input: UpdateEncounterInput) {
    const encounter = await prisma.encounter.findUnique({
      where: { id },
    });

    if (!encounter) {
      throw new NotFoundError('Encounter not found');
    }

    if (encounter.status === 'COMPLETED') {
      throw new InvalidStateTransitionError('Completed encounters cannot be modified');
    }

    if (input.status && input.status !== encounter.status) {
      const allowedNext = VALID_TRANSITIONS[encounter.status] || [];
      if (!allowedNext.includes(input.status)) {
        throw new InvalidStateTransitionError(
          `Cannot transition encounter from ${encounter.status} to ${input.status}`
        );
      }
    }

    const isCompleting = input.status === 'COMPLETED';

    return prisma.$transaction(async (tx) => {
      if (isCompleting && encounter.appointmentId) {
        await tx.appointment.updateMany({
          where: { id: encounter.appointmentId, status: 'IN_PROGRESS' },
          data: { status: 'COMPLETED' },
        });
      }

      return tx.encounter.update({
        where: { id },
        data: {
          ...(input.clinicalNotes !== undefined && { clinicalNotes: input.clinicalNotes }),
          ...(input.status !== undefined && { status: input.status }),
          ...(isCompleting && { completedAt: new Date() }),
        },
        include: ENCOUNTER_DETAIL_INCLUDE,
      });
    });
  }

  /**
   * Record vital signs for an in-progress encounter
   */
  async addVitalSigns(encounterId: string, input: VitalSignInput, recordedByUserId: string) {
    const encounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
    });

    if (!encounter) {
      throw new NotFoundError('Encounter not found');
    }

    if (encounter.status !== 'IN_PROGRESS') {
      throw new InvalidStateTransitionError(
        `Cannot record vital signs for an encounter in ${encounter.status} status`
      );
    }

    let bmi: number | undefined;
    if (input.weight !== undefined && input.height !== undefined) {
      const heightInMeters = input.height / 100;
      bmi = Number((input.weight / (heightInMeters * heightInMeters)).toFixed(2));
    }

    return prisma.vitalSign.create({
      data: {
        encounterId,
        temperature: input.temperature,
        bloodPressureSystolic: input.bpSystolic,
        bloodPressureDiastolic: input.bpDiastolic,
        heartRate: input.heartRate,
        respiratoryRate: input.respiratoryRate,
        oxygenSaturation: input.oxygenSaturation,
        weight: input.weight,
        height: input.height,
        bmi,
        notes: input.notes,
        recordedBy: recordedByUserId,
      },
    });
  }

  /**
   * Complete an in-progress encounter (IN_PROGRESS -> COMPLETED)
   */
  async complete(id: string) {
    const encounter = await prisma.encounter.findUnique({
      where: { id },
    });

    if (!encounter) {
      throw new NotFoundError('Encounter not found');
    }

    const allowedNext = VALID_TRANSITIONS[encounter.status] || [];
    if (!allowedNext.includes('COMPLETED')) {
      throw new InvalidStateTransitionError(
        `Cannot transition encounter from ${encounter.status} to COMPLETED`
      );
    }

    return prisma.$transaction(async (tx) => {
      if (encounter.appointmentId) {
        await tx.appointment.updateMany({
          where: { id: encounter.appointmentId, status: 'IN_PROGRESS' },
          data: { status: 'COMPLETED' },
        });
      }

      return tx.encounter.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
        include: ENCOUNTER_DETAIL_INCLUDE,
      });
    });
  }
}

export const encounterService = new EncounterService();
