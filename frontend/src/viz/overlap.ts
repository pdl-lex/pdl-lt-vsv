/**
 * Nachbarschafts-Überlappung nach **Gonen et al.**, „Simple, Interpretable and
 * Stable Method for Detecting Words with Usage Change across Corpora" (ACL 2020).
 *
 * Statt zwei Vektoren desselben Worts zu vergleichen, werden seine Top-k-
 * Nachbarlisten verglichen: `overlap@k(tᵢ, tⱼ) = |NN_k(tᵢ) ∩ NN_k(tⱼ)| / k`.
 * Wenige gemeinsame Nachbarn = veränderter Gebrauch.
 *
 * Zwei Eigenschaften machen das Maß zur Ergänzung des Kosinus:
 *
 * - **Kein Vektorvergleich über Zeitscheiben hinweg.** Jede Liste entsteht
 *   innerhalb ihrer Scheibe; verglichen werden nur Wortmengen. Was am Vektor
 *   selbst verzerrt ist (z. B. eine SVD-Achse, die nur eine Scheibe eines Worts
 *   beschreibt), schlägt hier anders durch — der direkte Vergleich beider Maße
 *   ist deshalb ein Plausibilitätstest.
 * - **Erklärbar.** Zu jeder Zahl gibt es die Liste der gemeinsamen,
 *   weggefallenen und hinzugekommenen Nachbarn (`neighborDiff`).
 *
 * Grundlage sind dieselben Listen wie überall (`neighborsAt`), also nach dem
 * Nachbar-Filter. Die Maskierungsregel gilt unverändert: `freq == 0` heißt
 * „nicht belegt", die Zelle bleibt leer statt 0.
 */
import { entityFreqAt, neighborsAt, type IndexedBundle } from "../data/model";
import type { SimilarityMatrix } from "./similarity";

/** Startwert für k. Gonen et al. nehmen 1000 bei großem Vokabular; 100 ist
 * bei 150er-Bundle-Listen noch voll gedeckt und reagiert schneller auf Wandel. */
export const OVERLAP_K_DEFAULT = 100;
export const OVERLAP_K_MIN = 10;

/**
 * Top-k-Nachbarn eines Zielworts je Zeitscheibe als Menge; `null`, wo das Wort
 * nicht belegt ist oder keine Liste vorliegt. Schlüssel ist das Label — so, wie
 * Nachbarn überall angezeigt und gefiltert werden.
 */
export function neighborSets(
  idx: IndexedBundle,
  entityId: string,
  k: number,
): (Set<string> | null)[] {
  return idx.sortedSlices.map((_, i) => {
    if (entityFreqAt(idx, entityId, i) <= 0) return null;
    const list = neighborsAt(idx, entityId, i);
    if (list.length === 0) return null;
    return new Set(list.slice(0, k).map((n) => n.label));
  });
}

/**
 * Anteil gemeinsamer Nachbarn. Geteilt wird durch die kürzere der beiden
 * Listen, nicht stur durch k: ist eine Liste kürzer als k (alte Bundles, harte
 * Filter), wäre sonst selbst Identität < 1.
 */
export function overlap(a: Set<string>, b: Set<string>): number {
  const denom = Math.min(a.size, b.size);
  if (denom === 0) return NaN;
  let shared = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) if (large.has(x)) shared++;
  return shared / denom;
}

/** Tatsächlich wirksames k: höchstens so lang wie die längste Liste. */
export function effectiveK(idx: IndexedBundle, k: number): number {
  return Math.max(1, Math.min(k, idx.maxNeighborK));
}

/** T×T-Überlappungsmatrix — dieselbe Form wie die Kosinus-Matrix, damit
 * Canvas, Skala und Small Multiples unverändert weiterarbeiten. */
export function buildOverlapMatrix(
  idx: IndexedBundle,
  entityId: string,
  k: number,
): SimilarityMatrix | null {
  const track = idx.tracks.find((t) => t.entity.id === entityId);
  if (!track) return null;

  const n = idx.sliceCount;
  const sets = neighborSets(idx, entityId, effectiveK(idx, k));
  const present = sets.map((s) => s !== null);
  const presentCount = present.reduce((acc, p) => acc + (p ? 1 : 0), 0);

  const values = new Float32Array(n * n).fill(NaN);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const si = sets[i];
    if (!si) continue;
    values[i * n + i] = 1;
    for (let j = i + 1; j < n; j++) {
      const sj = sets[j];
      if (!sj) continue;
      const v = overlap(si, sj);
      values[i * n + j] = v;
      values[j * n + i] = v;
      if (Number.isFinite(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 1;
  }

  return {
    entityId,
    entityLabel: track.entity.label ?? entityId,
    n,
    values,
    present,
    presentCount,
    min,
    max,
    // Rechengrundlage sind Nachbarlisten, kein Vektor — `source` bleibt für die
    // gemeinsame Form gesetzt, die UI zeigt bei dieser Metrik den Filterhinweis.
    source: "vector",
  };
}

export interface DiffEntry {
  label: string;
  /** 1-basierte Ränge in beiden Listen; `null`, wo nicht unter den Top k. */
  rankA: number | null;
  rankB: number | null;
}

export interface NeighborDiff {
  shared: DiffEntry[];
  onlyA: DiffEntry[];
  onlyB: DiffEntry[];
  k: number;
}

/**
 * Gemeinsame, nur in A und nur in B vorkommende Einträge zweier Ranglisten.
 * Gemeinsame nach Rangsumme, die übrigen nach ihrem Rang.
 */
export function diffLists(a: readonly string[], b: readonly string[], k: number): NeighborDiff {
  const rankA = new Map(a.map((label, r) => [label, r + 1]));
  const rankB = new Map(b.map((label, r) => [label, r + 1]));

  const shared: DiffEntry[] = [];
  const onlyA: DiffEntry[] = [];
  for (const [label, ra] of rankA) {
    const rb = rankB.get(label) ?? null;
    (rb === null ? onlyA : shared).push({ label, rankA: ra, rankB: rb });
  }
  const onlyB: DiffEntry[] = [];
  for (const [label, rb] of rankB) {
    if (!rankA.has(label)) onlyB.push({ label, rankA: null, rankB: rb });
  }
  shared.sort((x, y) => x.rankA! + x.rankB! - (y.rankA! + y.rankB!));
  return { shared, onlyA, onlyB, k };
}

/** Überlappung einer `diffLists`-Auswertung — dieselbe Zahl wie `overlap()`. */
export function diffOverlap(d: NeighborDiff): number {
  const denom = Math.min(d.shared.length + d.onlyA.length, d.shared.length + d.onlyB.length);
  return denom > 0 ? d.shared.length / denom : NaN;
}

/**
 * Was hinter einer Überlappungszahl steckt: gemeinsame Nachbarn (nach mittlerem
 * Rang), nur in tᵢ (weggefallen) und nur in tⱼ (hinzugekommen), je nach Rang.
 * `null`, wenn eine der beiden Scheiben nicht belegt ist.
 */
export function neighborDiff(
  idx: IndexedBundle,
  entityId: string,
  i: number,
  j: number,
  k: number,
): NeighborDiff | null {
  const kk = effectiveK(idx, k);
  if (entityFreqAt(idx, entityId, i) <= 0 || entityFreqAt(idx, entityId, j) <= 0) return null;
  const a = neighborsAt(idx, entityId, i).slice(0, kk).map((n) => n.label);
  const b = neighborsAt(idx, entityId, j).slice(0, kk).map((n) => n.label);
  if (a.length === 0 || b.length === 0) return null;
  return diffLists(a, b, kk);
}

// ── Zeiträume (Wandel-Ranking) ──────────────────────────────────────────────

/** Zeitraum als Bereich von Scheiben-Indizes, beide Enden einschließlich. */
export interface Period {
  from: number;
  to: number;
}

/** Standard: vor der Zäsur gegen ab der Zäsur; ohne Zäsur die zwei Hälften. */
export function defaultPeriods(idx: IndexedBundle): { a: Period; b: Period } {
  const n = idx.sliceCount;
  const cut =
    idx.shiftSliceIndex !== null && idx.shiftSliceIndex > 0 && idx.shiftSliceIndex < n
      ? idx.shiftSliceIndex
      : Math.max(1, Math.floor(n / 2));
  return { a: { from: 0, to: cut - 1 }, b: { from: cut, to: n - 1 } };
}

/** Indizes eines Zeitraums, auf die gültigen Scheiben geklemmt. */
function periodIndices(idx: IndexedBundle, p: Period): number[] {
  const lo = Math.max(0, Math.min(p.from, p.to));
  const hi = Math.min(idx.sliceCount - 1, Math.max(p.from, p.to));
  const out: number[] = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  return out;
}

export interface PooledList {
  /** Top-k-Labels des Zeitraums, bester zuerst. */
  labels: string[];
  /** Belegte Scheiben, die in die Liste eingeflossen sind. */
  used: number;
  /** Scheiben im Zeitraum insgesamt. */
  total: number;
}

/**
 * Eine Nachbarliste für einen ganzen Zeitraum. Gonen et al. trainieren je
 * Korpus ein Modell; hier liegen nur Listen je Scheibe vor, also werden sie per
 * **Rangpunkten (Borda)** zusammengelegt: in einer Liste der Länge L bekommt
 * Rang r (ab 0) L − r Punkte, summiert über die belegten Scheiben. Jede Scheibe
 * hat dabei gleiches Gewicht — ein einzelnes vielbelegtes Halbjahr soll den
 * Zeitraum nicht allein bestimmen. Gleichstand: bester Einzelrang zuerst.
 */
export function pooledNeighbors(
  idx: IndexedBundle,
  entityId: string,
  period: Period,
  k: number,
): PooledList {
  const indices = periodIndices(idx, period);
  const used = indices.filter(
    (i) => entityFreqAt(idx, entityId, i) > 0 && neighborsAt(idx, entityId, i).length > 0,
  );
  return { labels: pooledFrom(idx, entityId, used, k), used: used.length, total: indices.length };
}

/** Borda-Pooling über die gegebenen (belegten) Scheiben. */
function pooledFrom(idx: IndexedBundle, entityId: string, indices: number[], k: number): string[] {
  const points = new Map<string, number>();
  const best = new Map<string, number>();
  for (const i of indices) {
    const list = neighborsAt(idx, entityId, i);
    const L = list.length;
    list.forEach((n, r) => {
      points.set(n.label, (points.get(n.label) ?? 0) + (L - r));
      best.set(n.label, Math.min(best.get(n.label) ?? Infinity, r));
    });
  }
  return [...points.keys()]
    .sort((x, y) => points.get(y)! - points.get(x)! || best.get(x)! - best.get(y)!)
    .slice(0, effectiveK(idx, k));
}

/**
 * Grundrauschen eines Zeitraums als **Split-Half-Überlappung**: die belegten
 * Scheiben abwechselnd auf zwei Hälften verteilt, jede Hälfte wie oben gepoolt,
 * dann verglichen. Abwechselnd statt vorne/hinten, damit ein Trend innerhalb
 * des Zeitraums nicht als Rauschen zählt.
 *
 * Warum nicht einfach Scheibe gegen Scheibe: A↔B vergleicht *gepoolte* Listen,
 * und Pooling glättet. Einzelscheiben schwanken stärker, die Referenz läge
 * systematisch zu tief und jeder Vergleich sähe stabil aus. So stehen auf
 * beiden Seiten gepoolte Listen. `NaN` bei < 2 belegten Scheiben.
 */
export function withinOverlap(
  idx: IndexedBundle,
  entityId: string,
  period: Period,
  k: number,
): number {
  const used = periodIndices(idx, period).filter(
    (i) => entityFreqAt(idx, entityId, i) > 0 && neighborsAt(idx, entityId, i).length > 0,
  );
  if (used.length < 2) return NaN;
  const even = pooledFrom(idx, entityId, used.filter((_, n) => n % 2 === 0), k);
  const odd = pooledFrom(idx, entityId, used.filter((_, n) => n % 2 === 1), k);
  return overlap(new Set(even), new Set(odd));
}

export interface ChangeRow {
  entityId: string;
  label: string;
  /** Überlappung der gepoolten Listen A ↔ B; `NaN`, wenn ein Zeitraum leer ist. */
  between: number;
  withinA: number;
  withinB: number;
  a: PooledList;
  b: PooledList;
  diff: NeighborDiff | null;
}

/**
 * Wandel-Ranking nach Gonen et al.: je Zielwort die Überlappung der Nachbarn
 * zweier Zeiträume, aufsteigend sortiert (am stärksten verändert zuerst).
 * Wörter ohne Beleg in einem der Zeiträume stehen am Ende.
 */
export function buildChangeRanking(
  idx: IndexedBundle,
  entityIds: readonly string[],
  periodA: Period,
  periodB: Period,
  k: number,
): ChangeRow[] {
  const kk = effectiveK(idx, k);
  const rows = entityIds.map((entityId): ChangeRow => {
    const track = idx.tracks.find((t) => t.entity.id === entityId);
    const a = pooledNeighbors(idx, entityId, periodA, kk);
    const b = pooledNeighbors(idx, entityId, periodB, kk);
    const diff = a.labels.length > 0 && b.labels.length > 0 ? diffLists(a.labels, b.labels, kk) : null;
    return {
      entityId,
      label: track?.entity.label ?? entityId,
      between: diff ? diffOverlap(diff) : NaN,
      withinA: withinOverlap(idx, entityId, periodA, kk),
      withinB: withinOverlap(idx, entityId, periodB, kk),
      a,
      b,
      diff,
    };
  });
  return rows.sort((x, y) => {
    const fx = Number.isFinite(x.between);
    const fy = Number.isFinite(y.between);
    if (fx !== fy) return fx ? -1 : 1;
    return fx ? x.between - y.between : 0;
  });
}
