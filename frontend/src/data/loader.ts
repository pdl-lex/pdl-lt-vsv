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
