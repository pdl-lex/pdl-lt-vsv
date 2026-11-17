/**
 * Optionen des Wandel-Rankings: die zwei verglichenen Zeiträume und der
 * Sortierschlüssel (Abstand der Überlappung oder des Kosinus zur Baseline).
 *
 * `null` heißt „Standard des Bundles" (erste gegen zweite Hälfte, `defaultPeriods`). So passt
 * die Voreinstellung nach einem Bundle-Wechsel von selbst, ohne dass dieser
 * Store vom Laden wissen muss; ausgewählte Indizes werden beim Rechnen geklemmt.
 */
import { create } from "zustand";
import type { ChangeSort, Period } from "../viz/overlap";

interface ChangeOptionsState {
  periods: { a: Period; b: Period } | null;
  sortBy: ChangeSort;
  /** Ausgeklappte Zeile (Nachbar-Diff). */
  openEntityId: string | null;
  setPeriods: (p: { a: Period; b: Period } | null) => void;
  setSortBy: (s: ChangeSort) => void;
  setOpenEntityId: (id: string | null) => void;
}

export const useChangeOptions = create<ChangeOptionsState>((set) => ({
  periods: null,
  sortBy: "ueberlappung",
  openEntityId: null,
  setPeriods: (periods) => set({ periods }),
  setSortBy: (sortBy) => set({ sortBy }),
  setOpenEntityId: (openEntityId) => set({ openEntityId }),
}));
