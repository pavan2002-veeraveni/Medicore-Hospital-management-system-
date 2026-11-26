// =============================================================================
// MediCore API - External / Mock FHIR R4 HTTP Client
// =============================================================================
// Implements authenticated HTTP sync with configurable timeout, exponential
// backoff retries, and clear mock labeling when no external FHIR server is set.

import { config } from '../config/environment';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export interface FhirClientOptions {
  baseUrl?: string;
  authToken?: string;
  timeoutMs?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
  fetchFn?: typeof fetch;
}

export interface FhirTransmitResult {
  mode: 'mock' | 'remote';
  statusCode: number;
  remoteId: string;
  attempts: number;
}

export class FhirGatewayTimeoutError extends AppError {
  constructor(message: string = 'External FHIR server request timed out') {
    super(message, 504, 'FHIR_TIMEOUT');
  }
}

export class FhirUpstreamError extends AppError {
  constructor(message: string = 'External FHIR server returned an error') {
    super(message, 502, 'FHIR_UPSTREAM_ERROR');
  }
}

export class FhirClient {
  private readonly baseUrl: string;
  private readonly authToken?: string;
  private readonly timeoutMs: number;
  private readonly retryAttempts: number;
  private readonly retryDelayMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: FhirClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? config.fhir.baseUrl ?? '';
    this.authToken = options.authToken ?? config.fhir.authToken;
    this.timeoutMs = options.timeoutMs ?? config.fhir.timeoutMs ?? 5000;
    this.retryAttempts = options.retryAttempts ?? config.fhir.retryAttempts ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 100;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async pushResource(
    resourceType: string,
    resource: Record<string, any>,
    idempotencyKey?: string
  ): Promise<FhirTransmitResult> {
    if (!this.baseUrl || this.baseUrl.includes('localhost:8080')) {
      // Clearly labeled mock mode when local mock / no external server configured
      logger.info(
        { resourceType, id: resource.id, mode: 'mock' },
        '[MOCK FHIR] Transmitted FHIR R4 resource'
      );
      return {
        mode: 'mock',
        statusCode: 200,
        remoteId: `mock-fhir-${resourceType}-${resource.id}`,
        attempts: 1,
      };
    }

    const url = `${this.baseUrl.replace(/\/$/, '')}/${resourceType}`;
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await this.fetchFn(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/fhir+json',
            ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
            ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
          },
          body: JSON.stringify(resource),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (response.ok) {
          const data = (await response.json().catch(() => ({}))) as { id?: string };
          return {
            mode: 'remote',
            statusCode: response.status,
            remoteId: data.id || String(resource.id),
            attempts: attempt,
          };
        }

        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw new FhirUpstreamError(`FHIR server rejected resource with status ${response.status}`);
        }

        lastError = new FhirUpstreamError(`FHIR server responded with status ${response.status}`);
      } catch (error: any) {
        clearTimeout(timer);
        if (error instanceof FhirUpstreamError) {
          throw error;
        }
        if (error?.name === 'AbortError') {
          lastError = new FhirGatewayTimeoutError(
            `FHIR request timed out after ${this.timeoutMs}ms (attempt ${attempt}/${this.retryAttempts})`
          );
        } else {
          lastError = new FhirUpstreamError(error?.message || 'FHIR network failure');
        }
      }

      if (attempt < this.retryAttempts) {
        await new Promise((r) => setTimeout(r, this.retryDelayMs * attempt));
      }
    }

    throw lastError;
  }
}

export const fhirClient = new FhirClient();
