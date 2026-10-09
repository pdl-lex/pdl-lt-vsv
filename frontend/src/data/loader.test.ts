/**
 * Eigenes Bundle hochladen: aus der Dateiauswahl wird genau die JSON geöffnet.
 */
import { describe, it, expect } from "vitest";
import { pickBundleFile } from "./loader";

const file = (name: string) => new File(["{}"], name);

describe("pickBundleFile", () => {
  it("nimmt die JSON und ignoriert die Suchraum-Dateien", () => {
    const files = [file("b.vectors.npy"), file("b.JSON"), file("b.index.parquet")];
    expect(pickBundleFile(files).name).toBe("b.JSON");
  });

  it("weist eine Auswahl ohne JSON ab", () => {
    expect(() => pickBundleFile([file("b.vectors.npy")])).toThrow(/Keine Bundle-Datei/);
  });

  it("weist mehrere JSON-Dateien ab", () => {
    expect(() => pickBundleFile([file("a.json"), file("b.json")])).toThrow(/a\.json, b\.json/);
  });
});
