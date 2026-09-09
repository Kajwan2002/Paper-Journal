import { create } from "zustand";

/** Transient UI overlays that sit on top of the open book — the month-jump
 *  grid and search. Not persisted; only ever one is open at a time. */

interface OverlayState {
  month: boolean;
  search: boolean;
  openMonth: () => void;
  openSearch: () => void;
  close: () => void;
}

export const useOverlay = create<OverlayState>((set) => ({
  month: false,
  search: false,
  openMonth: () => set({ month: true, search: false }),
  openSearch: () => set({ search: true, month: false }),
  close: () => set({ month: false, search: false }),
}));
