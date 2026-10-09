/**
 * Zentraler UI-Zustand (zustand). Hält das geladene + indizierte Bundle, die
 * kontinuierliche Zeitposition und die Auswahl. Reine Interaktion (Slider,
 * Hover) lebt komplett hier im Client – nie ein Server-Roundtrip (specs.md §3).
 */
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { fetchBundleList, type BundleSummary } from "../data/apiClient";
import { loadFromApi, loadFromFile, pickBundleFile, type LoadedBundle } from "../data/loader";
import { indexBundle, type IndexedBundle } from "../data/model";

type Status = "idle" | "loading" | "ready" | "error";

/** Aggregiert = eine Trajektorie je Wort (aggregates); Facettiert = eine Linie je
 * Facettenwert (records); Streuung = facettenaufgelöste Punktwolke (Unsicherheit). */
export type ViewMode = "aggregat" | "facettiert" | "streuung";

/** Startlänge der Nachbarliste im Bild. Klein genug, dass die Szene lesbar
 * bleibt; ältere Bundles mit kürzeren Listen (8) begrenzen den Wert von selbst
 * (`applyLoaded`). */
export const NEIGHBOR_K_DEFAULT = 10;
/** Obergrenze des k-Reglers, unabhängig von der Listenlänge (bis 1000). */
export const NEIGHBOR_K_MAX = 100;

interface VizState {
  // Bundle-Liste (Backend)
  list: BundleSummary[];
  listError: string | null;

  // Aktives Bundle
  status: Status;
  error: string | null;
  loaded: LoadedBundle | null;
  indexed: IndexedBundle | null;

  // Zeit: kontinuierlicher Slider-Wert in [0, sliceCount-1]
  sliceT: number;

  // Auswahl
  selectedEntityIds: Set<string>;
  activeEntityId: string | null; // dessen Nachbarn werden eingeblendet

  /** Wie viele der vorberechneten Nachbarn gezeigt werden — in der Liste des
   * Nachbarn-Panels wie als Punkte im Raum. Der einzige Knopf: Auswahl und
   * Reihenfolge kommen aus dem Bundle, hier wird nur abgeschnitten. */
  neighborK: number;

  /** Ausgeblendete Anker-Cluster (Wortraum). Als NN hervorgehobene Anker
   * bleiben trotzdem sichtbar, sonst fehlte ein Teil der Nachbarliste im Bild. */
  hiddenClusters: Set<string>;

  // Facetten
  viewMode: ViewMode;
  /** Aktive Facetten-Filter: facetId → Menge erlaubter Wert-IDs (leer = alle). */
  facetFilters: Record<string, Set<string>>;

  // Aktionen
  loadList: () => Promise<void>;
  openApiBundle: (id: string) => Promise<void>;
  /** Eigenes Bundle aus einer Dateiauswahl (die JSON darin, s. `pickBundleFile`). */
  openFiles: (files: readonly File[]) => Promise<void>;
  setSliceT: (t: number) => void;
  setActiveEntity: (id: string | null) => void;
  toggleEntity: (id: string) => void;
  setNeighborK: (k: number) => void;
  toggleCluster: (cluster: string) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleFacetValue: (facetId: string, valueId: string) => void;
  clearFacet: (facetId: string) => void;
  clearAllFacets: () => void;
}

function applyLoaded(loaded: LoadedBundle) {
  const indexed = indexBundle(loaded.bundle);
  const entityIds = indexed.tracks.map((t) => t.entity.id);
  return {
    status: "ready" as Status,
    error: null,
    loaded,
    indexed,
    // Startposition: letzte Scheibe (aktuellster Stand)
    sliceT: Math.max(0, indexed.sliceCount - 1),
    selectedEntityIds: new Set(entityIds),
    activeEntityId: entityIds[0] ?? null,
    // Frisches Bundle: zurück auf Aggregiert, keine Filter.
    viewMode: "aggregat" as ViewMode,
    facetFilters: {} as Record<string, Set<string>>,
    hiddenClusters: new Set<string>(),
    // Startwert ist die klassische Panel-Länge: ein frisches Bundle sieht aus
    // wie bisher, mehr Nachbarn holt man sich bewusst über den Regler.
    neighborK: Math.min(NEIGHBOR_K_DEFAULT, indexed.maxNeighborK || NEIGHBOR_K_DEFAULT),
  };
}

/** Zähler der Ladevorgänge: nur der zuletzt gestartete darf sein Ergebnis
 * einsetzen. Sonst überschreibt eine langsame ältere Antwort (z.B. das
 * automatische Öffnen beim Start) ein inzwischen gewähltes Bundle. */
let loadSeq = 0;

export const useViz = create<VizState>((set, get) => ({
  list: [],
  listError: null,
  status: "idle",
  error: null,
  loaded: null,
  indexed: null,
  sliceT: 0,
  selectedEntityIds: new Set(),
  activeEntityId: null,
  neighborK: NEIGHBOR_K_DEFAULT,
  hiddenClusters: new Set(),
  viewMode: "aggregat",
  facetFilters: {},

  loadList: async () => {
    try {
      const list = await fetchBundleList();
      set({ list, listError: null });
      // Beim ersten Laden automatisch das erste Bundle öffnen.
      if (list.length > 0 && get().status === "idle") {
        void get().openApiBundle(list[0].id);
      }
    } catch (err) {
      set({ listError: (err as Error).message });
    }
  },

  openApiBundle: (id) => load(() => loadFromApi(id)),

  openFiles: (files) => load(() => loadFromFile(pickBundleFile(files))),

  setSliceT: (t) => set({ sliceT: t }),
  setActiveEntity: (id) => set({ activeEntityId: id }),
  setNeighborK: (k) =>
    set((s) => ({
      neighborK: Math.max(
        0,
        Math.min(Math.round(k), NEIGHBOR_K_MAX, s.indexed?.maxNeighborK ?? NEIGHBOR_K_MAX),
      ),
    })),
  toggleCluster: (cluster) =>
    set((s) => {
      const next = new Set(s.hiddenClusters);
      if (next.has(cluster)) next.delete(cluster);
      else next.add(cluster);
      return { hiddenClusters: next };
    }),
  toggleEntity: (id) =>
    set((s) => {
      const next = new Set(s.selectedEntityIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // Das aktive Zielwort (Overlay „Zielwort“) bleibt immer ein eingeblendetes:
      // wird es ausgeblendet, rückt das erste verbliebene nach.
      let active = s.activeEntityId;
      if (active === null || !next.has(active)) {
        active = s.indexed?.tracks.find((t) => next.has(t.entity.id))?.entity.id ?? null;
      }
      return { selectedEntityIds: next, activeEntityId: active };
    }),

  setViewMode: (mode) => set({ viewMode: mode }),
  toggleFacetValue: (facetId, valueId) =>
    set((s) => {
      const next: Record<string, Set<string>> = { ...s.facetFilters };
      const current = new Set(next[facetId] ?? []);
      if (current.has(valueId)) current.delete(valueId);
      else current.add(valueId);
      next[facetId] = current;
      return { facetFilters: next };
    }),
  clearFacet: (facetId) =>
    set((s) => {
      const next = { ...s.facetFilters };
      delete next[facetId];
      return { facetFilters: next };
    }),
  clearAllFacets: () => set({ facetFilters: {} }),
}));

/**
 * Mehrere Felder des Stores abonnieren, aber nur diese: die Komponente rendert
 * neu, wenn sich eines davon ändert — nicht bei jeder Änderung irgendwo im
 * Store. Wichtig wegen `sliceT`, das sich beim Abspielen in jedem Frame ändert.
 */
export function useVizPick<K extends keyof VizState>(...keys: K[]): Pick<VizState, K> {
  return useViz(useShallow((s) => pickKeys(s, keys)));
}

/** Die genannten Felder eines Objekts (Grundlage der `use…Pick`-Hooks). */
export function pickKeys<S extends object, K extends keyof S>(s: S, keys: readonly K[]): Pick<S, K> {
  const out = {} as Pick<S, K>;
  for (const k of keys) out[k] = s[k];
  return out;
}

/** Ein Bundle laden und einsetzen — es sei denn, inzwischen wurde ein anderes angefordert. */
async function load(fetchBundle: () => Promise<LoadedBundle>): Promise<void> {
  const seq = ++loadSeq;
  useViz.setState({ status: "loading", error: null });
  try {
    const loaded = await fetchBundle();
    if (seq === loadSeq) useViz.setState(applyLoaded(loaded));
  } catch (err) {
    if (seq === loadSeq) useViz.setState({ status: "error", error: (err as Error).message });
  }
}
