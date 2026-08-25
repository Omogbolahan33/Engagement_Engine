import { ExclamationTriangleIcon, ArrowPathIcon, WifiIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';
import clsx from 'clsx';

/**
 * Inline failure state with a retry affordance.
 *
 * A failed query previously left an empty region with no explanation and no way
 * forward short of reloading the page. This says what failed, distinguishes
 * "you are offline" from "the server said no", and lets the user retry in place.
 */

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void | Promise<unknown>;
  /** What was being loaded, e.g. "engagements". Used in the message. */
  resource?: string;
  className?: string;
  compact?: boolean;
}

/** Pull a useful message out of an axios error, a plain Error, or anything else. */
export function errorMessage(error: unknown): string {
  if (!error) return 'Unknown error';

  const axiosLike = error as {
    response?: { status?: number; data?: { error?: string; message?: string } };
    message?: string;
    code?: string;
  };

  const serverMessage = axiosLike.response?.data?.error ?? axiosLike.response?.data?.message;
  if (serverMessage) return serverMessage;

  const status = axiosLike.response?.status;
  if (status === 403) return 'You do not have permission to view this.';
  if (status === 404) return 'Not found.';
  if (status === 429) return 'Too many requests — please wait a moment.';
  if (status && status >= 500) return 'The server ran into a problem.';

  if (axiosLike.code === 'ERR_NETWORK') return 'Could not reach the server.';

  return axiosLike.message ?? 'Something went wrong.';
}

function isOffline(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return code === 'ERR_NETWORK' || (typeof navigator !== 'undefined' && !navigator.onLine);
}

export function ErrorState({ error, onRetry, resource, className, compact }: ErrorStateProps) {
  const [retrying, setRetrying] = useState(false);
  const offline = isOffline(error);

  const handleRetry = async () => {
    if (!onRetry || retrying) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  const Icon = offline ? WifiIcon : ExclamationTriangleIcon;
  const heading = offline
    ? "You're offline"
    : `Couldn't load ${resource ?? 'this'}`;

  return (
    <div
      role="alert"
      className={clsx(
        'card flex items-center gap-4 border-red-900/50 bg-red-950/20',
        compact ? 'py-3' : 'flex-col text-center py-10',
        className
      )}
    >
      <Icon
        className={clsx('text-red-400 shrink-0', compact ? 'w-5 h-5' : 'w-10 h-10')}
        aria-hidden="true"
      />

      <div className={clsx(compact ? 'flex-1 min-w-0' : 'space-y-1')}>
        <p className="text-sm font-medium text-dark-100">{heading}</p>
        <p className="text-sm text-dark-400">{errorMessage(error)}</p>
      </div>

      {onRetry && (
        <button
          type="button"
          onClick={handleRetry}
          disabled={retrying}
          className="btn-secondary inline-flex items-center gap-2 shrink-0"
        >
          <ArrowPathIcon
            className={clsx('w-4 h-4', retrying && 'animate-spin')}
            aria-hidden="true"
          />
          {retrying ? 'Retrying…' : 'Try again'}
        </button>
      )}
    </div>
  );
}

/**
 * Renders skeletons while loading, an error state with retry on failure, and the
 * children once data is available — so pages get all three states from one call
 * instead of hand-rolling each.
 */
export function QueryBoundary({
  isLoading,
  error,
  onRetry,
  resource,
  skeleton,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  onRetry?: () => void | Promise<unknown>;
  resource?: string;
  skeleton: React.ReactNode;
  children: React.ReactNode;
}) {
  if (isLoading) return <>{skeleton}</>;
  if (error) return <ErrorState error={error} onRetry={onRetry} resource={resource} />;
  return <>{children}</>;
}
