// =============================================================================
// MediCore API - Notification & FHIR Queue Dispatcher (BullMQ + DB Job Outbox)
// =============================================================================
// Guarantees idempotency via NotificationJob.idempotencyKey and gracefully
// handles Redis unavailability by persisting durable NotificationJob records.

import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '../config/database';
import { sandboxEmailClient } from '../integrations/email.sandbox';
import { sandboxSmsClient } from '../integrations/sms.sandbox';
import { logger } from '../utils/logger';

export interface EnqueueNotificationInput {
  type: string;
  recipientId: string;
  recipientEmail?: string;
  recipientPhone?: string;
  channel: 'email' | 'sms';
  subject?: string;
  body: string;
  idempotencyKey: string;
  scheduledFor?: Date;
}

let notificationQueue: Queue | null = null;

function getQueue(): Queue | null {
  if (process.env.NODE_ENV === 'test' || process.env.DISABLE_REDIS === 'true') {
    return null;
  }
  if (!notificationQueue && process.env.REDIS_URL) {
    try {
      const connection = new IORedis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        retryStrategy: () => null,
      });
      connection.on('error', () => {
        // Prevent unhandled error events when Redis is offline in local dev
      });
      notificationQueue = new Queue('notifications', { connection });
    } catch {
      return null;
    }
  }
  return notificationQueue;
}

/**
 * Enqueue or process a notification idempotently.
 * Duplicate idempotencyKey calls return the existing NotificationJob without re-sending.
 */
export async function dispatchNotificationJob(input: EnqueueNotificationInput) {
  const existing = await prisma.notificationJob.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });

  if (existing) {
    logger.info(
      { jobId: existing.id, idempotencyKey: input.idempotencyKey },
      'Duplicate notification job ignored (idempotent)'
    );
    return { job: existing, deduplicated: true };
  }

  const job = await prisma.notificationJob.create({
    data: {
      type: input.type,
      recipientId: input.recipientId,
      channel: input.channel,
      subject: input.subject ?? null,
      body: input.body,
      status: 'PENDING',
      idempotencyKey: input.idempotencyKey,
      scheduledFor: input.scheduledFor ?? null,
    },
  });

  // Also create in-app Notification record
  await prisma.notification
    .create({
      data: {
        userId: input.recipientId,
        type: input.type,
        title: input.subject || input.type.replace(/_/g, ' '),
        message: input.body,
        metadata: { jobId: job.id, channel: input.channel },
      },
    })
    .catch((err) => logger.warn({ err }, 'Failed to create in-app notification'));

  const queue = getQueue();
  if (queue) {
    try {
      await queue.add(
        input.type,
        { jobId: job.id, ...input },
        {
          jobId: input.idempotencyKey,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        }
      );
      return { job, deduplicated: false };
    } catch (err) {
      logger.warn({ err, jobId: job.id }, 'Redis unavailable; falling back to inline sandbox delivery');
    }
  }

  // Inline sandbox delivery fallback when Redis worker is not attached
  try {
    if (input.channel === 'email' && input.recipientEmail) {
      await sandboxEmailClient.send({
        to: input.recipientEmail,
        subject: input.subject || 'MediCore Notification',
        body: input.body,
        idempotencyKey: input.idempotencyKey,
      });
    } else if (input.channel === 'sms' && input.recipientPhone) {
      await sandboxSmsClient.send({
        to: input.recipientPhone,
        body: input.body,
        idempotencyKey: input.idempotencyKey,
      });
    }

    const updatedJob = await prisma.notificationJob.update({
      where: { id: job.id },
      data: {
        status: 'SENT',
        attempts: 1,
        lastAttemptAt: new Date(),
        sentAt: new Date(),
      },
    });
    return { job: updatedJob, deduplicated: false };
  } catch (error: any) {
    const failedJob = await prisma.notificationJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        attempts: 1,
        lastAttemptAt: new Date(),
        errorMessage: error?.message || 'Delivery failed',
      },
    });
    return { job: failedJob, deduplicated: false };
  }
}
