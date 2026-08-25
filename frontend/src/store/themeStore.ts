import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeState {
  /** What the user chose. 'system' defers to the OS. */
  preference: ThemePreference;
  /** What is actually on screen once 'system' is resolved. */
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  /** Cycles light -> dark -> system. */
  cycle: () => void;
  /** Re-resolves against the OS; called when the media query changes. */
  syncWithSystem: () => void;
}

const STORAGE_KEY = 'theme-preference';

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolve(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? systemTheme() : preference;
}

/**
 * Writing the attribute is what actually themes the app — index.css keys its
 * variables off `data-theme`. Done as a side effect of the store rather than in
 * a component so the theme is correct before first paint of any consumer.
 */
function applyTheme(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', resolved);
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      preference: 'system',
      resolved: systemTheme(),

      setPreference: (preference) => {
        const resolved = resolve(preference);
        applyTheme(resolved);
        set({ preference, resolved });
      },

      cycle: () => {
        const order: ThemePreference[] = ['light', 'dark', 'system'];
        const next = order[(order.indexOf(get().preference) + 1) % order.length];
        get().setPreference(next);
      },

      syncWithSystem: () => {
        if (get().preference !== 'system') return;
        const resolved = systemTheme();
        applyTheme(resolved);
        set({ resolved });
      },
    }),
    {
      name: STORAGE_KEY,
      // Only the choice is persisted; `resolved` is derived on every load so a
      // stored value can never disagree with the current OS setting.
      partialize: (state) => ({ preference: state.preference }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const resolved = resolve(state.preference);
        applyTheme(resolved);
        state.resolved = resolved;
      },
    }
  )
);

/**
 * Applies the persisted theme as early as possible and keeps it in step with the
 * OS. Called from main.tsx before React renders, so there is no flash of the
 * wrong theme on load.
 */
export function initTheme(): void {
  if (typeof window === 'undefined') return;

  const { preference } = useThemeStore.getState();
  applyTheme(resolve(preference));

  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => useThemeStore.getState().syncWithSystem());
}
