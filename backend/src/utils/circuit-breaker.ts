import { createContextLogger } from './logger';

const log = createContextLogger('circuit-breaker');

/**
 * Circuit Breaker Pattern
 * Prevents cascading failures when external services are down
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Too many failures, requests are blocked
 * - HALF_OPEN: Testing if service recovered
 */

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerOptions {
  failureThreshold: number;      // Failures before opening
  resetTimeoutMs: number;        // Time before trying half-open
  halfOpenMaxAttempts: number;   // Attempts in half-open before deciding
  monitoringWindowMs: number;    // Window to count failures
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeoutMs: 60000,
  halfOpenMaxAttempts: 3,
  monitoringWindowMs: 120000,
};

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private nextAttempt = 0;
  private options: CircuitBreakerOptions;
  private name: string;

  constructor(name: string, options?: Partial<CircuitBreakerOptions>) {
    this.name = name;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        const waitMs = this.nextAttempt - Date.now();
        throw new Error(`Circuit breaker [${this.name}] is OPEN. Retry in ${Math.ceil(waitMs / 1000)}s`);
      }
      this.state = 'HALF_OPEN';
      this.successCount = 0;
      log.info('Circuit breaker half-open', { name: this.name });
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.options.halfOpenMaxAttempts) {
        this.state = 'CLOSED';
        this.failureCount = 0;
        log.info('Circuit breaker closed (recovered)', { name: this.name });
      }
    } else {
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.options.resetTimeoutMs;
      log.warn('Circuit breaker re-opened from half-open', { name: this.name });
    } else if (this.failureCount >= this.options.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.options.resetTimeoutMs;
      log.warn('Circuit breaker opened', {
        name: this.name,
        failures: this.failureCount,
        resetInMs: this.options.resetTimeoutMs,
      });
    }
  }

  getState(): { state: CircuitState; failures: number; nextAttempt?: Date } {
    return {
      state: this.state,
      failures: this.failureCount,
      nextAttempt: this.state === 'OPEN' ? new Date(this.nextAttempt) : undefined,
    };
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
  }
}

// Global circuit breakers per service
const breakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(name: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
  if (!breakers.has(name)) {
    breakers.set(name, new CircuitBreaker(name, options));
  }
  return breakers.get(name)!;
}

export function getAllCircuitBreakers(): Array<{ name: string; state: CircuitState; failures: number }> {
  return Array.from(breakers.entries()).map(([name, breaker]) => ({
    name,
    ...breaker.getState(),
  }));
}
