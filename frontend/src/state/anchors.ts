/**
 * Anker der Sitzung: Arbeitsliste der Seite „Anker“.
 *
 * Geladen werden die Anker des Bundles; ergänzt, entfernt und umbenannt wird
 * nur für diese Sitzung. Das Bundle bleibt unverändert, gespeichert wird
 * nichts — ein neu geladenes Bundle (oder ein Neuladen der Seite) beginnt
 * wieder mit seinen eigenen Ankern. Wer eine Liste behalten will, exportiert
 * sie.
 *
 * Die Arbeitsliste liegt im indizierten Bundle (`indexed.anchors`, eingesetzt
 * über `withAnchors`), damit alle Ansichten sie ohne eigenes Abonnement sehen.
 * Gerechnet wird nichts: ein Anker braucht nur eine Position, und die kommt
 * aus dem Wortbestand des Bundles (`anchorCatalog`).
 */
import type { NeighborCandidates } from "../data/apiClient";
import { anchorKey, anchorLemma, withAnchors, type IndexedBundle } from "../data/model";
import type { Anchor, Coords3d } from "../types/schema";
import { useViz } from "./store";

/** Cluster eines neuen Ankers, solange keiner vergeben ist (wie `anchorSchema`). */
export const DEFAULT_CLUSTER = "_";

/** Ein Wort, das Anker werden kann: es hat eine Position im Bild. */
export interface CatalogWord {
  lemma: string;
  /** Anzeigeform; bei Ankern des Bundles deren Label, sonst das Lemma. */
  label: string;
  coords: Coords3d;
  /** Cluster, falls das Wort im Bundle Anker ist. */
  cluster?: string;
  source: "anchor" | "candidate" | "vocab";
}

// ---------------------------------------------------------------------------
// Reine Hilfsfunktionen (getestet in anchors.test.ts)
// ---------------------------------------------------------------------------

/**
 * Alle Wörter mit Position, je Lemma einmal: die Anker des Bundles, die
 * Kandidaten des Suchraums (falls geladen) und `vocab_points`. Kandidaten mit
 * eigener Zeitscheibe (SGNS) fehlen — ein Anker ist ein fester Punkt, ihre
 * Position gilt aber nur in einer Scheibe.
 */
export function anchorCatalog(
  bundleAnchors: Anchor[],
  candidates: Pick<NeighborCandidates, "lemma" | "coords_3d" | "slice"> | null,
  vocabPoints: { label: string; coords_3d: number[] }[],
): CatalogWord[] {
  const byLemma = new Map<string, CatalogWord>();
  const labels = new Set<string>();
  const add = (w: CatalogWord) => {
    if (byLemma.has(w.lemma) || labels.has(w.label)) return;
    byLemma.set(w.lemma, w);
    labels.add(w.label);
  };
  for (const a of bundleAnchors) {
    add({ lemma: anchorKey(a), label: a.label, coords: a.coords_3d as Coords3d, cluster: a.cluster, source: "anchor" });
  }
  if (candidates) {
    candidates.lemma.forEach((lemma, i) => {
      if (candidates.slice?.[i] != null) return;
      add({ lemma, label: lemma, coords: candidates.coords_3d[i], source: "candidate" });
    });
  }
  for (const v of vocabPoints) {
    add({ lemma: v.label, label: v.label, coords: v.coords_3d as Coords3d, source: "vocab" });
  }
  return [...byLemma.values()];
}

/**
 * Suche im Wortbestand: Lemma oder Label enthält die Eingabe (ohne
 * Groß-/Kleinschreibung). Reihenfolge: exakt, dann Wortanfang, dann der Rest,
 * jeweils alphabetisch.
 */
export function searchCatalog(catalog: CatalogWord[], query: string, limit: number): CatalogWord[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const rank = (w: CatalogWord): number => {
    const l = w.lemma.toLowerCase();
    const b = w.label.toLowerCase();
    if (l === q || b === q) return 0;
    if (l.startsWith(q) || b.startsWith(q)) return 1;
    if (l.includes(q) || b.includes(q)) return 2;
    return -1;
  };
  return catalog
    .map((w) => ({ w, r: rank(w) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.w.lemma.localeCompare(b.w.lemma, "de"))
    .slice(0, limit)
    .map((x) => x.w);
}

/** Anker aus einem Wort des Bestands; Label und Cluster wie im Bundle, sonst Lemma und `_`. */
export function anchorFromWord(w: CatalogWord, label?: string, cluster?: string): Anchor {
  return {
    label: label?.trim() || w.label,
    cluster: cluster?.trim() || w.cluster || DEFAULT_CLUSTER,
    lemma: w.lemma,
    coords_3d: w.coords,
  };
}

/** Anker anhängen, die weder nach Lemma noch nach Label schon in der Liste stehen. */
export function addAnchors(list: Anchor[], add: Anchor[]): Anchor[] {
  const keys = new Set(list.map(anchorKey));
  const labels = new Set(list.map((a) => a.label));
  const out = [...list];
  for (const a of add) {
    if (keys.has(anchorKey(a)) || labels.has(a.label)) continue;
    keys.add(anchorKey(a));
    labels.add(a.label);
    out.push(a);
  }
  return out;
}

/** Unterschied der Arbeitsliste zu den Ankern des Bundles (Abgleich über Lemma). */
export function anchorDiff(
  working: Anchor[],
  shipped: Anchor[],
): { added: Anchor[]; removed: Anchor[]; changed: Anchor[] } {
  const w = new Map(working.map((a) => [anchorKey(a), a]));
  const s = new Map(shipped.map((a) => [anchorKey(a), a]));
  return {
    added: working.filter((a) => !s.has(anchorKey(a))),
    removed: shipped.filter((a) => !w.has(anchorKey(a))),
    changed: working.filter((a) => {
      const o = s.get(anchorKey(a));
      return o !== undefined && (o.label !== a.label || o.cluster !== a.cluster);
    }),
  };
}

const HEADER = ["lemma", "label", "cluster"];

/** Exportdatei: Tabulator-getrennt, Kopfzeile `lemma label cluster`. */
export function anchorFileText(anchors: Anchor[], bundleName: string): string {
  const clean = (s: string) => s.replace(/[\t\r\n]+/g, " ");
  return [
    `# Anker (${bundleName})`,
    "# Tabulator-getrennt. Positionen kommen beim Import aus dem Bundle; Zeilen mit # werden ignoriert.",
    HEADER.join("\t"),
    ...anchors.map((a) => [anchorKey(a), a.label, a.cluster].map(clean).join("\t")),
    "",
  ].join("\n");
}

export interface AnchorRow {
  lemma: string;
  label?: string;
  cluster?: string;
}

/**
 * Importdatei lesen: je Zeile `lemma`, optional `label` und `cluster`.
 * Trennzeichen Tabulator, sonst Semikolon oder Komma (wie in der ersten
 * Datenzeile gefunden). Eine Kopfzeile, die mit `lemma` beginnt, wird
 * übersprungen; `#` leitet Kommentare ein. Eine Zeile mit nur einem Wort
 * (Wortliste) geht auch.
 */
export function parseAnchorText(text: string): AnchorRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^﻿/, ""))
    .filter((l) => l.trim() !== "" && !l.trim().startsWith("#"));
  if (lines.length === 0) return [];
  const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : lines[0].includes(",") ? "," : "\t";
  const rows: AnchorRow[] = [];
  lines.forEach((line, i) => {
    const cells = line.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, "$1"));
    if (i === 0 && cells[0].toLowerCase() === "lemma") return;
    if (!cells[0]) return;
    rows.push({ lemma: cells[0], label: cells[1] || undefined, cluster: cells[2] || undefined });
  });
  return rows;
}

/**
 * Importierte Zeilen in Anker übersetzen. Gesucht wird über das Lemma, ohne
 * Treffer über das Label; Wörter ohne Position im Bundle werden gemeldet,
 * nicht übernommen.
 */
export function resolveAnchorRows(
  rows: AnchorRow[],
  catalog: CatalogWord[],
): { anchors: Anchor[]; missing: string[] } {
  const byLemma = new Map(catalog.map((w) => [w.lemma, w]));
  const byLabel = new Map(catalog.map((w) => [w.label, w]));
  const anchors: Anchor[] = [];
  const missing: string[] = [];
  for (const r of rows) {
    const w = byLemma.get(r.lemma) ?? byLabel.get(r.lemma);
    if (w) anchors.push(anchorFromWord(w, r.label, r.cluster));
    else missing.push(r.lemma);
  }
  return { anchors: addAnchors([], anchors), missing };
}

// ---------------------------------------------------------------------------
// Aktionen auf dem indizierten Bundle
// ---------------------------------------------------------------------------

function setAnchors(update: (current: Anchor[], idx: IndexedBundle) => Anchor[]) {
  useViz.setState((s) => (s.indexed ? { indexed: withAnchors(s.indexed, update(s.indexed.anchors, s.indexed)) } : {}));
}

export const anchorActions = {
  add: (anchors: Anchor[]) => setAnchors((cur) => addAnchors(cur, anchors)),
  remove: (key: string) => setAnchors((cur) => cur.filter((a) => anchorKey(a) !== key)),
  /** Label oder Cluster eines Ankers ändern; ein schon vergebenes Label wird abgelehnt. */
  edit: (key: string, patch: { label?: string; cluster?: string }): string | null => {
    const idx = useViz.getState().indexed;
    if (!idx) return null;
    const label = patch.label?.trim();
    if (patch.label !== undefined && !label) return "Das Label darf nicht leer sein.";
    if (label && idx.anchors.some((a) => a.label === label && anchorKey(a) !== key)) {
      return `„${label}“ ist schon das Label eines anderen Ankers.`;
    }
    const cluster = patch.cluster !== undefined ? patch.cluster.trim() || DEFAULT_CLUSTER : undefined;
    setAnchors((cur) =>
      cur.map((a) =>
        anchorKey(a) === key
          ? { ...a, ...(label ? { label } : {}), ...(cluster ? { cluster } : {}), lemma: anchorLemma(a) ?? key }
          : a,
      ),
    );
    return null;
  },
  replace: (anchors: Anchor[]) => setAnchors(() => addAnchors([], anchors)),
  clear: () => setAnchors(() => []),
  /** Zurück auf die Anker des Bundles (dieselbe Referenz: Nachbarn wieder wie geliefert). */
  reset: () => setAnchors((_cur, idx) => idx.bundle.anchors),
};
