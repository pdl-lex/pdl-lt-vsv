/**
 * Regressionsschutz für den Datenvertrag: beide mitgelieferten Demo-Bundles
 * MÜSSEN valide sein. Bricht der Test, ist entweder das Schema zu streng geworden
 * oder die Beispieldaten sind aus dem Vertrag gelaufen.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { validateBundle, bundleSchema } from "./schema";
import { indexBundle, passesFacetFilter, facetKeyOf } from "../data/model";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "../../../data/test");

function load(name: string): unknown {
  return JSON.parse(readFileSync(resolve(dataDir, name), "utf-8"));
}

describe("Datenvertrag gegen Demo-Bundles", () => {
  for (const file of ["zeitenwende_demo.json", "generic_demo.json"]) {
    it(`${file} ist schema-valide`, () => {
      const raw = load(file);
      expect(() => validateBundle(raw)).not.toThrow();
    });

    it(`${file} lässt sich indizieren`, () => {
      const bundle = validateBundle(load(file));
      const idx = indexBundle(bundle);
      expect(idx.sliceCount).toBeGreaterThan(0);
      expect(idx.tracks.length).toBe(bundle.entities.length);
      expect(Number.isFinite(idx.scale)).toBe(true);
    });
  }

  it("weist ein defektes Bundle zurück (fehlende time_slices)", () => {
    const bad = { meta: { name: "x" }, entities: [], time_slices: [] };
    expect(() => validateBundle(bad)).toThrow();
  });

  it("baut facettenaufgelöste Tracks je Publikation (zeitenwende)", () => {
    const idx = indexBundle(validateBundle(load("zeitenwende_demo.json")));
    expect(idx.primaryFacetId).toBe("publication");
    const bw = idx.facetTracks.get("bundeswehr") ?? [];
    // 6 Publikationen → 6 Facetten-Tracks je Zielwort
    expect(bw.length).toBe(6);
    expect(bw.every((t) => t.samples.length === idx.sliceCount)).toBe(true);
  });

  it("passesFacetFilter: UND-Verknüpfung, leere Auswahl = keine Einschränkung", () => {
    expect(passesFacetFilter({ publication: "SZ" }, {})).toBe(true);
    expect(passesFacetFilter({ publication: "SZ" }, { publication: new Set() })).toBe(true);
    expect(passesFacetFilter({ publication: "SZ" }, { publication: new Set(["SZ"]) })).toBe(true);
    expect(passesFacetFilter({ publication: "SZ" }, { publication: new Set(["taz"]) })).toBe(false);
    // UND über zwei Facetten
    const f = { publication: new Set(["SZ"]), ressort: new Set(["Politik"]) };
    expect(passesFacetFilter({ publication: "SZ", ressort: "Politik" }, f)).toBe(true);
    expect(passesFacetFilter({ publication: "SZ", ressort: "Sport" }, f)).toBe(false);
  });

  it("facetKeyOf ist stabil unabhängig von Schlüssel-Reihenfolge", () => {
    expect(facetKeyOf({ a: "1", b: "2" })).toBe(facetKeyOf({ b: "2", a: "1" }));
    expect(facetKeyOf({})).toBe("");
  });

  it("reicht unbekannte Zusatzfelder durch (Flexibilität)", () => {
    const parsed = bundleSchema.parse({
      time_slices: [{ id: "t0", index: 0, extraOnSlice: 42 }],
      facets_schema: [{ id: "f", values: [{ id: "v", customKey: "keep" }] }],
    });
    // passthrough behält unbekannte Keys
    expect((parsed.time_slices[0] as Record<string, unknown>).extraOnSlice).toBe(42);
    expect((parsed.facets_schema[0].values[0] as Record<string, unknown>).customKey).toBe("keep");
  });
});
