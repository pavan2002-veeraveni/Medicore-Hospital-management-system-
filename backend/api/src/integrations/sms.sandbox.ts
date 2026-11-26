// =============================================================================
// MediCore API - Sandbox SMS Integration
// =============================================================================

import { logger } from '../utils/logger';

export interface SmsMessage {
  to: string;
  body: string;
  idempotencyKey?: string;
}

export interface SmsSendResult {
  messageId: string;
  provider: 'sandbox';
  accepted: boolean;
  sentAt: string;
}

export class SandboxSmsClient {
  private readonly simulateFailure: boolean;

  constructor(options?: { simulateFailure?: boolean }) {
    this.simulateFailure = options?.simulateFailure ?? false;
  }

  async send(message: SmsMessage): Promise<SmsSendResult> {
    if (this.simulateFailure) {
      throw new Error('Sandbox SMS gateway unavailable');
    }

    if (!message.to || !message.body) {
      throw new Error('Recipient phone number and message body are required');
    }

    const messageId = `sandbox-sms-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    logger.info(
      {
        messageId,
        to: message.to,
        idempotencyKey: message.idempotencyKey,
      },
      '[SANDBOX] SMS dispatched'
    );

    return {
      messageId,
      provider: 'sandbox',
      accepted: true,
      sentAt: new Date().toISOString(),
    };
  }
}

export const sandboxSmsClient = new SandboxSmsClient();
