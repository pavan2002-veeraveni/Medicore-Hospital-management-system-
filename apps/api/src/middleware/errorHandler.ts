// =============================================================================
// MediCore API - Error Handler Middleware
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';
import { errorResponse } from '../utils/apiResponse';

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details: any[];
  public isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    details: any[] = [],
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// Specific error classes
export class ValidationError extends AppError {
  constructor(message: string, details: any[] = []) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

export class AppointmentConflictError extends AppError {
  constructor(message: string = 'Appointment time slot conflicts with an existing appointment') {
    super(message, 409, 'APPOINTMENT_CONFLICT');
  }
}

export class InvalidStateTransitionError extends AppError {
  constructor(message: string = 'Invalid state transition') {
    super(message, 422, 'INVALID_STATE_TRANSITION');
  }
}

export class ConsentRequiredError extends AppError {
  constructor(message: string = 'Patient consent is required for this action') {
    super(message, 403, 'CONSENT_REQUIRED');
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log the error
  logger.error({
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    error: {
      name: err.name,
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    },
  });

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    errorResponse(
      res,
      'Request validation failed',
      'VALIDATION_ERROR',
      400,
      err.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
        code: e.code,
      }))
    );
    return;
  }

  // Handle application errors
  if (err instanceof AppError) {
    errorResponse(res, err.message, err.code, err.statusCode, err.details);
    return;
  }

  // Handle Prisma errors
  if (err.constructor.name === 'PrismaClientKnownRequestError') {
    const prismaErr = err as any;
    switch (prismaErr.code) {
      case 'P2002':
        errorResponse(res, 'A record with this value already exists', 'CONFLICT', 409);
        return;
      case 'P2025':
        errorResponse(res, 'Record not found', 'NOT_FOUND', 404);
        return;
      default:
        errorResponse(res, 'Database operation failed', 'DATABASE_ERROR', 500);
        return;
    }
  }

  // Default: Internal server error (never expose internals)
  errorResponse(
    res,
    'An unexpected error occurred',
    'INTERNAL_ERROR',
    500
  );
}
