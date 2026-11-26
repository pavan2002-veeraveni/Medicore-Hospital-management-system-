// =============================================================================
// MediCore API - Prescription Service
// =============================================================================

import { prisma } from '../../config/database';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  InvalidStateTransitionError,
} from '../../middleware/errorHandler';
import type { JwtPayload } from '../../middleware/auth';
import type { CreatePrescriptionInput } from './prescription.schemas';

const VALID_TRANSITIONS: Record<string, string[]> = {
  ACTIVE: ['DISPENSED', 'CANCELLED'],
  DISPENSED: [],
  CANCELLED: [],
};

export class PrescriptionService {
  async create(data: CreatePrescriptionInput, prescriberId: string) {
    const encounter = await prisma.encounter.findUnique({ where: { id: data.encounterId } });
    if (!encounter) throw new NotFoundError('Encounter not found');
    if (encounter.patientId !== data.patientId) {
      throw new ValidationError('Encounter does not belong to the specified patient');
    }
    if (encounter.status === 'COMPLETED') {
      throw new ValidationError('Cannot add prescription to a completed encounter');
    }

    const medicationIds = [...new Set(data.items.map((i) => i.medicationId))];
    const medications = await prisma.medicationCatalog.findMany({
      where: { id: { in: medicationIds }, isActive: true },
    });
    if (medications.length !== medicationIds.length) {
      throw new ValidationError('One or more medications not found or inactive');
    }

    const staff = await prisma.staff.findUnique({ where: { userId: prescriberId } });
    if (!staff || !staff.isActive) {
      throw new ForbiddenError('Only active doctors can create prescriptions');
    }

    return prisma.$transaction(async (tx) => {
      return tx.prescription.create({
        data: {
          encounterId: data.encounterId,
          patientId: data.patientId,
          prescriberId: staff.id,
          notes: data.notes,
          items: { create: data.items },
        },
        include: {
          items: { include: { medication: true } },
          patient: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        },
      });
    });
  }

  async findById(id: string, requester?: JwtPayload) {
    const prescription = await prisma.prescription.findUnique({
      where: { id },
      include: {
        items: { include: { medication: true } },
        patient: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        prescriber: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        encounter: true,
      },
    });
    if (!prescription) throw new NotFoundError('Prescription not found');

    if (requester) {
      const isClinicalStaff =
        requester.roles.includes('DOCTOR') || requester.roles.includes('NURSE');
      if (!isClinicalStaff && prescription.patient.userId !== requester.userId) {
        throw new ForbiddenError('You do not have permission to view this prescription');
      }
    }

    return prescription;
  }

  async findAll(page: number, limit: number, filters: Record<string, any>) {
    const where: Record<string, any> = {};
    if (filters.patientId) where.patientId = filters.patientId;
    if (filters.encounterId) where.encounterId = filters.encounterId;
    if (filters.status) where.status = filters.status;
    if (filters.prescriberId) where.prescriberId = filters.prescriberId;

    const [data, total] = await Promise.all([
      prisma.prescription.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          items: { include: { medication: true } },
          patient: { include: { user: { select: { firstName: true, lastName: true } } } },
          prescriber: { include: { user: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.prescription.count({ where }),
    ]);
    return { data, total };
  }

  async updateStatus(id: string, status: string) {
    const prescription = await prisma.prescription.findUnique({ where: { id } });
    if (!prescription) throw new NotFoundError('Prescription not found');

    const allowed = VALID_TRANSITIONS[prescription.status] || [];
    if (!allowed.includes(status)) {
      throw new InvalidStateTransitionError(`Cannot transition from ${prescription.status} to ${status}`);
    }

    return prisma.prescription.update({
      where: { id },
      data: { status },
      include: { items: { include: { medication: true } } },
    });
  }

  async getMedicationCatalog(search?: string) {
    const where: Record<string, any> = { isActive: true };
    if (search && search.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: 'insensitive' } },
        { genericName: { contains: search.trim(), mode: 'insensitive' } },
        { category: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }
    return prisma.medicationCatalog.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }
}

export const prescriptionService = new PrescriptionService();
