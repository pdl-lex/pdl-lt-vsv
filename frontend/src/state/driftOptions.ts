/**
 * Optionen des Drift-Moduls (eigener Store, weil Konfigurator und Hauptbereich
 * getrennte Komponenten der Modul-Registry sind).
 *
 * `baselineSlice` bleibt auch dann erhalten, wenn gerade „Erstbeleg" oder
 * „Vorgänger" aktiv ist — der Nutzer soll beim Hin- und Herschalten nicht seine
 * gewählte Referenzscheibe verlieren.
 */
import { create } from "zustand";
import type { DriftBaseline } from "../viz/series";

export type BaselineKind = DriftBaseline["kind"];

interface DriftOptionsState {
  baselineKind: BaselineKind;
  baselineSlice: number;
  setBaselineKind: (kind: BaselineKind) => void;
  setBaselineSlice: (index: number) => void;
}

export const useDriftOptions = create<DriftOptionsState>((set) => ({
  baselineKind: "erstbeleg",
  baselineSlice: 0,
  setBaselineKind: (baselineKind) => set({ baselineKind }),
  setBaselineSlice: (baselineSlice) => set({ baselineSlice }),
}));
