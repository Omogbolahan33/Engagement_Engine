import { useCallback, useMemo, useRef, useState } from 'react';

/**
 * Multi-select over a list of rows, with the interaction conventions people
 * expect from a file manager: click to toggle, shift-click to extend a range,
 * a header checkbox that reflects an indeterminate state.
 *
 * Selection is keyed by id rather than index so it survives sorting, filtering,
 * and pagination. Ids that leave the list are pruned on read, so an action can
 * never target a row the user can no longer see.
 */
export function useBulkSelection<T>(
  items: T[],
  getId: (item: T) => string
) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastToggledRef = useRef<string | null>(null);

  const visibleIds = useMemo(() => items.map(getId), [items, getId]);

  // Selection restricted to what is currently on screen.
  const effective = useMemo(() => {
    const visible = new Set(visibleIds);
    return new Set([...selected].filter((id) => visible.has(id)));
  }, [selected, visibleIds]);

  const isSelected = useCallback((id: string) => effective.has(id), [effective]);

  const toggle = useCallback(
    (id: string, event?: { shiftKey?: boolean }) => {
      setSelected((current) => {
        const next = new Set(current);

        // Shift-click extends from the last toggled row to this one.
        if (event?.shiftKey && lastToggledRef.current) {
          const from = visibleIds.indexOf(lastToggledRef.current);
          const to = visibleIds.indexOf(id);

          if (from !== -1 && to !== -1) {
            const [start, end] = from < to ? [from, to] : [to, from];
            // The anchor's resulting state is applied across the range.
            const selecting = !next.has(id);
            for (let i = start; i <= end; i++) {
              if (selecting) next.add(visibleIds[i]);
              else next.delete(visibleIds[i]);
            }
            lastToggledRef.current = id;
            return next;
          }
        }

        if (next.has(id)) next.delete(id);
        else next.add(id);

        lastToggledRef.current = id;
        return next;
      });
    },
    [visibleIds]
  );

  const selectAll = useCallback(() => {
    setSelected((current) => new Set([...current, ...visibleIds]));
  }, [visibleIds]);

  const clear = useCallback(() => {
    setSelected(new Set());
    lastToggledRef.current = null;
  }, []);

  const toggleAll = useCallback(() => {
    if (effective.size === visibleIds.length && visibleIds.length > 0) clear();
    else selectAll();
  }, [effective.size, visibleIds.length, clear, selectAll]);

  const allSelected = visibleIds.length > 0 && effective.size === visibleIds.length;

  return {
    /** Ids currently selected and still visible. */
    selectedIds: useMemo(() => [...effective], [effective]),
    selectedCount: effective.size,
    selectedItems: useMemo(
      () => items.filter((item) => effective.has(getId(item))),
      [items, effective, getId]
    ),
    isSelected,
    toggle,
    toggleAll,
    selectAll,
    clear,
    allSelected,
    /** True when some but not all rows are selected — drives the header checkbox. */
    indeterminate: effective.size > 0 && !allSelected,
    hasSelection: effective.size > 0,
  };
}
