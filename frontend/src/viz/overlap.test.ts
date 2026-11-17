/**
 * Absicherung der Gonen-Überlappung: Grundrechnung, Maskierung unbelegter
 * Scheiben und dass der Nachbar-Diff exakt zur Zahl in der Matrix passt.
 */
import { describe, it, expect } from "vitest";
import { fixturePath } from "../test/fixtures";
import { readFileSync } from "node:fs";
import { validateBundle } from "../types/schema";
import { entityFreqAt, indexBundle } from "../data/model";
import {
  buildChangeRanking,
  buildOverlapMatrix,
  changeRankingCsv,
  cosineChange,
  defaultPeriods,
  diffLists,
  diffOverlap,
  neighborDiff,
  neighborSets,
  overlap,
  pooledNeighbors,
  splitBaseline,
  splitNull,
} from "./overlap";
import { buildOverlapDriftSeries } from "./series";
import { buildSimilarityMatrix } from "./similarity";


function indexed(name: string) {
  return indexBundle(validateBundle(JSON.parse(readFileSync(fixturePath(name), "utf-8"))));
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

    it(`${file}: Ranking absteigend nach Abstand zum Zufall, einseitig belegte zuletzt`, () => {
      const idx = indexed(file);
      const { a, b } = defaultPeriods(idx);
      expect(a.to + 1).toBe(b.from);
      const rows = buildChangeRanking(idx, idx.tracks.map((t) => t.entity.id), a, b, 5);
      expect(rows).toHaveLength(idx.tracks.length);
      const gaps = rows.filter((r) => Number.isFinite(r.gap)).map((r) => r.gap);
      expect([...gaps].sort((x, y) => y - x)).toEqual(gaps);
      const firstNaN = rows.findIndex((r) => !Number.isFinite(r.gap));
      if (firstNaN !== -1) expect(rows.slice(firstNaN).every((r) => !Number.isFinite(r.gap))).toBe(true);
      for (const r of rows) {
        expect(r.a.labels.length).toBeLessThanOrEqual(5);
        if (Number.isFinite(r.withinA)) expect(r.withinA).toBeLessThanOrEqual(1);
        expect(Number.isFinite(r.baseline)).toBe(Number.isFinite(r.between));
        expect(Number.isFinite(r.p)).toBe(Number.isFinite(r.between));
        if (Number.isFinite(r.p)) {
          expect(r.p).toBeGreaterThan(0);
          expect(r.p).toBeLessThanOrEqual(1);
        }
        expect(r.coverage === "beide").toBe(r.a.used > 0 && r.b.used > 0);
        if (r.coverage === "nur B") expect(r.freqA).toBe(0);
      }
    });

    it(`${file}: Kosinus über je eine Scheibe = 1 − Wert der Kosinus-Matrix`, () => {
      const idx = indexed(file);
      for (const t of idx.tracks) {
        const m = buildSimilarityMatrix(idx, t.entity.id)!;
        const present = m.present.flatMap((p, i) => (p ? [i] : []));
        if (present.length < 2) continue;
        const [i, j] = [present[0], present[present.length - 1]];
        const c = cosineChange(idx, t.entity.id, { from: i, to: i }, { from: j, to: j });
        expect(c.distance).toBeCloseTo(1 - m.values[i * m.n + j], 5);
        // zwei Scheiben, zwei Aufteilungen (echte und Spiegel), beide gleich weit
        expect(c.p).toBe(1);
      }
    });

    it(`${file}: Sortierung nach Kosinus folgt rankCos, beide Ränge gesetzt`, () => {
      const idx = indexed(file);
      const { a, b } = defaultPeriods(idx);
      const ids = idx.tracks.map((t) => t.entity.id);
      const rows = buildChangeRanking(idx, ids, a, b, 5, "kosinus");
      const ranks = rows.map((r) => r.rankCos).filter((x): x is number => x !== null);
      expect(ranks).toEqual(ranks.map((_, i) => i + 1));
      const gaps = rows.filter((r) => r.rankCos !== null).map((r) => r.cos.gap);
      expect([...gaps].sort((x, y) => y - x)).toEqual(gaps);
      for (const r of rows) {
        expect(r.rankOverlap === null).toBe(!Number.isFinite(r.gap));
        if (Number.isFinite(r.cos.distance)) {
          expect(r.cos.distance).toBeGreaterThanOrEqual(-1e-9);
          expect(r.cos.distance).toBeLessThanOrEqual(2);
          expect(r.cos.p).toBeGreaterThan(0);
          expect(r.cos.p).toBeLessThanOrEqual(1);
        }
      }
      // gleiche Zeilen, nur andere Reihenfolge
      const byOverlap = buildChangeRanking(idx, ids, a, b, 5);
      expect(new Set(byOverlap.map((r) => r.entityId))).toEqual(new Set(rows.map((r) => r.entityId)));
    });

    it(`${file}: CSV hat eine Zeile je Zielwort und Ränge nur bei Überlappung`, () => {
      const idx = indexed(file);
      const { a, b } = defaultPeriods(idx);
      const rows = buildChangeRanking(idx, idx.tracks.map((t) => t.entity.id), a, b, 5);
      const lines = changeRankingCsv(rows, { periodA: "A", periodB: "B", k: 5 }).trimEnd().split("\n");
      expect(lines).toHaveLength(rows.length + 1);
      expect(lines[0].split(",")[0]).toBe("rank");
      rows.forEach((r, i) => {
        const rank = lines[i + 1].split(",")[0];
        expect(rank === "").toBe(!Number.isFinite(r.between));
      });
    });

    it(`${file}: Pooling hängt nur von den Top k ab, nicht von der Listenlänge`, () => {
      const idx = indexed(file);
      // Dieselben Listen, nur hinten verlängert (wie 150 → 1000 aus der Abfrage)
      const longer = Object.fromEntries(
        Object.entries(idx.neighbors).map(([e, per]) => [
          e,
          Object.fromEntries(
            Object.entries(per).map(([s, list]) => [
              s,
              [...list, ...Array.from({ length: 50 }, (_, i) => ({ label: `__extra${i}` }))],
            ]),
          ),
        ]),
      );
      const idxLong = { ...idx, neighbors: longer, maxNeighborK: idx.maxNeighborK + 50 };
      const { a, b } = defaultPeriods(idx);
      const k = 5;
      const short = buildChangeRanking(idx, idx.tracks.map((t) => t.entity.id), a, b, k);
      const long = buildChangeRanking(idxLong, idx.tracks.map((t) => t.entity.id), a, b, k);
      expect(long.map((r) => [r.entityId, r.a.labels, r.b.labels, r.between, r.baseline])).toEqual(
        short.map((r) => [r.entityId, r.a.labels, r.b.labels, r.between, r.baseline]),
      );
    });
  }

  it("splitBaseline: gleiche Listen → 1, getrennte Zeiträume → Zufall deutlich über A ↔ B", () => {
    const same = [["a", "b", "c"], ["a", "b", "c"]];
    expect(splitBaseline(same, same, 3)).toBe(1);

    const listsA = [["a", "b", "c"], ["a", "b", "c"], ["a", "b", "c"]];
    const listsB = [["x", "y", "z"], ["x", "y", "z"], ["x", "y", "z"]];
    const baseline = splitBaseline(listsA, listsB, 3);
    expect(baseline).toBeGreaterThan(0.3); // gemischte Gruppen teilen Nachbarn
    expect(splitBaseline(listsA, [], 3)).toBeNaN();
  });

  it("splitNull: p klein bei getrennten Zeiträumen, 1 bei gleichen Listen", () => {
    const listsA = [["a", "b", "c"], ["a", "b", "c"], ["a", "b", "c"]];
    const listsB = [["x", "y", "z"], ["x", "y", "z"], ["x", "y", "z"]];
    // k = 6: jede gemischte Gruppe enthält alle sechs Wörter (Überlappung 1);
    // nur die echte Aufteilung und ihr Spiegel haben 0. C(6,3) = 20 → p = 3/21.
    const sep = splitNull(listsA, listsB, 6, 0);
    expect(sep.splits).toBe(20);
    expect(sep.mean).toBeCloseTo(18 / 20);
    expect(sep.mean).toBe(splitBaseline(listsA, listsB, 6));
    expect(sep.p).toBeCloseTo(3 / 21);
    const same = [["a", "b", "c"], ["a", "b", "c"]];
    expect(splitNull(same, same, 3, 1).p).toBe(1);
    expect(splitNull(listsA, listsB, 3, NaN).p).toBeNaN();
  });

  it("splitBaseline: Zufallsauswahl ist deterministisch", () => {
    const lists = Array.from({ length: 20 }, (_, i) => [`w${i % 7}`, `w${(i * 3) % 11}`, "fest"]);
    const a = lists.slice(0, 10);
    const b = lists.slice(10);
    expect(splitBaseline(a, b, 3, 16)).toBe(splitBaseline(a, b, 3, 16));
  });
});
