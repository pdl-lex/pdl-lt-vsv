/**
 * Welche Paarmetrik die Ähnlichkeitsansichten benutzen: Kosinus der Vektoren
 * oder Nachbarschafts-Überlappung (Gonen et al., `viz/overlap.ts`).
 *
 * Bewusst **ein** Store für Matrizen und Drift: die Drift-Kurve ist eine Zeile
 * der Matrix, beide sollen dieselbe Zahl zeigen. Wer in einem Modul umschaltet,
 * sieht im anderen nicht plötzlich eine andere Metrik.
 */
import { create } from "zustand";
import { OVERLAP_K_DEFAULT } from "../viz/overlap";

export type Metric = "kosinus" | "ueberlappung";

interface MetricOptionsState {
  metric: Metric;
  /** k für `overlap@k`; wird beim Rechnen auf die Listenlänge begrenzt. */
  overlapK: number;
  setMetric: (m: Metric) => void;
  setOverlapK: (k: number) => void;
}

export const useMetricOptions = create<MetricOptionsState>((set) => ({
  metric: "kosinus",
  overlapK: OVERLAP_K_DEFAULT,
  setMetric: (metric) => set({ metric }),
  setOverlapK: (overlapK) => set({ overlapK: Math.max(1, Math.round(overlapK)) }),
}));
