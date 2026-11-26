// =============================================================================
// MediCore API - Consent Service
// =============================================================================

import { prisma } from '../../config/database';
import {
  NotFoundError,
  InvalidStateTransitionError,
} from '../../middleware/errorHandler';
import type {
  CreateConsentInput,
  ConsentQueryInput,
} from './consent.schemas';

export class ConsentService {
  /**
   * Grant a new patient consent and record initial history entry
   */
  async grant(input: CreateConsentInput, actorId: string) {
    const patient = await prisma.patient.findUnique({
      where: { id: input.patientId },
      select: { id: true },
    });

    if (!patient) {
      throw new NotFoundError('Patient not found');
    }

    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const consent = await tx.consent.create({
        data: {
          patientId: input.patientId,
          category: input.category,
          purpose: input.purpose,
          status: 'GRANTED',
          grantedAt: now,
          expiresAt: input.expiresAt ?? null,
        },
      });

      await tx.consentHistory.create({
        data: {
          consentId: consent.id,
          action: 'GRANTED',
          actorId,
          metadata: {
            category: input.category,
            purpose: input.purpose,
            expiresAt: input.expiresAt ? input.expiresAt.toISOString() : null,
          },
        },
      });

      return tx.consent.findUnique({
        where: { id: consent.id },
        include: {
          history: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });
    });
  }

  /**
   * Revoke an existing consent and append revocation history
   */
  async revoke(consentId: string, actorId: string, reason: string) {
    const consent = await prisma.consent.findUnique({
      where: { id: consentId },
    });

    if (!consent) {
      throw new NotFoundError('Consent record not found');
    }

    if (consent.status === 'REVOKED') {
      throw new InvalidStateTransitionError('Consent has already been revoked');
    }

    if (consent.status === 'EXPIRED') {
      throw new InvalidStateTransitionError('Cannot revoke an expired consent');
    }

    const now = new Date();

    return prisma.$transaction(async (tx) => {
      await tx.consent.update({
        where: { id: consentId },
        data: {
          status: 'REVOKED',
          revokedAt: now,
        },
      });

      await tx.consentHistory.create({
        data: {
          consentId,
          action: 'REVOKED',
          actorId,
          reason,
          metadata: {
            revokedAt: now.toISOString(),
          },
        },
      });

      return tx.consent.findUnique({
        where: { id: consentId },
        include: {
          history: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });
    });
  }

  /**
   * Find a single consent record with patient ownership info
   */
  async findById(id: string) {
    const consent = await prisma.consent.findUnique({
      where: { id },
      include: {
        patient: {
          select: {
            id: true,
            userId: true,
            registrationNumber: true,
          },
        },
        history: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!consent) {
      throw new NotFoundError('Consent record not found');
    }

    return consent;
  }

  /**
   * Find paginated consents filtered by patientId, category, and status
   */
  async findByPatient(query: Partial<ConsentQueryInput> & { patientId?: string }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, any> = {};
    if (query.patientId) {
      where.patientId = query.patientId;
    }
    if (query.category) {
      where.category = query.category;
    }
    if (query.status) {
      where.status = query.status;
    }

    const [consents, total] = await Promise.all([
      prisma.consent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          history: {
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
      prisma.consent.count({ where }),
    ]);

    return {
      consents,
      total,
      page,
      limit,
    };
  }

  /**
   * Check whether a patient has an active, non-expired consent for category & purpose
   */
  async checkConsent(
    patientId: string,
    category: string,
    purpose?: string
  ): Promise<boolean> {
    const now = new Date();

    const activeConsent = await prisma.consent.findFirst({
      where: {
        patientId,
        category,
        ...(purpose ? { purpose } : {}),
        status: 'GRANTED',
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { id: true },
    });

    return Boolean(activeConsent);
  }
}

export const consentService = new ConsentService();
