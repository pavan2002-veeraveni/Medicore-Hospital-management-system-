// =============================================================================
// MediCore API - Appointment Routes
// =============================================================================

import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { appointmentController } from './appointment.controller';
import {
  appointmentIdParamSchema,
  appointmentQuerySchema,
  availableSlotsQuerySchema,
  cancelSchema,
  createAppointmentSchema,
  rescheduleSchema,
} from './appointment.schemas';

const router = Router();

// All appointment endpoints require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/v1/appointments:
 *   post:
 *     summary: Book a new appointment
 *     tags: [Appointments]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patientId, doctorId, scheduledStart, scheduledEnd]
 *             properties:
 *               patientId: { type: string, format: uuid }
 *               doctorId: { type: string, format: uuid }
 *               scheduledStart: { type: string, format: date-time }
 *               scheduledEnd: { type: string, format: date-time }
 *               type: { type: string, enum: [CONSULTATION, FOLLOW_UP, PROCEDURE, EMERGENCY] }
 *               reason: { type: string }
 *               notes: { type: string }
 *               idempotencyKey: { type: string }
 *     responses:
 *       201: { description: Appointment requested successfully }
 *       409: { description: Appointment conflict or outside doctor schedule }
 */
router.post(
  '/',
  authorize('PATIENT', 'RECEPTIONIST', 'DOCTOR', 'HOSPITAL_ADMIN'),
  validate({ body: createAppointmentSchema }),
  appointmentController.create
);

/**
 * @swagger
 * /api/v1/appointments:
 *   get:
 *     summary: List appointments (patients see own only)
 *     tags: [Appointments]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Appointments retrieved successfully }
 */
router.get(
  '/',
  validate({ query: appointmentQuerySchema }),
  appointmentController.findAll
);

/**
 * @swagger
 * /api/v1/appointments/available-slots:
 *   get:
 *     summary: Get available appointment slots for a doctor on a given date
 *     tags: [Appointments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: doctorId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: date
 *         required: true
 *         schema: { type: string, format: date }
 *     responses:
 *       200: { description: Available slots retrieved successfully }
 */
router.get(
  '/available-slots',
  authorize('PATIENT', 'RECEPTIONIST', 'DOCTOR', 'NURSE', 'HOSPITAL_ADMIN'),
  validate({ query: availableSlotsQuerySchema }),
  appointmentController.getAvailableSlots
);

/**
 * @swagger
 * /api/v1/appointments/{id}:
 *   get:
 *     summary: Get appointment by ID
 *     tags: [Appointments]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Appointment retrieved successfully }
 *       404: { description: Appointment not found }
 */
router.get(
  '/:id',
  validate({ params: appointmentIdParamSchema }),
  appointmentController.findById
);

/**
 * @swagger
 * /api/v1/appointments/{id}/confirm:
 *   patch:
 *     summary: Confirm a requested appointment (REQUESTED -> CONFIRMED)
 *     tags: [Appointments]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Appointment confirmed }
 *       422: { description: Invalid state transition }
 */
router.patch(
  '/:id/confirm',
  authorize('RECEPTIONIST', 'DOCTOR'),
  validate({ params: appointmentIdParamSchema }),
  appointmentController.confirm
);

/**
 * @swagger
 * /api/v1/appointments/{id}/check-in:
 *   patch:
 *     summary: Check in a confirmed appointment (CONFIRMED -> CHECKED_IN)
 *     tags: [Appointments]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Patient checked in }
 *       422: { description: Invalid state transition }
 */
router.patch(
  '/:id/check-in',
  authorize('RECEPTIONIST'),
  validate({ params: appointmentIdParamSchema }),
  appointmentController.checkIn
);

/**
 * @swagger
 * /api/v1/appointments/{id}/start:
 *   patch:
 *     summary: Start clinical encounter for appointment (CHECKED_IN -> IN_PROGRESS)
 *     tags: [Appointments]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Appointment encounter started }
 *       422: { description: Invalid state transition }
 */
router.patch(
  '/:id/start',
  authorize('DOCTOR'),
  validate({ params: appointmentIdParamSchema }),
  appointmentController.startEncounter
);

/**
 * @swagger
 * /api/v1/appointments/{id}/complete:
 *   patch:
 *     summary: Complete an in-progress appointment (IN_PROGRESS -> COMPLETED)
 *     tags: [Appointments]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Appointment completed }
 *       422: { description: Invalid state transition }
 */
router.patch(
  '/:id/complete',
  authorize('DOCTOR'),
  validate({ params: appointmentIdParamSchema }),
  appointmentController.complete
);

/**
 * @swagger
 * /api/v1/appointments/{id}/cancel:
 *   patch:
 *     summary: Cancel a requested or confirmed appointment
 *     tags: [Appointments]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Appointment cancelled }
 *       422: { description: Invalid state transition }
 */
router.patch(
  '/:id/cancel',
  authorize('PATIENT', 'RECEPTIONIST', 'DOCTOR'),
  validate({ params: appointmentIdParamSchema, body: cancelSchema }),
  appointmentController.cancel
);

/**
 * @swagger
 * /api/v1/appointments/{id}/no-show:
 *   patch:
 *     summary: Mark a confirmed appointment as no-show (CONFIRMED -> NO_SHOW)
 *     tags: [Appointments]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Appointment marked as no-show }
 *       422: { description: Invalid state transition }
 */
router.patch(
  '/:id/no-show',
  authorize('RECEPTIONIST', 'DOCTOR'),
  validate({ params: appointmentIdParamSchema }),
  appointmentController.markNoShow
);

/**
 * @swagger
 * /api/v1/appointments/{id}/reschedule:
 *   patch:
 *     summary: Reschedule a requested or confirmed appointment
 *     tags: [Appointments]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Appointment rescheduled }
 *       409: { description: Appointment conflict or outside doctor schedule }
 *       422: { description: Invalid state transition }
 */
router.patch(
  '/:id/reschedule',
  authorize('RECEPTIONIST', 'PATIENT'),
  validate({ params: appointmentIdParamSchema, body: rescheduleSchema }),
  appointmentController.reschedule
);

export default router;
