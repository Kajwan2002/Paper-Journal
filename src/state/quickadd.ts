import { create } from "zustand";
import type { LineKind } from "@/lib/rapidlog";

/** The quick-add tray requests a new line of a given kind; the active
 *  DailyPage picks it up, appends it, and focuses it. */

interface QuickAddState {
  pending: { kind: LineKind; nonce: number } | null;
  request: (kind: LineKind) => void;
  consume: () => void;
}

export const useQuickAdd = create<QuickAddState>((set) => ({
  pending: null,
  request: (kind) => set({ pending: { kind, nonce: Date.now() } }),
  consume: () => set({ pending: null }),
}));
