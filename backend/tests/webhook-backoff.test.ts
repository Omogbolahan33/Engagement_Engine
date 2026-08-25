/**
 * Retry scheduling for webhook delivery.
 *
 * The service module pulls in Prisma and ioredis at import time, both of which
 * would open real connections; they are stubbed because nothing here touches
 * them. Only the pure scheduling logic is under test.
 */

jest.mock('../src/config/database', () => ({ prisma: {} }));
jest.mock('../src/config/redis', () => ({ redis: {} }));
jest.mock('../src/utils/ssrf-protection', () => ({ safeFetch: jest.fn() }));

import { webhookService } from '../src/services/webhook.service';

/** `isRetryable` is private; reach it directly rather than widening the API. */
const isRetryable = (status: number): boolean =>
  (webhookService as any).isRetryable(status);

describe('backoff schedule', () => {
  it('grows exponentially across attempts', () => {
    // Jitter makes each value a range, so compare medians over many samples.
    const median = (attempt: number) => {
      const samples = Array.from({ length: 201 }, () => webhookService.backoffMs(attempt));
      samples.sort((a, b) => a - b);
      return samples[100];
    };

    const first = median(1);
    const second = median(2);
    const third = median(3);

    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
    // Each step roughly doubles.
    expect(second / first).toBeGreaterThan(1.5);
    expect(third / second).toBeGreaterThan(1.5);
  });

  it('never returns a delay below half the nominal interval', () => {
    // Full jitter that could return ~0 would produce a retry storm; the floor
    // guarantees genuine spacing.
    for (let attempt = 1; attempt <= 6; attempt++) {
      for (let i = 0; i < 50; i++) {
        expect(webhookService.backoffMs(attempt)).toBeGreaterThanOrEqual(
          Math.floor(Math.min(30_000 * 2 ** (attempt - 1), 3_600_000) / 2)
        );
      }
    }
  });

  it('caps the interval at one hour however many attempts have passed', () => {
    for (const attempt of [10, 25, 100]) {
      for (let i = 0; i < 25; i++) {
        expect(webhookService.backoffMs(attempt)).toBeLessThanOrEqual(3_600_000);
      }
    }
  });

  it('applies jitter rather than a fixed delay', () => {
    const values = new Set(Array.from({ length: 50 }, () => webhookService.backoffMs(3)));
    expect(values.size).toBeGreaterThan(1);
  });
});

describe('retryable status classification', () => {
  it('retries server errors', () => {
    for (const status of [500, 502, 503, 504]) {
      expect(isRetryable(status)).toBe(true);
    }
  });

  it('retries the two 4xx codes that mean "try again"', () => {
    expect(isRetryable(408)).toBe(true); // Request Timeout
    expect(isRetryable(429)).toBe(true); // Too Many Requests
  });

  it('gives up on client errors that replaying cannot fix', () => {
    for (const status of [400, 401, 403, 404, 410, 422]) {
      expect(isRetryable(status)).toBe(false);
    }
  });
});
