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

/** Top-k-Labels je belegter Scheibe eines Zeitraums (Scheiben ohne Beleg oder Liste fallen weg). */
function periodLists(idx: IndexedBundle, entityId: string, period: Period, k: number): string[][] {
  const lists: string[][] = [];
  for (const i of periodIndices(idx, period)) {
    if (entityFreqAt(idx, entityId, i) <= 0) continue;
    const list = neighborsAt(idx, entityId, i);
    if (list.length > 0) lists.push(list.slice(0, k).map((n) => n.label));
  }
  return lists;
}

/**
 * Eine Nachbarliste für einen ganzen Zeitraum. Gonen et al. trainieren je
 * Korpus ein Modell; hier liegen nur Listen je Scheibe vor, also werden sie per
 * **Rangpunkten (Borda)** zusammengelegt: jede Liste wird auf die ersten k
 * gekürzt, Rang r (ab 0) bekommt k − r Punkte, summiert über die belegten
 * Scheiben. Jede Scheibe hat dabei gleiches Gewicht — ein einzelnes
 * vielbelegtes Halbjahr soll den Zeitraum nicht allein bestimmen. Gleichstand:
 * bester Einzelrang zuerst.
 *
 * Gekürzt wird vor dem Zählen, damit das Ergebnis nur von den Top-k abhängt
 * und nicht davon, wie lang die gelieferten Listen sind (150 im Bundle, 1000
 * aus der Abfrage) — sonst gäben dieselben Filter mit und ohne Backend
 * verschiedene Rankings.
 */
export function pooledNeighbors(
  idx: IndexedBundle,
  entityId: string,
  period: Period,
  k: number,
): PooledList {
  const kk = effectiveK(idx, k);
  const lists = periodLists(idx, entityId, period, kk);
  return { labels: pooledFrom(lists, kk), used: lists.length, total: periodIndices(idx, period).length };
}

/** Borda-Pooling über Listen, die schon auf k gekürzt sind. */
function pooledFrom(lists: readonly string[][], k: number): string[] {
  const points = new Map<string, number>();
  const best = new Map<string, number>();
  for (const list of lists) {
    list.forEach((label, r) => {
      points.set(label, (points.get(label) ?? 0) + (k - r));
      best.set(label, Math.min(best.get(label) ?? Infinity, r));
    });
  }
  return [...points.keys()]
    .sort((x, y) => points.get(y)! - points.get(x)! || best.get(x)! - best.get(y)!)
    .slice(0, k);
}

/**
 * Binnen-Überlappung eines Zeitraums (**Split-Half**): die belegten Scheiben
 * abwechselnd auf zwei Hälften verteilt, jede Hälfte gepoolt, dann verglichen.
 * Beschreibt, wie stabil das Umfeld *innerhalb* des Zeitraums ist. Als
 * Vergleichsmaß für A ↔ B taugt sie nicht: die Hälften poolen nur halb so viele
 * Scheiben und schwanken deshalb stärker (s. `splitBaseline`). `NaN` bei < 2
 * belegten Scheiben.
 */
export function withinOverlap(
  idx: IndexedBundle,
  entityId: string,
  period: Period,
  k: number,
): number {
  const kk = effectiveK(idx, k);
  const lists = periodLists(idx, entityId, period, kk);
  if (lists.length < 2) return NaN;
  const even = pooledFrom(lists.filter((_, n) => n % 2 === 0), kk);
  const odd = pooledFrom(lists.filter((_, n) => n % 2 === 1), kk);
  return overlap(new Set(even), new Set(odd));
}

/** Höchstzahl der Aufteilungen für `splitBaseline`; darunter wird vollständig aufgezählt. */
export const BASELINE_SPLITS = 64;

/** Kleiner deterministischer Zufallsgenerator (mulberry32) — gleiche Daten, gleiche Zahl. */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Anzahl der Teilmengen der Größe r aus n, gekappt bei `cap + 1`. */
function choose(n: number, r: number, cap: number): number {
  let c = 1;
  for (let i = 1; i <= r; i++) {
    c = (c * (n - r + i)) / i;
    if (c > cap) return cap + 1;
  }
  return Math.round(c);
}

/** Alle Teilmengen {0…n−1} der Größe r (nur für kleine Anzahlen aufgerufen). */
function combinations(n: number, r: number): number[][] {
  const out: number[][] = [];
  const pick: number[] = [];
  const rec = (start: number) => {
    if (pick.length === r) {
      out.push([...pick]);
      return;
    }
    for (let i = start; i <= n - (r - pick.length); i++) {
      pick.push(i);
      rec(i + 1);
      pick.pop();
    }
  };
  rec(0);
  return out;
}

/**
 * Grundrauschen für A ↔ B als **Permutations-Baseline**: die belegten Scheiben
 * beider Zeiträume werden ohne Rücksicht auf ihre Zugehörigkeit auf zwei
 * Gruppen verteilt, so groß wie A und B, beide gepoolt und verglichen —
 * Mittelwert über alle Aufteilungen (bis `BASELINE_SPLITS`, sonst eine feste
 * Zufallsauswahl). Das ist die Überlappung, die ohne Unterschied zwischen A und
 * B zu erwarten wäre, bei **derselben Pooling-Tiefe** wie der echte Vergleich.
 * Eine Split-Half-Referenz innerhalb der Zeiträume poolt nur halb so viele
 * Scheiben, liegt deshalb systematisch zu tief und ließe Wandel kleiner
 * erscheinen. `NaN`, wenn ein Zeitraum leer ist.
 */
export function splitBaseline(
  listsA: readonly string[][],
  listsB: readonly string[][],
  k: number,
  maxSplits: number = BASELINE_SPLITS,
): number {
  const all = [...listsA, ...listsB];
  const n = all.length;
  const r = listsA.length;
  if (r === 0 || listsB.length === 0) return NaN;

  // Labels → Ganzzahlen: hier wird bis zu BASELINE_SPLITS-mal gepoolt, das
  // muss ohne Map-Zugriffe und Vergleichsfunktionen auskommen.
  const ids = new Map<string, number>();
  const encoded = all.map((list) =>
    Int32Array.from(list.slice(0, k), (label) => {
      let id = ids.get(label);
      if (id === undefined) {
        id = ids.size;
        ids.set(label, id);
      }
      return id;
    }),
  );
  const V = ids.size;
  const points = new Float64Array(V);
  const best = new Int32Array(V);
  const inA = new Uint8Array(V);

  /** Borda wie `pooledFrom`, Ergebnis als IDs; Gleichstand: bester Rang, dann ID. */
  const pool = (members: number[]): Int32Array => {
    points.fill(0);
    best.fill(k);
    for (const m of members) {
      const list = encoded[m];
      for (let rank = 0; rank < list.length; rank++) {
        const id = list[rank];
        points[id] += k - rank;
        if (rank < best[id]) best[id] = rank;
      }
    }
    // Ein Sortierschlüssel je Label (Punkte, dann Rang, dann ID), ganzzahlig
    // und < 2^53, damit die native Sortierung von Float64Array reicht.
    const keys: number[] = [];
    for (let id = 0; id < V; id++) {
      if (points[id] > 0) keys.push((points[id] * (k + 1) + (k - best[id])) * V + (V - 1 - id));
    }
    const sorted = Float64Array.from(keys).sort();
    const take = Math.min(k, sorted.length);
    const top = new Int32Array(take);
    for (let i = 0; i < take; i++) top[i] = V - 1 - (sorted[sorted.length - 1 - i] % V);
    return top;
  };

  const value = (groupA: Set<number>) => {
    const a: number[] = [];
    const b: number[] = [];
    for (let i = 0; i < n; i++) (groupA.has(i) ? a : b).push(i);
    const topA = pool(a);
    const topB = pool(b);
    const denom = Math.min(topA.length, topB.length);
    if (denom === 0) return NaN;
    inA.fill(0);
    for (const id of topA) inA[id] = 1;
    let shared = 0;
    for (const id of topB) shared += inA[id];
    return shared / denom;
  };

  let sum = 0;
  let count = 0;
  const add = (v: number) => {
    if (Number.isFinite(v)) {
      sum += v;
      count++;
    }
  };
  if (choose(n, r, maxSplits) <= maxSplits) {
    for (const combo of combinations(n, r)) add(value(new Set(combo)));
  } else {
    const rand = seededRandom(n * 7919 + r);
    const order = all.map((_, i) => i);
    for (let s = 0; s < maxSplits; s++) {
      // Teilweises Fisher-Yates: die ersten r Positionen sind eine Zufallsauswahl
      for (let i = 0; i < r; i++) {
        const j = i + Math.floor(rand() * (n - i));
        [order[i], order[j]] = [order[j], order[i]];
      }
      add(value(new Set(order.slice(0, r))));
    }
  }
  return count > 0 ? sum / count : NaN;
}

export interface ChangeRow {
  entityId: string;
  label: string;
  /** Überlappung der gepoolten Listen A ↔ B; `NaN`, wenn ein Zeitraum leer ist. */
  between: number;
  /** Erwartete Überlappung ohne Unterschied zwischen A und B (`splitBaseline`). */
  baseline: number;
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
    const listsA = periodLists(idx, entityId, periodA, kk);
    const listsB = periodLists(idx, entityId, periodB, kk);
    const a: PooledList = { labels: pooledFrom(listsA, kk), used: listsA.length, total: periodIndices(idx, periodA).length };
    const b: PooledList = { labels: pooledFrom(listsB, kk), used: listsB.length, total: periodIndices(idx, periodB).length };
    const diff = a.labels.length > 0 && b.labels.length > 0 ? diffLists(a.labels, b.labels, kk) : null;
    return {
      entityId,
      label: track?.entity.label ?? entityId,
      between: diff ? diffOverlap(diff) : NaN,
      baseline: diff ? splitBaseline(listsA, listsB, kk) : NaN,
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
