// =============================================================================
// MediCore API - Logger
// =============================================================================

import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'debug',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  base: {
    service: 'medicore-api',
    version: process.env.APP_VERSION || '1.0.0',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
  // Never log credentials, tokens, or restricted PHI/PII fields
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'passwordHash',
      'token',
      'refreshToken',
      'ssn',
      'nationalId',
      'medicalNotes',
      'clinicalNotes',
      'allergies',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.refreshToken',
      '*.medicalNotes',
      '*.clinicalNotes',
      '*.allergies',
    ],
    censor: '[REDACTED]',
  },
});
