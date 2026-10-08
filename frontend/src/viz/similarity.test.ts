/**
 * Absicherung der Kiyama-Rechenschicht. Zwei Dinge müssen stimmen, sonst lügt
 * die Matrix optisch: die **Symmetrie/Diagonale** (sonst ist das Muster kaputt)
 * und die **Maskierung unbelegter Zeitscheiben** (sonst behauptet die Fläche
 * Ähnlichkeit, wo gar keine Daten sind).
 */
import { describe, it, expect } from "vitest";
import { fixturePath } from "../test/fixtures";
import { readFileSync } from "node:fs";
import { validateBundle } from "../types/schema";
import { indexBundle } from "../data/model";
import {
  buildSimilarityMatrix,
  cosine,
  normalize,
  sharedDomain,
  similaritySourceOf,
} from "./similarity";


function indexed(name: string) {
  return indexBundle(validateBundle(JSON.parse(readFileSync(fixturePath(name), "utf-8"))));
}

describe("cosine", () => {
  it("gibt 1 für identische und -1 für entgegengesetzte Vektoren", () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
    expect(cosine([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1, 10);
  });

  it("gibt 0 für orthogonale Vektoren", () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  it("gibt NaN statt eines still falschen 0-Werts bei Nullvektor/Dim-Konflikt", () => {
    expect(cosine([0, 0], [1, 1])).toBeNaN();
    expect(cosine([1, 2], [1, 2, 3])).toBeNaN();
    expect(cosine([], [])).toBeNaN();
  });

  it("klemmt Rundungsfehler auf [-1,1]", () => {
    const v = [0.1, 0.2, 0.3];
    expect(cosine(v, v)).toBeLessThanOrEqual(1);
  });
});

describe("buildSimilarityMatrix gegen die Demo-Bundles", () => {
  for (const file of ["zeitenwende_demo.json", "generic_demo.json"]) {
    it(`${file}: nutzt die vollen Vektoren, nicht coords_3d`, () => {
      expect(similaritySourceOf(indexed(file))).toBe("vector");
    });

    it(`${file}: Matrix ist symmetrisch mit 1 auf der Diagonale`, () => {
      const idx = indexed(file);
      const m = buildSimilarityMatrix(idx, idx.tracks[0].entity.id)!;
      expect(m.n).toBe(idx.sliceCount);

      for (let i = 0; i < m.n; i++) {
        if (!m.present[i]) continue;
        expect(m.values[i * m.n + i]).toBe(1);
        for (let j = 0; j < m.n; j++) {
          if (!m.present[j]) continue;
          expect(m.values[i * m.n + j]).toBeCloseTo(m.values[j * m.n + i], 6);
        }
      }
    });

    it(`${file}: der Wertebereich klammert die Diagonale aus`, () => {
      const idx = indexed(file);
      const m = buildSimilarityMatrix(idx, idx.tracks[0].entity.id)!;
      // Wäre die Diagonale drin, läge max zwangsläufig exakt bei 1.
      expect(m.max).toBeLessThanOrEqual(1);
      expect(m.min).toBeLessThanOrEqual(m.max);
    });
  }

  it("maskiert unbelegte Zeitscheiben (freq==0) vollständig", () => {
    const idx = indexed("zeitenwende_demo.json");
    for (const track of idx.tracks) {
      const m = buildSimilarityMatrix(idx, track.entity.id)!;
      for (let i = 0; i < m.n; i++) {
        const freq = track.samples[i]?.freq ?? 0;
        expect(m.present[i]).toBe(freq > 0);
        if (freq > 0) continue;
        // Komplette Zeile UND Spalte müssen NaN sein – keine erfundene Ähnlichkeit.
        for (let j = 0; j < m.n; j++) {
          expect(m.values[i * m.n + j]).toBeNaN();
          expect(m.values[j * m.n + i]).toBeNaN();
        }
      }
    }
  });

  it("bildet ein teilbelegtes Wort als teilweise maskierte Matrix ab", () => {
    // "zeitenwende" ist das einzige Zielwort mit Leerzellen: das Wort existiert
    // vor der Zäsur nicht (43 von 64 Quartalen unbelegt). Genau dort darf die
    // Matrix nichts zeigen — der Fall, den die Maskierung abdecken muss.
    const idx = indexed("zeitenwende_demo.json");
    const m = buildSimilarityMatrix(idx, "zeitenwende")!;
    expect(m.presentCount).toBe(21);
    expect(m.presentCount).toBeLessThan(m.n);
    expect(m.present[0]).toBe(false); // 2010Q1
    expect(m.present[m.n - 1]).toBe(true); // letztes Quartal
  });

  it("gibt null für ein unbekanntes Zielwort", () => {
    expect(buildSimilarityMatrix(indexed("generic_demo.json"), "gibtsnicht")).toBeNull();
  });
});

describe("normalize", () => {
  it("spannt über die tatsächliche Domäne, nicht über [-1,1]", () => {
    expect(normalize(0.6, 0.6, 0.9)).toBe(0);
    expect(normalize(0.9, 0.6, 0.9)).toBe(1);
    expect(normalize(0.75, 0.6, 0.9)).toBeCloseTo(0.5, 6);
  });

  it("behandelt eine konstante Matrix als durchgehend 'oben'", () => {
    expect(normalize(0.8, 0.8, 0.8)).toBe(1);
  });

  it("reicht NaN (= kein Beleg) durch, statt es zu 0 zu machen", () => {
    expect(normalize(NaN, 0, 1)).toBeNaN();
  });
});

describe("sharedDomain", () => {
  it("umschließt alle Matrizen mit mehr als einer belegten Scheibe", () => {
    const idx = indexed("zeitenwende_demo.json");
    const ms = idx.tracks.map((t) => buildSimilarityMatrix(idx, t.entity.id)!);
    const d = sharedDomain(ms);
    for (const m of ms) {
      if (m.presentCount <= 1) continue;
      expect(d.min).toBeLessThanOrEqual(m.min);
      expect(d.max).toBeGreaterThanOrEqual(m.max);
    }
  });

  it("fällt ohne verwertbare Matrizen auf [0,1] zurück", () => {
    expect(sharedDomain([])).toEqual({ min: 0, max: 1 });
  });
});
