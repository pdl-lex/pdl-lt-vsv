/**
 * Absicherung der Zeitreihen-Schicht (Drift + Wort-gegen-Wort).
 *
 * Drei Dinge müssen stimmen, sonst zeigt die Kurve etwas anderes, als sie
 * behauptet:
 * 1. **Die Kurve ist wirklich eine Zeile der Matrix** (`1 − cos`). Wären es
 *    zwei getrennte Rechenwege, könnten Matrix und Kurve auseinanderlaufen.
 * 2. **Lücken bleiben Lücken** — `null`, nie 0. Eine 0 hieße „identisch mit dem
 *    Bezugspunkt" und wäre die denkbar falscheste Aussage über fehlende Daten.
 * 3. **Der Bezugspunkt ist ehrlich**: fehlt er, wird die Kurve nicht gezeichnet
 *    (`baselineMissing`) statt still auf etwas anderes auszuweichen.
 */
import { describe, it, expect } from "vitest";
import { fixturePath } from "../test/fixtures";
import { readFileSync } from "node:fs";
import { validateBundle } from "../types/schema";
import { indexBundle } from "../data/model";
import { buildSimilarityMatrix } from "./similarity";
import { buildDriftSeries, buildPairSeries, firstPresentIndex, seriesDomain } from "./series";


function indexed(name: string) {
  return indexBundle(validateBundle(JSON.parse(readFileSync(fixturePath(name), "utf-8"))));
}

/** `zeitenwende` ist das einzige teilbelegte Zielwort der Demo (21 von 64
 * Quartalen, erster Beleg bei Index 43) — der Prüffall für alle Lücken-Regeln. */
const GAP_WORD = "zeitenwende";
const GAP_FIRST = 43;

describe("buildDriftSeries", () => {
  it("startet beim Erstbeleg mit exakt 0 und lässt davor Lücken", () => {
    const idx = indexed("zeitenwende_demo.json");
    const s = buildDriftSeries(idx, GAP_WORD, { kind: "erstbeleg" })!;

    expect(s.baselineIndex).toBe(GAP_FIRST);
    expect(s.baselineMissing).toBe(false);
    expect(s.values[GAP_FIRST]).toBeCloseTo(0, 10);
    expect(s.values.slice(0, GAP_FIRST).every((v) => v === null)).toBe(true);
    expect(s.valueCount).toBe(21);
  });

  it("ist Zeile für Zeile identisch mit 1 − Matrixwert", () => {
    const idx = indexed("zeitenwende_demo.json");
    const id = idx.tracks[0].entity.id;
    const s = buildDriftSeries(idx, id, { kind: "scheibe", index: 0 })!;
    const m = buildSimilarityMatrix(idx, id)!;

    for (let i = 0; i < idx.sliceCount; i++) {
      const cell = m.values[0 * m.n + i];
      if (!Number.isFinite(cell)) expect(s.values[i]).toBeNull();
      else expect(s.values[i]).toBeCloseTo(1 - cell, 6);
    }
  });

  it("meldet einen unbelegten Bezugspunkt, statt still auszuweichen", () => {
    const idx = indexed("zeitenwende_demo.json");
    const s = buildDriftSeries(idx, GAP_WORD, { kind: "scheibe", index: 0 })!;

    expect(s.baselineMissing).toBe(true);
    expect(s.valueCount).toBe(0);
    expect(s.values.every((v) => v === null)).toBe(true);
  });

  it("vergleicht im Vorgänger-Modus strikt die Nachbarscheibe", () => {
    const idx = indexed("zeitenwende_demo.json");
    const s = buildDriftSeries(idx, GAP_WORD, { kind: "vorgaenger" })!;

    expect(s.values[0]).toBeNull(); // keine Vorscheibe
    expect(s.baselineIndex).toBeNull();
    // Erster Beleg: Vorscheibe fehlt → keine Rate, keine überspannte Lücke.
    expect(s.values[GAP_FIRST]).toBeNull();
    expect(s.values[GAP_FIRST + 1]).not.toBeNull();
    expect(s.valueCount).toBe(20);
  });

  it("liefert nur nichtnegative Distanzen und kennt unbekannte Wörter nicht", () => {
    const idx = indexed("generic_demo.json");
    const s = buildDriftSeries(idx, idx.tracks[0].entity.id, { kind: "erstbeleg" })!;
    for (const v of s.values) {
      if (v === null) continue;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(2);
    }
    expect(buildDriftSeries(idx, "gibt-es-nicht", { kind: "erstbeleg" })).toBeNull();
  });
});

describe("buildPairSeries", () => {
  it("ist symmetrisch und gegen sich selbst konstant 1", () => {
    const idx = indexed("generic_demo.json");
    const [a, b] = idx.tracks.map((t) => t.entity.id);
    const ab = buildPairSeries(idx, a, b)!;
    const ba = buildPairSeries(idx, b, a)!;
    const self = buildPairSeries(idx, a, a)!;

    ab.values.forEach((v, i) => {
      if (v === null) expect(ba.values[i]).toBeNull();
      else expect(ba.values[i]!).toBeCloseTo(v, 10);
    });
    for (const v of self.values) if (v !== null) expect(v).toBeCloseTo(1, 6);
  });

  it("setzt aus, sobald eines der beiden Wörter nicht belegt ist", () => {
    const idx = indexed("zeitenwende_demo.json");
    const s = buildPairSeries(idx, "bundeswehr", GAP_WORD)!;

    expect(s.values.slice(0, GAP_FIRST).every((v) => v === null)).toBe(true);
    expect(s.values[GAP_FIRST]).not.toBeNull();
    expect(s.valueCount).toBe(21);
  });

  it("bleibt im Kosinus-Wertebereich", () => {
    const idx = indexed("zeitenwende_demo.json");
    const s = buildPairSeries(idx, "bundeswehr", "ruestung")!;
    for (const v of s.values) {
      if (v === null) continue;
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("seriesDomain", () => {
  it("verankert mit zeroFloor bei 0 und polstert nach oben", () => {
    const d = seriesDomain([[0.2, 0.4, null]], { zeroFloor: true });
    expect(d.min).toBe(0);
    expect(d.max).toBeGreaterThan(0.4);
  });

  it("spannt ohne zeroFloor um die tatsächlichen Werte", () => {
    const d = seriesDomain([[0.8, 0.9]]);
    expect(d.min).toBeLessThan(0.8);
    expect(d.min).toBeGreaterThan(0.5); // nicht bis 0 aufgerissen
    expect(d.max).toBeGreaterThan(0.9);
  });

  it("gibt konstanten und leeren Kurven eine zeichenbare Achse", () => {
    const flat = seriesDomain([[0.5, 0.5]]);
    expect(flat.max).toBeGreaterThan(flat.min);
    expect(seriesDomain([[null, null]])).toEqual({ min: 0, max: 1 });
    expect(seriesDomain([])).toEqual({ min: 0, max: 1 });
  });
});

describe("firstPresentIndex", () => {
  it("findet den ersten belegten Eintrag, sonst null", () => {
    expect(firstPresentIndex([null, null, [1, 2]])).toBe(2);
    expect(firstPresentIndex([null, null])).toBeNull();
  });
});
