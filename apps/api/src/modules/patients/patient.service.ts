// =============================================================================
// MediCore API - Patient Service
// =============================================================================

import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../middleware/errorHandler';
import type {
  CreatePatientInput,
  PatientQueryInput,
  UpdatePatientInput,
} from './patient.schemas';

const AUTHORIZED_STAFF_ROLES = ['HOSPITAL_ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE'];

const patientUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  isActive: true,
  emailVerified: true,
} satisfies Prisma.UserSelect;

export class PatientService {
  /**
   * Generate next sequential registration number in MED-XXXXXX format.
   */
  private async generateRegistrationNumber(tx: Prisma.TransactionClient): Promise<string> {
    const latestPatient = await tx.patient.findFirst({
      where: {
        registrationNumber: {
          startsWith: 'MED-',
        },
      },
      orderBy: {
        registrationNumber: 'desc',
      },
      select: {
        registrationNumber: true,
      },
    });

    let nextNumber = 1;
    if (latestPatient?.registrationNumber) {
      const numericPart = parseInt(latestPatient.registrationNumber.replace('MED-', ''), 10);
      if (!Number.isNaN(numericPart)) {
        nextNumber = numericPart + 1;
      }
    }

    return `MED-${String(nextNumber).padStart(6, '0')}`;
  }

  /**
   * Check for potential duplicate patients by date of birth and full name.
   */
  async checkDuplicate(
    dateOfBirth: Date | string,
    firstName: string,
    lastName: string
  ) {
    const dob = new Date(dateOfBirth);
    const startOfDay = new Date(
      Date.UTC(dob.getUTCFullYear(), dob.getUTCMonth(), dob.getUTCDate())
    );
    const endOfDay = new Date(
      Date.UTC(dob.getUTCFullYear(), dob.getUTCMonth(), dob.getUTCDate() + 1)
    );

    return prisma.patient.findMany({
      where: {
        dateOfBirth: {
          gte: startOfDay,
          lt: endOfDay,
        },
        user: {
          firstName: { equals: firstName.trim(), mode: 'insensitive' },
          lastName: { equals: lastName.trim(), mode: 'insensitive' },
        },
      },
      include: {
        user: {
          select: patientUserSelect,
        },
      },
    });
  }

  /**
   * Create a new patient record with an auto-generated registration number (MED-XXXXXX)
   * and optional emergency contact inside a database transaction.
   */
  async create(userId: string, data: CreatePatientInput) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const existingPatient = await prisma.patient.findUnique({
      where: { userId },
    });

    if (existingPatient) {
      throw new ConflictError('A patient profile already exists for this user');
    }

    const duplicates = await this.checkDuplicate(
      data.dateOfBirth,
      user.firstName,
      user.lastName
    );
    if (duplicates.length > 0) {
      throw new ConflictError(
        'A patient with matching name and date of birth already exists'
      );
    }

    const { emergencyContact, registrationNumber: providedRegNum, userId: _ignoredUserId, ...patientFields } = data;

    return prisma.$transaction(async (tx) => {
      const registrationNumber =
        providedRegNum || (await this.generateRegistrationNumber(tx));

      const createdPatient = await tx.patient.create({
        data: {
          userId,
          registrationNumber,
          dateOfBirth: new Date(patientFields.dateOfBirth),
          gender: patientFields.gender,
          bloodType: patientFields.bloodType ?? null,
          address: patientFields.address ?? null,
          city: patientFields.city ?? null,
          state: patientFields.state ?? null,
          postalCode: patientFields.postalCode ?? null,
          country: patientFields.country ?? null,
          allergies: patientFields.allergies ?? null,
          medicalNotes: patientFields.medicalNotes ?? null,
        },
      });

      if (emergencyContact) {
        await tx.patientContact.create({
          data: {
            patientId: createdPatient.id,
            contactType: 'EMERGENCY',
            firstName: emergencyContact.firstName,
            lastName: emergencyContact.lastName,
            relationship: emergencyContact.relationship,
            phone: emergencyContact.phone,
            email: emergencyContact.email ?? null,
            isPrimary: true,
          },
        });
      }

      return tx.patient.findUniqueOrThrow({
        where: { id: createdPatient.id },
        include: {
          user: {
            select: patientUserSelect,
          },
          contacts: {
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          },
        },
      });
    });
  }

  /**
   * Find a patient by ID with user info and contacts.
   */
  async findById(id: string) {
    const patient = await prisma.patient.findUnique({
      where: { id },
      include: {
        user: {
          select: patientUserSelect,
        },
        contacts: {
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!patient) {
      throw new NotFoundError('Patient not found');
    }

    return patient;
  }

  /**
   * Retrieve paginated, searchable, and filterable list of patients.
   */
  async findAll(query: PatientQueryInput) {
    const {
      page = 1,
      limit = 20,
      search,
      gender,
      bloodType,
      sortBy = 'createdAt',
      order = 'desc',
    } = query;

    const where: Prisma.PatientWhereInput = {};

    if (gender) {
      where.gender = gender;
    }

    if (bloodType) {
      where.bloodType = bloodType;
    }

    if (search && search.trim().length > 0) {
      const term = search.trim();
      const nameParts = term.split(/\s+/).filter(Boolean);

      const orConditions: Prisma.PatientWhereInput[] = [
        { registrationNumber: { contains: term, mode: 'insensitive' } },
        { user: { firstName: { contains: term, mode: 'insensitive' } } },
        { user: { lastName: { contains: term, mode: 'insensitive' } } },
        { user: { email: { contains: term, mode: 'insensitive' } } },
      ];

      if (nameParts.length >= 2) {
        orConditions.push({
          user: {
            AND: [
              { firstName: { contains: nameParts[0], mode: 'insensitive' } },
              { lastName: { contains: nameParts[nameParts.length - 1], mode: 'insensitive' } },
            ],
          },
        });
      }

      where.OR = orConditions;
    }

    const skip = (page - 1) * limit;

    const [patients, total] = await prisma.$transaction([
      prisma.patient.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: order },
        include: {
          user: {
            select: patientUserSelect,
          },
          contacts: {
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          },
        },
      }),
      prisma.patient.count({ where }),
    ]);

    return {
      patients,
      total,
      page,
      limit,
    };
  }

  /**
   * Update a patient record. Only the patient themselves or authorized staff may update.
   */
  async update(
    id: string,
    data: UpdatePatientInput,
    requestingUserId: string,
    requestingUserRoles?: string[]
  ) {
    const existingPatient = await prisma.patient.findUnique({
      where: { id },
      include: {
        contacts: true,
      },
    });

    if (!existingPatient) {
      throw new NotFoundError('Patient not found');
    }

    if (existingPatient.userId !== requestingUserId) {
      let roles = requestingUserRoles;

      if (!roles) {
        const userRoles = await prisma.userRole.findMany({
          where: { userId: requestingUserId },
          include: { role: { select: { name: true } } },
        });
        roles = userRoles.map((ur) => ur.role.name);
      }

      const isAuthorizedStaff = roles.some((role) =>
        AUTHORIZED_STAFF_ROLES.includes(role)
      );

      if (!isAuthorizedStaff) {
        throw new ForbiddenError('You do not have permission to update this patient profile');
      }
    }

    const { emergencyContact, ...patientFields } = data;

    const updateData: Prisma.PatientUpdateInput = {};
    if (patientFields.dateOfBirth !== undefined) {
      updateData.dateOfBirth = new Date(patientFields.dateOfBirth);
    }
    if (patientFields.gender !== undefined) {
      updateData.gender = patientFields.gender;
    }
    if (patientFields.bloodType !== undefined) {
      updateData.bloodType = patientFields.bloodType;
    }
    if (patientFields.address !== undefined) {
      updateData.address = patientFields.address;
    }
    if (patientFields.city !== undefined) {
      updateData.city = patientFields.city;
    }
    if (patientFields.state !== undefined) {
      updateData.state = patientFields.state;
    }
    if (patientFields.postalCode !== undefined) {
      updateData.postalCode = patientFields.postalCode;
    }
    if (patientFields.country !== undefined) {
      updateData.country = patientFields.country;
    }
    if (patientFields.allergies !== undefined) {
      updateData.allergies = patientFields.allergies;
    }
    if (patientFields.medicalNotes !== undefined) {
      updateData.medicalNotes = patientFields.medicalNotes;
    }

    return prisma.$transaction(async (tx) => {
      if (Object.keys(updateData).length > 0) {
        await tx.patient.update({
          where: { id },
          data: updateData,
        });
      }

      if (emergencyContact) {
        const existingEmergencyContact =
          existingPatient.contacts.find(
            (c) => c.contactType === 'EMERGENCY' && c.isPrimary
          ) || existingPatient.contacts.find((c) => c.contactType === 'EMERGENCY');

        if (existingEmergencyContact) {
          await tx.patientContact.update({
            where: { id: existingEmergencyContact.id },
            data: {
              firstName: emergencyContact.firstName,
              lastName: emergencyContact.lastName,
              relationship: emergencyContact.relationship,
              phone: emergencyContact.phone,
              email: emergencyContact.email ?? null,
            },
          });
        } else {
          await tx.patientContact.create({
            data: {
              patientId: id,
              contactType: 'EMERGENCY',
              firstName: emergencyContact.firstName,
              lastName: emergencyContact.lastName,
              relationship: emergencyContact.relationship,
              phone: emergencyContact.phone,
              email: emergencyContact.email ?? null,
              isPrimary: true,
            },
          });
        }
      }

      return tx.patient.findUniqueOrThrow({
        where: { id },
        include: {
          user: {
            select: patientUserSelect,
          },
          contacts: {
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          },
        },
      });
    });
  }

  /**
   * Search active patients by name or registration number.
   */
  async search(term: string, limit: number = 20) {
    const trimmed = term.trim();
    if (!trimmed) {
      return [];
    }

    const nameParts = trimmed.split(/\s+/).filter(Boolean);

    const orConditions: Prisma.PatientWhereInput[] = [
      { registrationNumber: { contains: trimmed, mode: 'insensitive' } },
      { user: { firstName: { contains: trimmed, mode: 'insensitive' } } },
      { user: { lastName: { contains: trimmed, mode: 'insensitive' } } },
    ];

    if (nameParts.length >= 2) {
      orConditions.push({
        user: {
          AND: [
            { firstName: { contains: nameParts[0], mode: 'insensitive' } },
            { lastName: { contains: nameParts[nameParts.length - 1], mode: 'insensitive' } },
          ],
        },
      });
    }

    return prisma.patient.findMany({
      where: {
        isActive: true,
        OR: orConditions,
      },
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        user: {
          select: patientUserSelect,
        },
        contacts: {
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });
  }
}

export const patientService = new PatientService();
