// =============================================================================
// MediCore API - Appointment Controller
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { ForbiddenError } from '../../middleware/errorHandler';
import {
  createdResponse,
  paginatedResponse,
  successResponse,
} from '../../utils/apiResponse';
import { appointmentService, type AuditMeta } from './appointment.service';
import type {
  AppointmentQueryInput,
  AvailableSlotsQueryInput,
} from './appointment.schemas';

function getAuditMeta(req: Request): AuditMeta {
  return {
    requestId: req.requestId,
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  };
}

export class AppointmentController {
  /**
   * Create a new appointment request.
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;

      // Patients can only book appointments for their own patient record
      const isPatientOnly =
        user.roles.includes('PATIENT') && !user.roles.includes('RECEPTIONIST');
      if (isPatientOnly) {
        const patient = await prisma.patient.findUnique({
          where: { userId: user.userId },
          select: { id: true },
        });
        if (!patient || patient.id !== req.body.patientId) {
          throw new ForbiddenError('Patients can only book appointments for themselves');
        }
      }

      const headerIdempotencyKey =
        typeof req.headers['x-idempotency-key'] === 'string'
          ? req.headers['x-idempotency-key'].trim()
          : undefined;

      const payload = {
        ...req.body,
        idempotencyKey: req.body.idempotencyKey || headerIdempotencyKey,
      };

      const appointment = await appointmentService.create(
        payload,
        user.userId,
        getAuditMeta(req)
      );

      createdResponse(res, appointment, 'Appointment requested successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * List appointments with filters and role-based scoping.
   */
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as AppointmentQueryInput;
      const result = await appointmentService.findAll(query, req.user);

      paginatedResponse(
        res,
        result.appointments,
        result.total,
        result.page,
        result.limit,
        'Appointments retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get available appointment slots for a doctor on a given date.
   */
  async getAvailableSlots(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { doctorId, date } = req.query as unknown as AvailableSlotsQueryInput;
      const slots = await appointmentService.getAvailableSlots(doctorId, date);

      successResponse(res, slots, 'Available slots retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get a single appointment by ID.
   */
  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const appointment = await appointmentService.findById(req.params.id, req.user);
      successResponse(res, appointment, 'Appointment retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Confirm a requested appointment (REQUESTED -> CONFIRMED).
   */
  async confirm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const appointment = await appointmentService.confirm(
        req.params.id,
        req.user?.userId,
        getAuditMeta(req)
      );
      successResponse(res, appointment, 'Appointment confirmed successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Check in a confirmed appointment (CONFIRMED -> CHECKED_IN).
   */
  async checkIn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const appointment = await appointmentService.checkIn(
        req.params.id,
        req.user?.userId,
        getAuditMeta(req)
      );
      successResponse(res, appointment, 'Patient checked in successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Start clinical encounter for a checked-in appointment (CHECKED_IN -> IN_PROGRESS).
   */
  async startEncounter(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const appointment = await appointmentService.startEncounter(
        req.params.id,
        req.user?.userId,
        getAuditMeta(req)
      );
      successResponse(res, appointment, 'Appointment encounter started successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Complete an in-progress appointment (IN_PROGRESS -> COMPLETED).
   */
  async complete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const appointment = await appointmentService.complete(
        req.params.id,
        req.user?.userId,
        getAuditMeta(req)
      );
      successResponse(res, appointment, 'Appointment completed successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cancel an appointment (REQUESTED or CONFIRMED -> CANCELLED).
   */
  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const appointment = await appointmentService.cancel(
        req.params.id,
        req.body.reason,
        req.user!.userId,
        getAuditMeta(req),
        req.user
      );
      successResponse(res, appointment, 'Appointment cancelled successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark a confirmed appointment as no-show (CONFIRMED -> NO_SHOW).
   */
  async markNoShow(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const appointment = await appointmentService.markNoShow(
        req.params.id,
        req.user?.userId,
        getAuditMeta(req)
      );
      successResponse(res, appointment, 'Appointment marked as no-show');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reschedule a REQUESTED or CONFIRMED appointment to a new time range.
   */
  async reschedule(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const appointment = await appointmentService.reschedule(
        req.params.id,
        req.body.newStart,
        req.body.newEnd,
        req.body.reason,
        req.user?.userId,
        getAuditMeta(req),
        req.user
      );
      successResponse(res, appointment, 'Appointment rescheduled successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const appointmentController = new AppointmentController();
