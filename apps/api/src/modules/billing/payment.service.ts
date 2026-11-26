// =============================================================================
// MediCore API - Payment Service (Sandbox Mode)
// =============================================================================

import { prisma } from '../../config/database';
import { ForbiddenError, NotFoundError, ValidationError } from '../../middleware/errorHandler';
import type { JwtPayload } from '../../middleware/auth';
import type { CreatePaymentInput } from './payment.schemas';

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export class PaymentService {
  /**
   * Record a sandbox payment against an issued invoice inside a transaction.
   */
  async create(data: CreatePaymentInput, processedBy: string) {
    return prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id: data.invoiceId } });
      if (!invoice) {
        throw new NotFoundError('Invoice not found');
      }
      if (invoice.status === 'CANCELLED') {
        throw new ValidationError('Cannot pay a cancelled invoice');
      }
      if (invoice.status === 'DRAFT') {
        throw new ValidationError('Invoice must be issued before recording payments');
      }
      if (invoice.status === 'PAID') {
        throw new ValidationError('Invoice is already fully paid');
      }

      const remaining = roundCurrency(invoice.totalAmount - invoice.paidAmount);
      if (data.amount > remaining) {
        throw new ValidationError(`Payment amount (${data.amount}) exceeds remaining balance (${remaining})`);
      }

      const payment = await tx.payment.create({
        data: {
          invoiceId: data.invoiceId,
          amount: roundCurrency(data.amount),
          method: data.method,
          reference: data.reference,
          notes: data.notes,
          status: 'COMPLETED',
          processedBy,
          processedAt: new Date(),
        },
      });

      const newPaidAmount = roundCurrency(invoice.paidAmount + data.amount);
      const newStatus = newPaidAmount >= invoice.totalAmount ? 'PAID' : 'PARTIALLY_PAID';

      await tx.invoice.update({
        where: { id: data.invoiceId },
        data: { paidAmount: newPaidAmount, status: newStatus },
      });

      return payment;
    });
  }

  async findAll(page: number = 1, limit: number = 20, invoiceId?: string) {
    const skip = (page - 1) * limit;
    const where = invoiceId ? { invoiceId } : {};

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { processedAt: 'desc' },
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              patientId: true,
              totalAmount: true,
              status: true,
            },
          },
        },
      }),
      prisma.payment.count({ where }),
    ]);

    return { payments, total, page, limit };
  }

  async findByInvoice(invoiceId: string, requestingUser?: JwtPayload) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { patient: { select: { userId: true } } },
    });

    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    if (requestingUser) {
      const isStaff =
        requestingUser.roles.includes('BILLING_OFFICER') ||
        requestingUser.roles.includes('HOSPITAL_ADMIN');

      if (!isStaff && invoice.patient.userId !== requestingUser.userId) {
        throw new ForbiddenError('You do not have permission to view payments for this invoice');
      }
    }

    return prisma.payment.findMany({
      where: { invoiceId },
      orderBy: { processedAt: 'desc' },
    });
  }
}

export const paymentService = new PaymentService();
