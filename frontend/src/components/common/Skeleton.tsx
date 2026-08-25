import clsx from 'clsx';

/**
 * Loading placeholders that mirror the shape of the content they stand in for.
 *
 * A spinner tells the user "something is happening"; a skeleton also tells them
 * what is about to appear and reserves its space, so the page does not jump when
 * data lands.
 *
 * The whole group is announced once, politely, via the container's aria-busy —
 * individual bars are decorative and hidden from assistive tech.
 */

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ className, style }: SkeletonProps) {
  return <div className={clsx('skeleton', className)} style={style} aria-hidden="true" />;
}

/** Wraps a skeleton group so screen readers hear one status, not twenty bars. */
export function SkeletonGroup({
  label = 'Loading',
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" aria-label={label}>
      {children}
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={clsx('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={clsx('h-4', i === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  );
}

export function SkeletonStatCard() {
  return (
    <div className="card flex flex-col gap-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

export function SkeletonStatGrid({ count = 4 }: { count?: number }) {
  return (
    <SkeletonGroup label="Loading statistics">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>
    </SkeletonGroup>
  );
}

export function SkeletonTable({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <SkeletonGroup label="Loading table">
      <div className="table-container">
        <div className="min-w-full">
          {/* Header */}
          <div
            className="flex gap-6 px-6 py-3 bg-dark-900 border-b border-dark-800"
            aria-hidden="true"
          >
            {Array.from({ length: columns }).map((_, i) => (
              <Skeleton key={i} className="h-3 flex-1" />
            ))}
          </div>
          {/* Body */}
          {Array.from({ length: rows }).map((_, r) => (
            <div
              key={r}
              className="flex gap-6 px-6 py-4 border-b border-dark-800"
              aria-hidden="true"
            >
              {Array.from({ length: columns }).map((_, c) => (
                <Skeleton
                  key={c}
                  className={clsx('h-4 flex-1', c === 0 && 'max-w-[40%]')}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </SkeletonGroup>
  );
}

export function SkeletonCardGrid({ count = 6 }: { count?: number }) {
  return (
    <SkeletonGroup label="Loading items">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="card space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
            <SkeletonText lines={2} />
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}

export function SkeletonChart({ className }: { className?: string }) {
  // Fixed heights rather than random ones so the placeholder does not reflow
  // between renders.
  const heights = [45, 70, 35, 85, 55, 75, 40, 65, 50, 80, 60, 30];

  return (
    <SkeletonGroup label="Loading chart">
      <div className={clsx('card', className)}>
        <Skeleton className="h-4 w-40 mb-6" />
        <div className="flex items-end gap-2 h-48" aria-hidden="true">
          {heights.map((h, i) => (
            <Skeleton key={i} className="flex-1" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
    </SkeletonGroup>
  );
}
