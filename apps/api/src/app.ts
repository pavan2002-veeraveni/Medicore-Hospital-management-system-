// =============================================================================
// MediCore API - Express Application Configuration
// =============================================================================

import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { config } from './config/environment';
import { prisma } from './config/database';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import { requestIdMiddleware } from './middleware/requestId';
import { logger } from './utils/logger';

// Route imports
import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/users/user.routes';
import patientRoutes from './modules/patients/patient.routes';
import staffRoutes from './modules/staff/staff.routes';
import departmentRoutes from './modules/departments/department.routes';
import appointmentRoutes from './modules/appointments/appointment.routes';
import encounterRoutes from './modules/encounters/encounter.routes';
import diagnosisRoutes from './modules/diagnoses/diagnosis.routes';
import prescriptionRoutes from './modules/prescriptions/prescription.routes';
import laboratoryRoutes from './modules/laboratories/laboratory.routes';
import labOrderRoutes from './modules/laboratories/labOrder.routes';
import labResultRoutes from './modules/laboratories/labResult.routes';
import billingRoutes from './modules/billing/billing.routes';
import paymentRoutes from './modules/billing/payment.routes';
import consentRoutes from './modules/consent/consent.routes';
import auditRoutes from './modules/audit/audit.routes';
import notificationRoutes from './modules/notifications/notification.routes';
import fhirRoutes from './modules/fhir/fhir.routes';
import analyticsRoutes from './modules/analytics/analytics.routes';
import { setupSwagger } from './config/swagger';

export function createApp(): Express {
  const app = express();

  // ---------------------------------------------------------------------------
  // Security Middleware
  // ---------------------------------------------------------------------------
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  app.use(cors({
    origin: config.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Idempotency-Key'],
    exposedHeaders: ['X-Request-ID'],
  }));

  // ---------------------------------------------------------------------------
  // Rate Limiting
  // ---------------------------------------------------------------------------
  const limiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMaxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: 'Too many requests, please try again later.',
      error: { code: 'RATE_LIMIT_EXCEEDED', details: [] },
    },
  });
  app.use(limiter);

  // ---------------------------------------------------------------------------
  // General Middleware
  // ---------------------------------------------------------------------------
  app.use(express.json({ limit: config.maxRequestSize }));
  app.use(express.urlencoded({ extended: true, limit: config.maxRequestSize }));
  app.use(cookieParser());
  app.use(compression());
  app.use(requestIdMiddleware);

  // HTTP request logging
  app.use(morgan('combined', {
    stream: { write: (message: string) => logger.info(message.trim()) },
  }));

  // ---------------------------------------------------------------------------
  // Health Endpoints
  // ---------------------------------------------------------------------------
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      success: true,
      message: 'MediCore API is healthy',
      data: {
        status: 'UP',
        timestamp: new Date().toISOString(),
        version: config.appVersion,
      },
    });
  });

  app.get('/ready', async (_req: Request, res: Response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;

      res.json({
        success: true,
        message: 'MediCore API is ready',
        data: {
          status: 'READY',
          timestamp: new Date().toISOString(),
          checks: {
            database: 'UP',
          },
        },
      });
    } catch {
      res.status(503).json({
        success: false,
        message: 'Service not ready',
        data: {
          status: 'NOT_READY',
          timestamp: new Date().toISOString(),
          checks: {
            database: 'DOWN',
          },
        },
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Swagger Documentation
  // ---------------------------------------------------------------------------
  setupSwagger(app);

  // ---------------------------------------------------------------------------
  // API Routes (v1)
  // ---------------------------------------------------------------------------
  const apiV1 = '/api/v1';

  app.use(`${apiV1}/auth`, authRoutes);
  app.use(`${apiV1}/users`, userRoutes);
  app.use(`${apiV1}/patients`, patientRoutes);
  app.use(`${apiV1}/staff`, staffRoutes);
  app.use(`${apiV1}/departments`, departmentRoutes);
  app.use(`${apiV1}/appointments`, appointmentRoutes);
  app.use(`${apiV1}/encounters`, encounterRoutes);
  app.use(`${apiV1}/diagnoses`, diagnosisRoutes);
  app.use(`${apiV1}/prescriptions`, prescriptionRoutes);
  app.use(`${apiV1}/laboratories`, laboratoryRoutes);
  app.use(`${apiV1}/lab-orders`, labOrderRoutes);
  app.use(`${apiV1}/lab-results`, labResultRoutes);
  app.use(`${apiV1}/billing`, billingRoutes);
  app.use(`${apiV1}/invoices`, billingRoutes);
  app.use(`${apiV1}/payments`, paymentRoutes);
  app.use(`${apiV1}/consents`, consentRoutes);
  app.use(`${apiV1}/audit-logs`, auditRoutes);
  app.use(`${apiV1}/notifications`, notificationRoutes);
  app.use(`${apiV1}/fhir`, fhirRoutes);
  app.use(`${apiV1}/analytics`, analyticsRoutes);

  // ---------------------------------------------------------------------------
  // Error Handling
  // ---------------------------------------------------------------------------
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
