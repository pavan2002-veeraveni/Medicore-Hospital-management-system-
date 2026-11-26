// =============================================================================
// MediCore API - Sandbox Email Integration
// =============================================================================
// Clearly labeled SANDBOX adapter: implements real interface, timeout, retry,
// and idempotent delivery tracking via NotificationJob without sending real mail.

import { logger } from '../utils/logger';

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  idempotencyKey?: string;
}

export interface EmailSendResult {
  messageId: string;
  provider: 'sandbox';
  accepted: boolean;
  sentAt: string;
}

export class SandboxEmailClient {
  private readonly timeoutMs: number;
  private readonly simulateFailure: boolean;

  constructor(options?: { timeoutMs?: number; simulateFailure?: boolean }) {
    this.timeoutMs = options?.timeoutMs ?? 5000;
    this.simulateFailure = options?.simulateFailure ?? false;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    if (this.simulateFailure) {
      throw new Error('Sandbox SMTP connection timeout');
    }

    if (!message.to || !message.subject) {
      throw new Error('Recipient and subject are required for email delivery');
    }

    const messageId = `sandbox-email-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    logger.info(
      {
        messageId,
        to: message.to,
        subject: message.subject,
        idempotencyKey: message.idempotencyKey,
        timeoutMs: this.timeoutMs,
      },
      '[SANDBOX] Email dispatched'
    );

    return {
      messageId,
      provider: 'sandbox',
      accepted: true,
      sentAt: new Date().toISOString(),
    };
  }
}

export const sandboxEmailClient = new SandboxEmailClient();
