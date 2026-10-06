/**
 * Zeitreihen über dieselbe Kosinus-Rechnung wie die Kiyama-Matrix — die
 * eindimensionalen Lesarten des Vektorraums.
 *
 * Zwei Fragen, zwei Kurvenarten:
 *
 * - **Drift** (`buildDriftSeries`): *Wie weit hat sich ein Wort von sich selbst
 *   entfernt?* Nach Hamilton et al. („Diachronic Word Embeddings Reveal
 *   Statistical Laws of Semantic Change") ist das die Kosinus-**Distanz** zu
 *   einem Referenzzeitpunkt. Geometrisch ist die Kurve genau **eine Zeile der
 *   Matrix**, an der Ähnlichkeitsachse gespiegelt (`1 − cos`): was dort als
 *   Farbverlauf einer Zeile steckt, wird hier ablesbar und vergleichbar.
 * - **Wort gegen Wort** (`buildPairSeries`): *Nähern sich zwei Wörter an?* Das
 *   ist `cos(v_a^t, v_b^t)` je Zeitscheibe — keine Selbst-, sondern
 *   Kreuzähnlichkeit, und damit die einzige der drei Ansichten, die zwei
 *   verschiedene Zielwörter direkt in Beziehung setzt.
 *
 * **Warum Distanz bei der Drift, Ähnlichkeit beim Paar:** die Achse soll in
 * beiden Fällen in Leserichtung „mehr von dem, wonach die Ansicht fragt"
 * bedeuten — bei Drift ist das Entfernung (steigt = hat sich verändert), beim
 * Paar Nähe (steigt = rücken zusammen). Beides ist dieselbe Zahl, nur einmal
 * gespiegelt; die Module schreiben die Formel deshalb sichtbar an.
 *
 * Lücken: wo ein Wort nicht belegt ist (`freq == 0`), steht `null` — nie 0.
 * Die Kurve setzt dort aus, genau wie die Trajektorie im Wortraum und wie die
 * Schraffur in der Matrix. Eine durchgezogene Linie über eine Belegungslücke
 * hinweg würde Entwicklung behaupten, für die es keine Daten gibt.
 */
import type { IndexedBundle } from "../data/model";
import { cosine, entityVectors, similaritySourceOf, type SimilaritySource } from "./similarity";
import { effectiveK, neighborSets, overlap } from "./overlap";

/** Wogegen die Drift gemessen wird. */
export type DriftBaseline =
  /** Erste belegte Scheibe des jeweiligen Wortes (je Wort verschieden). */
  | { kind: "erstbeleg" }
  /** Feste Zeitscheibe für alle Wörter (vergleichbar, aber ggf. unbelegt). */
  | { kind: "scheibe"; index: number }
  /** Jeweils die unmittelbar vorhergehende Scheibe = Änderungsrate. */
  | { kind: "vorgaenger" };

export interface DriftSeries {
  entityId: string;
  entityLabel: string;
  /** `1 − cos(v_ref, v_t)` je Zeitscheibe; `null` wo nicht berechenbar. */
  values: (number | null)[];
  /** Referenzscheibe; `null` bei `vorgaenger` (die wandert mit). */
  baselineIndex: number | null;
  /** true, wenn die feste Referenzscheibe für dieses Wort unbelegt ist. */
  baselineMissing: boolean;
  /** Anzahl Zeitscheiben mit einem Wert. */
  valueCount: number;
  source: SimilaritySource;
}

export interface PairSeries {
  otherId: string;
  otherLabel: string;
  /** `cos(v_bezug^t, v_other^t)`; `null`, wo eines der beiden Wörter fehlt. */
  values: (number | null)[];
  valueCount: number;
  source: SimilaritySource;
}

function labelOf(idx: IndexedBundle, entityId: string): string {
  const track = idx.tracks.find((t) => t.entity.id === entityId);
  return track?.entity.label ?? entityId;
}

/** Index der ersten belegten Zeitscheibe, sonst `null`. */
export function firstPresentIndex(vectors: (readonly number[] | null)[]): number | null {
  const i = vectors.findIndex((v) => v !== null);
  return i === -1 ? null : i;
}

/**
 * Drift-Kurve eines Zielworts.
 *
 * Bei `vorgaenger` wird bewusst **strikt** die Nachbarscheibe verglichen und
 * nicht „die letzte belegte" — sonst überspannte ein einzelner Wert eine
 * beliebig lange Belegungslücke und die Änderungsrate meinte je nach Stelle
 * etwas anderes.
 */
export function buildDriftSeries(
  idx: IndexedBundle,
  entityId: string,
  baseline: DriftBaseline,
  source: SimilaritySource = similaritySourceOf(idx),
): DriftSeries | null {
  const vectors = entityVectors(idx, entityId, source);
  if (!vectors) return null;
  return driftFrom(idx, entityId, baseline, source, vectors.map((v) => v !== null), (i, j) =>
    cosine(vectors[i]!, vectors[j]!),
  );
}

/**
 * Drift-Kurve aus der Nachbarschafts-Überlappung (Gonen et al.): `1 − overlap@k`
 * statt `1 − cos`. Bezugspunkte und Lückenregel sind dieselben, nur die
 * Paarmetrik ist ausgetauscht.
 */
export function buildOverlapDriftSeries(
  idx: IndexedBundle,
  entityId: string,
  baseline: DriftBaseline,
  k: number,
): DriftSeries | null {
  if (!idx.tracks.some((t) => t.entity.id === entityId)) return null;
  const sets = neighborSets(idx, entityId, effectiveK(idx, k));
  return driftFrom(idx, entityId, baseline, similaritySourceOf(idx), sets.map((s) => s !== null), (i, j) =>
    overlap(sets[i]!, sets[j]!),
  );
}

/** Gemeinsamer Kern beider Drift-Arten: `present` maskiert, `sim(i, j)` liefert
 * die Ähnlichkeit zweier belegter Scheiben, die Kurve ist `1 − sim`. */
function driftFrom(
  idx: IndexedBundle,
  entityId: string,
  baseline: DriftBaseline,
  source: SimilaritySource,
  present: boolean[],
  sim: (i: number, j: number) => number,
): DriftSeries {
  const n = idx.sliceCount;
  const values: (number | null)[] = new Array(n).fill(null);
  const count = () => values.reduce<number>((acc, v) => acc + (v === null ? 0 : 1), 0);

  if (baseline.kind === "vorgaenger") {
    for (let i = 1; i < n; i++) {
      if (!present[i - 1] || !present[i]) continue;
      const c = sim(i - 1, i);
      if (Number.isFinite(c)) values[i] = 1 - c;
    }
    return {
      entityId,
      entityLabel: labelOf(idx, entityId),
      values,
      baselineIndex: null,
      baselineMissing: false,
      valueCount: count(),
      source,
    };
  }

  const firstIdx = present.indexOf(true);
  const baselineIndex =
    baseline.kind === "erstbeleg" ? (firstIdx === -1 ? null : firstIdx) : baseline.index;
  const hasRef = baselineIndex !== null && baselineIndex >= 0 && baselineIndex < n && present[baselineIndex];

  if (hasRef) {
    const ref = baselineIndex as number;
    for (let i = 0; i < n; i++) {
      if (!present[i]) continue;
      const c = sim(ref, i);
      if (Number.isFinite(c)) values[i] = 1 - c;
    }
  }

  return {
    entityId,
    entityLabel: labelOf(idx, entityId),
    values,
    baselineIndex: baselineIndex ?? null,
    baselineMissing: !hasRef,
    valueCount: count(),
    source,
  };
}

/** Kreuzähnlichkeit zweier Zielwörter je Zeitscheibe. */
export function buildPairSeries(
  idx: IndexedBundle,
  refId: string,
  otherId: string,
  source: SimilaritySource = similaritySourceOf(idx),
): PairSeries | null {
  const a = entityVectors(idx, refId, source);
  const b = entityVectors(idx, otherId, source);
  if (!a || !b) return null;

  const n = idx.sliceCount;
  const values: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const va = a[i];
    const vb = b[i];
    if (!va || !vb) continue;
    const c = cosine(va, vb);
    if (Number.isFinite(c)) values[i] = c;
  }

  return {
    otherId,
    otherLabel: labelOf(idx, otherId),
    values,
    valueCount: values.reduce<number>((acc, v) => acc + (v === null ? 0 : 1), 0),
    source,
  };
}

/**
 * Wertebereich über mehrere Kurven, gerundet auf „runde" Enden.
 *
 * `zeroFloor` verankert die Achse bei 0 (Drift: Distanz 0 heißt „identisch",
 * das ist ein echter Nullpunkt und darf nicht weggeschnitten werden). Für
 * Ähnlichkeitskurven ist 0 dagegen kein sinnvoller Anker — dort spannt die
 * Achse um die tatsächlichen Werte, sonst liegt jede Kurve flach oben.
 */
export function seriesDomain(
  seriesValues: (number | null)[][],
  opts: { zeroFloor?: boolean } = {},
): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const values of seriesValues) {
    for (const v of values) {
      if (v === null || !Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };

  if (opts.zeroFloor) min = 0;
  if (max - min < 1e-6) {
    // Konstante Kurve: eine Achse ohne Spanne wäre nicht zeichenbar.
    return { min: min - 0.05, max: max + 0.05 };
  }
  const pad = (max - min) * 0.08;
  return { min: opts.zeroFloor ? 0 : min - pad, max: max + pad };
}
