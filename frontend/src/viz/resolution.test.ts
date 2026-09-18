import { describe, expect, it } from "vitest";
import {
  GENERIK_SCHRANKE,
  KONTRAST_SCHRANKE,
  daempfung,
  istGenerisch,
  istUnaufgeloest,
  trackAufloesung,
} from "./resolution";

// Der wichtigste Test der Datei: Bundles ohne die Felder (PPMI-Pfad, Demo,
// Fremdlieferanten) duerfen sich nicht veraendern. Faellt der um, sieht jedes
// aeltere Bundle ploetzlich anders aus.
describe("kein Gating ohne Messung", () => {
  it("behandelt undefined als neutral", () => {
    expect(istUnaufgeloest(undefined)).toBe(false);
    expect(istGenerisch(undefined)).toBe(false);
    expect(daempfung(undefined)).toBe(1);
    expect(trackAufloesung([undefined, undefined])).toBeNull();
  });

  it("behandelt null wie fehlend - eine fehlende Messung ist kein schlechter Wert", () => {
    expect(istUnaufgeloest(null)).toBe(false);
    expect(istGenerisch(null)).toBe(false);
    expect(daempfung(null)).toBe(1);
  });

  it("ignoriert NaN statt daran zu rechnen", () => {
    expect(daempfung(Number.NaN)).toBe(1);
    expect(istUnaufgeloest(Number.NaN)).toBe(false);
  });
});

describe("istUnaufgeloest / istGenerisch", () => {
  it("greift unterhalb bzw. oberhalb der Schranke", () => {
    expect(istUnaufgeloest(KONTRAST_SCHRANKE - 0.01)).toBe(true);
    expect(istUnaufgeloest(KONTRAST_SCHRANKE)).toBe(false);
    expect(istGenerisch(GENERIK_SCHRANKE + 0.01)).toBe(true);
    expect(istGenerisch(GENERIK_SCHRANKE)).toBe(false);
  });

  it("trifft die echten SGNS-Werte richtig", () => {
    expect(istUnaufgeloest(0.4)).toBe(false); // Bundeswehr
    expect(istUnaufgeloest(0.11)).toBe(true); // Wehrpflicht
    expect(istUnaufgeloest(-0.01)).toBe(true); // Drohne 2017
    expect(istGenerisch(0.31)).toBe(false); // Bundeswehr 2022
    expect(istGenerisch(0.69)).toBe(true); // Wehrpflicht 2021
  });
});

describe("daempfung", () => {
  it("daempft nicht oberhalb der Schranke", () => {
    expect(daempfung(0.4)).toBe(1);
    expect(daempfung(KONTRAST_SCHRANKE)).toBe(1);
  });

  it("daempft monoton staerker, je niedriger der Kontrast", () => {
    const werte = [0.28, 0.2, 0.1, 0].map(daempfung);
    for (let i = 1; i < werte.length; i++) expect(werte[i]).toBeLessThan(werte[i - 1]);
  });

  it("bleibt sichtbar - auch der Extremfall wird nicht auf 0 gedaempft", () => {
    expect(daempfung(-0.01)).toBeGreaterThan(0.3);
    expect(daempfung(0)).toBeLessThan(0.5);
  });
});

describe("trackAufloesung", () => {
  it("nimmt den Median der gemessenen Zellen", () => {
    expect(trackAufloesung([0.1, 0.2, 0.3])).toBeCloseTo(0.2);
    expect(trackAufloesung([0.1, 0.3])).toBeCloseTo(0.2);
  });

  it("ueberspringt Luecken, statt sie als 0 zu zaehlen", () => {
    expect(trackAufloesung([0.4, null, undefined, 0.4])).toBeCloseTo(0.4);
  });

  it("laesst ein gutes Wort nicht an einem duennen Jahr scheitern", () => {
    // Verteidigung: 7 von 12 Scheiben belastbar, 2017 und 2021 brechen ein.
    const verteidigung = [0.36, 0.21, 0.23, 0.08, 0.38, 0.3, 0.28, 0.16, 0.41, 0.33, 0.4, 0.41];
    expect(trackAufloesung(verteidigung)).toBeGreaterThanOrEqual(KONTRAST_SCHRANKE);
    // Wehrpflicht dagegen faellt durch, wie es soll.
    const wehrpflicht = [0.13, 0.14, 0.11, 0.09, 0.07, 0.07, 0.19, null, 0.07, 0.08, 0.09, 0.21];
    expect(trackAufloesung(wehrpflicht)).toBeLessThan(KONTRAST_SCHRANKE);
  });
});
