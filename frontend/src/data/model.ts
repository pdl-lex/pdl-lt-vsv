/**
 * Aufbereitung eines validierten Bundles in eine render-fertige Struktur.
 *
 * Hier passiert alles Domänenunabhängige einmalig beim Laden: Zeitscheiben
 * sortieren, Aggregat-Trajektorien je Entity bauen, gemeinsame Bounding-Box für
 * Auto-Framing berechnen, Konfidenz-Normierung (freq-Maxima) und Lookups für
 * Nachbarschaften/Anker. Die 3D-Komponenten arbeiten nur noch mit `IndexedBundle`.
 */
import type { Anchor, Bundle, Cell, Coords3d, Entity, Neighbor, Neighbors, TimeSlice, VocabPoint } from "../types/schema";
import type { NeighborCandidates, NeighborQueryResult } from "./apiClient";

/** Ein Aggregat-Sample einer Entity zu einer Zeitscheibe. */
export interface TrackSample {
  sliceIndex: number;
  sliceId: string;
  coords: Coords3d;
  freq: number;
  sentiment: number | null;
  /** Voller Vektor im gemeinsamen Raum, falls das Bundle ihn mitliefert.
   * Referenz auf das Bundle-Array (keine Kopie) – Grundlage der
   * Ähnlichkeitsrechnung in `viz/similarity.ts`. */
  vector: number[] | undefined;
  /** Gütemaße des Lieferanten, `null` wo nicht geliefert oder nicht messbar.
   * Auswertung ausschließlich über `viz/resolution.ts` — dort steht auch,
   * warum fehlend nicht "schlecht" heißen darf. */
  kontrast: number | null;
  generik: number | null;
}

/** Aggregat-Trajektorie einer Entity über die Zeitscheiben. */
export interface EntityTrack {
  entity: Entity;
  /** Ausgerichtet an `sortedSlices`; `undefined`, wo kein Aggregat existiert. */
  samples: (TrackSample | undefined)[];
  /** Zusammenhängende Läufe belegter (freq>0) Positionen – für die Pfadlinien. */
  segments: Coords3d[][];
}

/** Facettenaufgelöste Trajektorie einer Entity (eine je Facetten-Kombination). */
export interface FacetTrack {
  entityId: string;
  /** Stabile Serialisierung der Facetten, z.B. "publication=SZ". */
  facetKey: string;
  facets: Record<string, string>;
  /** Wert der Primär-Facette (facets_schema[0]) – für die Einfärbung. */
  primaryValueId: string | undefined;
  samples: (TrackSample | undefined)[];
  segments: Coords3d[][];
}

export interface IndexedBundle {
  bundle: Bundle;
  sortedSlices: TimeSlice[];
  sliceCount: number;
  sliceIndexById: Map<string, number>;
  /** Index der als Zäsur markierten Scheibe (`meta.shift_point`), sonst null. */
  shiftSliceIndex: number | null;

  tracks: EntityTrack[];
  /** Facettenaufgelöste Tracks je Entity-ID (aus `records`). */
  facetTracks: Map<string, FacetTrack[]>;
  /** ID der Primär-Facette (facets_schema[0]) für Einfärbung/Legende. */
  primaryFacetId: string | null;
  /** Wert-ID der Primär-Facette → Slot-Index (feste Reihenfolge aus dem Schema). */
  primaryValueIndex: Map<string, number>;
  /** Die Anker, die alle Ansichten zeigen. Anfangs die des Bundles; auf der
   * Seite „Anker“ für die Sitzung änderbar (`withAnchors`). Das Bundle selbst
   * bleibt unverändert (`bundle.anchors`). */
  anchors: Anchor[];
  /** Anker nach Label, **exakt** (mit Groß-/Kleinschreibung): ob ein Nachbar
   * ein Anker ist, entscheidet über Label, Cluster und Hervorhebung — im
   * Deutschen sind `Bedarf` und `bedarf` verschiedene Wörter. */
  anchorByLabel: Map<string, Anchor>;
  /** Koordinaten-Tabelle für Nachbarn, die kein Anker sind (s. `pointForLabel`).
   * Kein eigener Suchraum mehr — ausgewählt wird im vollen Vektorraum beim
   * Lieferanten, hier steht nur, wo die ausgewählten Wörter im Bild liegen.
   * Bewusst NICHT Teil der Framing-Bounding-Box: Ausreißer hier dürfen nicht
   * die Skalierung der ganzen Szene verändern. */
  vocabPoints: VocabPoint[];
  /** Label → Position, Anker und Vokabel-Punkte in einer Tabelle. Anker haben
   * Vorrang: kollidiert ein Vokabel-Label mit einer Anker-Anzeigeform (etwa
   * Anker `marode` mit Lemma `marod` neben dem eigenständigen Korpus-Lemma
   * `marode`), gewinnt der beschriftete Anker. Die Pipeline schließt solche
   * Kollisionen inzwischen aus; die Regel hier hält auch ältere Bundles heil.
   * Exakt, mit Groß-/Kleinschreibung. */
  pointByLabel: Map<string, Coords3d>;
  /** Rückfall für `pointForLabel`, nur wenn es keinen exakten Eintrag gibt:
   * dieselben Positionen nach kleingeschriebenem Label (erster Eintrag gewinnt).
   * Getrennt von `pointByLabel`, damit ein Alias nie ein anderes, exakt
   * vorhandenes Wort verdeckt (`bedarf` neben dem Anker `Bedarf`). Gebraucht für
   * Bundles, deren Nachbar-Labels anders geschrieben sind als ihre Punkte
   * (SGNS: Nachbar `Sicherheit`, Punkt `sicherheit`). */
  pointByLowerLabel: Map<string, Coords3d>;
  /** Positionen der Kandidaten mit eigener Zeitscheibe (SGNS-Suchraum):
   * Zeitscheiben-ID → Label → Position. Leer ohne solche Kandidaten. */
  slicePointByLabel: Map<string, Map<string, Coords3d>>;
  /** Die Nachbarlisten, die alle Ansichten zeigen (über `neighborsAt`).
   * Anfangs die vorberechneten aus dem Bundle; nach einer Nachbarabfrage mit
   * Filtern deren Ergebnis (`withQueriedNeighbors`). Das Bundle selbst bleibt
   * unverändert — es ist der Rückfall (`withBundleNeighbors`). */
  neighbors: Neighbors;
  /** Dieselben Listen vor der Zuordnung zu den Ankern der Sitzung: so, wie
   * Bundle bzw. Backend sie liefern (Label und Gruppe nach `bundle.anchors`).
   * Gleich `neighbors`, solange die Anker nicht geändert wurden. */
  baseNeighbors: Neighbors;
  /** Woher `neighbors` stammt: vorberechnet im Bundle oder aus einer Abfrage. */
  neighborSource: "bundle" | "query";
  /** Längste Nachbarliste in `neighbors` = Obergrenze des k-Reglers.
   * Ältere Bundles liefern 8, neue 150, Abfragen bis 1000 — der Regler richtet
   * sich danach, statt eine Zahl zu raten. */
  maxNeighborK: number;

  clusters: string[];

  /** Gemeinsame Projektion: Weltmittelpunkt (roh) und Skalierung für die Szene. */
  center: Coords3d;
  scale: number;

  /** freq-Maxima je Ebene für die Konfidenz-Normierung (Aggregate ≫ Records). */
  aggFreqMax: number;
  recordFreqMax: number;
}

// Zielradius der Punktwolke in Three.js-Welteinheiten. Exportiert, damit z.B.
// der Vokabel-Radius-Regler seine Obergrenze an der tatsächlichen
// Szenenausdehnung ausrichten kann, statt einen Wert zu raten.
export const WORLD_RADIUS = 6;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Sortiert Zeitscheiben nach `index` (stabil, defensiv gegen fehlende Werte). */
function sortSlices(slices: TimeSlice[]): TimeSlice[] {
  return [...slices].sort((a, b) => a.index - b.index);
}

/** Bounding-Box über eine Menge von coords → Mittelpunkt + Skalierung. */
function computeFraming(allCoords: Coords3d[]): { center: Coords3d; scale: number } {
  if (allCoords.length === 0) {
    return { center: [0, 0, 0], scale: 1 };
  }
  const min: Coords3d = [Infinity, Infinity, Infinity];
  const max: Coords3d = [-Infinity, -Infinity, -Infinity];
  for (const c of allCoords) {
    for (let k = 0; k < 3; k++) {
      if (c[k] < min[k]) min[k] = c[k];
      if (c[k] > max[k]) max[k] = c[k];
    }
  }
  const center: Coords3d = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  const radius =
    0.5 *
    Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], Number.EPSILON);
  return { center, scale: WORLD_RADIUS / radius };
}

/** Legt Zellen als Samples an die Zeitachse (undefined, wo keine Zelle existiert). */
function buildSamples(
  cells: Cell[],
  sliceIndexById: Map<string, number>,
  sliceCount: number,
): (TrackSample | undefined)[] {
  const samples: (TrackSample | undefined)[] = new Array(sliceCount).fill(undefined);
  for (const cell of cells) {
    const idx = sliceIndexById.get(cell.time_slice_id);
    if (idx === undefined) continue; // Zelle referenziert unbekannte Scheibe
    samples[idx] = {
      sliceIndex: idx,
      sliceId: cell.time_slice_id,
      coords: cell.coords_3d,
      freq: cell.freq ?? 1,
      sentiment: cell.sentiment ?? null,
      vector: cell.vector,
      kontrast: cell.kontrast ?? null,
      generik: cell.generik ?? null,
    };
  }
  return samples;
}

/** Pfadlinien nur zwischen aufeinanderfolgenden belegten (freq>0) Positionen.
 * Leere Zellen (freq==0) trennen die Linie: kein "Erfinden" von Bewegung. */
function buildSegments(samples: (TrackSample | undefined)[]): Coords3d[][] {
  const segments: Coords3d[][] = [];
  let run: Coords3d[] = [];
  for (const s of samples) {
    if (s && s.freq > 0) {
      run.push(s.coords);
    } else if (run.length > 0) {
      if (run.length > 1) segments.push(run);
      run = [];
    }
  }
  if (run.length > 1) segments.push(run);
  return segments;
}

function buildTrack(
  entity: Entity,
  cells: Cell[],
  sliceIndexById: Map<string, number>,
  sliceCount: number,
): EntityTrack {
  const samples = buildSamples(cells, sliceIndexById, sliceCount);
  return { entity, samples, segments: buildSegments(samples) };
}

/** Stabile Serialisierung einer Facetten-Kombination (Schlüssel sortiert). */
export function facetKeyOf(facets: Record<string, string>): string {
  return Object.keys(facets)
    .sort()
    .map((k) => `${k}=${facets[k]}`)
    .join("&");
}

/** Größte `freq` (mindestens 1), ohne Spread — der sprengt bei sehr vielen
 * Zellen die Argumentgrenze der JS-Engine. */
function maxFreq(cells: readonly Cell[]): number {
  let max = 1;
  for (const c of cells) {
    const f = c.freq ?? 1;
    if (f > max) max = f;
  }
  return max;
}

/** Position eintragen: exakt nur, wenn noch frei (frühere Einträge haben
 * Vorrang), kleingeschrieben nur in die Rückfall-Tabelle. */
function addPoint(
  exact: Map<string, Coords3d>,
  lower: Map<string, Coords3d>,
  label: string,
  coords: Coords3d,
): void {
  if (!exact.has(label)) exact.set(label, coords);
  const key = label.toLowerCase();
  if (!lower.has(key)) lower.set(key, coords);
}

/** Wandelt ein validiertes Bundle in die render-fertige Struktur. */
export function indexBundle(bundle: Bundle): IndexedBundle {
  const sortedSlices = sortSlices(bundle.time_slices);
  const sliceCount = sortedSlices.length;
  const sliceIndexById = new Map<string, number>();
  sortedSlices.forEach((s, i) => sliceIndexById.set(s.id, i));

  const shift = bundle.meta.shift_point;
  const shiftSliceIndex =
    shift && sliceIndexById.has(shift) ? sliceIndexById.get(shift)! : null;

  // Aggregate (facets={}) je Entity gruppieren.
  const aggByEntity = new Map<string, Cell[]>();
  for (const cell of bundle.aggregates) {
    const list = aggByEntity.get(cell.entity_id);
    if (list) list.push(cell);
    else aggByEntity.set(cell.entity_id, [cell]);
  }

  const tracks = bundle.entities.map((entity) =>
    buildTrack(entity, aggByEntity.get(entity.id) ?? [], sliceIndexById, sliceCount),
  );

  // Facettenaufgelöste Tracks: records nach (Entity, Facetten-Kombination) gruppieren.
  const primaryFacetId = bundle.facets_schema[0]?.id ?? null;
  const primaryValueIndex = new Map<string, number>();
  bundle.facets_schema[0]?.values.forEach((v, i) => primaryValueIndex.set(v.id, i));

  const recByEntity = new Map<string, Map<string, Cell[]>>();
  for (const rec of bundle.records) {
    let byFacet = recByEntity.get(rec.entity_id);
    if (!byFacet) {
      byFacet = new Map();
      recByEntity.set(rec.entity_id, byFacet);
    }
    const fk = facetKeyOf(rec.facets);
    const list = byFacet.get(fk);
    if (list) list.push(rec);
    else byFacet.set(fk, [rec]);
  }

  const facetTracks = new Map<string, FacetTrack[]>();
  for (const [entityId, byFacet] of recByEntity) {
    const list: FacetTrack[] = [];
    for (const [fk, cells] of byFacet) {
      const facets = cells[0].facets;
      const samples = buildSamples(cells, sliceIndexById, sliceCount);
      list.push({
        entityId,
        facetKey: fk,
        facets,
        primaryValueId: primaryFacetId ? facets[primaryFacetId] : undefined,
        samples,
        segments: buildSegments(samples),
      });
    }
    facetTracks.set(entityId, list);
  }

  const anchorByLabel = indexAnchors(bundle.anchors);
  const clusters = clustersOf(bundle.anchors);

  // Positions-Tabelle für die Nachbarlisten. Anker zuerst eintragen, damit sie
  // bei gleichem Text gewinnen (s. `pointByLabel` im Interface).
  const pointByLabel = new Map<string, Coords3d>();
  const pointByLowerLabel = new Map<string, Coords3d>();
  for (const a of bundle.anchors) addPoint(pointByLabel, pointByLowerLabel, a.label, a.coords_3d as Coords3d);
  for (const v of bundle.vocab_points) addPoint(pointByLabel, pointByLowerLabel, v.label, v.coords_3d as Coords3d);

  // Framing über alle sichtbaren Punkte (Anker + Aggregate + Records).
  const allCoords: Coords3d[] = [
    ...bundle.anchors.map((a) => a.coords_3d as Coords3d),
    ...bundle.aggregates.map((c) => c.coords_3d as Coords3d),
    ...bundle.records.map((c) => c.coords_3d as Coords3d),
  ];
  const { center, scale } = computeFraming(allCoords);

  const aggFreqMax = maxFreq(bundle.aggregates);
  const recordFreqMax = maxFreq(bundle.records);

  return {
    bundle,
    sortedSlices,
    sliceCount,
    sliceIndexById,
    shiftSliceIndex,
    tracks,
    facetTracks,
    primaryFacetId,
    primaryValueIndex,
    anchors: bundle.anchors,
    anchorByLabel,
    vocabPoints: bundle.vocab_points,
    pointByLabel,
    pointByLowerLabel,
    slicePointByLabel: new Map(),
    neighbors: bundle.neighbors,
    baseNeighbors: bundle.neighbors,
    neighborSource: "bundle",
    maxNeighborK: longestList(bundle.neighbors),
    clusters,
    center,
    scale,
    aggFreqMax,
    recordFreqMax,
  };
}

/** Roh-coords → Three.js-Weltkoordinaten (zentriert + skaliert). */
export function toWorld(idx: IndexedBundle, c: Coords3d): Coords3d {
  return [
    (c[0] - idx.center[0]) * idx.scale,
    (c[1] - idx.center[1]) * idx.scale,
    (c[2] - idx.center[2]) * idx.scale,
  ];
}

/** Interpolierte Roh-Position + freq eines Tracks beim kontinuierlichen Slider-Wert `t`.
 * Funktioniert für Aggregat- (EntityTrack) wie Facetten-Tracks (FacetTrack).
 *
 * Interpoliert wird nur zwischen zwei **belegten** Zellen (`freq > 0`). Eine
 * Zelle mit `freq == 0` zählt wie eine fehlende: ihre Koordinate ist ein
 * Platzhalter, auf den der Punkt sonst zuwandern würde — Bewegung, für die es
 * keine Daten gibt. Ist nur eine Seite belegt, gilt die nächstgelegene
 * Zeitscheibe (wie beim Runden für Nachbarn-Panel und Beleg-Anzeige): ist sie
 * unbelegt, gibt es keinen Punkt. */
export function sampleTrackAt(
  track: { samples: (TrackSample | undefined)[] },
  t: number,
): { coords: Coords3d; freq: number; sentiment: number | null; kontrast: number | null } | null {
  const n = track.samples.length;
  if (n === 0) return null;
  const clamped = Math.max(0, Math.min(t, n - 1));
  const i0 = Math.floor(clamped);
  const i1 = Math.min(i0 + 1, n - 1);
  const frac = clamped - i0;
  const belegt = (s: TrackSample | undefined) => (s && s.freq > 0 ? s : undefined);
  const s0 = belegt(track.samples[i0]);
  const s1 = belegt(track.samples[i1]);

  if (s0 && s1) {
    return {
      coords: [
        lerp(s0.coords[0], s1.coords[0], frac),
        lerp(s0.coords[1], s1.coords[1], frac),
        lerp(s0.coords[2], s1.coords[2], frac),
      ],
      freq: lerp(s0.freq, s1.freq, frac),
      sentiment:
        s0.sentiment !== null && s1.sentiment !== null
          ? lerp(s0.sentiment, s1.sentiment, frac)
          : (s1.sentiment ?? s0.sentiment),
      // Wie sentiment: nur interpolieren, wenn BEIDE Seiten gemessen sind,
      // sonst die vorhandene Seite nehmen. Interpolieren ist hier richtig,
      // obwohl kontrast je Scheibe gemessen wird - beim Scrubben soll der Punkt
      // weich abblenden, wenn er in ein unaufgelöstes Jahr läuft, statt zu
      // springen. Eine fehlende Messung darf dabei nicht als 0 durchschlagen.
      kontrast:
        s0.kontrast !== null && s1.kontrast !== null
          ? lerp(s0.kontrast, s1.kontrast, frac)
          : (s1.kontrast ?? s0.kontrast),
    };
  }
  const only = frac < 0.5 ? s0 : s1;
  return only
    ? { coords: only.coords, freq: only.freq, sentiment: only.sentiment, kontrast: only.kontrast }
    : null;
}

/** Vorberechnete Nachbarn eines Zielworts an einer (diskreten) Zeitscheibe. */
export function neighborsAt(
  idx: IndexedBundle,
  entityId: string | null,
  sliceIndex: number,
): Neighbor[] {
  if (!entityId) return [];
  const sliceId = idx.sortedSlices[sliceIndex]?.id;
  if (!sliceId) return [];
  return idx.neighbors[entityId]?.[sliceId] ?? [];
}

function longestList(neighbors: Neighbors): number {
  let max = 0;
  for (const perSlice of Object.values(neighbors)) {
    for (const list of Object.values(perSlice)) {
      if (list.length > max) max = list.length;
    }
  }
  return max;
}

/**
 * Ergebnis einer Nachbarabfrage einsetzen: aus Zeilennummern, Scores und der
 * Kandidatentabelle entstehen Einträge im Format von `neighbors` (`label`,
 * `score`, `group`, dazu `lemma`). Alle Nutzer von `neighborsAt()` bleiben
 * dadurch unverändert.
 *
 * `pointByLabel` wird um die Koordinaten aller Kandidaten ergänzt — damit hat
 * jeder mögliche Nachbar eine Position im Bild, nicht nur die aus
 * `vocab_points`. Bestehende Einträge (Anker zuerst) behalten Vorrang, wie in
 * `indexBundle()`.
 */
export function withQueriedNeighbors(
  idx: IndexedBundle,
  candidates: NeighborCandidates,
  result: NeighborQueryResult,
): IndexedBundle {
  const posByRow = new Map<number, number>();
  candidates.row.forEach((row, i) => posByRow.set(row, i));

  const neighbors: Neighbors = {};
  for (const [entityId, perSlice] of Object.entries(result.neighbors)) {
    const out: Record<string, Neighbor[]> = {};
    for (const [sliceId, { rows, scores }] of Object.entries(perSlice)) {
      const list: Neighbor[] = [];
      rows.forEach((row, r) => {
        const i = posByRow.get(row);
        if (i === undefined) return; // Zeile ohne Kandidat: Antwort passt nicht zur Tabelle
        list.push({
          label: candidates.label[i],
          score: scores[r],
          group: candidates.group[i],
          lemma: candidates.lemma[i],
        });
      });
      out[sliceId] = list;
    }
    neighbors[entityId] = out;
  }

  // Kandidaten mit eigener Zeitscheibe (SGNS) haben je Scheibe eine andere
  // Position; die gilt nur dort (`slicePointByLabel`). In die allgemeinen
  // Tabellen kommen nur Kandidaten, die für alle Scheiben gelten.
  const pointByLabel = new Map(idx.pointByLabel);
  const pointByLowerLabel = new Map(idx.pointByLowerLabel);
  const slicePointByLabel = new Map<string, Map<string, Coords3d>>();
  candidates.label.forEach((label, i) => {
    const coords = candidates.coords_3d[i];
    const sliceId = candidates.slice?.[i];
    if (sliceId == null) {
      addPoint(pointByLabel, pointByLowerLabel, label, coords);
      return;
    }
    let perSlice = slicePointByLabel.get(sliceId);
    if (!perSlice) slicePointByLabel.set(sliceId, (perSlice = new Map()));
    if (!perSlice.has(label)) perSlice.set(label, coords);
  });

  return {
    ...idx,
    neighbors: relabelNeighbors(neighbors, idx.bundle.anchors, idx.anchors),
    baseNeighbors: neighbors,
    neighborSource: "query",
    pointByLabel,
    pointByLowerLabel,
    slicePointByLabel,
    maxNeighborK: result.k,
  };
}

/** Zurück zu den vorberechneten Nachbarn des Bundles (Rückfall). */
export function withBundleNeighbors(idx: IndexedBundle): IndexedBundle {
  if (idx.neighborSource === "bundle") return idx;
  return {
    ...idx,
    neighbors: relabelNeighbors(idx.bundle.neighbors, idx.bundle.anchors, idx.anchors),
    baseNeighbors: idx.bundle.neighbors,
    neighborSource: "bundle",
    maxNeighborK: longestList(idx.bundle.neighbors),
  };
}

// ---------------------------------------------------------------------------
// Anker der Sitzung (Seite „Anker“)
// ---------------------------------------------------------------------------

/** Gruppe eines Nachbarn, der kein Anker ist (SCHEMA.md, „Auswertung einer Abfrage“, Schritt 5). */
export const FALLBACK_GROUP = "KONTEXT";

/** Lemma eines Ankers, falls angegeben (`anchors[].lemma` ist optional). */
export function anchorLemma(a: Anchor): string | undefined {
  return typeof a.lemma === "string" ? a.lemma : undefined;
}

/** Worüber ein Anker einem Nachbarn zugeordnet wird: das Lemma, ohne Lemma das Label. */
export function anchorKey(a: Anchor): string {
  return anchorLemma(a) ?? a.label;
}

function indexAnchors(anchors: Anchor[]): Map<string, Anchor> {
  return new Map(anchors.map((a) => [a.label, a]));
}

function clustersOf(anchors: Anchor[]): string[] {
  return [...new Set(anchors.map((a) => a.cluster))].sort();
}

/**
 * Nachbarlisten den Ankern der Sitzung zuordnen. Bundle und Backend vergeben
 * Label und Gruppe nach den Ankern des Bundles (über das Lemma); hier wird das
 * für die geänderte Liste nachgeholt — gerechnet wird nichts, Rang und Score
 * bleiben. Ein Nachbar, der Anker des Bundles war und es nicht mehr ist, wird
 * wieder zu Lemma und `KONTEXT`.
 */
export function relabelNeighbors(neighbors: Neighbors, shipped: Anchor[], working: Anchor[]): Neighbors {
  if (shipped === working) return neighbors;
  const shippedByLabel = new Map(shipped.map((a) => [a.label, a]));
  const shippedByKey = new Map(shipped.map((a) => [anchorKey(a), a]));
  const workingByKey = new Map(working.map((a) => [anchorKey(a), a]));

  const relabel = (n: Neighbor): Neighbor => {
    // Neuere Listen tragen das Lemma; bei älteren steht am Anker-Nachbarn nur das Anker-Label.
    const from = n.lemma !== undefined ? shippedByKey.get(n.lemma) : shippedByLabel.get(n.label);
    const lemma = n.lemma ?? (from ? anchorKey(from) : n.label);
    const a = workingByKey.get(lemma);
    if (a) {
      return a.label === n.label && a.cluster === n.group ? n : { ...n, label: a.label, group: a.cluster, lemma };
    }
    if (from && from.label === n.label) return { ...n, label: lemma, group: FALLBACK_GROUP, lemma };
    return n;
  };

  const out: Neighbors = {};
  for (const [entityId, perSlice] of Object.entries(neighbors)) {
    const slices: Record<string, Neighbor[]> = {};
    for (const [sliceId, list] of Object.entries(perSlice)) slices[sliceId] = list.map(relabel);
    out[entityId] = slices;
  }
  return out;
}

/**
 * Anker der Sitzung einsetzen (Seite „Anker“). Ersetzt die Anker-Landmarken,
 * die Cluster der Legende und die Zuordnung der Nachbarn; das Bundle und die
 * Bildausschnitt-Berechnung (`center`/`scale`) bleiben, damit die Szene beim
 * Bearbeiten nicht springt.
 */
export function withAnchors(idx: IndexedBundle, anchors: Anchor[]): IndexedBundle {
  const pointByLabel = new Map(idx.pointByLabel);
  const pointByLowerLabel = new Map(idx.pointByLowerLabel);
  for (const a of anchors) {
    // Anker haben Vorrang vor allem, was schon eingetragen ist
    pointByLabel.set(a.label, a.coords_3d as Coords3d);
    addPoint(pointByLabel, pointByLowerLabel, a.label, a.coords_3d as Coords3d);
  }
  return {
    ...idx,
    anchors,
    anchorByLabel: indexAnchors(anchors),
    clusters: clustersOf(anchors),
    pointByLabel,
    pointByLowerLabel,
    neighbors: relabelNeighbors(idx.baseNeighbors, idx.bundle.anchors, anchors),
  };
}

/** Anker zu einem NN-Label — nur exakt, s. `anchorByLabel`. */
export function anchorForLabel(idx: IndexedBundle, label: string): Anchor | undefined {
  return idx.anchorByLabel.get(label);
}

/** Position zu einem NN-Label: erst Anker, dann die Position in dieser
 * Zeitscheibe (SGNS-Kandidaten, falls `sliceIndex` angegeben), dann
 * Kandidat bzw. Vokabel-Punkt (s. `pointByLabel`), zuletzt ohne
 * Groß-/Kleinschreibung (`pointByLowerLabel`). `undefined` heißt "dieses Wort
 * hat im Bundle keine Koordinate" — bei den neuen Bundles per Konstruktion
 * ausgeschlossen, bei älteren der Normalfall für alles, was kein Anker ist. */
export function pointForLabel(idx: IndexedBundle, label: string, sliceIndex?: number): Coords3d | undefined {
  const anchor = idx.anchorByLabel.get(label);
  if (anchor) return anchor.coords_3d as Coords3d;
  if (sliceIndex !== undefined) {
    const sliceId = idx.sortedSlices[sliceIndex]?.id;
    const inSlice = sliceId !== undefined ? idx.slicePointByLabel.get(sliceId)?.get(label) : undefined;
    if (inSlice) return inSlice;
  }
  return idx.pointByLabel.get(label) ?? idx.pointByLowerLabel.get(label.toLowerCase());
}

/** Faceted-Search-Prädikat: UND-Verknüpfung über Facetten; leere Auswahl je
 * Facette = keine Einschränkung. `filters[facetId]` = Menge erlaubter Wert-IDs. */
export function passesFacetFilter(
  facets: Record<string, string>,
  filters: Record<string, Set<string>>,
): boolean {
  for (const facetId of Object.keys(filters)) {
    const allowed = filters[facetId];
    if (!allowed || allowed.size === 0) continue; // Facette nicht eingeschränkt
    const value = facets[facetId];
    if (value === undefined || !allowed.has(value)) return false;
  }
  return true;
}

/** Aggregat-Frequenz eines Zielworts an einer diskreten Scheibe (0 = nicht belegt). */
export function entityFreqAt(
  idx: IndexedBundle,
  entityId: string | null,
  sliceIndex: number,
): number {
  if (!entityId) return 0;
  const track = idx.tracks.find((t) => t.entity.id === entityId);
  return track?.samples[sliceIndex]?.freq ?? 0;
}
