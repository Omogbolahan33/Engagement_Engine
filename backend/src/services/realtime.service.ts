import { EventEmitter } from 'events';
import { redis } from '../config/redis';
import { createContextLogger } from '../utils/logger';

const log = createContextLogger('realtime');

/**
 * Real-time event fan-out over Server-Sent Events.
 *
 * SSE rather than WebSocket: every event here travels server -> client, so the
 * bidirectional handshake, upgrade handling, and heartbeat machinery of a socket
 * would buy nothing. SSE is plain HTTP, survives proxies, and reconnects on its
 * own in the browser.
 *
 * Events are published through Redis pub/sub rather than a local emitter alone,
 * so an event raised on one API instance (or in a worker process) reaches
 * clients connected to any other instance.
 */

export type RealtimeEvent =
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'engagement.updated'
  | 'engagement.status'
  | 'site.health'
  | 'credential.expiring'
  | 'notification';

export interface RealtimePayload {
  event: RealtimeEvent;
  organizationId: string;
  data: Record<string, any>;
  timestamp: string;
}

const CHANNEL = 'realtime:events';

class RealtimeService {
  /** Local listeners, keyed implicitly by organization in the event name. */
  private readonly emitter = new EventEmitter();
  private subscriber?: ReturnType<typeof redis.duplicate>;
  private connectionCount = 0;

  constructor() {
    // Node's default of 10 is far too low: one listener per open SSE stream.
    this.emitter.setMaxListeners(0);
  }

  /**
   * Begin consuming the Redis channel. Idempotent; safe to call at startup.
   * The subscriber must be its own connection — a subscribed ioredis client
   * cannot serve normal commands.
   */
  async init(): Promise<void> {
    if (this.subscriber) return;

    const subscriber = redis.duplicate();
    this.subscriber = subscriber;

    subscriber.on('error', (error: Error) => {
      log.error('Realtime subscriber error', { error: error.message });
    });

    await subscriber.subscribe(CHANNEL);

    subscriber.on('message', (channel: string, raw: string) => {
      if (channel !== CHANNEL) return;
      try {
        const payload = JSON.parse(raw) as RealtimePayload;
        this.emitter.emit(payload.organizationId, payload);
      } catch (error: any) {
        log.warn('Discarded malformed realtime message', { error: error.message });
      }
    });

    log.info('Realtime subscriber ready');
  }

  async close(): Promise<void> {
    if (!this.subscriber) return;
    await this.subscriber.quit();
    this.subscriber = undefined;
  }

  /**
   * Broadcast an event to every client watching this organization, on any
   * instance. Never throws — realtime delivery is best-effort and must not fail
   * the operation that produced the event.
   */
  async publish(
    organizationId: string,
    event: RealtimeEvent,
    data: Record<string, any>
  ): Promise<void> {
    const payload: RealtimePayload = {
      event,
      organizationId,
      data,
      timestamp: new Date().toISOString(),
    };

    try {
      await redis.publish(CHANNEL, JSON.stringify(payload));
    } catch (error: any) {
      log.warn('Failed to publish realtime event', { event, error: error.message });
    }
  }

  /**
   * Subscribe a connected client. Returns an unsubscribe function that the
   * request handler must call when the connection closes, or listeners leak.
   */
  subscribe(organizationId: string, listener: (payload: RealtimePayload) => void): () => void {
    this.emitter.on(organizationId, listener);
    this.connectionCount++;

    return () => {
      this.emitter.off(organizationId, listener);
      this.connectionCount--;
    };
  }

  /** Open SSE connections on this instance. */
  get connections(): number {
    return this.connectionCount;
  }
}

export const realtimeService = new RealtimeService();
