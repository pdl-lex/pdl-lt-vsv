/**
 * Optionen des Matrizen-Moduls. Eigener kleiner Store, weil Konfigurator-Spalte
 * und Hauptbereich getrennte Komponenten sind (Modul-Registry) und sich denselben
 * Zustand teilen müssen.
 */
import { create } from "zustand";

/** `gemeinsam` = eine Farbskala über alle gezeigten Matrizen (vergleichbar);
 *  `einzeln` = jede Matrix spannt ihre eigene (maximale Binnenstruktur). */
export type ScaleMode = "gemeinsam" | "einzeln";

interface MatrixOptionsState {
  scaleMode: ScaleMode;
  setScaleMode: (m: ScaleMode) => void;
}

export const useMatrixOptions = create<MatrixOptionsState>((set) => ({
  scaleMode: "gemeinsam",
  setScaleMode: (scaleMode) => set({ scaleMode }),
}));
