import { prisma } from '../config/database';
import { decrypt } from '../utils/encryption';
import { safeFetch } from '../utils/ssrf-protection';
import crypto from 'crypto';
import { createContextLogger } from '../utils/logger';
import { DeliveryStatus } from '@prisma/client';

const log = createContextLogger('webhook');

/**
 * Webhook Delivery Service
 *
 * Every event is persisted as a WebhookDelivery row before the first attempt, so
 * a delivery survives a crash mid-flight and can be retried, inspected, or
 * replayed. Failed attempts back off exponentially with jitter; the sweeper
 * (`processDueRetries`, driven by the scheduler process) picks up rows whose
 * nextAttemptAt has come due.
 */

interface WebhookEvent {
  event: string;
  data: Record<string, any>;
  timestamp: string;
  organizationId: string;
}

/** Base delay for the first retry. Doubles each attempt. */
const RETRY_BASE_MS = 30_000;
/** Ceiling for a single backoff interval (1 hour). */
const RETRY_MAX_MS = 3_600_000;
/** Total attempts including the first. 6 ≈ 30s, 1m, 2m, 4m, 8m of retries. */
const DEFAULT_MAX_ATTEMPTS = 6;
/** Consecutive failed deliveries before an endpoint is disabled. */
const FAILURE_LIMIT = 10;
const REQUEST_TIMEOUT_MS = 10_000;

export class WebhookService {
  /**
   * Queue an event for every endpoint subscribed to it, then attempt each
   * delivery immediately. Attempts run detached — event producers must not block
   * on, or fail because of, a slow subscriber.
   */
  async deliver(organizationId: string, event: string, data: Record<string, any>): Promise<void> {
    const webhooks = await prisma.webhook.findMany({
      where: {
        organizationId,
        isActive: true,
        events: { has: event },
      },
    });

    if (webhooks.length === 0) return;

    const payload: WebhookEvent = {
      event,
      data,
      timestamp: new Date().toISOString(),
      organizationId,
    };

    for (const webhook of webhooks) {
      const delivery = await prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          event,
          payload: payload as any,
          maxAttempts: DEFAULT_MAX_ATTEMPTS,
          status: DeliveryStatus.PENDING,
          // Due immediately, so that if this process dies before or during the
          // inline attempt below, the sweeper still picks the delivery up.
          nextAttemptAt: new Date(),
        },
      });

      this.attemptDelivery(delivery.id).catch((error) => {
        log.error('Webhook delivery attempt threw', {
          deliveryId: delivery.id,
          error: error.message,
        });
      });
    }
  }

  /**
   * Run one delivery attempt and record the outcome. Safe to call on a delivery
   * that is already terminal — it becomes a no-op.
   */
  async attemptDelivery(deliveryId: string): Promise<boolean> {
    const delivery = await prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { webhook: true },
    });

    if (!delivery) return false;
    if (
      delivery.status === DeliveryStatus.DELIVERED ||
      delivery.status === DeliveryStatus.FAILED
    ) {
      return delivery.status === DeliveryStatus.DELIVERED;
    }

    const attempt = delivery.attempt + 1;
    const payload = delivery.payload as unknown as WebhookEvent;
    const payloadString = JSON.stringify(payload);
    const webhook = delivery.webhook;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'EngagementPlatform-Webhook/1.0',
      'X-Webhook-Event': delivery.event,
      'X-Webhook-Timestamp': payload.timestamp,
      'X-Webhook-Delivery': delivery.id,
      'X-Webhook-Attempt': String(attempt),
    };

    // Sign payload if secret is configured
    if (webhook.encryptedSecret) {
      const secret = decrypt(webhook.encryptedSecret);
      const signature = crypto
        .createHmac('sha256', secret)
        .update(payloadString)
        .digest('hex');
      headers['X-Webhook-Signature'] = `sha256=${signature}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await safeFetch(webhook.url, {
        method: 'POST',
        headers,
        body: payloadString,
        signal: controller.signal,
      });

      if (response.ok) {
        await prisma.$transaction([
          prisma.webhookDelivery.update({
            where: { id: delivery.id },
            data: {
              attempt,
              status: DeliveryStatus.DELIVERED,
              statusCode: response.status,
              deliveredAt: new Date(),
              nextAttemptAt: null,
              error: null,
            },
          }),
          prisma.webhook.update({
            where: { id: webhook.id },
            data: { lastTriggeredAt: new Date(), failureCount: 0 },
          }),
        ]);

        log.debug('Webhook delivered', {
          webhookId: webhook.id,
          deliveryId: delivery.id,
          attempt,
          status: response.status,
        });
        return true;
      }

      await this.recordFailure(
        delivery.id,
        webhook.id,
        attempt,
        delivery.maxAttempts,
        `HTTP ${response.status}`,
        response.status
      );
      return false;
    } catch (error: any) {
      const message = controller.signal.aborted
        ? `Timed out after ${REQUEST_TIMEOUT_MS}ms`
        : error.message;
      await this.recordFailure(
        delivery.id,
        webhook.id,
        attempt,
        delivery.maxAttempts,
        message
      );
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Record a failed attempt and either schedule the next one or give up.
   */
  private async recordFailure(
    deliveryId: string,
    webhookId: string,
    attempt: number,
    maxAttempts: number,
    error: string,
    statusCode?: number
  ): Promise<void> {
    const permanent = statusCode !== undefined && !this.isRetryable(statusCode);
    const exhausted = attempt >= maxAttempts;
    const giveUp = permanent || exhausted;

    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        attempt,
        status: giveUp ? DeliveryStatus.FAILED : DeliveryStatus.RETRYING,
        statusCode,
        error,
        nextAttemptAt: giveUp ? null : new Date(Date.now() + this.backoffMs(attempt)),
      },
    });

    if (giveUp) {
      // Only a terminal failure counts against the endpoint's health, so a
      // subscriber that succeeds on retry is not penalised.
      const webhook = await prisma.webhook.update({
        where: { id: webhookId },
        data: { failureCount: { increment: 1 } },
        select: { failureCount: true, url: true },
      });

      if (webhook.failureCount >= FAILURE_LIMIT) {
        await prisma.webhook.update({
          where: { id: webhookId },
          data: { isActive: false },
        });
        log.warn('Webhook disabled after repeated failures', {
          webhookId,
          url: webhook.url,
          failureCount: webhook.failureCount,
        });
      }

      log.warn('Webhook delivery failed permanently', {
        webhookId,
        deliveryId,
        attempt,
        statusCode,
        error,
        reason: permanent ? 'non-retryable response' : 'attempts exhausted',
      });
    } else {
      log.info('Webhook delivery failed, will retry', {
        webhookId,
        deliveryId,
        attempt,
        statusCode,
        error,
        retryInMs: this.backoffMs(attempt),
      });
    }
  }

  /**
   * Exponential backoff with full jitter.
   *
   * Jitter matters here: without it, every delivery queued by the same burst of
   * events retries in lockstep and re-hammers an endpoint that is already
   * struggling.
   */
  backoffMs(attempt: number): number {
    const exponential = Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_MAX_MS);
    // Full jitter, floored at half the interval so retries still spread out
    // rather than clustering immediately.
    return Math.floor(exponential / 2 + Math.random() * (exponential / 2));
  }

  /**
   * 4xx means the request itself was rejected and replaying it unchanged will
   * be rejected again — except 408 (timeout) and 429 (slow down), which are
   * explicitly "try again".
   */
  private isRetryable(statusCode: number): boolean {
    if (statusCode === 408 || statusCode === 429) return true;
    return statusCode >= 500;
  }

  /**
   * Retry every delivery whose backoff has elapsed. Driven by the scheduler.
   */
  async processDueRetries(limit = 100): Promise<{ processed: number; delivered: number }> {
    const due = await prisma.webhookDelivery.findMany({
      where: {
        status: { in: [DeliveryStatus.PENDING, DeliveryStatus.RETRYING] },
        nextAttemptAt: { lte: new Date() },
      },
      select: { id: true },
      take: limit,
      orderBy: { nextAttemptAt: 'asc' },
    });

    let delivered = 0;
    for (const { id } of due) {
      if (await this.attemptDelivery(id)) delivered++;
    }

    if (due.length > 0) {
      log.info('Processed webhook retries', { processed: due.length, delivered });
    }

    return { processed: due.length, delivered };
  }

  /**
   * Recent delivery history for an endpoint, for the management UI.
   */
  async getDeliveries(
    webhookId: string,
    organizationId: string,
    limit = 50
  ): Promise<any[]> {
    const webhook = await prisma.webhook.findFirst({
      where: { id: webhookId, organizationId },
      select: { id: true },
    });
    if (!webhook) return [];

    return prisma.webhookDelivery.findMany({
      where: { webhookId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Re-queue a delivery that previously gave up.
   */
  async replay(deliveryId: string, organizationId: string): Promise<boolean> {
    const delivery = await prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, webhook: { organizationId } },
      select: { id: true },
    });
    if (!delivery) return false;

    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        attempt: 0,
        status: DeliveryStatus.PENDING,
        error: null,
        statusCode: null,
        nextAttemptAt: null,
        deliveredAt: null,
      },
    });

    return this.attemptDelivery(deliveryId);
  }

  /**
   * Test a webhook endpoint
   */
  async test(webhookId: string, organizationId: string): Promise<{ success: boolean; status?: number; error?: string }> {
    const webhook = await prisma.webhook.findFirst({
      where: { id: webhookId, organizationId },
    });

    if (!webhook) {
      return { success: false, error: 'Webhook not found' };
    }

    const testPayload: WebhookEvent = {
      event: 'webhook.test',
      data: { message: 'This is a test webhook delivery' },
      timestamp: new Date().toISOString(),
      organizationId,
    };

    const payloadString = JSON.stringify(testPayload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': 'webhook.test',
    };

    if (webhook.encryptedSecret) {
      const secret = decrypt(webhook.encryptedSecret);
      const signature = crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
      headers['X-Webhook-Signature'] = `sha256=${signature}`;
    }

    try {
      const response = await safeFetch(webhook.url, {
        method: 'POST',
        headers,
        body: payloadString,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      return { success: response.ok, status: response.status };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

export const webhookService = new WebhookService();

// Webhook event types
export const WEBHOOK_EVENTS = [
  'engagement.created',
  'engagement.updated',
  'engagement.deleted',
  'engagement.activated',
  'engagement.paused',
  'engagement.completed',
  'engagement.failed',
  'run.started',
  'run.completed',
  'run.failed',
  'credential.expired',
  'credential.refreshed',
  'site.created',
  'site.updated',
  'rate_limit.warning',
  'error.critical',
] as const;
