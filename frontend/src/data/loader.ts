/**
 * Einheitliche Ladeschnittstelle. Beide Datenquellen – Backend-Picker und lokal
 * geöffnete/gezogene Datei – münden in *ein* validiertes `Bundle`. Der Rest der
 * App sieht nie, woher die Daten kamen.
 */
import { validateBundle, BundleValidationError, type Bundle } from "../types/schema";
import { fetchBundleRaw } from "./apiClient";

export { BundleValidationError };

/** Woher ein geladenes Bundle stammt – für Anzeige/Debug. */
export interface LoadedBundle {
  bundle: Bundle;
  source: { kind: "api"; id: string } | { kind: "file"; filename: string };
}

/** Lädt ein vom Backend angebotenes Bundle und validiert es. */
export async function loadFromApi(id: string): Promise<LoadedBundle> {
  const raw = await fetchBundleRaw(id);
  return { bundle: validateBundle(raw), source: { kind: "api", id } };
}

/**
 * Aus einer Dateiauswahl die Bundle-JSON heraussuchen. Wer die Suchraum-Dateien
 * (`.vectors.npy`, `.index.parquet`) gleich mit auswählt oder hineinzieht, soll
 * keinen Fehler bekommen: Sie werden ignoriert, Nachbarabfragen laufen nur über
 * das Backend.
 */
export function pickBundleFile(files: readonly File[]): File {
  const jsons = files.filter((f) => f.name.toLowerCase().endsWith(".json"));
  if (jsons.length === 1) return jsons[0];
  if (jsons.length === 0) {
    throw new Error(
      "Keine Bundle-Datei (.json) dabei. Die Suchraum-Dateien (.npy, .parquet) " +
        "lassen sich nicht allein öffnen.",
    );
  }
  throw new Error(
    `Mehrere JSON-Dateien ausgewählt (${jsons.map((f) => f.name).join(", ")}). ` +
      "Bitte nur ein Bundle auf einmal.",
  );
}

/** Lädt eine lokale JSON-Datei (File-Input oder Drag-and-Drop) und validiert sie. */
export async function loadFromFile(file: File): Promise<LoadedBundle> {
  const text = await file.text();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `"${file.name}" ist kein gültiges JSON: ${(err as Error).message}`,
    );
  }
  return { bundle: validateBundle(raw), source: { kind: "file", filename: file.name } };
}
