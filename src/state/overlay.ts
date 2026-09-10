import { create } from "zustand";

/** Transient UI overlays that sit on top of the open book. Not persisted;
 *  only ever one is open at a time, so they can't stack into a modal pile. */

export type OverlayKind = "month" | "search" | "loops" | "settings";

interface OverlayState {
  open: OverlayKind | null;
  show: (kind: OverlayKind) => void;
  close: () => void;
}

export const useOverlay = create<OverlayState>((set) => ({
  open: null,
  show: (kind) => set({ open: kind }),
  close: () => set({ open: null }),
}));

/** Is any overlay up? Used by the book to hand over the keyboard. */
export function overlayOpen(): boolean {
  return useOverlay.getState().open !== null;
}
