/** CSV-Export der Nachbarlisten: Quoting und Schutz vor Formel-Injection. */
import { describe, it, expect } from "vitest";
import { csvCell } from "./NeighborModal";

describe("csvCell", () => {
  it("macht Text, der wie eine Formel beginnt, zu Text", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-Wort")).toBe("'-Wort");
    expect(csvCell("@sum")).toBe("'@sum");
  });

  it("lässt Zahlen und gewöhnlichen Text unverändert", () => {
    expect(csvCell(-0.1234)).toBe("-0.1234");
    expect(csvCell("Bundeswehr")).toBe("Bundeswehr");
    expect(csvCell(null)).toBe("");
  });

  it("setzt Anführungszeichen bei Trennzeichen und Zeilenumbrüchen", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("a\rb")).toBe('"a\rb"');
  });
});
