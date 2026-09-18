/**
 * Diachrone Ähnlichkeitsmatrizen nach **Kiyama et al.**, „Analyzing Continuous
 * Semantic Shifts with Diachronic Word Similarity Matrices" (PDF unter
 * `data/zeitenwende/`).
 *
 * Idee: statt nur benachbarte Zeitscheiben zu vergleichen, wird für ein Wort w
 * die **volle T×T-Matrix** `M[i][j] = cos(v_w^{t_i}, v_w^{t_j})` gebildet. Die
 * Textur der Matrix macht den *Verlauf* der Verschiebung lesbar, was eine
 * Trajektorie allein nicht zeigt:
 *
 * - gleichmäßig hoch          → stabiles Wort
 * - zwei scharfe Blöcke       → ein abrupter Bruch (Zäsur)
 * - Gradient von der Diagonale weg → kontinuierliche Drift
 * - wiederkehrende Blöcke     → Rückkehr zu früherem Gebrauch
 *
 * **Warum das hier ohne Alignment funktioniert:** das Bundle liefert einen
 * gemeinsamen Vektorraum (specs.md §2, „ein gemeinsamer Vektorraum, kein
 * Alignment"). Vektoren verschiedener Zeitscheiben sind also direkt
 * vergleichbar – das Alignment-Problem, das Kiyama mit inkrementellem Training
 * löst, stellt sich im Bundle-Schema gar nicht erst.
 *
 * **Gerechnet wird auf `vector`, nicht auf `coords_3d`.** Die 3D-Koordinaten
 * sind eine verlustbehaftete Projektion (Demo: ~82 % Varianz); Kosinuswerte
 * daraus wären systematisch verzerrt. Nur wenn ein Bundle keine vollen Vektoren
 * mitbringt, fällt die Rechnung auf `coords_3d` zurück – sichtbar über
 * `source`, damit die UI das ehrlich anschreiben kann.
 */
import type { IndexedBundle, TrackSample } from "../data/model";

/** Womit gerechnet wurde – die UI muss den Rückfall kenntlich machen. */
export type SimilaritySource = "vector" | "coords_3d";

export interface SimilarityMatrix {
  entityId: string;
  entityLabel: string;
  /** Kantenlänge = Anzahl Zeitscheiben. */
  n: number;
  /** n×n, zeilenweise. `NaN`, wo mindestens eine der beiden Scheiben unbelegt ist. */
  values: Float32Array;
  /** Je Zeitscheibe: liegt ein verwertbarer Vektor mit freq>0 vor? */
  present: boolean[];
  /** Anzahl belegter Zeitscheiben (0 = Matrix komplett leer). */
  presentCount: number;
  /** Wertebereich über die belegten Zellen **ohne Diagonale** (die ist immer 1
   * und würde die Rampe sonst stauchen). Bei <2 belegten Scheiben: [0,1]. */
  min: number;
  max: number;
  source: SimilaritySource;
}

/** Kosinus-Ähnlichkeit. `NaN`, wenn eine Länge 0 ist oder die Dimensionen
 * nicht passen – ein stiller 0-Wert wäre als „unähnlich" fehlinterpretierbar. */
export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return NaN;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return NaN;
  // Rundungsfehler können minimal über ±1 hinausschießen – klemmen.
  return Math.max(-1, Math.min(1, dot / Math.sqrt(na * nb)));
}

/**
 * Vektor eines Samples für die Ähnlichkeitsrechnung.
 *
 * `freq == 0` heißt bundleweit „Wort im Korpus an dieser Scheibe nicht belegt"
 * (siehe `entityFreqAt`, Trajektorien setzen dort aus). Der hinterlegte Vektor
 * ist dann ein Platzhalter ohne Aussage – er darf **nicht** in die Matrix
 * einfließen, sonst behauptet die Fläche Ähnlichkeit, wo keine Daten sind.
 */
function usableVector(
  sample: TrackSample | undefined,
  source: SimilaritySource,
): readonly number[] | null {
  if (!sample || sample.freq <= 0) return null;
  if (source === "vector") return sample.vector && sample.vector.length > 0 ? sample.vector : null;
  return sample.coords;
}

/** Liefert `"vector"`, sobald irgendein Aggregat volle Vektoren mitbringt. */
export function similaritySourceOf(idx: IndexedBundle): SimilaritySource {
  const hasVectors = idx.tracks.some((t) =>
    t.samples.some((s) => s?.vector !== undefined && s.vector.length > 0),
  );
  return hasVectors ? "vector" : "coords_3d";
}

/**
 * Vektoren eines Zielworts entlang der Zeitachse; `null`, wo nicht belegt.
 *
 * Die gemeinsame Grundlage aller Ähnlichkeitsansichten: die Matrix vergleicht
 * dieses Feld mit sich selbst, die Drift-Kurve mit einem Referenzpunkt daraus,
 * Wort-gegen-Wort mit dem Feld eines zweiten Wortes (`viz/series.ts`). Damit
 * gilt die Maskierungsregel („freq == 0 ist kein kleiner Wert") überall gleich,
 * weil sie genau einmal hier durchgesetzt wird.
 */
export function entityVectors(
  idx: IndexedBundle,
  entityId: string,
  source: SimilaritySource = similaritySourceOf(idx),
): (readonly number[] | null)[] | null {
  const track = idx.tracks.find((t) => t.entity.id === entityId);
  if (!track) return null;
  return track.samples.map((s) => usableVector(s, source));
}

/**
 * Baut die T×T-Matrix eines Zielworts aus seinen **Aggregat**-Zellen.
 *
 * Aggregate sind über alle Facetten vorberechnet (`facets: {}`) – das ist die
 * Kiyama-Lesart „ein Wort, ein Verlauf". Facettenaufgelöste Matrizen wären eine
 * eigene Ansicht (je Facettenwert eine Matrix) und bewusst noch nicht drin.
 */
export function buildSimilarityMatrix(
  idx: IndexedBundle,
  entityId: string,
  source: SimilaritySource = similaritySourceOf(idx),
): SimilarityMatrix | null {
  const track = idx.tracks.find((t) => t.entity.id === entityId);
  if (!track) return null;

  const n = idx.sliceCount;
  const vectors = entityVectors(idx, entityId, source) ?? [];
  const present = vectors.map((v) => v !== null);
  const presentCount = present.reduce((acc, p) => acc + (p ? 1 : 0), 0);

  const values = new Float32Array(n * n).fill(NaN);
  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < n; i++) {
    const vi = vectors[i];
    if (!vi) continue;
    values[i * n + i] = 1; // Selbstähnlichkeit, per Definition
    for (let j = i + 1; j < n; j++) {
      const vj = vectors[j];
      if (!vj) continue;
      const s = cosine(vi, vj);
      values[i * n + j] = s;
      values[j * n + i] = s; // symmetrisch – nur eine Hälfte rechnen
      if (Number.isFinite(s)) {
        if (s < min) min = s;
        if (s > max) max = s;
      }
    }
  }

  // Ohne Nebendiagonal-Werte (0 oder 1 belegte Scheibe) gibt es keine Spanne.
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 1;
  }

  return {
    entityId,
    entityLabel: track.entity.label ?? entityId,
    n,
    values,
    present,
    presentCount,
    min,
    max,
    source,
  };
}

/**
 * Normiert einen Kosinuswert auf [0,1] für die Farbrampe.
 *
 * **Bewusst über die tatsächliche Spanne der Matrix, nicht über [-1,1].** Die
 * Selbstähnlichkeit eines Wortes über die Zeit liegt real eng beieinander (oft
 * 0.6–1.0); auf [-1,1] gespreizt wäre jede Matrix eine einfarbige Fläche und
 * die Kiyama-Struktur unsichtbar. Der Preis ist, dass Farben **zwischen**
 * Matrizen nur vergleichbar sind, wenn dieselbe Domäne benutzt wird – deshalb
 * kann das Modul eine gemeinsame Domäne über alle gezeigten Wörter setzen.
 */
export function normalize(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return NaN;
  const span = max - min;
  if (span <= 1e-9) return 1; // konstante Matrix: alles „oben"
  return Math.max(0, Math.min(1, (value - min) / span));
}

/** Gemeinsamer Wertebereich über mehrere Matrizen (Small-Multiples-Vergleich). */
export function sharedDomain(matrices: SimilarityMatrix[]): { min: number; max: number } {
  const usable = matrices.filter((m) => m.presentCount > 1);
  if (usable.length === 0) return { min: 0, max: 1 };
  return {
    min: Math.min(...usable.map((m) => m.min)),
    max: Math.max(...usable.map((m) => m.max)),
  };
}
