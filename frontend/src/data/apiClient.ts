/**
 * Dünner Client für den FastAPI-Serving-Layer.
 *
 * Spricht relative Pfade (`/bundles`), die der Vite-Dev-Proxy ans Backend
 * weiterreicht. In Produktion liegen statisches Frontend + API idealerweise
 * hinter derselben Origin (Reverse-Proxy) – dann funktioniert derselbe Code.
 */

/** Leichtgewichtige Bundle-Übersicht für den Picker (spiegelt BundleSummary im Backend). */
export interface BundleSummary {
  id: string;
  name: string;
  description: string;
  vector_dim: number | null;
  projection: string | null;
  shift_point: string | null;
  entities: number;
  time_slices: number;
  facets: string[];
  records: number;
}

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

/** Alle vom Backend angebotenen Bundles. Leeres Array, wenn kein Backend erreichbar. */
export async function fetchBundleList(): Promise<BundleSummary[]> {
  const res = await fetch(`${API_BASE}/bundles`);
  if (!res.ok) {
    throw new Error(`Bundle-Liste konnte nicht geladen werden (HTTP ${res.status}).`);
  }
  return (await res.json()) as BundleSummary[];
}

/** Roh-JSON eines Bundles (noch unvalidiert). */
export async function fetchBundleRaw(id: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}/bundles/${encodeURIComponent(id)}`);
  if (!res.ok) {
    throw new Error(`Bundle "${id}" konnte nicht geladen werden (HTTP ${res.status}).`);
  }
  return await res.json();
}
