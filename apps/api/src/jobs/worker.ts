// =============================================================================
// MediCore API - BullMQ Worker
// =============================================================================

import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { logger } from '../utils/logger';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null });

// Notification Worker
const notificationWorker = new Worker('notifications', async (job: Job) => {
  const { type, recipientId, channel, subject, body } = job.data;
  logger.info({ jobId: job.id, type, channel, recipientId }, 'Processing notification job');

  switch (channel) {
    case 'email':
      // Sandbox email - log instead of sending
      logger.info({ to: recipientId, subject, body: body?.substring(0, 100) }, '[SANDBOX] Email notification');
      break;
    case 'sms':
      logger.info({ to: recipientId, body: body?.substring(0, 100) }, '[SANDBOX] SMS notification');
      break;
    default:
      logger.warn({ channel }, 'Unknown notification channel');
  }

  return { status: 'sent', channel, timestamp: new Date().toISOString() };
}, {
  connection,
  concurrency: 5,
  limiter: { max: 10, duration: 1000 },
});

// FHIR Sync Worker
const fhirWorker = new Worker('fhir-sync', async (job: Job) => {
  const { resourceType, localId, direction } = job.data;
  logger.info({ jobId: job.id, resourceType, localId, direction }, 'Processing FHIR sync job');
  // Mock FHIR sync - would call external FHIR server
  logger.info({ resourceType, localId }, '[MOCK] FHIR resource synced');
  return { status: 'synced', resourceType, timestamp: new Date().toISOString() };
}, {
  connection,
  concurrency: 2,
});

// Appointment Reminder Worker
const reminderWorker = new Worker('appointment-reminders', async (job: Job) => {
  const { appointmentId, patientId, scheduledStart } = job.data;
  logger.info({ jobId: job.id, appointmentId }, 'Sending appointment reminder');
  logger.info({ appointmentId, patientId, scheduledStart }, '[SANDBOX] Appointment reminder sent');
  return { status: 'reminded', timestamp: new Date().toISOString() };
}, {
  connection,
  concurrency: 3,
});

// Error handlers
[notificationWorker, fhirWorker, reminderWorker].forEach(worker => {
  worker.on('completed', (job) => logger.info({ jobId: job.id, queue: worker.name }, 'Job completed'));
  worker.on('failed', (job, err) => logger.error({ jobId: job?.id, queue: worker.name, error: err.message }, 'Job failed'));
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Worker shutting down...');
  await Promise.all([notificationWorker.close(), fhirWorker.close(), reminderWorker.close()]);
  await connection.quit();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

logger.info('🔧 MediCore workers started: notifications, fhir-sync, appointment-reminders');
