/**
 * Datenvertrag zwischen Datenproduktion und Visualisierungstool.
 *
 * Direkt aus `data/test/SCHEMA.md` abgeleitet und die einzige Quelle der Wahrheit
 * für die Form eines Bundles. Jedes geladene Bundle – egal ob vom Backend oder
 * per Drag-and-Drop – läuft durch `validateBundle()`. Das ist der Kern der
 * Domänenunabhängigkeit: der Renderer kennt nur Entities, Zeitscheiben, Facetten
 * und Vektoren, nie eine konkrete Domäne.
 *
 * Leitlinien der Validierung:
 * - **Permissiv nach außen:** unbekannte Zusatzfelder (`ausrichtung` an einem
 *   Facettenwert, `category` an einer Entity, …) werden per `.passthrough()`
 *   durchgereicht, nicht verworfen. Weitere Facetten/Felder = keine Codeänderung.
 * - **Streng nach innen:** was der Renderer wirklich braucht (`coords_3d`, IDs,
 *   Reihenfolge der Scheiben) wird geprüft; Fehler werden lesbar gemeldet.
 * - **Dimensionsagnostisch:** die Länge von `vector` wird NIE festgenagelt
 *   (Bundles variieren, Demo: 48 vs. 32). `vector` ist optional – ein Bundle,
 *   das nur `coords_3d` liefert, rendert trotzdem (Re-Projektion kommt später).
 */
import { z } from "zod";

/** Vorprojizierte 3D-Koordinate (gemeinsame PCA). Genau drei Zahlen → Tupel-Typ. */
export const coords3dSchema = z.tuple([z.number(), z.number(), z.number()]);

/** Voller Vektor im gemeinsamen Raum – beliebige, aber bundleweit gleiche Dim. */
export const vectorSchema = z.array(z.number());

export const metaSchema = z
  .object({
    name: z.string().default("Unbenanntes Bundle"),
    description: z.string().default(""),
    // Herkunft der Daten (Korpus, Zitation, Lizenz), z.B. „Plenarprotokolle des
    // Deutschen Bundestages (CPP-BT, Fobbe 2026, CC BY-SA 4.0)".
    source: z.string().optional(),
    vector_dim: z.number().int().positive().optional(),
    // PPMI-SVD: Exponent der Eigenwert-Gewichtung der Zeilenvektoren (U·S^p).
    eig_p: z.number().optional(),
    // Kurzname des Verfahrens (z.B. "PPMI-SVD") für knappe Anzeigen; die
    // ausführliche Beschreibung steht in `projection`.
    method: z.string().optional(),
    projection: z.string().optional(),
    // Zäsur (z.B. "2022Q1"); darf fehlen oder null sein (generic-Demo).
    shift_point: z.string().nullish(),
    // Stufe 2 (k → 3, zentrierte PCA): echte erklärte Varianz.
    // In-sample: gilt für die Punkte, auf denen die PCA gefittet wurde
    // (Aggregate + Anker).
    explained_variance_ratio_3d: z.number().min(0).max(1).optional(),
    // Dieselben drei Achsen, aber für die `vocab_points` — die wurden nur
    // hineinprojiziert, nicht mitgefittet, und werden deshalb schlechter
    // abgebildet (SGNS-Bundle: 20 % gegen 37 %). Genau diese Wolke zeigt der
    // Radius-Regler, also darf dort nicht der In-Sample-Wert stehen. Optional:
    // ältere Bundles und der PPMI-Pfad liefern das Feld nicht.
    explained_variance_ratio_3d_vocab: z.number().min(0).max(1).optional(),
    // Stufe 1 (rohe Matrix → k, unzentrierte SVD): erklärter Anteil der
    // Frobenius-Norm — eine andere Rechnung als oben, nicht "Varianz".
    explained_frobenius_ratio_k: z.number().min(0).max(1).optional(),
  })
  .passthrough();

export const facetValueSchema = z
  .object({
    id: z.string(),
    label: z.string().optional(),
  })
  .passthrough(); // z.B. `ausrichtung` bleibt erhalten

export const facetSchema = z
  .object({
    id: z.string(),
    label: z.string().optional(),
    type: z.string().default("categorical"),
    values: z.array(facetValueSchema).default([]),
  })
  .passthrough();

export const entitySchema = z
  .object({
    id: z.string(),
    label: z.string().optional(),
    category: z.string().optional(),
    note: z.string().optional(),
  })
  .passthrough();

export const timeSliceSchema = z
  .object({
    id: z.string(),
    label: z.string().optional(),
    index: z.number().int(),
    start: z.string().optional(),
    year: z.number().optional(),
    quarter: z.number().optional(),
  })
  .passthrough();

export const anchorSchema = z
  .object({
    label: z.string(),
    cluster: z.string().default("_"),
    vector: vectorSchema.optional(),
    coords_3d: coords3dSchema,
  })
  .passthrough();

/** Gemeinsame Form von `records` (facettenaufgelöst) und `aggregates` (facets={}). */
export const cellSchema = z
  .object({
    entity_id: z.string(),
    time_slice_id: z.string(),
    facets: z.record(z.string(), z.string()).default({}),
    vector: vectorSchema.optional(),
    coords_3d: coords3dSchema,
    // Stichprobengröße → Konfidenz. Optional; fehlend = volle Konfidenz.
    freq: z.number().nonnegative().optional(),
    sentiment: z.number().nullish(),
    // Optionale Gütemaße des Lieferanten, beide unabhängig von `freq` und
    // voneinander (s. `viz/resolution.ts`). Nicht ineinander umrechenbar —
    // insbesondere ist `kontrast + generik` NICHT der Selbst-Kosinus.
    //   kontrast  Reproduzierbarkeit des Vektors → sagt die Zelle etwas aus?
    //   generik   Ähnlichkeit zum Vokabular allgemein → ist die Nachbarliste
    //             interpretierbar?
    // `nullish`, weil "gemessen, ging nicht" (null) etwas anderes ist als
    // "misst dieser Lieferant nicht" (fehlend) — beide führen aber zu keinem
    // Gating, damit ältere Bundles unverändert aussehen.
    kontrast: z.number().nullish(),
    generik: z.number().nullish(),
  })
  .passthrough();

/** Unkuratierter Vokabel-Punkt: Label + Position im selben gemeinsamen Raum,
 * kein `cluster`/keine Dornseiff-Zuordnung. Zweck ist die Koordinaten-Tabelle
 * zu den Nachbarlisten — jeder Nachbar, der kein Anker ist, findet hier seine
 * Position, damit er im 3D-Bild gezeichnet werden kann. Kein eigener Suchraum:
 * ausgewählt wird im vollen Vektorraum beim Lieferanten (`neighbors`). */
export const vocabPointSchema = z
  .object({
    label: z.string(),
    coords_3d: coords3dSchema,
  })
  .passthrough();

export const neighborSchema = z
  .object({
    label: z.string(),
    score: z.number().optional(),
    group: z.string().optional(),
    // Lemma des Nachbarn; Anzeige-`label` kann davon abweichen (Anker).
    // Nur aus Abfragen, Grundlage für „ausblenden“ (Stoppwörter gehen aufs Lemma).
    lemma: z.string().optional(),
  })
  .passthrough();

/**
 * `meta.neighbor_space` (SCHEMA.md, Format 1): Suchraum für Nachbarabfragen.
 *
 * Bewusst NICHT Teil von `metaSchema`: ein fehlerhafter Suchraum darf das
 * Bundle nicht unladbar machen — dann gibt es eben nur die vorberechneten
 * `neighbors`. Ausgewertet wird er getrennt über `parseNeighborSpaceMeta()`.
 */
export const neighborSpaceFilterSchema = z
  .object({
    column: z.string(),
    type: z.enum(["categorical", "minimum", "exclude_if_true"]),
    label: z.string(),
    description: z.string().optional(),
    default: z.unknown().optional(),
    // minimum: Obergrenze des Werts, angezeigt als „≥ 10 von 80".
    out_of: z.number().optional(),
  })
  .passthrough();

export const neighborSpaceMetaSchema = z
  .object({
    format: z.literal(1),
    vectors: z.string(),
    index: z.string(),
    neighbor_kind: z.string().optional(),
    similarity: z.literal("cosine"),
    filters: z.array(neighborSpaceFilterSchema),
    stopwords: z.array(z.string()),
    // Filterspalte mit der Häufigkeit eines Kandidaten (Schriftgröße der Wortwolke).
    frequency: z.string().optional(),
  })
  .passthrough();

export type NeighborSpaceMeta = z.infer<typeof neighborSpaceMetaSchema>;

/** `meta.neighbor_space` prüfen: das Objekt, oder ein lesbarer Grund, warum nicht. */
export function parseNeighborSpaceMeta(
  meta: Record<string, unknown>,
): { ok: true; value: NeighborSpaceMeta } | { ok: false; reason: string } {
  const raw = meta.neighbor_space;
  if (raw === undefined || raw === null) {
    return { ok: false, reason: "Das Bundle hat keinen Suchraum (meta.neighbor_space)." };
  }
  const result = neighborSpaceMetaSchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    return {
      ok: false,
      reason: `Suchraum nicht nutzbar (${first.path.join(".") || "neighbor_space"}: ${first.message}).`,
    };
  }
  return { ok: true, value: result.data };
}

/** neighbors: { [entity_id]: { [slice_id]: Neighbor[] } } */
export const neighborsSchema = z.record(
  z.string(),
  z.record(z.string(), z.array(neighborSchema)),
);

export const bundleSchema = z
  .object({
    meta: metaSchema.default({}),
    facets_schema: z.array(facetSchema).default([]),
    entities: z.array(entitySchema).default([]),
    time_slices: z.array(timeSliceSchema).min(1, "time_slices darf nicht leer sein"),
    anchors: z.array(anchorSchema).default([]),
    vocab_points: z.array(vocabPointSchema).default([]),
    records: z.array(cellSchema).default([]),
    aggregates: z.array(cellSchema).default([]),
    neighbors: neighborsSchema.default({}),
  })
  .passthrough();

export type Coords3d = [number, number, number];
export type Meta = z.infer<typeof metaSchema>;
export type Facet = z.infer<typeof facetSchema>;
export type FacetValue = z.infer<typeof facetValueSchema>;
export type Entity = z.infer<typeof entitySchema>;
export type TimeSlice = z.infer<typeof timeSliceSchema>;
export type Anchor = z.infer<typeof anchorSchema>;
export type VocabPoint = z.infer<typeof vocabPointSchema>;
export type Cell = z.infer<typeof cellSchema>;
export type Neighbor = z.infer<typeof neighborSchema>;
export type Neighbors = z.infer<typeof neighborsSchema>;
export type Bundle = z.infer<typeof bundleSchema>;

/** Fehler mit menschenlesbarer Zusammenfassung der ersten Schema-Verstöße. */
export class BundleValidationError extends Error {
  readonly issues: z.ZodIssue[];
  constructor(issues: z.ZodIssue[]) {
    const head = issues
      .slice(0, 6)
      .map((i) => `• ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    const more = issues.length > 6 ? `\n… und ${issues.length - 6} weitere` : "";
    super(`Bundle entspricht nicht dem Schema:\n${head}${more}`);
    this.name = "BundleValidationError";
    this.issues = issues;
  }
}

/**
 * Validiert unbekannte Rohdaten gegen den Datenvertrag.
 * @throws {BundleValidationError} mit lesbarer Zusammenfassung bei Verstoß.
 */
export function validateBundle(raw: unknown): Bundle {
  const result = bundleSchema.safeParse(raw);
  if (!result.success) {
    throw new BundleValidationError(result.error.issues);
  }
  return result.data;
}
