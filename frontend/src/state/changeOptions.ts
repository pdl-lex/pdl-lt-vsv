/**
 * Optionen des Wandel-Rankings: die zwei verglichenen Zeiträume.
 *
 * `null` heißt „Standard des Bundles" (vor/ab Zäsur, `defaultPeriods`). So passt
 * die Voreinstellung nach einem Bundle-Wechsel von selbst, ohne dass dieser
 * Store vom Laden wissen muss; ausgewählte Indizes werden beim Rechnen geklemmt.
 */
import { create } from "zustand";
import type { Period } from "../viz/overlap";

interface ChangeOptionsState {
  periods: { a: Period; b: Period } | null;
  /** Ausgeklappte Zeile (Nachbar-Diff). */
  openEntityId: string | null;
  setPeriods: (p: { a: Period; b: Period } | null) => void;
  setOpenEntityId: (id: string | null) => void;
}

export const useChangeOptions = create<ChangeOptionsState>((set) => ({
  periods: null,
  openEntityId: null,
  setPeriods: (periods) => set({ periods }),
  setOpenEntityId: (openEntityId) => set({ openEntityId }),
}));
