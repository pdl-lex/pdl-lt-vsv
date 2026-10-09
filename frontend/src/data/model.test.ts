/**
 * Aufbereitung des Bundles: Interpolation über unbelegte Zellen, Zuordnung von
 * Nachbarn zu Ankern und Positionen (Groß-/Kleinschreibung, Positionen je
 * Zeitscheibe) und große Bundles.
 */
import { describe, it, expect } from "vitest";
import { validateBundle, type Bundle } from "../types/schema";
import type { NeighborCandidates, NeighborQueryResult } from "./apiClient";
import { anchorForLabel, indexBundle, pointForLabel, sampleTrackAt, toWorld, withQueriedNeighbors } from "./model";
import { neighborPointsAt } from "../viz/neighborPointsData";

function mini(): Bundle {
  return validateBundle({
    meta: { name: "mini" },
    entities: [{ id: "w", label: "w" }],
    time_slices: [
      { id: "t0", index: 0 },
      { id: "t1", index: 1 },
      { id: "t2", index: 2 },
    ],
    anchors: [{ label: "Bedarf", cluster: "X", lemma: "Bedarf", coords_3d: [1, 1, 1] }],
    vocab_points: [
      { label: "bedarf", coords_3d: [2, 2, 2] },
      { label: "sicherheit", coords_3d: [3, 3, 3] },
    ],
    aggregates: [
      { entity_id: "w", time_slice_id: "t0", coords_3d: [0, 0, 0], freq: 10 },
      // unbelegt: die Koordinate ist ein Platzhalter
      { entity_id: "w", time_slice_id: "t1", coords_3d: [9, 9, 9], freq: 0 },
      { entity_id: "w", time_slice_id: "t2", coords_3d: [4, 0, 0], freq: 10 },
    ],
    neighbors: { w: { t0: [{ label: "bedarf" }, { label: "Bedarf" }, { label: "Sicherheit" }] } },
  });
}

describe("sampleTrackAt", () => {
  const track = indexBundle(mini()).tracks[0];

  it("wandert nicht auf die Platzhalter-Koordinate einer unbelegten Zelle zu", () => {
    expect(sampleTrackAt(track, 0.4)?.coords).toEqual([0, 0, 0]);
    expect(sampleTrackAt(track, 0.6)).toBeNull(); // näher an der unbelegten Scheibe
    expect(sampleTrackAt(track, 1)).toBeNull();
    expect(sampleTrackAt(track, 1.6)?.coords).toEqual([4, 0, 0]);
  });

  it("interpoliert zwischen zwei belegten Zellen", () => {
    const b = mini();
    b.aggregates[1] = { ...b.aggregates[1], freq: 10 };
    const t = indexBundle(b).tracks[0];
    expect(sampleTrackAt(t, 0.5)?.coords).toEqual([4.5, 4.5, 4.5]);
  });
});

describe("Anker und Positionen: Groß-/Kleinschreibung", () => {
  const idx = indexBundle(mini());

  it("`bedarf` ist nicht der Anker `Bedarf` und behält seine eigene Position", () => {
    expect(anchorForLabel(idx, "bedarf")).toBeUndefined();
    expect(anchorForLabel(idx, "Bedarf")?.cluster).toBe("X");
    expect(pointForLabel(idx, "bedarf")).toEqual([2, 2, 2]);
    expect(pointForLabel(idx, "Bedarf")).toEqual([1, 1, 1]);
  });

  it("ohne exakten Eintrag hilft der Rückfall ohne Groß-/Kleinschreibung", () => {
    expect(pointForLabel(idx, "Sicherheit")).toEqual([3, 3, 3]);
  });

  it("im 3D-Bild: `bedarf` wird gezeichnet, nur `Bedarf` gilt als Anker", () => {
    const punkte = neighborPointsAt(idx, "w", 0, 3);
    expect(punkte.map((p) => [p.label, p.isAnchor])).toEqual([
      ["bedarf", false],
      ["Bedarf", true],
      ["Sicherheit", false],
    ]);
    expect(punkte[0].pos).toEqual(toWorld(idx, [2, 2, 2]));
  });
});

describe("Positionen je Zeitscheibe (SGNS-Suchraum)", () => {
  it("nimmt die Position des Kandidaten aus der jeweiligen Zeitscheibe", () => {
    const idx = indexBundle(mini());
    const candidates: NeighborCandidates = {
      row: [10, 11],
      lemma: ["Drohne", "Drohne"],
      label: ["Drohne", "Drohne"],
      group: ["KONTEXT", "KONTEXT"],
      coords_3d: [
        [5, 5, 5],
        [6, 6, 6],
      ],
      attributes: {},
      slice: ["t0", "t2"],
    };
    const result: NeighborQueryResult = {
      k: 1000,
      n_candidates: 2,
      n_candidates_total: 2,
      neighbors: { w: { t0: { rows: [10], scores: [0.9] }, t2: { rows: [11], scores: [0.8] } } },
    };
    const q = withQueriedNeighbors(idx, candidates, result);
    expect(pointForLabel(q, "Drohne", 0)).toEqual([5, 5, 5]);
    expect(pointForLabel(q, "Drohne", 2)).toEqual([6, 6, 6]);
    expect(neighborPointsAt(q, "w", 2, 1)[0].pos).toEqual(toWorld(q, [6, 6, 6]));
  });
});

describe("große Bundles", () => {
  it("indiziert auch sehr viele Zellen (kein Spread über die Argumentgrenze)", () => {
    const b = mini();
    const many = Array.from({ length: 300_000 }, (_, i) => ({
      ...b.aggregates[0],
      freq: i === 123_456 ? 999 : 5,
    }));
    const idx = indexBundle({ ...b, aggregates: many, records: many });
    expect(idx.aggFreqMax).toBe(999);
    expect(idx.recordFreqMax).toBe(999);
  });
});
