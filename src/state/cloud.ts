import { create } from "zustand";
import { persist } from "zustand/middleware";

/** How this device reaches the shared journal.
 *
 *  Two ways in, because one of them cannot be relied on. Signing in with
 *  Google is the good one: nothing to paste, and the journal is scoped to
 *  an account only you can sign into. But inside a home-screen app on iOS
 *  that sign-in has a long history of going wrong — the popup is sandboxed
 *  from the app that opened it, and the redirect has its own ways of
 *  hanging — so there has to be a way in that cannot fail.
 *
 *  That way is a pairing code: the device signs in anonymously, which asks
 *  nothing of anyone, and the code names which journal to join. Unlike the
 *  GitHub token it replaces, the code is not a credential that expires, is
 *  revoked, or has to be regenerated. You paste it once on the second
 *  device and never think about it again. */
export type CloudMode = "google" | "code";

export type CloudPhase = "off" | "connecting" | "live" | "error";

export interface CloudConfig {
  mode: CloudMode;
  /** which journal in the cloud this device reads and writes */
  journalId: string;
  /** shown in settings so you can tell which account you're on */
  label?: string;
}

interface CloudState {
  config: CloudConfig | null;
  phase: CloudPhase;
  error: string | null;
  /** when a change last landed, either direction */
  lastAt: number | null;
  connect: (config: CloudConfig) => void;
  disconnect: () => void;
  setPhase: (phase: CloudPhase, error?: string | null) => void;
  touched: () => void;
}

export const useCloud = create<CloudState>()(
  persist(
    (set) => ({
      config: null,
      phase: "off",
      error: null,
      lastAt: null,
      connect: (config) => set({ config, phase: "connecting", error: null }),
      disconnect: () =>
        set({ config: null, phase: "off", error: null, lastAt: null }),
      setPhase: (phase, error = null) => set({ phase, error }),
      touched: () => set({ lastAt: Date.now(), phase: "live", error: null }),
    }),
    {
      name: "marginalia.cloud",
      partialize: (s) => ({ config: s.config, lastAt: s.lastAt }),
    },
  ),
);
