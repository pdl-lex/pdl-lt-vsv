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

// ---------------------------------------------------------------------------
// Nachbarabfragen (backend/app/neighbors.py, SCHEMA.md „meta.neighbor_space“)
// ---------------------------------------------------------------------------

export type NeighborFilterType = "categorical" | "minimum" | "exclude_if_true";

/** Ein deklarierter Filter, ergänzt um die Werte, die unter den Kandidaten vorkommen. */
export interface NeighborFilterInfo {
  column: string;
  type: NeighborFilterType;
  label: string;
  description?: string;
  default: unknown;
  /** minimum: Obergrenze des Werts (z.B. Zahl der belegten Zellen), angezeigt als „≥ 10 von 80". */
  out_of?: number;
  /** Kandidaten ohne Wert — die bleiben bei jedem Filter drin. */
  null_count: number;
  /** categorical: vorkommende Werte, häufigste zuerst. */
  values?: { value: string; count: number }[];
  /** minimum: Spanne der vorkommenden Werte. */
  min?: number | null;
  max?: number | null;
  /** exclude_if_true: Zahl der Kandidaten mit Wert true. */
  count_true?: number;
}

/** Kandidatentabelle, spaltenweise (alle Listen gleich lang, aufsteigend nach `row`). */
export interface NeighborCandidates {
  row: number[];
  lemma: string[];
  label: string[];
  group: string[];
  coords_3d: [number, number, number][];
  attributes: Record<string, unknown[]>;
  /** Nur bei Suchräumen mit eigenem Raum je Zeitscheibe (SGNS). */
  slice?: (string | null)[];
}

export interface NeighborSpaceInfo {
  format: number;
  neighbor_kind: string | null;
  similarity: string;
  k_max: number;
  filters: NeighborFilterInfo[];
  stopwords: string[];
  candidates: NeighborCandidates;
}

/** Abfrage: fehlender Filter = Voreinstellung, `null` = aus; `stopwords` fehlt = mitgelieferte Liste. */
export interface NeighborQueryBody {
  k: number;
  filters: Record<string, unknown>;
  stopwords?: string[];
}

export interface NeighborQueryResult {
  k: number;
  /** Kandidaten nach Filtern und Stoppwörtern / insgesamt (vor der Zeitscheiben-Regel). */
  n_candidates: number;
  n_candidates_total: number;
  /** Dieselben Kandidaten als Zeilen (`candidates.row`); fehlt bei älteren Backends. */
  kept_rows?: number[];
  /** entity_id → slice_id → Zeilennummern (`candidates.row`) und Scores, nach Rang. */
  neighbors: Record<string, Record<string, { rows: number[]; scores: number[] }>>;
}

/** Fehlermeldung des Backends (`detail`) lesbar machen. */
async function errorText(res: Response, what: string): Promise<string> {
  let detail = "";
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body.detail === "string") detail = `: ${body.detail}`;
  } catch {
    /* kein JSON */
  }
  return `${what} (HTTP ${res.status})${detail}`;
}

/** Suchraum eines Bundles: Filter, Stoppwörter, Kandidatentabelle (einmal je Bundle). */
export async function fetchNeighborSpace(id: string, signal?: AbortSignal): Promise<NeighborSpaceInfo> {
  const res = await fetch(`${API_BASE}/bundles/${encodeURIComponent(id)}/neighbor-space`, { signal });
  if (!res.ok) throw new Error(await errorText(res, "Suchraum konnte nicht geladen werden"));
  return (await res.json()) as NeighborSpaceInfo;
}

/** Nachbarn aller Zielwörter und Zeitscheiben für die gewählten Filter. */
export async function fetchNeighbors(
  id: string,
  body: NeighborQueryBody,
  signal?: AbortSignal,
): Promise<NeighborQueryResult> {
  const res = await fetch(`${API_BASE}/bundles/${encodeURIComponent(id)}/neighbors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(await errorText(res, "Nachbarabfrage fehlgeschlagen"));
  return (await res.json()) as NeighborQueryResult;
}
