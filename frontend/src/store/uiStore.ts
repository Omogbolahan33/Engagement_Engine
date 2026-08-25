import { create } from 'zustand';

/**
 * Ephemeral UI state shared across components that have no parent-child
 * relationship — currently just the command palette, which is mounted in the
 * layout but opened from the header, the keyboard, and elsewhere.
 *
 * Deliberately not persisted: none of this should survive a reload.
 */
interface UIState {
  commandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  commandPaletteOpen: false,
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  toggleCommandPalette: () =>
    set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
}));
