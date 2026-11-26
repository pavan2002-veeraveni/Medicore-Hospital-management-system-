// =============================================================================
// MediCore API - Laboratory Service
// =============================================================================

import { prisma } from '../../config/database';
import {
  ConflictError,
  ForbiddenError,
  InvalidStateTransitionError,
  NotFoundError,
  ValidationError,
} from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';
import { dispatchNotificationJob } from '../../jobs/queues';
import type {
  AbnormalFlag,
  CreateLabOrderInput,
  CreateLabTestInput,
  LabOrderItemStatus,
  LabOrderQueryInput,
  LabOrderStatus,
  LabResultInput,
  LabTestQueryInput,
  UpdateLabTestInput,
} from './laboratory.schemas';

export interface RequesterContext {
  userId: string;
  roles: string[];
}

const VALID_ORDER_TRANSITIONS: Record<LabOrderStatus, LabOrderStatus[]> = {
  ORDERED: ['SPECIMEN_COLLECTED', 'CANCELLED'],
  SPECIMEN_COLLECTED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

const VALID_ITEM_TRANSITIONS: Record<LabOrderItemStatus, LabOrderItemStatus[]> = {
  PENDING: ['SPECIMEN_COLLECTED', 'CANCELLED'],
  SPECIMEN_COLLECTED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

const CLINICAL_AND_ADMIN_ROLES = [
  'LAB_TECHNICIAN',
  'DOCTOR',
  'NURSE',
  'HOSPITAL_ADMIN',
  'ADMIN',
];

const LAB_ORDER_INCLUDE = {
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
  encounter: {
    select: {
      id: true,
      status: true,
      type: true,
      startedAt: true,
    },
  },
  items: {
    include: {
      test: true,
      result: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
};

export class LaboratoryService {
  // ===========================================================================
  // LAB TESTS (CATALOG CRUD)
  // ===========================================================================

  /**
   * Create a new laboratory test definition in the catalog
   */
  async createLabTest(input: CreateLabTestInput) {
    const existing = await prisma.laboratoryTest.findUnique({
      where: { code: input.code },
    });

    if (existing) {
      throw new ConflictError(`A laboratory test with code '${input.code}' already exists`);
    }

    this.validateReferenceBounds(input.referenceMin, input.referenceMax);

    const labTest = await prisma.laboratoryTest.create({
      data: {
        name: input.name,
        code: input.code,
        category: input.category,
        description: input.description ?? null,
        unit: input.unit ?? null,
        referenceMin: input.referenceMin ?? null,
        referenceMax: input.referenceMax ?? null,
        referenceRange: input.referenceRange ?? null,
        sampleType: input.sampleType ?? null,
        turnaroundHours: input.turnaroundHours ?? null,
        price: input.price ?? null,
        isActive: input.isActive ?? true,
      },
    });

    logger.info({ labTestId: labTest.id, code: labTest.code }, 'Laboratory test created');
    return labTest;
  }

  /**
   * List laboratory tests with filtering and pagination
   */
  async findAllLabTests(query: LabTestQueryInput) {
    const { page, limit, category, isActive, search } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, any> = {};

    if (category) {
      where.category = { equals: category, mode: 'insensitive' };
    }

    if (typeof isActive === 'boolean') {
      where.isActive = isActive;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [tests, total] = await Promise.all([
      prisma.laboratoryTest.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      }),
      prisma.laboratoryTest.count({ where }),
    ]);

    return { tests, total, page, limit };
  }

  /**
   * Get a single laboratory test by ID
   */
  async findLabTestById(id: string) {
    const labTest = await prisma.laboratoryTest.findUnique({
      where: { id },
    });

    if (!labTest) {
      throw new NotFoundError('Laboratory test not found');
    }

    return labTest;
  }

  /**
   * Update a laboratory test in the catalog
   */
  async updateLabTest(id: string, input: UpdateLabTestInput) {
    const existing = await this.findLabTestById(id);

    if (input.code && input.code !== existing.code) {
      const codeConflict = await prisma.laboratoryTest.findUnique({
        where: { code: input.code },
      });
      if (codeConflict) {
        throw new ConflictError(`A laboratory test with code '${input.code}' already exists`);
      }
    }

    const nextMin =
      input.referenceMin !== undefined ? input.referenceMin : existing.referenceMin;
    const nextMax =
      input.referenceMax !== undefined ? input.referenceMax : existing.referenceMax;
    this.validateReferenceBounds(nextMin, nextMax);

    const updated = await prisma.laboratoryTest.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.code !== undefined && { code: input.code }),
        ...(input.category !== undefined && { category: input.category }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.unit !== undefined && { unit: input.unit }),
        ...(input.referenceMin !== undefined && { referenceMin: input.referenceMin }),
        ...(input.referenceMax !== undefined && { referenceMax: input.referenceMax }),
        ...(input.referenceRange !== undefined && { referenceRange: input.referenceRange }),
        ...(input.sampleType !== undefined && { sampleType: input.sampleType }),
        ...(input.turnaroundHours !== undefined && { turnaroundHours: input.turnaroundHours }),
        ...(input.price !== undefined && { price: input.price }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });

    logger.info({ labTestId: updated.id, code: updated.code }, 'Laboratory test updated');
    return updated;
  }

  /**
   * Deactivate or remove a laboratory test from the catalog
   */
  async deleteLabTest(id: string) {
    const existing = await prisma.laboratoryTest.findUnique({
      where: { id },
      include: {
        _count: {
          select: { labOrderItems: true },
        },
      },
    });

    if (!existing) {
      throw new NotFoundError('Laboratory test not found');
    }

    if (existing._count.labOrderItems > 0) {
      const deactivated = await prisma.laboratoryTest.update({
        where: { id },
        data: { isActive: false },
      });
      logger.info({ labTestId: id }, 'Laboratory test deactivated (referenced by existing orders)');
      return { ...deactivated, deactivated: true };
    }

    await prisma.laboratoryTest.delete({ where: { id } });
    logger.info({ labTestId: id }, 'Laboratory test deleted');
    return { id, deleted: true };
  }

  // ===========================================================================
  // LAB ORDERS
  // ===========================================================================

  /**
   * Create a new lab order with its order items inside a database transaction
   */
  async createLabOrder(input: CreateLabOrderInput, orderedBy: string) {
    const patient = await prisma.patient.findUnique({
      where: { id: input.patientId },
    });

    if (!patient) {
      throw new NotFoundError('Patient not found');
    }

    if (!patient.isActive) {
      throw new ValidationError('Cannot create a lab order for an inactive patient');
    }

    if (input.encounterId) {
      const encounter = await prisma.encounter.findUnique({
        where: { id: input.encounterId },
      });

      if (!encounter) {
        throw new NotFoundError('Encounter not found');
      }

      if (encounter.patientId !== input.patientId) {
        throw new ValidationError('Encounter does not belong to the specified patient');
      }
    }

    const uniqueTestIds = [...new Set(input.items.map((item) => item.testId))];
    const tests = await prisma.laboratoryTest.findMany({
      where: { id: { in: uniqueTestIds } },
    });

    if (tests.length !== uniqueTestIds.length) {
      const foundIds = new Set(tests.map((t) => t.id));
      const missingIds = uniqueTestIds.filter((tid) => !foundIds.has(tid));
      throw new NotFoundError(`Laboratory test(s) not found: ${missingIds.join(', ')}`);
    }

    const inactiveTests = tests.filter((t) => !t.isActive);
    if (inactiveTests.length > 0) {
      throw new ValidationError(
        `Cannot order inactive laboratory test(s): ${inactiveTests.map((t) => t.code).join(', ')}`
      );
    }

    const labOrder = await prisma.$transaction(async (tx) => {
      return tx.labOrder.create({
        data: {
          patientId: input.patientId,
          encounterId: input.encounterId ?? null,
          orderedBy,
          status: 'ORDERED',
          priority: input.priority,
          clinicalNotes: input.clinicalNotes ?? null,
          items: {
            create: uniqueTestIds.map((testId) => ({
              testId,
              status: 'PENDING',
            })),
          },
        },
        include: LAB_ORDER_INCLUDE,
      });
    });

    logger.info(
      { labOrderId: labOrder.id, patientId: labOrder.patientId, itemCount: labOrder.items.length },
      'Lab order created'
    );

    return labOrder;
  }

  /**
   * Find a single lab order by ID, enforcing patient ownership for PATIENT role
   */
  async findLabOrderById(id: string, requester?: RequesterContext) {
    const labOrder = await prisma.labOrder.findUnique({
      where: { id },
      include: LAB_ORDER_INCLUDE,
    });

    if (!labOrder) {
      throw new NotFoundError('Lab order not found');
    }

    if (requester && this.isPatientOnlyRole(requester.roles)) {
      if (labOrder.patient.userId !== requester.userId) {
        throw new ForbiddenError('You do not have permission to access another patient\'s lab order');
      }
    }

    return labOrder;
  }

  /**
   * List lab orders with filtering and pagination
   */
  async findAllLabOrders(query: LabOrderQueryInput, requester?: RequesterContext) {
    const { page, limit, patientId, encounterId, status, priority, search } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, any> = {};

    if (requester && this.isPatientOnlyRole(requester.roles)) {
      where.patient = { userId: requester.userId };
    }

    if (patientId) {
      where.patientId = patientId;
    }

    if (encounterId) {
      where.encounterId = encounterId;
    }

    if (status) {
      where.status = status;
    }

    if (priority) {
      where.priority = priority;
    }

    if (search) {
      where.OR = [
        { clinicalNotes: { contains: search, mode: 'insensitive' } },
        { patient: { registrationNumber: { contains: search, mode: 'insensitive' } } },
        { patient: { user: { firstName: { contains: search, mode: 'insensitive' } } } },
        { patient: { user: { lastName: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    const [orders, total] = await Promise.all([
      prisma.labOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { orderedAt: 'desc' },
        include: LAB_ORDER_INCLUDE,
      }),
      prisma.labOrder.count({ where }),
    ]);

    return { orders, total, page, limit };
  }

  /**
   * Transition lab order status following ORDERED -> SPECIMEN_COLLECTED -> PROCESSING -> COMPLETED (or CANCELLED)
   */
  async updateLabOrderStatus(id: string, newStatus: LabOrderStatus) {
    const existing = await prisma.labOrder.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!existing) {
      throw new NotFoundError('Lab order not found');
    }

    const currentStatus = existing.status as LabOrderStatus;
    const allowedNext = VALID_ORDER_TRANSITIONS[currentStatus] || [];

    if (!allowedNext.includes(newStatus)) {
      throw new InvalidStateTransitionError(
        `Invalid lab order status transition from ${currentStatus} to ${newStatus}`
      );
    }

    const updatedOrder = await prisma.$transaction(async (tx) => {
      await tx.labOrder.update({
        where: { id },
        data: { status: newStatus },
      });

      if (newStatus === 'SPECIMEN_COLLECTED') {
        await tx.labOrderItem.updateMany({
          where: { labOrderId: id, status: 'PENDING' },
          data: { status: 'SPECIMEN_COLLECTED' },
        });
      } else if (newStatus === 'PROCESSING') {
        await tx.labOrderItem.updateMany({
          where: { labOrderId: id, status: { in: ['PENDING', 'SPECIMEN_COLLECTED'] } },
          data: { status: 'PROCESSING' },
        });
      } else if (newStatus === 'COMPLETED') {
        await tx.labOrderItem.updateMany({
          where: { labOrderId: id, status: { in: ['PENDING', 'SPECIMEN_COLLECTED', 'PROCESSING'] } },
          data: { status: 'COMPLETED' },
        });
      } else if (newStatus === 'CANCELLED') {
        await tx.labOrderItem.updateMany({
          where: { labOrderId: id, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
          data: { status: 'CANCELLED' },
        });
      }

      return tx.labOrder.findUnique({
        where: { id },
        include: LAB_ORDER_INCLUDE,
      });
    });

    logger.info(
      { labOrderId: id, previousStatus: currentStatus, newStatus },
      'Lab order status updated'
    );

    return updatedOrder!;
  }

  // ===========================================================================
  // SPECIMEN COLLECTION (INDIVIDUAL ITEMS)
  // ===========================================================================

  /**
   * Update status of an individual lab order item (e.g., specimen collection per item)
   */
  async updateLabOrderItemStatus(
    orderId: string,
    itemId: string,
    newStatus: LabOrderItemStatus
  ) {
    const item = await prisma.labOrderItem.findUnique({
      where: { id: itemId },
      include: {
        labOrder: true,
        test: true,
        result: true,
      },
    });

    if (!item || item.labOrderId !== orderId) {
      throw new NotFoundError('Lab order item not found for this order');
    }

    if (item.labOrder.status === 'CANCELLED' || item.labOrder.status === 'COMPLETED') {
      throw new InvalidStateTransitionError(
        `Cannot update item status when lab order is ${item.labOrder.status}`
      );
    }

    const currentItemStatus = item.status as LabOrderItemStatus;
    const allowedNext = VALID_ITEM_TRANSITIONS[currentItemStatus] || [];

    if (!allowedNext.includes(newStatus)) {
      throw new InvalidStateTransitionError(
        `Invalid lab order item status transition from ${currentItemStatus} to ${newStatus}`
      );
    }

    const updatedItem = await prisma.$transaction(async (tx) => {
      const updated = await tx.labOrderItem.update({
        where: { id: itemId },
        data: { status: newStatus },
        include: {
          test: true,
          result: true,
        },
      });

      await this.syncOrderStatusFromItems(tx, orderId, item.labOrder.status as LabOrderStatus);

      return updated;
    });

    logger.info(
      { labOrderId: orderId, labOrderItemId: itemId, previousStatus: currentItemStatus, newStatus },
      'Lab order item status updated'
    );

    return updatedItem;
  }

  /**
   * Record specimen collection for specific items or all pending items of an order
   */
  async collectSpecimens(orderId: string, itemIds?: string[]) {
    const order = await prisma.labOrder.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundError('Lab order not found');
    }

    if (order.status === 'CANCELLED' || order.status === 'COMPLETED') {
      throw new InvalidStateTransitionError(
        `Cannot collect specimens for a ${order.status} lab order`
      );
    }

    const targetItems = itemIds
      ? order.items.filter((i) => itemIds.includes(i.id))
      : order.items.filter((i) => i.status === 'PENDING');

    if (itemIds && targetItems.length !== new Set(itemIds).size) {
      throw new NotFoundError('One or more lab order items do not belong to this lab order');
    }

    if (targetItems.length === 0) {
      throw new InvalidStateTransitionError('No pending items available for specimen collection');
    }

    const invalidItems = targetItems.filter((i) => i.status !== 'PENDING');
    if (invalidItems.length > 0) {
      throw new InvalidStateTransitionError(
        'Specimens can only be collected for items in PENDING status'
      );
    }

    const updatedOrder = await prisma.$transaction(async (tx) => {
      await tx.labOrderItem.updateMany({
        where: { id: { in: targetItems.map((i) => i.id) } },
        data: { status: 'SPECIMEN_COLLECTED' },
      });

      await this.syncOrderStatusFromItems(tx, orderId, order.status as LabOrderStatus);

      return tx.labOrder.findUnique({
        where: { id: orderId },
        include: LAB_ORDER_INCLUDE,
      });
    });

    logger.info(
      { labOrderId: orderId, collectedItemIds: targetItems.map((i) => i.id) },
      'Specimens collected for lab order'
    );

    return updatedOrder!;
  }

  // ===========================================================================
  // LAB RESULTS
  // ===========================================================================

  /**
   * Record a lab result for a lab order item.
   * - Verifies chain: orderItem -> order -> patient (and expectedOrderId if provided).
   * - Auto-flags abnormal results when numericValue falls outside referenceMin/referenceMax.
   */
  async recordResult(
    labOrderItemId: string,
    data: Omit<LabResultInput, 'labOrderItemId'> & { patientId?: string },
    performedBy: string,
    expectedOrderId?: string
  ) {
    const orderItem = await prisma.labOrderItem.findUnique({
      where: { id: labOrderItemId },
      include: {
        labOrder: {
          include: {
            patient: true,
          },
        },
        test: true,
        result: true,
      },
    });

    this.verifyResultOrderPatientChain(orderItem, expectedOrderId, data.patientId);

    if (orderItem!.labOrder.status === 'CANCELLED' || orderItem!.status === 'CANCELLED') {
      throw new InvalidStateTransitionError(
        'Cannot record a result for a cancelled lab order or item'
      );
    }

    if (orderItem!.labOrder.status === 'ORDERED') {
      throw new InvalidStateTransitionError(
        'Specimen must be collected before recording lab results'
      );
    }

    if (orderItem!.result) {
      throw new ConflictError('A result has already been recorded for this lab order item');
    }

    const test = orderItem!.test;
    const { isAbnormal, abnormalFlag } = this.evaluateAbnormalResult(
      data.numericValue,
      test,
      data.isAbnormal,
      data.abnormalFlag
    );

    const resolvedUnit = data.unit ?? test.unit ?? null;
    const resolvedReferenceRange =
      data.referenceRange ??
      test.referenceRange ??
      (test.referenceMin !== null && test.referenceMax !== null
        ? `${test.referenceMin} - ${test.referenceMax}`
        : null);

    const result = await prisma.$transaction(async (tx) => {
      const createdResult = await tx.labResult.create({
        data: {
          labOrderItemId,
          value: data.value,
          numericValue: data.numericValue ?? null,
          unit: resolvedUnit,
          referenceRange: resolvedReferenceRange,
          isAbnormal,
          abnormalFlag,
          notes: data.notes ?? null,
          performedBy,
        },
        include: {
          labOrderItem: {
            include: {
              test: true,
              labOrder: {
                select: {
                  id: true,
                  patientId: true,
                  status: true,
                },
              },
            },
          },
        },
      });

      await tx.labOrderItem.update({
        where: { id: labOrderItemId },
        data: { status: 'COMPLETED' },
      });

      if (orderItem!.labOrder.status === 'SPECIMEN_COLLECTED') {
        await tx.labOrder.update({
          where: { id: orderItem!.labOrderId },
          data: { status: 'PROCESSING' },
        });
      }

      return createdResult;
    });

    logger.info(
      {
        labResultId: result.id,
        labOrderItemId,
        labOrderId: orderItem!.labOrderId,
        patientId: orderItem!.labOrder.patientId,
        isAbnormal,
        abnormalFlag,
      },
      'Lab result recorded'
    );

    return result;
  }

  /**
   * Validate a recorded lab result and verify the result -> orderItem -> order -> patient chain
   */
  async validateResult(resultId: string, validatedBy: string) {
    const existingResult = await prisma.labResult.findUnique({
      where: { id: resultId },
      include: {
        labOrderItem: {
          include: {
            labOrder: {
              include: {
                patient: true,
              },
            },
            test: true,
          },
        },
      },
    });

    if (!existingResult) {
      throw new NotFoundError('Lab result not found');
    }

    this.verifyResultOrderPatientChain(existingResult.labOrderItem);

    if (
      existingResult.labOrderItem.labOrder.status === 'CANCELLED' ||
      existingResult.labOrderItem.status === 'CANCELLED'
    ) {
      throw new InvalidStateTransitionError(
        'Cannot validate a result belonging to a cancelled lab order'
      );
    }

    if (existingResult.validatedAt || existingResult.validatedBy) {
      throw new ConflictError('Lab result has already been validated');
    }

    const validatedResult = await prisma.labResult.update({
      where: { id: resultId },
      data: {
        validatedBy,
        validatedAt: new Date(),
      },
      include: {
        labOrderItem: {
          include: {
            test: true,
            labOrder: {
              select: {
                id: true,
                patientId: true,
                status: true,
                patient: {
                  select: {
                    userId: true,
                    user: { select: { email: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    logger.info(
      {
        labResultId: validatedResult.id,
        labOrderId: validatedResult.labOrderItem.labOrderId,
        patientId: validatedResult.labOrderItem.labOrder.patientId,
        validatedBy,
      },
      'Lab result validated'
    );

    if (validatedResult.labOrderItem.labOrder.patient?.userId) {
      await dispatchNotificationJob({
        type: 'LAB_RESULT',
        recipientId: validatedResult.labOrderItem.labOrder.patient.userId,
        recipientEmail: validatedResult.labOrderItem.labOrder.patient.user?.email,
        channel: 'email',
        subject: `Lab Result Ready: ${validatedResult.labOrderItem.test.name}`,
        body: `Your laboratory result for ${validatedResult.labOrderItem.test.name} has been validated and is available in your MediCore portal.`,
        idempotencyKey: `lab-result-validated-${validatedResult.id}`,
      }).catch(() => {});
    }

    return validatedResult;
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private isPatientOnlyRole(roles: string[]): boolean {
    return (
      roles.includes('PATIENT') &&
      !roles.some((role) => CLINICAL_AND_ADMIN_ROLES.includes(role))
    );
  }

  private validateReferenceBounds(min?: number | null, max?: number | null): void {
    if (min !== undefined && min !== null && max !== undefined && max !== null && min > max) {
      throw new ValidationError('referenceMin cannot be greater than referenceMax');
    }
  }

  /**
   * Verify full ownership/relational chain: result -> orderItem -> order -> patient
   */
  private verifyResultOrderPatientChain(
    orderItem: {
      id: string;
      labOrderId: string;
      labOrder?: {
        id: string;
        patientId: string;
        patient?: { id: string } | null;
      } | null;
    } | null,
    expectedOrderId?: string,
    expectedPatientId?: string
  ): void {
    if (!orderItem) {
      throw new NotFoundError('Lab order item not found');
    }

    if (!orderItem.labOrder) {
      throw new NotFoundError('Associated lab order not found for this order item');
    }

    if (!orderItem.labOrder.patient || orderItem.labOrder.patient.id !== orderItem.labOrder.patientId) {
      throw new NotFoundError('Associated patient record not found for this lab order');
    }

    if (expectedOrderId && orderItem.labOrderId !== expectedOrderId) {
      throw new ValidationError(
        'Lab order item does not belong to the specified lab order and patient'
      );
    }

    if (expectedPatientId && orderItem.labOrder.patientId !== expectedPatientId) {
      throw new ValidationError(
        'Patient mismatch: lab order item belongs to a different patient'
      );
    }
  }

  /**
   * Auto-flag abnormal results when numericValue is outside referenceMin/referenceMax
   */
  private evaluateAbnormalResult(
    numericValue: number | null | undefined,
    test: { referenceMin: number | null; referenceMax: number | null },
    explicitIsAbnormal?: boolean,
    explicitFlag?: AbnormalFlag | null
  ): { isAbnormal: boolean; abnormalFlag: AbnormalFlag | null } {
    if (numericValue !== undefined && numericValue !== null) {
      if (test.referenceMin !== null && numericValue < test.referenceMin) {
        return {
          isAbnormal: true,
          abnormalFlag: explicitFlag === 'CRITICAL' ? 'CRITICAL' : 'LOW',
        };
      }

      if (test.referenceMax !== null && numericValue > test.referenceMax) {
        return {
          isAbnormal: true,
          abnormalFlag: explicitFlag === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
        };
      }

      if (test.referenceMin !== null || test.referenceMax !== null) {
        if (explicitFlag || explicitIsAbnormal) {
          return {
            isAbnormal: true,
            abnormalFlag: explicitFlag ?? null,
          };
        }
        return { isAbnormal: false, abnormalFlag: null };
      }
    }

    return {
      isAbnormal: explicitIsAbnormal ?? Boolean(explicitFlag),
      abnormalFlag: explicitFlag ?? null,
    };
  }

  /**
   * Automatically advance lab order status when all non-cancelled items reach a milestone
   */
  private async syncOrderStatusFromItems(
    tx: any,
    orderId: string,
    currentOrderStatus: LabOrderStatus
  ): Promise<void> {
    const items: Array<{ status: string }> = await tx.labOrderItem.findMany({
      where: { labOrderId: orderId },
      select: { status: true },
    });

    const activeItems = items.filter((i) => i.status !== 'CANCELLED');
    if (activeItems.length === 0) {
      return;
    }

    if (
      currentOrderStatus === 'ORDERED' &&
      activeItems.every((i) => i.status !== 'PENDING')
    ) {
      await tx.labOrder.update({
        where: { id: orderId },
        data: { status: 'SPECIMEN_COLLECTED' },
      });
    } else if (
      currentOrderStatus === 'SPECIMEN_COLLECTED' &&
      activeItems.every((i) => i.status === 'PROCESSING' || i.status === 'COMPLETED')
    ) {
      await tx.labOrder.update({
        where: { id: orderId },
        data: { status: 'PROCESSING' },
      });
    }
  }
}

export const laboratoryService = new LaboratoryService();
