/**
 * Absicherung der Gonen-Überlappung: Grundrechnung, Maskierung unbelegter
 * Scheiben und dass der Nachbar-Diff exakt zur Zahl in der Matrix passt.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { validateBundle } from "../types/schema";
import { entityFreqAt, indexBundle } from "../data/model";
import {
  buildChangeRanking,
  buildOverlapMatrix,
  defaultPeriods,
  diffLists,
  diffOverlap,
  neighborDiff,
  neighborSets,
  overlap,
  pooledNeighbors,
} from "./overlap";
import { buildOverlapDriftSeries } from "./series";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "../../../data/test");

function indexed(name: string) {
  return indexBundle(validateBundle(JSON.parse(readFileSync(resolve(dataDir, name), "utf-8"))));
}

describe("overlap", () => {
  it("zählt gemeinsame Elemente relativ zur kürzeren Liste", () => {
    expect(overlap(new Set(["a", "b", "c", "d"]), new Set(["c", "d", "e", "f"]))).toBe(0.5);
    expect(overlap(new Set(["a", "b"]), new Set(["a", "b", "c", "d"]))).toBe(1);
    expect(overlap(new Set(["a"]), new Set(["b"]))).toBe(0);
  });

  it("gibt NaN statt 0 bei leerer Liste", () => {
    expect(overlap(new Set(), new Set(["a"]))).toBeNaN();
  });
});

describe("buildOverlapMatrix gegen die Demo-Bundles", () => {
  for (const file of ["zeitenwende_demo.json", "generic_demo.json"]) {
    it(`${file}: symmetrisch, 1 auf der Diagonale, Werte in [0,1]`, () => {
      const idx = indexed(file);
      const id = idx.tracks[0].entity.id;
      const m = buildOverlapMatrix(idx, id, 5)!;
      const { n, values } = m;
      for (let i = 0; i < n; i++) {
        if (!m.present[i]) continue;
        expect(values[i * n + i]).toBe(1);
        for (let j = 0; j < n; j++) {
          const v = values[i * n + j];
          if (!m.present[j]) {
            expect(v).toBeNaN();
            continue;
          }
          expect(v).toBe(values[j * n + i]);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    });

    it(`${file}: unbelegte Scheiben (freq 0) sind maskiert`, () => {
      const idx = indexed(file);
      for (const t of idx.tracks) {
        const sets = neighborSets(idx, t.entity.id, 5);
        sets.forEach((s, i) => {
          if (entityFreqAt(idx, t.entity.id, i) <= 0) expect(s).toBeNull();
        });
      }
    });

    it(`${file}: Nachbar-Diff ergibt genau den Matrixwert`, () => {
      const idx = indexed(file);
      const id = idx.tracks[0].entity.id;
      const k = 5;
      const m = buildOverlapMatrix(idx, id, k)!;
      const i = m.present.indexOf(true);
      const j = m.present.lastIndexOf(true);
      const d = neighborDiff(idx, id, i, j, k)!;
      const denom = Math.min(d.shared.length + d.onlyA.length, d.shared.length + d.onlyB.length);
      expect(d.shared.length / denom).toBeCloseTo(m.values[i * m.n + j], 6);
    });

    it(`${file}: Drift = 1 − Matrixzeile des Erstbelegs`, () => {
      const idx = indexed(file);
      const id = idx.tracks[0].entity.id;
      const m = buildOverlapMatrix(idx, id, 5)!;
      const s = buildOverlapDriftSeries(idx, id, { kind: "erstbeleg" }, 5)!;
      const b = s.baselineIndex!;
      s.values.forEach((v, t) => {
        const cell = m.values[b * m.n + t];
        if (Number.isFinite(cell)) expect(v).toBeCloseTo(1 - cell, 6);
        else expect(v).toBeNull();
      });
    });
  }
});

describe("Wandel-Ranking", () => {
  it("diffLists: Überlappung passt zu overlap()", () => {
    const a = ["a", "b", "c", "d"];
    const b = ["c", "x", "a", "y"];
    const d = diffLists(a, b, 4);
    expect(d.shared.map((e) => e.label)).toEqual(["a", "c"]); // Rangsumme gleich (4) → stabile Reihenfolge
    expect(d.onlyA.map((e) => e.label)).toEqual(["b", "d"]);
    expect(d.onlyB.map((e) => e.label)).toEqual(["x", "y"]);
    expect(diffOverlap(d)).toBe(overlap(new Set(a), new Set(b)));
  });

  for (const file of ["zeitenwende_demo.json", "generic_demo.json"]) {
    it(`${file}: gepoolte Liste über eine Scheibe = deren Top k`, () => {
      const idx = indexed(file);
      const id = idx.tracks[0].entity.id;
      const i = neighborSets(idx, id, 5).findIndex((s) => s !== null);
      const pooled = pooledNeighbors(idx, id, { from: i, to: i }, 5);
      expect(pooled.used).toBe(1);
      expect(new Set(pooled.labels)).toEqual(neighborSets(idx, id, 5)[i]);
    });

    it(`${file}: Ranking ist aufsteigend nach Überlappung, leere Zeilen zuletzt`, () => {
      const idx = indexed(file);
      const { a, b } = defaultPeriods(idx);
      expect(a.to + 1).toBe(b.from);
      const rows = buildChangeRanking(idx, idx.tracks.map((t) => t.entity.id), a, b, 5);
      expect(rows).toHaveLength(idx.tracks.length);
      const finite = rows.filter((r) => Number.isFinite(r.between)).map((r) => r.between);
      expect([...finite].sort((x, y) => x - y)).toEqual(finite);
      const firstNaN = rows.findIndex((r) => !Number.isFinite(r.between));
      if (firstNaN !== -1) expect(rows.slice(firstNaN).every((r) => !Number.isFinite(r.between))).toBe(true);
      for (const r of rows) {
        expect(r.a.labels.length).toBeLessThanOrEqual(5);
        if (Number.isFinite(r.withinA)) expect(r.withinA).toBeLessThanOrEqual(1);
      }
    });
  }
});
