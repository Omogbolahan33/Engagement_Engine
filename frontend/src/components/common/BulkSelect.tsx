import { useEffect, useRef } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';

/**
 * Checkbox that can render the indeterminate state.
 *
 * `indeterminate` is a DOM property with no HTML attribute equivalent, so React
 * cannot set it declaratively — it has to be written through a ref.
 */
export function SelectCheckbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (event: React.MouseEvent | React.ChangeEvent) => void;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      aria-label={label}
      onChange={onChange}
      // Shift-click state lives on the mouse event, which `change` doesn't carry.
      onClick={onChange}
      className={clsx(
        'w-4 h-4 rounded bg-dark-800 border-dark-600 text-primary-600 cursor-pointer',
        'focus-visible:ring-2 focus-visible:ring-primary-500',
        className
      )}
    />
  );
}

/**
 * Action bar shown while rows are selected. Anchored to the bottom so it does
 * not shift the list when it appears.
 */
export function BulkActionBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: React.ReactNode;
}) {
  // Escape clears the selection, matching the dismiss convention elsewhere.
  useEffect(() => {
    if (count === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClear();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [count, onClear]);

  if (count === 0) return null;

  return (
    <div
      role="region"
      aria-label={`${count} selected`}
      className="sticky bottom-4 z-30 mx-auto flex w-fit items-center gap-4 rounded-xl border border-dark-700 bg-dark-800 px-4 py-3 shadow-2xl"
    >
      <span className="text-sm font-medium text-dark-100" aria-live="polite">
        {count} selected
      </span>

      <div className="h-5 w-px bg-dark-700" aria-hidden="true" />

      <div className="flex items-center gap-2">{children}</div>

      <button
        type="button"
        onClick={onClear}
        className="text-dark-400 hover:text-dark-200 transition-colors"
        aria-label="Clear selection"
      >
        <XMarkIcon className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}
