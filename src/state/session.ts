import { create } from "zustand";
import { persist } from "zustand/middleware";
import { addDays, todayKey, type DayKey } from "@/lib/date";

interface SessionState {
  /** Which notebook is on the desk. Set once the shelf has loaded. */
  notebookId: string | null;
  /** The day-page currently facing up. */
  date: DayKey;
  /** Is the cover open? */
  open: boolean;

  setNotebook: (id: string) => void;
  openBook: () => void;
  closeBook: () => void;
  goToDate: (date: DayKey) => void;
  goToday: () => void;
  step: (delta: number) => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      notebookId: null,
      date: todayKey(),
      open: false,

      setNotebook: (id) => set({ notebookId: id }),
      openBook: () => set({ open: true }),
      closeBook: () => set({ open: false }),
      goToDate: (date) => set({ date }),
      goToday: () => set({ date: todayKey() }),
      step: (delta) => set({ date: addDays(get().date, delta) }),
    }),
    {
      name: "marginalia.session",
      partialize: (s) => ({
        notebookId: s.notebookId,
        date: s.date,
        open: s.open,
      }),
    },
  ),
);
