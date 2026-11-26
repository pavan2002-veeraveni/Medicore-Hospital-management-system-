// =============================================================================
// MediCore API - Server Entry Point
// =============================================================================

import express from 'express';
import { createApp } from './app';
import { config } from './config/environment';
import { logger } from './utils/logger';
import { prisma } from './config/database';

const app: express.Express = createApp();

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  await prisma.$disconnect();
  logger.info('Database connection closed');

  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Unhandled rejections
process.on('unhandledRejection', (reason: unknown) => {
  logger.error({ reason }, 'Unhandled Rejection');
});

process.on('uncaughtException', (error: Error) => {
  logger.error({ err: error }, 'Uncaught Exception');
  process.exit(1);
});

// Start HTTP listener outside Vercel serverless runtime
if (!process.env.VERCEL) {
  app.listen(config.port, config.host, () => {
    logger.info(`🏥 MediCore API running on http://${config.host}:${config.port}`);
    logger.info(`📚 Swagger docs: http://${config.host}:${config.port}/api-docs`);
    logger.info(`💚 Health check: http://${config.host}:${config.port}/health`);
    logger.info(`Environment: ${config.nodeEnv}`);
  });
}

export default app;
