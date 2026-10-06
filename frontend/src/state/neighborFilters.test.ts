/**
 * Nachbar-Filter: Austausch der Datenquelle, Rückfall, Abfrageparameter,
 * Stoppwortliste. Die Filterregeln selbst prüft das Backend (SCHEMA.md);
 * hier geht es darum, dass das Frontend sie richtig anfragt und das Ergebnis
 * richtig einsetzt.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { validateBundle } from "../types/schema";
import { indexBundle, neighborsAt, pointForLabel, withBundleNeighbors, withQueriedNeighbors } from "../data/model";
import type { LoadedBundle } from "../data/loader";
import type { NeighborCandidates, NeighborQueryResult } from "../data/apiClient";
import { buildNeighborFlow } from "../viz/neighborFlow";
import {
  cloudWords,
  addStopwords,
  availabilityOf,
  buildQueryBody,
  defaultValues,
  filterSummary,
  parseStopwordText,
  stopwordDiff,
  stopwordFileText,
} from "./neighborFilters";

const here = dirname(fileURLToPath(import.meta.url));
const raw = () =>
  JSON.parse(readFileSync(resolve(here, "../../../data/test/zeitenwende_demo.json"), "utf-8"));

const NEIGHBOR_SPACE = {
  format: 1,
  vectors: "demo.vectors.npy",
  index: "demo.index.parquet",
  neighbor_kind: "context",
  similarity: "cosine",
  filters: [
    { column: "pos", type: "categorical", label: "Wortart", default: ["NOUN", "VERB"] },
    { column: "n_rows", type: "minimum", label: "Mindestbelegung", default: 10 },
    { column: "n_cooccurrences", type: "minimum", label: "Kookkurrenzen", default: null },
    { column: "is_speaker_name", type: "exclude_if_true", label: "Rednernamen ausblenden", default: true },
  ],
  stopwords: ["Herr", "sagen"],
};

function loaded(meta: Record<string, unknown> = {}, source: LoadedBundle["source"] = { kind: "api", id: "demo" }): LoadedBundle {
  const r = raw();
  r.meta = { ...r.meta, ...meta };
  return { bundle: validateBundle(r), source };
}

// Kandidatentabelle mit einem Anker (Label weicht vom Lemma ab) und zwei Kontextwörtern
const CANDIDATES: NeighborCandidates = {
  row: [100, 101, 102],
  lemma: ["Einsatzkräft", "Drohne", "Frontlinie"],
  label: ["Einsatzkräfte", "Drohne", "Frontlinie"],
  group: ["MILITÄR", "KONTEXT", "KONTEXT"],
  coords_3d: [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
  attributes: {},
};

describe("withQueriedNeighbors / withBundleNeighbors", () => {
  const idx = indexBundle(loaded().bundle);
  const entityId = idx.tracks[0].entity.id;
  const sliceId = idx.sortedSlices[3].id;
  const result: NeighborQueryResult = {
    k: 1000,
    n_candidates: 3,
    n_candidates_total: 3,
    neighbors: { [entityId]: { [sliceId]: { rows: [102, 100], scores: [0.91, 0.5] } } },
  };

  it("setzt Einträge aus Zeilen, Scores und Kandidatentabelle zusammen", () => {
    const q = withQueriedNeighbors(idx, CANDIDATES, result);
    expect(q.neighborSource).toBe("query");
    expect(neighborsAt(q, entityId, 3)).toEqual([
      { label: "Frontlinie", score: 0.91, group: "KONTEXT", lemma: "Frontlinie" },
      { label: "Einsatzkräfte", score: 0.5, group: "MILITÄR", lemma: "Einsatzkräft" },
    ]);
    // Zeitscheiben ohne Ergebnis sind leer, nicht die alten Listen
    expect(neighborsAt(q, entityId, 4)).toEqual([]);
    expect(q.maxNeighborK).toBe(1000);
  });

  it("gibt jedem Kandidaten eine Position, Anker behalten Vorrang", () => {
    const q = withQueriedNeighbors(idx, CANDIDATES, result);
    expect(pointForLabel(q, "Drohne")).toEqual([4, 5, 6]);
    const anchor = idx.anchors[0];
    const clash: NeighborCandidates = { ...CANDIDATES, label: [anchor.label, "x", "y"] };
    expect(pointForLabel(withQueriedNeighbors(idx, clash, result), anchor.label)).toEqual(anchor.coords_3d);
  });

  it("lässt das Bundle unverändert und kehrt zu dessen Nachbarn zurück", () => {
    const before = neighborsAt(idx, entityId, 3);
    const q = withQueriedNeighbors(idx, CANDIDATES, result);
    expect(q.bundle).toBe(idx.bundle);
    const back = withBundleNeighbors(q);
    expect(back.neighborSource).toBe("bundle");
    expect(neighborsAt(back, entityId, 3)).toEqual(before);
    expect(back.maxNeighborK).toBe(idx.maxNeighborK);
  });
});

describe("buildNeighborFlow mit Grenze", () => {
  it("schneidet die Rangachse auf den k-Regler ab", () => {
    const idx = indexBundle(loaded().bundle);
    const full = buildNeighborFlow(idx, "zeitenwende")!;
    const cut = buildNeighborFlow(idx, "zeitenwende", 3)!;
    expect(full.k).toBeGreaterThan(3);
    expect(cut.k).toBe(3);
    for (const l of cut.labels) for (const p of l.points) expect(p.rank).toBeLessThanOrEqual(3);
  });
});

describe("availabilityOf", () => {
  it("ohne Suchraum: Rückfall mit Grund", () => {
    const a = availabilityOf(loaded());
    expect(a.kind).toBe("unavailable");
    expect(a.meta).toBeNull();
  });

  it("aus Datei: Rückfall, Deklaration bleibt zum Anzeigen", () => {
    const a = availabilityOf(loaded({ neighbor_space: NEIGHBOR_SPACE }, { kind: "file", filename: "x.json" }));
    expect(a.kind).toBe("unavailable");
    expect(a.meta?.filters).toHaveLength(4);
  });

  it("unbekanntes Format: Rückfall, Bundle bleibt ladbar", () => {
    const a = availabilityOf(loaded({ neighbor_space: { ...NEIGHBOR_SPACE, format: 2 } }));
    expect(a.kind).toBe("unavailable");
    expect(a.kind === "unavailable" && a.reason).toMatch(/format/);
  });

  it("vom Backend mit Suchraum: verfügbar", () => {
    const a = availabilityOf(loaded({ neighbor_space: NEIGHBOR_SPACE }));
    expect(a).toMatchObject({ kind: "available", bundleId: "demo" });
  });
});

describe("Abfrageparameter", () => {
  it("schickt alle deklarierten Filter ausdrücklich, null = aus", () => {
    const values = { ...defaultValues(NEIGHBOR_SPACE.filters), n_rows: null, fremd: 5 };
    expect(buildQueryBody(NEIGHBOR_SPACE.filters, values, ["Herr"], 1000)).toEqual({
      k: 1000,
      filters: { pos: ["NOUN", "VERB"], n_rows: null, n_cooccurrences: null, is_speaker_name: true },
      stopwords: ["Herr"],
    });
  });

  it("fasst die aktiven Filter zusammen", () => {
    const decl = NEIGHBOR_SPACE.filters as Parameters<typeof filterSummary>[0];
    expect(
      filterSummary(decl, defaultValues(decl), ["Herr", "sagen", "machen"], NEIGHBOR_SPACE.stopwords),
    ).toEqual([
      "Wortart: NOUN, VERB",
      "Mindestbelegung ≥ 10",
      "Rednernamen ausblenden",
      "3 Stoppwörter (geändert)",
    ]);
    // mit bekannten Werten (aus dem Backend): Anzahl statt Aufzählung
    const withValues = [{ ...decl[0], values: [{ value: "NOUN" }, { value: "VERB" }, { value: "ADJ" }] }];
    expect(filterSummary(withValues, { pos: ["NOUN"] }, ["Herr", "sagen"], NEIGHBOR_SPACE.stopwords)).toEqual([
      "Wortart: 1 von 3",
      "2 Stoppwörter",
    ]);
  });
});

describe("Stoppwortliste", () => {
  it("ergänzt ohne Dubletten und leere Einträge, Reihenfolge bleibt", () => {
    expect(addStopwords(["Herr"], [" sagen ", "", "Herr", "machen"])).toEqual(["Herr", "sagen", "machen"]);
  });

  it("liest und schreibt das Dateiformat der Pipeline", () => {
    const text = "# Kommentar\nHerr\n\n  sagen  \n# noch einer\nHerr\nmachen\r\n";
    expect(parseStopwordText(text)).toEqual(["Herr", "sagen", "machen"]);
    expect(parseStopwordText(stopwordFileText(["Herr", "sagen"], "Demo"))).toEqual(["Herr", "sagen"]);
  });

  it("zeigt den Unterschied zur mitgelieferten Liste", () => {
    expect(stopwordDiff(["Herr", "machen"], ["Herr", "sagen"])).toEqual({ added: ["machen"], removed: ["sagen"] });
  });
});

describe("cloudWords", () => {
  const cands = {
    row: [10, 11, 12, 13, 14],
    lemma: ["Krieg", "Frieden", "Krieg", "Armee", "Panzer"],
    attributes: { n: [5, 30, 12, null, 8] as unknown[] },
  };

  it("nimmt nur verbleibende Kandidaten, je Lemma den größten Wert, die häufigsten, alphabetisch", () => {
    expect(cloudWords(cands, [10, 11, 12, 13, 14], "n", 3)).toEqual([
      { lemma: "Frieden", freq: 30 },
      { lemma: "Krieg", freq: 12 },
      { lemma: "Panzer", freq: 8 },
    ]);
    expect(cloudWords(cands, [10, 13], "n", 10)).toEqual([
      { lemma: "Armee", freq: null },
      { lemma: "Krieg", freq: 5 },
    ]);
  });

  it("ohne Häufigkeitsspalte: alle gleich, keine Werte", () => {
    expect(cloudWords(cands, [11, 14], undefined, 10)).toEqual([
      { lemma: "Frieden", freq: null },
      { lemma: "Panzer", freq: null },
    ]);
  });
});
