// =============================================================================
// MediCore API - Billing Service
// =============================================================================

import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  InvalidStateTransitionError,
} from '../../middleware/errorHandler';
import type { JwtPayload } from '../../middleware/auth';
import type {
  CreateInvoiceInput,
  InvoiceQueryInput,
  UpdateInvoiceInput,
} from './billing.schemas';

const INVOICE_INCLUDE = {
  patient: {
    select: {
      id: true,
      userId: true,
      registrationNumber: true,
      user: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  },
  items: {
    orderBy: { createdAt: 'asc' as const },
  },
  payments: {
    orderBy: { processedAt: 'desc' as const },
  },
} as const;

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatDateSegment(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

export class BillingService {
  /**
   * Create a new draft invoice with auto-generated invoice number (INV-YYYYMMDD-XXXX)
   * and calculate subtotal, tax, and total inside a database transaction.
   */
  async create(input: CreateInvoiceInput) {
    const patient = await prisma.patient.findUnique({
      where: { id: input.patientId },
      select: { id: true },
    });

    if (!patient) {
      throw new NotFoundError('Patient not found');
    }

    const calculatedItems = input.items.map((item) => {
      const quantity = item.quantity ?? 1;
      const totalPrice = roundCurrency(quantity * item.unitPrice);
      return {
        description: item.description,
        category: item.category,
        quantity,
        unitPrice: roundCurrency(item.unitPrice),
        totalPrice,
        referenceId: item.referenceId ?? null,
        referenceType: item.referenceType ?? null,
      };
    });

    const subtotal = roundCurrency(
      calculatedItems.reduce((sum, item) => sum + item.totalPrice, 0)
    );
    const discountAmount = roundCurrency(input.discountAmount ?? 0);

    if (discountAmount > subtotal) {
      throw new ValidationError('Discount amount cannot exceed invoice subtotal');
    }

    const taxRate = input.taxRate ?? 0;
    const taxableAmount = roundCurrency(Math.max(0, subtotal - discountAmount));
    const taxAmount = roundCurrency(taxableAmount * (taxRate / 100));
    const totalAmount = roundCurrency(taxableAmount + taxAmount);

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await prisma.$transaction(async (tx) => {
          const invoiceNumber = await this.generateInvoiceNumber(tx);

          return tx.invoice.create({
            data: {
              patientId: input.patientId,
              invoiceNumber,
              status: 'DRAFT',
              subtotal,
              taxRate,
              taxAmount,
              discountAmount,
              totalAmount,
              paidAmount: 0,
              dueDate: input.dueDate ?? null,
              notes: input.notes ?? null,
              items: {
                create: calculatedItems,
              },
            },
            include: INVOICE_INCLUDE,
          });
        });
      } catch (error) {
        const isUniqueViolation =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002';

        if (isUniqueViolation && attempt < maxAttempts) {
          continue;
        }
        throw error;
      }
    }

    throw new Error('Failed to generate unique invoice number');
  }

  /**
   * Generate sequential invoice number in INV-YYYYMMDD-XXXX format.
   */
  private async generateInvoiceNumber(tx: Prisma.TransactionClient): Promise<string> {
    const prefix = `INV-${formatDateSegment(new Date())}-`;

    const latestInvoice = await tx.invoice.findFirst({
      where: {
        invoiceNumber: {
          startsWith: prefix,
        },
      },
      orderBy: {
        invoiceNumber: 'desc',
      },
      select: {
        invoiceNumber: true,
      },
    });

    let nextSequence = 1;
    if (latestInvoice) {
      const sequencePart = latestInvoice.invoiceNumber.slice(prefix.length);
      const parsed = parseInt(sequencePart, 10);
      if (!Number.isNaN(parsed)) {
        nextSequence = parsed + 1;
      }
    }

    return `${prefix}${String(nextSequence).padStart(4, '0')}`;
  }

  /**
   * Find an invoice by ID. Enforces ownership check when requested by a PATIENT.
   */
  async findById(id: string, requestingUser?: JwtPayload) {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: INVOICE_INCLUDE,
    });

    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    if (requestingUser) {
      const isBillingOfficer = requestingUser.roles.includes('BILLING_OFFICER');
      const isAdmin = requestingUser.roles.includes('HOSPITAL_ADMIN');

      if (!isBillingOfficer && !isAdmin && invoice.patient.userId !== requestingUser.userId) {
        throw new ForbiddenError('You do not have permission to view this invoice');
      }
    }

    return invoice;
  }

  /**
   * Find all invoices with pagination and filters.
   */
  async findAll(query: InvoiceQueryInput) {
    const { page, limit, patientId, status, dateFrom, dateTo } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceWhereInput = {};

    if (patientId) {
      where.patientId = patientId;
    }

    if (status) {
      where.status = status;
    }

    if (dateFrom || dateTo) {
      where.createdAt = {
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
      };
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: INVOICE_INCLUDE,
      }),
      prisma.invoice.count({ where }),
    ]);

    return { invoices, total, page, limit };
  }

  /**
   * Issue a DRAFT invoice (DRAFT -> ISSUED) and set issuedAt / issuedBy.
   */
  async issue(id: string, issuedByUserId: string, notes?: string) {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: { id: true, status: true, notes: true },
    });

    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    if (invoice.status !== 'DRAFT') {
      throw new InvalidStateTransitionError(
        `Cannot issue invoice with status ${invoice.status}. Only DRAFT invoices can be issued.`
      );
    }

    return prisma.invoice.update({
      where: { id },
      data: {
        status: 'ISSUED',
        issuedAt: new Date(),
        issuedBy: issuedByUserId,
        ...(notes !== undefined ? { notes } : {}),
      },
      include: INVOICE_INCLUDE,
    });
  }

  /**
   * Cancel an invoice (only DRAFT or ISSUED -> CANCELLED).
   */
  async cancel(id: string, notes?: string) {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: { id: true, status: true, notes: true },
    });

    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    if (invoice.status !== 'DRAFT' && invoice.status !== 'ISSUED') {
      throw new InvalidStateTransitionError(
        `Cannot cancel invoice with status ${invoice.status}. Only DRAFT or ISSUED invoices can be cancelled.`
      );
    }

    return prisma.invoice.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        ...(notes !== undefined ? { notes } : {}),
      },
      include: INVOICE_INCLUDE,
    });
  }

  /**
   * Update invoice status (ISSUED or CANCELLED) and/or notes.
   */
  async update(id: string, input: UpdateInvoiceInput, userId: string) {
    if (input.status === 'ISSUED') {
      return this.issue(id, userId, input.notes);
    }
    if (input.status === 'CANCELLED') {
      return this.cancel(id, input.notes);
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    return prisma.invoice.update({
      where: { id },
      data: {
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      include: INVOICE_INCLUDE,
    });
  }

  /**
   * Get billing summary (invoices and payments) for a specific patient.
   */
  async getPatientBilling(patientId: string, requestingUser?: JwtPayload) {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        userId: true,
        registrationNumber: true,
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!patient) {
      throw new NotFoundError('Patient not found');
    }

    if (requestingUser) {
      const isBillingOfficer = requestingUser.roles.includes('BILLING_OFFICER');
      const isAdmin = requestingUser.roles.includes('HOSPITAL_ADMIN');

      if (!isBillingOfficer && !isAdmin && patient.userId !== requestingUser.userId) {
        throw new ForbiddenError('You do not have permission to view this patient billing summary');
      }
    }

    const invoices = await prisma.invoice.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: { orderBy: { createdAt: 'asc' } },
        payments: { orderBy: { processedAt: 'desc' } },
      },
    });

    const payments = invoices
      .flatMap((inv) =>
        inv.payments.map((payment) => ({
          ...payment,
          invoiceNumber: inv.invoiceNumber,
        }))
      )
      .sort((a, b) => b.processedAt.getTime() - a.processedAt.getTime());

    const statusCounts: Record<string, number> = {
      DRAFT: 0,
      ISSUED: 0,
      PARTIALLY_PAID: 0,
      PAID: 0,
      OVERDUE: 0,
      CANCELLED: 0,
    };

    let totalBilled = 0;
    let totalPaid = 0;
    let outstandingBalance = 0;

    for (const inv of invoices) {
      statusCounts[inv.status] = (statusCounts[inv.status] ?? 0) + 1;

      if (inv.status !== 'CANCELLED') {
        totalBilled = roundCurrency(totalBilled + inv.totalAmount);
        totalPaid = roundCurrency(totalPaid + inv.paidAmount);
        if (inv.status !== 'DRAFT') {
          outstandingBalance = roundCurrency(
            outstandingBalance + Math.max(0, inv.totalAmount - inv.paidAmount)
          );
        }
      }
    }

    return {
      patient,
      summary: {
        totalInvoices: invoices.length,
        totalBilled,
        totalPaid,
        outstandingBalance,
        statusCounts,
      },
      invoices,
      payments,
    };
  }
}

export const billingService = new BillingService();
