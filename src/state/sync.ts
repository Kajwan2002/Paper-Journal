import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SyncPhase = "off" | "idle" | "working" | "error";

export interface SyncConfig {
  token: string;
  gistId: string;
  /** the AES key, base64 — travels only inside a sync code you carry */
  key: string;
  login?: string;
}

interface SyncState {
  config: SyncConfig | null;
  /** which notebook is on the desk, so a pull can tell whether the reader is
   *  looking at an empty seed while their journal arrives beside it */
  currentNotebookId: string | null;
  phase: SyncPhase;
  lastSynced: number | null;
  error: string | null;
  connect: (config: SyncConfig) => void;
  disconnect: () => void;
  setPhase: (phase: SyncPhase, error?: string | null) => void;
  setSynced: (at: number) => void;
  setCurrentNotebook: (id: string | null) => void;
}

export const useSync = create<SyncState>()(
  persist(
    (set) => ({
      config: null,
      currentNotebookId: null,
      phase: "off",
      lastSynced: null,
      error: null,
      connect: (config) => set({ config, phase: "idle", error: null }),
      disconnect: () =>
        set({ config: null, phase: "off", error: null, lastSynced: null }),
      setPhase: (phase, error = null) => set({ phase, error }),
      setSynced: (at) => set({ lastSynced: at, phase: "idle", error: null }),
      setCurrentNotebook: (id) => set({ currentNotebookId: id }),
    }),
    {
      name: "marginalia.sync",
      partialize: (s) => ({ config: s.config, lastSynced: s.lastSynced }),
      onRehydrateStorage: () => (state) => {
        if (state?.config) state.phase = "idle";
      },
    },
  ),
);
