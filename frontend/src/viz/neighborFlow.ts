/**
 * Aufbereitung des `neighbors`-Blocks zu einem **Nachbarschafts-Fluss**: wie
 * sich die Top-k-Nachbarn eines Zielworts über die Zeitscheiben ablösen.
 *
 * Warum das eine eigene Ansicht verdient: Vektoren und Matrizen sagen, *dass*
 * sich ein Wort verschoben hat — die Nachbarschaft sagt **wohin, in Wörtern**.
 * Das ist der Teil der Analyse, den man zitieren kann („‚Drohne' steht ab 2022
 * neben Frontlinie und Angriffskrieg statt neben Hobby und Fernsteuerung").
 *
 * Zwei Regeln, die hier durchgesetzt werden:
 *
 * 1. **Rang ist die Reihenfolge im Bundle, nicht `score`.** Die Liste kommt
 *    sortiert aus der Datenproduktion; ein Nachsortieren nach `score` würde bei
 *    fehlendem oder anders normiertem Score stillschweigend eine andere
 *    Reihenfolge behaupten. `score` wird nur angezeigt.
 * 2. **`freq == 0` blendet die Scheibe aus**, auch wenn das Bundle dort
 *    Nachbarn mitliefert. Ein Wort, das im Korpus nicht vorkommt, hat keine
 *    Nachbarn — dieselbe Regel wie bei Trajektorien, Matrix und Kurven.
 */
import type { IndexedBundle } from "../data/model";
import { anchorForLabel, entityFreqAt, neighborsAt } from "../data/model";

export interface FlowPoint {
  sliceIndex: number;
  /** 1 = nächster Nachbar. */
  rank: number;
  score: number | null;
}

export interface FlowLabel {
  label: string;
  group: string | null;
  /** Farbslot: Position in `NeighborFlow.groups`. */
  groupIndex: number;
  /** Alle Vorkommen, aufsteigend nach Zeitscheibe. */
  points: FlowPoint[];
  /** Zusammenhängende Läufe — jeder wird als eigenes Liniensegment gezeichnet.
   * Eine Lücke heißt: der Nachbar war zwischendurch nicht in den Top-k. */
  runs: FlowPoint[][];
  firstIndex: number;
  lastIndex: number;
  /** In wie vielen Zeitscheiben der Nachbar in den Top-k war. */
  count: number;
  /** Bester (kleinster) erreichter Rang. */
  bestRank: number;
  /** Gibt es zu diesem Label einen Anker im Bundle? (sonst nur Text) */
  matchedAnchor: boolean;
}

export interface NeighborFlow {
  entityId: string;
  entityLabel: string;
  /** Größte vorkommende Listenlänge = Höhe der Rangachse. */
  k: number;
  labels: FlowLabel[];
  /** Je Zeitscheibe: belegt (freq>0) UND Nachbarn vorhanden? */
  slicePresent: boolean[];
  presentCount: number;
  /** Gruppenreihenfolge = Anker-Cluster zuerst, dann zusätzliche Gruppen. */
  groups: string[];
  /** Anteil der Top-k, der gegenüber der Vorscheibe neu ist; `null`, wo einer
   * der beiden Nachbarlisten fehlt. */
  turnover: (number | null)[];
}

/**
 * Gruppenreihenfolge über das ganze Bundle.
 *
 * Beginnt mit den Anker-Clustern in ihrer bestehenden Reihenfolge, damit eine
 * Gruppe hier denselben Farbslot bekommt wie ihr Anker-Cluster im 3D-Raum.
 * Gruppen, die nur in `neighbors` vorkommen (z.B. `ZIELWORT`), hängen sortiert
 * hinten an — deterministisch, damit Farben zwischen Sitzungen stabil sind.
 */
export function neighborGroups(idx: IndexedBundle): string[] {
  const extra = new Set<string>();
  for (const perSlice of Object.values(idx.neighbors)) {
    for (const list of Object.values(perSlice)) {
      for (const n of list) {
        if (n.group && !idx.clusters.includes(n.group)) extra.add(n.group);
      }
    }
  }
  return [...idx.clusters, ...[...extra].sort()];
}

/** Zerlegt Vorkommen in zusammenhängende Läufe (Lücke = nicht in den Top-k). */
function splitRuns(points: FlowPoint[]): FlowPoint[][] {
  const runs: FlowPoint[][] = [];
  let run: FlowPoint[] = [];
  for (const p of points) {
    const prev = run[run.length - 1];
    if (prev && p.sliceIndex !== prev.sliceIndex + 1) {
      runs.push(run);
      run = [];
    }
    run.push(p);
  }
  if (run.length > 0) runs.push(run);
  return runs;
}

/**
 * @param limit Höchstens so viele Ränge je Zeitscheibe (der k-Regler). Ohne
 *   Grenze nähme der Fluss die volle Listenlänge als Rangachse — bei Abfragen
 *   mit k = 1000 also 1000 Ränge.
 */
export function buildNeighborFlow(
  idx: IndexedBundle,
  entityId: string,
  limit: number = Infinity,
): NeighborFlow | null {
  const track = idx.tracks.find((t) => t.entity.id === entityId);
  if (!track) return null;

  const groups = neighborGroups(idx);
  const groupIndex = new Map(groups.map((g, i) => [g, i]));
  const n = idx.sliceCount;

  const byLabel = new Map<string, FlowPoint[]>();
  const meta = new Map<string, { group: string | null }>();
  const setPerSlice: (Set<string> | null)[] = new Array(n).fill(null);
  const slicePresent: boolean[] = new Array(n).fill(false);
  let k = 0;

  for (let i = 0; i < n; i++) {
    if (entityFreqAt(idx, entityId, i) <= 0) continue; // Regel 2
    const list = neighborsAt(idx, entityId, i).slice(0, Math.max(0, limit));
    if (list.length === 0) continue;
    slicePresent[i] = true;
    k = Math.max(k, list.length);
    const names = new Set<string>();
    list.forEach((nb, rank) => {
      names.add(nb.label);
      if (!meta.has(nb.label)) meta.set(nb.label, { group: nb.group ?? null });
      const points = byLabel.get(nb.label) ?? [];
      points.push({
        sliceIndex: i,
        rank: rank + 1, // Regel 1
        score: typeof nb.score === "number" ? nb.score : null,
      });
      byLabel.set(nb.label, points);
    });
    setPerSlice[i] = names;
  }

  const turnover: (number | null)[] = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    const cur = setPerSlice[i];
    const prev = setPerSlice[i - 1];
    if (!cur || !prev || cur.size === 0) continue;
    let fresh = 0;
    for (const name of cur) if (!prev.has(name)) fresh++;
    turnover[i] = fresh / cur.size;
  }

  const labels: FlowLabel[] = [...byLabel.entries()].map(([label, points]) => {
    const group = meta.get(label)?.group ?? null;
    return {
      label,
      group,
      groupIndex: group !== undefined && group !== null ? (groupIndex.get(group) ?? -1) : -1,
      points,
      runs: splitRuns(points),
      firstIndex: points[0].sliceIndex,
      lastIndex: points[points.length - 1].sliceIndex,
      count: points.length,
      bestRank: Math.min(...points.map((p) => p.rank)),
      matchedAnchor: !!anchorForLabel(idx, label),
    };
  });

  // Reihenfolge: bester Rang zuerst, dann Dauer — die prägenden Nachbarn oben
  // in der Tabelle, ohne die Zeichnung zu beeinflussen (die hängt am Rang).
  labels.sort((a, b) => a.bestRank - b.bestRank || b.count - a.count || a.label.localeCompare(b.label));

  return {
    entityId,
    entityLabel: track.entity.label ?? entityId,
    k: Math.max(1, k),
    labels,
    slicePresent,
    presentCount: slicePresent.reduce<number>((acc, p) => acc + (p ? 1 : 0), 0),
    groups,
    turnover,
  };
}
