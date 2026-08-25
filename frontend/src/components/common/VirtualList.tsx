import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';

/**
 * Windowed rendering: only the rows intersecting the viewport are mounted.
 *
 * Rendering a few thousand engagement rows mounts a few thousand React subtrees
 * and their event handlers, which is what makes long lists stutter. The scroll
 * extent is preserved with spacer rows so the scrollbar behaves normally, while
 * the DOM only ever holds the visible window plus a small overscan buffer.
 *
 * A fixed row height is required — it is what lets the visible range be computed
 * arithmetically instead of by measuring every row.
 */

interface VirtualWindowOptions {
  itemCount: number;
  itemHeight: number;
  /** Height of the scroll viewport, in px. */
  height: number;
  /** Rows rendered beyond each edge, to cover fast scrolling. */
  overscan?: number;
}

export function useVirtualWindow({
  itemCount,
  itemHeight,
  height,
  overscan = 5,
}: VirtualWindowOptions) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const onScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  // If the list shrinks below the current offset (filtering, deletion), scroll
  // back into range rather than leaving a blank window.
  useEffect(() => {
    const maxScroll = Math.max(0, itemCount * itemHeight - height);
    if (scrollTop > maxScroll) {
      containerRef.current?.scrollTo({ top: maxScroll });
      setScrollTop(maxScroll);
    }
  }, [itemCount, itemHeight, height, scrollTop]);

  const window = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visibleCount = Math.ceil(height / itemHeight) + overscan * 2;
    const endIndex = Math.min(itemCount, startIndex + visibleCount);

    return {
      startIndex,
      endIndex,
      paddingTop: startIndex * itemHeight,
      paddingBottom: Math.max(0, (itemCount - endIndex) * itemHeight),
    };
  }, [itemCount, itemHeight, height, overscan, scrollTop]);

  return { ...window, containerRef, onScroll };
}

/**
 * Virtualisation only pays for itself once a list is long enough that the saved
 * render work exceeds the bookkeeping. Below this, everything renders normally
 * so short lists keep natural page scrolling and auto row heights.
 */
export const VIRTUALIZE_THRESHOLD = 100;

interface VirtualTableProps<T> {
  items: T[];
  /** Must return a `<tr>`. */
  renderRow: (item: T, index: number) => React.ReactNode;
  getKey: (item: T, index: number) => string | number;
  /** Table header markup — a `<tr>` of `<th>`. Stays pinned while scrolling. */
  header: React.ReactNode;
  /** Row height in px; must match what `renderRow` actually renders. */
  itemHeight?: number;
  /** Viewport height once virtualised. */
  height?: number;
  /** Needed for the spacer rows' colSpan. */
  columnCount: number;
  threshold?: number;
  className?: string;
  label?: string;
}

/**
 * Table that windows its rows once the list grows past `threshold`.
 *
 * Below the threshold it is an ordinary table, so nothing about short lists
 * changes. Above it, the table gains its own scroll container and renders only
 * the visible slice.
 */
export function VirtualTable<T>({
  items,
  renderRow,
  getKey,
  header,
  itemHeight = 57,
  height = 600,
  columnCount,
  threshold = VIRTUALIZE_THRESHOLD,
  className,
  label,
}: VirtualTableProps<T>) {
  const virtualize = items.length > threshold;

  // Hooks cannot be called conditionally; for short lists the result is unused.
  const { startIndex, endIndex, paddingTop, paddingBottom, containerRef, onScroll } =
    useVirtualWindow({ itemCount: items.length, itemHeight, height });

  const visible = virtualize ? items.slice(startIndex, endIndex) : items;
  const offset = virtualize ? startIndex : 0;

  return (
    <div
      ref={virtualize ? containerRef : undefined}
      onScroll={virtualize ? onScroll : undefined}
      className={clsx('table-container', className)}
      style={virtualize ? { height, overflowY: 'auto' } : undefined}
    >
      <table className="table" aria-label={label} aria-rowcount={items.length}>
        <thead className={virtualize ? 'sticky top-0 z-10' : undefined}>{header}</thead>
        <tbody>
          {/* Spacers reproduce the full scroll extent without mounting rows.
              They are <tr>/<td> rather than a wrapper div so the table's
              layout and semantics stay intact. */}
          {virtualize && paddingTop > 0 && (
            <tr aria-hidden="true" style={{ height: paddingTop }}>
              <td colSpan={columnCount} />
            </tr>
          )}

          {visible.map((item, i) => (
            <Row key={getKey(item, offset + i)}>{renderRow(item, offset + i)}</Row>
          ))}

          {virtualize && paddingBottom > 0 && (
            <tr aria-hidden="true" style={{ height: paddingBottom }}>
              <td colSpan={columnCount} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Passes a caller-provided `<tr>` through under a stable key. */
function Row({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
