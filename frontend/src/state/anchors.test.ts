/**
 * Anker der Sitzung: Wortbestand, Suche, Import/Export und die Zuordnung der
 * Nachbarlisten zu einer geänderten Ankerliste.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fixturePath } from "../test/fixtures";
import { validateBundle, type Anchor } from "../types/schema";
import {
  anchorForLabel,
  FALLBACK_GROUP,
  indexBundle,
  neighborsAt,
  pointForLabel,
  withAnchors,
  withBundleNeighbors,
  withQueriedNeighbors,
} from "../data/model";
import type { NeighborCandidates, NeighborQueryResult } from "../data/apiClient";
import {
  addAnchors,
  anchorCatalog,
  anchorDiff,
  anchorFileText,
  anchorFromWord,
  parseAnchorText,
  resolveAnchorRows,
  searchCatalog,
} from "./anchors";

const bundle = () => validateBundle(JSON.parse(readFileSync(fixturePath("zeitenwende_demo.json"), "utf-8")));

const SHIPPED: Anchor[] = [
  { label: "Einsatzkräfte", cluster: "MILITÄR", lemma: "Einsatzkräft", coords_3d: [1, 2, 3] },
  { label: "Panne", cluster: "SKANDAL", coords_3d: [0, 0, 1] },
];

const CANDIDATES: NeighborCandidates = {
  row: [100, 101, 102, 103],
  lemma: ["Einsatzkräft", "Drohne", "Fahrplan", "Panzer"],
  label: ["Einsatzkräfte", "Drohne", "Fahrplan", "Panzer"],
  group: ["MILITÄR", "KONTEXT", "KONTEXT", "KONTEXT"],
  coords_3d: [[1, 2, 3], [4, 5, 6], [7, 8, 9], [9, 9, 9]],
  attributes: {},
  slice: [null, null, null, "2022Q1"],
};

describe("anchorCatalog / searchCatalog", () => {
  const catalog = anchorCatalog(SHIPPED, CANDIDATES, [{ label: "Drohnen", coords_3d: [0, 1, 0] }]);

  it("führt Anker, Kandidaten und Vokabelpunkte je Lemma einmal", () => {
    expect(catalog.map((w) => [w.lemma, w.label, w.source])).toEqual([
      ["Einsatzkräft", "Einsatzkräfte", "anchor"],
      ["Panne", "Panne", "anchor"],
      ["Drohne", "Drohne", "candidate"],
      ["Fahrplan", "Fahrplan", "candidate"],
      ["Drohnen", "Drohnen", "vocab"],
    ]);
  });

  it("lässt Kandidaten mit eigener Zeitscheibe aus (keine feste Position)", () => {
    expect(catalog.some((w) => w.lemma === "Panzer")).toBe(false);
  });

  it("sortiert exakt vor Wortanfang vor Teilwort, ohne Groß-/Kleinschreibung", () => {
    expect(searchCatalog(catalog, "drohne", 10).map((w) => w.lemma)).toEqual(["Drohne", "Drohnen"]);
    expect(searchCatalog(catalog, "kräfte", 10).map((w) => w.lemma)).toEqual(["Einsatzkräft"]);
    expect(searchCatalog(catalog, "  ", 10)).toEqual([]);
    expect(searchCatalog(catalog, "e", 2)).toHaveLength(2);
  });

  it("übernimmt Label und Cluster eines Bundle-Ankers, sonst Lemma und _", () => {
    expect(anchorFromWord(catalog[0])).toMatchObject({ label: "Einsatzkräfte", cluster: "MILITÄR", lemma: "Einsatzkräft" });
    expect(anchorFromWord(catalog[2])).toMatchObject({ label: "Drohne", cluster: "_", lemma: "Drohne", coords_3d: [4, 5, 6] });
    expect(anchorFromWord(catalog[2], " UAV ", "MILITÄR")).toMatchObject({ label: "UAV", cluster: "MILITÄR" });
  });
});

describe("Liste, Unterschied, Import/Export", () => {
  const drohne: Anchor = { label: "Drohne", cluster: "MILITÄR", lemma: "Drohne", coords_3d: [4, 5, 6] };

  it("ergänzt ohne Dubletten nach Lemma oder Label", () => {
    const list = addAnchors(SHIPPED, [drohne, { ...drohne, label: "UAV" }, { ...drohne, lemma: "x" }]);
    expect(list.map((a) => a.label)).toEqual(["Einsatzkräfte", "Panne", "Drohne"]);
  });

  it("zählt ergänzte, entfernte und umbenannte Anker", () => {
    const working = [{ ...SHIPPED[0], cluster: "WEHR" }, drohne];
    const d = anchorDiff(working, SHIPPED);
    expect(d.added.map((a) => a.label)).toEqual(["Drohne"]);
    expect(d.removed.map((a) => a.label)).toEqual(["Panne"]);
    expect(d.changed.map((a) => a.label)).toEqual(["Einsatzkräfte"]);
  });

  it("liest die eigene Exportdatei wieder ein", () => {
    const text = anchorFileText([...SHIPPED, drohne], "Demo");
    expect(parseAnchorText(text)).toEqual([
      { lemma: "Einsatzkräft", label: "Einsatzkräfte", cluster: "MILITÄR" },
      { lemma: "Panne", label: "Panne", cluster: "SKANDAL" },
      { lemma: "Drohne", label: "Drohne", cluster: "MILITÄR" },
    ]);
  });

  it("liest Semikolon-Tabellen und reine Wortlisten", () => {
    expect(parseAnchorText('lemma;label;cluster\n"Drohne";UAV;\n# Kommentar\nPanne')).toEqual([
      { lemma: "Drohne", label: "UAV", cluster: undefined },
      { lemma: "Panne", label: undefined, cluster: undefined },
    ]);
    expect(parseAnchorText("Drohne\nFrontlinie\n")).toEqual([{ lemma: "Drohne" }, { lemma: "Frontlinie" }].map((r) => ({ ...r, label: undefined, cluster: undefined })));
  });

  it("holt Positionen aus dem Bestand und meldet Wörter ohne Position", () => {
    const catalog = anchorCatalog(SHIPPED, CANDIDATES, []);
    const { anchors, missing } = resolveAnchorRows(
      [{ lemma: "Drohne", cluster: "MILITÄR" }, { lemma: "Einsatzkräfte" }, { lemma: "Panzer" }, { lemma: "Unbekannt" }],
      catalog,
    );
    expect(anchors).toEqual([
      { label: "Drohne", cluster: "MILITÄR", lemma: "Drohne", coords_3d: [4, 5, 6] },
      { label: "Einsatzkräfte", cluster: "MILITÄR", lemma: "Einsatzkräft", coords_3d: [1, 2, 3] },
    ]);
    expect(missing).toEqual(["Panzer", "Unbekannt"]);
  });
});

describe("withAnchors", () => {
  const idx = indexBundle(bundle());
  const entityId = "bundeswehr";
  const slice = idx.sliceIndexById.get("2010Q1")!;
  const first = neighborsAt(idx, entityId, slice)[0]; // Sparzwang, Anker im Bundle

  it("entfernt einen Anker: Nachbar wird zu Lemma und KONTEXT, Bundle bleibt", () => {
    const next = withAnchors(idx, idx.anchors.filter((a) => a.label !== first.label));
    expect(neighborsAt(next, entityId, slice)[0]).toMatchObject({ label: first.label, group: FALLBACK_GROUP, score: first.score });
    expect(anchorForLabel(next, first.label)).toBeUndefined();
    expect(next.bundle.anchors).toBe(idx.bundle.anchors);
    expect(next.clusters).toEqual(idx.clusters);
  });

  it("benennt um: Nachbar trägt neues Label und Cluster und hat eine Position", () => {
    // Wie `anchorActions.edit`: ein Anker ohne Lemma behält sein altes Label als Lemma
    const next = withAnchors(
      idx,
      idx.anchors.map((a) =>
        a.label === first.label ? { ...a, label: "Sparen", cluster: "HAUSHALT", lemma: a.label } : a,
      ),
    );
    expect(neighborsAt(next, entityId, slice)[0]).toMatchObject({ label: "Sparen", group: "HAUSHALT", lemma: first.label });
    expect(next.clusters).toContain("HAUSHALT");
    expect(pointForLabel(next, "Sparen")).toEqual(anchorForLabel(idx, first.label)!.coords_3d);
  });

  it("ordnet neue Anker auch Abfrageergebnissen zu, und bleibt beim Rückfall", () => {
    const sliceId = idx.sortedSlices[slice].id;
    const result: NeighborQueryResult = {
      k: 1000, n_candidates: 2, n_candidates_total: 4,
      neighbors: { [entityId]: { [sliceId]: { rows: [101, 102], scores: [0.9, 0.8] } } },
    };
    const drohne: Anchor = { label: "Drohne", cluster: "MILITÄR", lemma: "Drohne", coords_3d: [4, 5, 6] };
    const edited = withAnchors(idx, [...idx.anchors, drohne]);
    const q = withQueriedNeighbors(edited, CANDIDATES, result);
    expect(neighborsAt(q, entityId, slice).map((n) => [n.label, n.group])).toEqual([
      ["Drohne", "MILITÄR"],
      ["Fahrplan", FALLBACK_GROUP],
    ]);
    expect(q.anchors).toBe(edited.anchors);
    const back = withBundleNeighbors(q);
    expect(back.anchors).toBe(edited.anchors);
    expect(anchorForLabel(back, "Drohne")).toBe(drohne);
  });

  it("zurück auf die Anker des Bundles: Nachbarn wieder wie geliefert", () => {
    const edited = withAnchors(idx, []);
    expect(edited.clusters).toEqual([]);
    const back = withAnchors(edited, idx.bundle.anchors);
    expect(back.neighbors).toBe(idx.bundle.neighbors);
    expect(back.clusters).toEqual(idx.clusters);
  });
});
