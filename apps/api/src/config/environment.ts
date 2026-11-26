// =============================================================================
// MediCore API - Environment Configuration
// =============================================================================

import fs from 'fs';
import path from 'path';
import { z } from 'zod';

/**
 * Load apps/api/.env into unset process.env keys when running outside tests so
 * direct invocations (`tsx watch`, `node dist/server.js`) match Prisma and Analytics configs.
 */
function loadDotEnvIfNeeded() {
  if (process.env.NODE_ENV === 'test') return;
  const candidatePaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'apps/api/.env'),
    path.resolve(__dirname, '../../.env'),
  ];
  for (const envPath of candidatePaths) {
    if (!fs.existsSync(envPath)) continue;
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
    break;
  }
}

loadDotEnvIfNeeded();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_NAME: z.string().default('MediCore'),
  APP_VERSION: z.string().default('1.0.0'),

  API_PORT: z.coerce.number().default(4000),
  API_HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string(),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:3001'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),

  MAX_REQUEST_SIZE: z.string().default('10mb'),

  ANALYTICS_PORT: z.coerce.number().optional(),
  ANALYTICS_URL: z.string().optional(),
  ANALYTICS_API_KEY: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  FHIR_BASE_URL: z.string().optional(),
  FHIR_AUTH_TOKEN: z.string().optional(),
  FHIR_TIMEOUT_MS: z.coerce.number().default(30000),
  FHIR_RETRY_ATTEMPTS: z.coerce.number().default(3),

  LOG_LEVEL: z.string().default('debug'),
  LOG_FORMAT: z.string().default('json'),
});

function loadConfig() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success && process.env.NODE_ENV !== 'test') {
    console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
    // In development, use defaults; in production, fail
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }

  const env = parsed.success ? parsed.data : {
    NODE_ENV: 'development' as const,
    APP_NAME: 'MediCore',
    APP_VERSION: '1.0.0',
    API_PORT: 4000,
    API_HOST: '0.0.0.0',
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://medicore_user:medicore_password@localhost:5432/medicore_db',
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-in-production-32chars',
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production-32chars',
    JWT_ACCESS_EXPIRY: '15m',
    JWT_REFRESH_EXPIRY: '7d',
    REDIS_URL: 'redis://localhost:6379',
    CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3001',
    RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS || 900000),
    RATE_LIMIT_MAX_REQUESTS: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 100),
    MAX_REQUEST_SIZE: '10mb',
    ANALYTICS_PORT: process.env.ANALYTICS_PORT ? Number(process.env.ANALYTICS_PORT) : undefined,
    ANALYTICS_URL: process.env.ANALYTICS_URL,
    ANALYTICS_API_KEY: process.env.ANALYTICS_API_KEY,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_FROM: process.env.SMTP_FROM,
    FHIR_BASE_URL: process.env.FHIR_BASE_URL,
    FHIR_AUTH_TOKEN: process.env.FHIR_AUTH_TOKEN,
    FHIR_TIMEOUT_MS: 30000,
    FHIR_RETRY_ATTEMPTS: 3,
    LOG_LEVEL: 'debug',
    LOG_FORMAT: 'json',
  };

  if (
    env.NODE_ENV === 'production' &&
    (!env.ANALYTICS_API_KEY || env.ANALYTICS_API_KEY === 'change-this-to-a-secure-api-key')
  ) {
    console.error('❌ ANALYTICS_API_KEY must be set to a strong non-default value in production');
    process.exit(1);
  }

  return {
    nodeEnv: env.NODE_ENV,
    appName: env.APP_NAME,
    appVersion: env.APP_VERSION,
    port: env.API_PORT,
    host: env.API_HOST,
    databaseUrl: env.DATABASE_URL,
    jwtAccessSecret: env.JWT_ACCESS_SECRET,
    jwtRefreshSecret: env.JWT_REFRESH_SECRET,
    jwtAccessExpiry: env.JWT_ACCESS_EXPIRY,
    jwtRefreshExpiry: env.JWT_REFRESH_EXPIRY,
    redisUrl: env.REDIS_URL,
    corsOrigin: env.CORS_ORIGIN,
    rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
    rateLimitMaxRequests: env.RATE_LIMIT_MAX_REQUESTS,
    maxRequestSize: env.MAX_REQUEST_SIZE,
    analyticsUrl:
      env.ANALYTICS_URL ||
      `http://127.0.0.1:${env.ANALYTICS_PORT || 8000}`,
    analyticsApiKey:
      env.ANALYTICS_API_KEY || 'change-this-to-a-secure-api-key',
    smtp: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: env.SMTP_FROM,
    },
    fhir: {
      baseUrl: env.FHIR_BASE_URL,
      authToken: env.FHIR_AUTH_TOKEN,
      timeoutMs: env.FHIR_TIMEOUT_MS,
      retryAttempts: env.FHIR_RETRY_ATTEMPTS,
    },
    logLevel: env.LOG_LEVEL,
    logFormat: env.LOG_FORMAT,
  };
}

export const config = loadConfig();
export type Config = ReturnType<typeof loadConfig>;
