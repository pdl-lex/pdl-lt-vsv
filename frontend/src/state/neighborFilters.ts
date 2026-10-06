/**
 * Nachbar-Filter: Filterwerte, Arbeitsliste der Stoppwörter und die Abfrage
 * beim Backend (SCHEMA.md, „meta.neighbor_space“; nextsteps.md §2).
 *
 * Es gibt genau einen Ort für diese Filter (Seite „Filter für nächste Nachbarn“), und sie
 * wirken in allen Modulen: Das Ergebnis einer Abfrage ersetzt die Nachbarlisten
 * im indizierten Bundle (`withQueriedNeighbors`), und alle Ansichten lesen über
 * `neighborsAt()`. Gefiltert wird ausschließlich im Backend, hier wird nur
 * gesammelt, was der Nutzer einstellt — die Regeln stehen im Schema, nicht im
 * Frontend.
 *
 * Rückfall: Bundle ohne Suchraum, aus einer Datei geöffnet oder Backend nicht
 * erreichbar → die vorberechneten `neighbors` des Bundles, Filter mit Hinweis
 * deaktiviert.
 *
 * Der Store hängt sich an `useViz`: Wird ein anderes Bundle geladen, beginnt
 * er neu (s. Abonnement am Dateiende).
 */
import { create } from "zustand";
import {
  fetchNeighborSpace,
  fetchNeighbors,
  type NeighborCandidates,
  type NeighborFilterInfo,
  type NeighborQueryBody,
  type NeighborSpaceInfo,
} from "../data/apiClient";
import type { LoadedBundle } from "../data/loader";
import { withBundleNeighbors, withQueriedNeighbors } from "../data/model";
import { parseNeighborSpaceMeta, type NeighborSpaceMeta } from "../types/schema";
import { useViz } from "./store";

/** Wartezeit nach der letzten Änderung, bevor abgefragt wird. */
export const QUERY_DEBOUNCE_MS = 400;
/** Abgefragte Listenlänge (nextsteps.md §2: k_NN = 1000), begrenzt durch `k_max` des Backends. */
export const QUERY_K = 1000;

// ---------------------------------------------------------------------------
// Reine Hilfsfunktionen (getestet in neighborFilters.test.ts)
// ---------------------------------------------------------------------------

export type Availability =
  | { kind: "available"; bundleId: string; meta: NeighborSpaceMeta }
  | { kind: "unavailable"; reason: string; meta: NeighborSpaceMeta | null };

/** Ob für dieses Bundle Abfragen möglich sind, und wenn nicht, warum. */
export function availabilityOf(loaded: LoadedBundle | null): Availability {
  if (!loaded) return { kind: "unavailable", reason: "Kein Bundle geladen.", meta: null };
  const parsed = parseNeighborSpaceMeta(loaded.bundle.meta as Record<string, unknown>);
  if (!parsed.ok) return { kind: "unavailable", reason: parsed.reason, meta: null };
  if (loaded.source.kind !== "api") {
    return {
      kind: "unavailable",
      reason:
        "Das Bundle wurde aus einer Datei geöffnet; Abfragen gehen nur über das Backend. " +
        "Angezeigt werden die vorberechneten Nachbarn mit den Voreinstellungen.",
      meta: parsed.value,
    };
  }
  return { kind: "available", bundleId: loaded.source.id, meta: parsed.value };
}

/** Voreinstellungen aus der Filterdeklaration (fehlender `default` = Filter aus). */
export function defaultValues(filters: { column: string; default?: unknown }[]): Record<string, unknown> {
  return Object.fromEntries(filters.map((f) => [f.column, f.default ?? null]));
}

/** Abfrage-Body: alle deklarierten Filter ausdrücklich (`null` = aus), Stoppwörter immer mit. */
export function buildQueryBody(
  filters: { column: string }[],
  values: Record<string, unknown>,
  stopwords: string[],
  k: number,
): NeighborQueryBody {
  return {
    k,
    filters: Object.fromEntries(filters.map((f) => [f.column, values[f.column] ?? null])),
    stopwords,
  };
}

/** Stoppwortdatei lesen: ein Lemma je Zeile, `#` für Kommentare, Leerzeilen egal. */
export function parseStopwordText(text: string): string[] {
  return addStopwords(
    [],
    text.split(/\r?\n/).filter((line) => !line.trim().startsWith("#")),
  );
}

/** Stoppwortdatei schreiben, im selben Format wie `stopwords.txt` der Pipeline. */
export function stopwordFileText(stopwords: string[], bundleName: string): string {
  return [
    `# Stoppwortliste für die Nachbarlisten (${bundleName})`,
    "# Ein Lemma je Zeile, Groß-/Kleinschreibung zählt. Zeilen mit # werden ignoriert.",
    "",
    ...stopwords,
    "",
  ].join("\n");
}

/** Wörter anhängen: getrimmt, ohne leere, ohne Dubletten, Reihenfolge bleibt. */
export function addStopwords(list: string[], words: string[]): string[] {
  const out = [...list];
  const seen = new Set(out);
  for (const raw of words) {
    const w = raw.trim();
    if (w && !seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
  }
  return out;
}

export function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Unterschied der Arbeitsliste zur mitgelieferten Liste. */
export function stopwordDiff(working: string[], shipped: string[]): { added: string[]; removed: string[] } {
  const w = new Set(working);
  const s = new Set(shipped);
  return {
    added: working.filter((x) => !s.has(x)),
    removed: shipped.filter((x) => !w.has(x)),
  };
}

/**
 * Kurzbeschreibung der aktiven Filter, für die Anzeige in jedem Modul, das
 * Nachbarn zeigt (z. B. „Wortart: 4 von 12 · Mindestbelegung ≥ 10 ·
 * Rednernamen ausblenden · 25 Stoppwörter (geändert)“).
 */
export function filterSummary(
  filters: (Pick<NeighborFilterInfo, "column" | "type" | "label"> & { values?: { value: string }[] })[],
  values: Record<string, unknown>,
  stopwords: string[],
  shipped: string[],
): string[] {
  const parts: string[] = [];
  for (const f of filters) {
    const v = values[f.column];
    if (v === null || v === undefined) continue;
    if (f.type === "categorical" && Array.isArray(v)) {
      parts.push(
        f.values ? `${f.label}: ${v.length} von ${f.values.length}` : `${f.label}: ${v.join(", ")}`,
      );
    } else if (f.type === "minimum" && typeof v === "number") {
      parts.push(`${f.label} ≥ ${v}`);
    } else if (f.type === "exclude_if_true" && v === true) {
      parts.push(f.label);
    }
  }
  const changed = !sameList(stopwords, shipped);
  parts.push(`${stopwords.length} Stoppwörter${changed ? " (geändert)" : ""}`);
  return parts;
}

export interface CloudWord {
  lemma: string;
  /** Wert der Häufigkeitsspalte; `null`, wenn das Bundle keine deklariert oder er fehlt. */
  freq: number | null;
}

/**
 * Wörter der Kandidaten-Wortwolke: die Kandidaten nach Filtern (`keptRows`),
 * je Lemma einmal (SGNS: ein Kandidat je Zeitscheibe → größter Wert), die
 * `limit` häufigsten, alphabetisch sortiert. Ohne Häufigkeitsspalte bleibt die
 * Reihenfolge der Kandidatentabelle maßgeblich für die Auswahl.
 */
export function cloudWords(
  candidates: Pick<NeighborCandidates, "row" | "lemma" | "attributes">,
  keptRows: number[],
  frequencyColumn: string | undefined,
  limit: number,
): CloudWord[] {
  const posByRow = new Map<number, number>();
  candidates.row.forEach((row, i) => posByRow.set(row, i));
  const freqs = frequencyColumn ? candidates.attributes[frequencyColumn] : undefined;

  const byLemma = new Map<string, number | null>();
  for (const row of keptRows) {
    const i = posByRow.get(row);
    if (i === undefined) continue;
    const lemma = candidates.lemma[i];
    const raw = freqs?.[i];
    const f = typeof raw === "number" ? raw : null;
    const prev = byLemma.get(lemma);
    if (prev === undefined || (f !== null && (prev === null || f > prev))) byLemma.set(lemma, f);
  }

  return [...byLemma]
    .map(([lemma, freq]) => ({ lemma, freq }))
    .sort((a, b) => (b.freq ?? -Infinity) - (a.freq ?? -Infinity))
    .slice(0, limit)
    .sort((a, b) => a.lemma.localeCompare(b.lemma, "de"));
}

// ---------------------------------------------------------------------------
// Arbeitsliste im localStorage, je Bundle
// ---------------------------------------------------------------------------

const storageKey = (bundleId: string) => `vsv.stopwords.${bundleId}`;

function loadStoredStopwords(bundleId: string): string[] | null {
  try {
    const raw = localStorage.getItem(storageKey(bundleId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((w) => typeof w === "string") ? parsed : null;
  } catch {
    return null; // Speicher nicht verfügbar oder Inhalt kaputt: mitgelieferte Liste
  }
}

function storeStopwords(bundleId: string, stopwords: string[], shipped: string[]) {
  try {
    if (sameList(stopwords, shipped)) localStorage.removeItem(storageKey(bundleId));
    else localStorage.setItem(storageKey(bundleId), JSON.stringify(stopwords));
  } catch {
    /* Speicher nicht verfügbar: die Liste gilt dann nur in dieser Sitzung */
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type LoadStatus = "idle" | "loading" | "ready" | "error";

interface NeighborFilterState {
  availability: Availability;
  /** Antwort von `GET …/neighbor-space` (Filter mit Werten, Kandidatentabelle). */
  space: NeighborSpaceInfo | null;
  spaceStatus: LoadStatus;
  spaceError: string | null;

  /** Filterwerte je Spalte; `null` = Filter aus. */
  values: Record<string, unknown>;
  /** Arbeitsliste der Stoppwörter (die mitgelieferte bleibt in `availability.meta`). */
  stopwords: string[];

  queryStatus: LoadStatus;
  queryError: string | null;
  /** Kandidaten nach Filtern / insgesamt, aus der letzten Abfrage. */
  candidateCount: { kept: number; total: number } | null;
  /** Zeilen (`candidates.row`) der Kandidaten nach Filtern, aus der letzten Abfrage. */
  keptRows: number[] | null;

  setValue: (column: string, value: unknown) => void;
  resetFilters: () => void;
  addStopwords: (words: string[]) => void;
  removeStopword: (word: string) => void;
  replaceStopwords: (words: string[]) => void;
  resetStopwords: () => void;
  retry: () => void;
}

/** Die mitgelieferte Stoppwortliste des aktuellen Bundles. */
export function shippedStopwords(a: Availability): string[] {
  return a.meta?.stopwords ?? [];
}

let currentLoaded: LoadedBundle | null = null;
let spaceAbort: AbortController | null = null;
let queryAbort: AbortController | null = null;
let debounce: ReturnType<typeof setTimeout> | null = null;

export const useNeighborFilters = create<NeighborFilterState>((set, get) => ({
  availability: availabilityOf(null),
  space: null,
  spaceStatus: "idle",
  spaceError: null,
  values: {},
  stopwords: [],
  queryStatus: "idle",
  queryError: null,
  candidateCount: null,
  keptRows: null,

  setValue: (column, value) => {
    if (get().availability.kind !== "available") return;
    set((s) => ({ values: { ...s.values, [column]: value } }));
    scheduleQuery();
  },
  resetFilters: () => {
    const { availability } = get();
    if (availability.kind !== "available") return;
    set({ values: defaultValues(availability.meta.filters) });
    scheduleQuery();
  },
  addStopwords: (words) => setStopwords(addStopwords(get().stopwords, words)),
  removeStopword: (word) => setStopwords(get().stopwords.filter((w) => w !== word)),
  replaceStopwords: (words) => setStopwords(addStopwords([], words)),
  resetStopwords: () => setStopwords([...shippedStopwords(get().availability)]),
  retry: () => {
    if (get().space) scheduleQuery(0);
    else void loadSpace();
  },
}));

const getState = () => useNeighborFilters.getState();
const setState = useNeighborFilters.setState;

function setStopwords(stopwords: string[]) {
  const { availability } = getState();
  if (availability.kind !== "available") return;
  setState({ stopwords });
  storeStopwords(availability.bundleId, stopwords, availability.meta.stopwords);
  scheduleQuery();
}

function scheduleQuery(delay = QUERY_DEBOUNCE_MS) {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    debounce = null;
    void runQuery();
  }, delay);
}

/** Bundle-Nachbarn wiederherstellen; k-Regler auf die neue Obergrenze begrenzen. */
function fallBack() {
  useViz.setState((s) => {
    if (!s.indexed) return {};
    const indexed = withBundleNeighbors(s.indexed);
    return { indexed, neighborK: Math.min(s.neighborK, indexed.maxNeighborK) };
  });
}

async function runQuery() {
  const { availability, space, values, stopwords } = getState();
  if (availability.kind !== "available" || !space) return;
  const loaded = currentLoaded;
  queryAbort?.abort();
  const ctrl = new AbortController();
  queryAbort = ctrl;
  setState({ queryStatus: "loading", queryError: null });
  try {
    const body = buildQueryBody(space.filters, values, stopwords, Math.min(QUERY_K, space.k_max));
    const result = await fetchNeighbors(availability.bundleId, body, ctrl.signal);
    if (ctrl.signal.aborted || currentLoaded !== loaded) return; // veraltet
    useViz.setState((s) =>
      s.indexed && s.loaded === loaded
        ? { indexed: withQueriedNeighbors(s.indexed, space.candidates, result) }
        : {},
    );
    setState({
      queryStatus: "ready",
      candidateCount: { kept: result.n_candidates, total: result.n_candidates_total },
      keptRows: result.kept_rows ?? null,
    });
  } catch (err) {
    if (ctrl.signal.aborted || currentLoaded !== loaded) return;
    // Kein Ergebnis zu den eingestellten Filtern: lieber die vorberechneten
    // Listen mit Hinweis als ein altes Ergebnis, das nicht mehr zu den
    // Filtern passt.
    fallBack();
    setState({
      queryStatus: "error", queryError: (err as Error).message, candidateCount: null, keptRows: null,
    });
  }
}

async function loadSpace() {
  const { availability } = getState();
  if (availability.kind !== "available") return;
  const loaded = currentLoaded;
  spaceAbort?.abort();
  const ctrl = new AbortController();
  spaceAbort = ctrl;
  setState({ spaceStatus: "loading", spaceError: null });
  try {
    const space = await fetchNeighborSpace(availability.bundleId, ctrl.signal);
    if (ctrl.signal.aborted || currentLoaded !== loaded) return;
    setState({ space, spaceStatus: "ready" });
    scheduleQuery(0);
  } catch (err) {
    if (ctrl.signal.aborted || currentLoaded !== loaded) return;
    setState({ spaceStatus: "error", spaceError: (err as Error).message });
  }
}

/** Neubeginn für ein frisch geladenes Bundle. */
function init(loaded: LoadedBundle | null) {
  currentLoaded = loaded;
  spaceAbort?.abort();
  queryAbort?.abort();
  if (debounce) clearTimeout(debounce);
  debounce = null;
  const availability = availabilityOf(loaded);
  const meta = availability.meta;
  const stopwords =
    availability.kind === "available"
      ? (loadStoredStopwords(availability.bundleId) ?? [...availability.meta.stopwords])
      : [...(meta?.stopwords ?? [])];
  setState({
    availability,
    space: null,
    spaceStatus: "idle",
    spaceError: null,
    values: meta ? defaultValues(meta.filters) : {},
    stopwords,
    queryStatus: "idle",
    queryError: null,
    candidateCount: null,
    keptRows: null,
  });
  void loadSpace();
}

// Neues Bundle → Filter neu aufsetzen. `loaded` wechselt nur beim Laden, nicht
// beim Einsetzen eines Abfrageergebnisses (das ändert nur `indexed`).
useViz.subscribe((state, prev) => {
  if (state.loaded !== prev.loaded) init(state.loaded);
});
