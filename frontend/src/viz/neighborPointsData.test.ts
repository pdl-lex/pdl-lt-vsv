/**
 * Absicherung der Verortung der Nachbarlisten. Grundlage ist das Demo-Bundle:
 * es liefert 8 Nachbarn je Zelle und KEIN `vocab_points` — damit lassen sich
 * beide Auflösungswege prüfen, der über Anker (steht schon drin) und der über
 * Vokabel-Punkte (wird hier gezielt injiziert).
 */
import { describe, it, expect } from "vitest";
import { fixturePath } from "../test/fixtures";
import { readFileSync } from "node:fs";
import { validateBundle } from "../types/schema";
import { indexBundle, pointForLabel, toWorld } from "../data/model";
import { neighborPointsAt } from "./neighborPointsData";


function loadRaw(name: string) {
  return JSON.parse(readFileSync(fixturePath(name), "utf-8"));
}

function withVocabPoints(
  raw: unknown,
  vocab_points: { label: string; coords_3d: [number, number, number] }[],
) {
  return { ...(raw as object), vocab_points };
}

function demoIndex(vocab_points: { label: string; coords_3d: [number, number, number] }[] = []) {
  return indexBundle(validateBundle(withVocabPoints(loadRaw("zeitenwende_demo.json"), vocab_points)));
}

describe("neighborPointsAt", () => {
  it("liefert die ersten k Nachbarn in Lieferantenreihenfolge", () => {
    const idx = demoIndex();
    // sliceT=0 entspricht 2010Q1; "bundeswehr" ist dort belegt (freq 526).
    const punkte = neighborPointsAt(idx, "bundeswehr", 0, 3);

    expect(punkte.map((p) => p.label)).toEqual(["Sparzwang", "Missstand", "marode"]);
    expect(punkte.map((p) => p.rank)).toEqual([1, 2, 3]);
    // Alle drei sind im Demo-Bundle kuratierte Anker.
    expect(punkte.every((p) => p.isAnchor)).toBe(true);
  });

  it("zeichnet die Position aus dem Bundle, nicht die des Zielworts", () => {
    const idx = demoIndex();
    const anker = idx.anchors.find((a) => a.label === "Sparzwang")!;
    const [p] = neighborPointsAt(idx, "bundeswehr", 0, 1);

    expect(p.pos).toEqual(toWorld(idx, anker.coords_3d));
  });

  it("gibt bei k<=0 oder ohne aktives Wort nichts zurück", () => {
    const idx = demoIndex();
    expect(neighborPointsAt(idx, "bundeswehr", 0, 0)).toEqual([]);
    expect(neighborPointsAt(idx, null, 0, 50)).toEqual([]);
  });

  it("meldet nichts an einer unbelegten Zeitscheibe", () => {
    const idx = demoIndex();
    // "zeitenwende" ist in 2010Q1 mit freq 0 verzeichnet.
    expect(neighborPointsAt(idx, "zeitenwende", 0, 50)).toEqual([]);
  });

  it("überspringt Nachbarn ohne Koordinate, ohne die übrigen zu verlieren", () => {
    const roh = loadRaw("zeitenwende_demo.json");
    // Zweiten Nachbarn durch ein Wort ersetzen, das im Bundle keinen Punkt hat.
    roh.neighbors.bundeswehr["2010Q1"][1] = { label: "GibtsNicht", score: 0.5 };
    const idx = indexBundle(validateBundle(withVocabPoints(roh, [])));

    const punkte = neighborPointsAt(idx, "bundeswehr", 0, 3);
    expect(punkte.map((p) => p.label)).toEqual(["Sparzwang", "marode"]);
    // Der Rang bleibt der aus der Lieferantenliste - Platz 2 fehlt einfach.
    expect(punkte.map((p) => p.rank)).toEqual([1, 3]);
  });

  it("verortet Nicht-Anker über vocab_points", () => {
    const roh = loadRaw("zeitenwende_demo.json");
    roh.neighbors.bundeswehr["2010Q1"][0] = { label: "Sondervermögen", score: 0.9 };
    const idx = indexBundle(
      validateBundle(withVocabPoints(roh, [{ label: "Sondervermögen", coords_3d: [1, 2, 3] }])),
    );

    const [p] = neighborPointsAt(idx, "bundeswehr", 0, 1);
    expect(p.label).toBe("Sondervermögen");
    expect(p.isAnchor).toBe(false);
    expect(p.pos).toEqual(toWorld(idx, [1, 2, 3]));
  });
});

describe("pointForLabel / maxNeighborK", () => {
  it("gibt dem Anker den Vorrang, wenn ein Vokabel-Label kollidiert", () => {
    // Genau der Fall "marode" aus dem Halbjahr-Bundle: Anker mit Anzeigeform
    // "marode" (Lemma "marod") neben einem eigenständigen Korpus-Lemma gleichen
    // Textes. Das Bundle darf das nicht mehr liefern, das Frontend muss es
    // trotzdem eindeutig auflösen.
    const idx = demoIndex([{ label: "marode", coords_3d: [99, 99, 99] }]);
    const anker = idx.anchors.find((a) => a.label === "marode")!;

    expect(pointForLabel(idx, "marode")).toEqual(anker.coords_3d);
  });

  it("liest die Obergrenze des k-Reglers aus dem Bundle", () => {
    // Das Demo-Bundle liefert durchgehend 8 Nachbarn je Zelle.
    expect(demoIndex().maxNeighborK).toBe(8);
  });
});
