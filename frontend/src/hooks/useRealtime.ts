import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';

/**
 * Live server events over SSE, replacing poll-only refresh.
 *
 * EventSource cannot set an Authorization header, so the access token travels as
 * a query parameter — the `/events/stream` route accepts it there specifically
 * for this reason.
 *
 * The browser reconnects EventSource automatically, but not when the socket is
 * closed after an auth failure, so failures are retried here with backoff.
 */

export type RealtimeEventName =
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'engagement.updated'
  | 'engagement.status'
  | 'site.health'
  | 'credential.expiring'
  | 'notification';

export interface RealtimeMessage {
  event: RealtimeEventName;
  organizationId: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export type ConnectionState = 'connecting' | 'open' | 'closed';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

/**
 * Query keys refreshed when an event arrives. Invalidation rather than manual
 * cache patching: the server stays the source of truth, and a stale list cannot
 * drift from it.
 */
const INVALIDATION_MAP: Record<RealtimeEventName, string[][]> = {
  'run.started': [['engagements'], ['dashboard']],
  'run.completed': [['engagements'], ['dashboard'], ['analytics'], ['metrics']],
  'run.failed': [['engagements'], ['dashboard'], ['analytics'], ['metrics']],
  'engagement.updated': [['engagements']],
  'engagement.status': [['engagements'], ['dashboard']],
  'site.health': [['sites'], ['site-health']],
  'credential.expiring': [['credentials']],
  notification: [],
};

export function useRealtime(options?: {
  onEvent?: (message: RealtimeMessage) => void;
  enabled?: boolean;
}) {
  const enabled = options?.enabled ?? true;
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();

  const [state, setState] = useState<ConnectionState>('closed');
  const [lastEvent, setLastEvent] = useState<RealtimeMessage | null>(null);

  // Held in a ref so reconnects don't re-run this effect on every render.
  const onEventRef = useRef(options?.onEvent);
  onEventRef.current = options?.onEvent;

  useEffect(() => {
    if (!enabled || !accessToken) {
      setState('closed');
      return;
    }

    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;

      setState('connecting');
      source = new EventSource(
        `/api/v1/events/stream?token=${encodeURIComponent(accessToken)}`
      );

      source.onopen = () => {
        attempt = 0; // a successful open resets the backoff
        setState('open');
      };

      const handle = (raw: MessageEvent) => {
        try {
          const message = JSON.parse(raw.data) as RealtimeMessage;
          setLastEvent(message);
          onEventRef.current?.(message);

          for (const key of INVALIDATION_MAP[message.event] ?? []) {
            queryClient.invalidateQueries({ queryKey: key });
          }
        } catch {
          // A malformed frame is not worth tearing the stream down for.
        }
      };

      // Named events don't fire onmessage, so subscribe to each explicitly.
      for (const name of Object.keys(INVALIDATION_MAP) as RealtimeEventName[]) {
        source.addEventListener(name, handle as EventListener);
      }
      source.onmessage = handle;

      source.onerror = () => {
        source?.close();
        source = null;
        setState('closed');
        if (cancelled) return;

        const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
        attempt++;
        // Jitter stops every open tab from reconnecting in lockstep after an
        // outage.
        reconnectTimer = setTimeout(connect, delay / 2 + Math.random() * (delay / 2));
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      source?.close();
      setState('closed');
    };
  }, [enabled, accessToken, queryClient]);

  return { state, lastEvent, isLive: state === 'open' };
}
