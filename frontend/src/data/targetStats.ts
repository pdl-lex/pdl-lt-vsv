/**
 * Kennzahlen zur Datenlage der Zielwörter — Grundlage des Moduls „Zielwörter".
 *
 * Quelle ist allein `freq` der Aggregate (Stichprobengröße der Zelle
 * Zielwort × Zeitscheibe). Daraus:
 * - **Belegung**: in wie vielen Zeitscheiben das Wort belegt ist (`freq > 0`),
 * - **Häufigkeit**: Summe von `freq` über alle Zeitscheiben.
 *
 * Fehlt ein Aggregat, zählt die Zelle als unbelegt (`freq` 0) — wie überall im
 * Tool (siehe `model.ts`, Pfadlinien).
 */
import type { IndexedBundle } from "./model";

export interface TargetStat {
  id: string;
  label: string;
  /** Position in `indexed.tracks` — für die Identitätsfarbe. */
  colorIndex: number;
  /** `freq` je Zeitscheibe (an `sortedSlices` ausgerichtet), 0 = unbelegt. */
  freqs: number[];
  /** Anzahl belegter Zeitscheiben (`freq > 0`). */
  belegt: number;
  /** Summe `freq` über alle Zeitscheiben. */
  total: number;
}

export interface Summary {
  n: number;
  min: number;
  q1: number;
  median: number;
  mean: number;
  q3: number;
  max: number;
}

export function targetStats(idx: IndexedBundle): TargetStat[] {
  return idx.tracks.map((t, colorIndex) => {
    const freqs = Array.from({ length: idx.sliceCount }, (_, i) => Math.max(0, t.samples[i]?.freq ?? 0));
    return {
      id: t.entity.id,
      label: t.entity.label ?? t.entity.id,
      colorIndex,
      freqs,
      belegt: freqs.filter((f) => f > 0).length,
      total: freqs.reduce((a, b) => a + b, 0),
    };
  });
}

/** Quantil mit linearer Interpolation (wie R type 7 / numpy default). `sorted` aufsteigend. */
export function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

export function summarize(values: number[]): Summary | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return {
    n: s.length,
    min: s[0],
    q1: quantile(s, 0.25),
    median: quantile(s, 0.5),
    mean: s.reduce((a, b) => a + b, 0) / s.length,
    q3: quantile(s, 0.75),
    max: s[s.length - 1],
  };
}

/**
 * Liegt `v` im unteren Quartil (`v ≤ Q1`)? Haben die Werte keine Streuung
 * (`Q1 == max`), wird nichts markiert — sonst wäre bei lauter gleichen Werten
 * alles „niedrig".
 */
export function isLow(v: number, s: Summary | null): boolean {
  return s !== null && s.q1 < s.max && v <= s.q1;
}
