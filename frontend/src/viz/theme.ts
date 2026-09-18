/**
 * Farb- und Tokenquelle für die Visualisierung (JS, weil react-three-fiber die
 * Werte als Zahlen/Strings braucht — die UI-Chrome nutzt die CSS-Tokens aus
 * `styles/tokens.css`). INK ist auf die LexoTerm-Flächen abgestimmt, damit
 * 3D-Szene und Werkzeug-Chrome zusammen gehören.
 *
 * ## Kategoriale Daten-Palette (12 Slots)
 *
 * Erweitert von 8 auf **12 Farben**, damit mehr Serien (Zielwörter/Facetten/
 * Cluster) unterscheidbar sind. Entworfen und validiert mit dem dataviz-Skill
 * (OKLab + Machado-CVD-Simulation):
 *
 * - **Kategoriales Gate (Legende/Linien = benachbarte Slots) BESTEHT in beiden
 *   Modi:** worst adjacent CVD ΔE 8.3 hell / 9.9 dunkel (Ziel ≥ 8); worst
 *   adjacent Normalsicht ΔE 29.2 / 25.0 (Boden ≥ 15). Alle 12 liegen im
 *   Helligkeitsband und über dem Chroma-Boden.
 * - **Slot-Reihenfolge ist die CVD-Sicherung, nicht kosmetisch.** Sie ist eine
 *   „Aufdeck-Reihenfolge": die ersten Slots sind maximal verschieden, sodass der
 *   häufige Fall weniger Serien (≤ 6) die klarsten Farben zuerst bekommt.
 * - **Viele Serien gleichzeitig** (3D-Streuung, alle Wörter sichtbar): jenseits
 *   ~4–5 Serien trägt Farbe die Identität nicht allein (all-pairs unter CVD nicht
 *   trennbar — das gilt für JEDE 12er-Palette). Deshalb ist jedes Zielwort IMMER
 *   direkt beschriftet + eigene Trajektorienlinie (die dokumentierte
 *   „label directly"-Sekundärkodierung des Skills). Bewusst so, kein Bug.
 *
 * Zwei Layer teilen sich den Farbraum unterschiedlich:
 * - **Zielwörter/Facetten** tragen die kräftigen Hues in Slot-Reihenfolge.
 * - **Anker-Cluster** sind Kontext/Landmarken: dieselben Hues, aber Richtung
 *   Szenenfläche entsättigt (recessiv). Cluster-Identität trägt das Label.
 */

export type Mode = "light" | "dark";

// Validierte kategoriale 12er-Palette (feste Reihenfolge = CVD-Sicherung).
const CATEGORICAL: Record<Mode, string[]> = {
  light: [
    "#00b597", "#d775d5", "#8a9a00", "#7d52c3", "#e0a900", "#487ee7",
    "#c04020", "#00c6f1", "#fe7c4e", "#0749ac", "#65ce69", "#ba448c",
  ],
  dark: [
    "#00927a", "#c074bd", "#727f00", "#795bb3", "#ba8c07", "#5581d3",
    "#b24f37", "#00a4c8", "#d87451", "#2d5caa", "#5aa95c", "#ae5288",
  ],
};

/** Chrome-/Ink-Token je Modus — an die LexoTerm-Flächen (tokens.css) angelehnt.
 * `page` ist der 3D-Canvas-Hintergrund: hell die ruhige App-Fläche, dunkel die
 * tiefste Fläche, damit die leuchtenden Punkte maximal Kontrast bekommen. */
export const INK: Record<Mode, {
  surface: string;
  page: string;
  primary: string;
  secondary: string;
  muted: string;
  grid: string;
  baseline: string;
}> = {
  light: {
    surface: "#ffffff",
    page: "#f7faf8",
    primary: "#0d1411",
    secondary: "#3e4845",
    muted: "#6c7672",
    grid: "#e0e6e2",
    baseline: "#c9d1cc",
  },
  dark: {
    surface: "#131a17",
    page: "#0e1412",
    primary: "#e9efeb",
    secondary: "#adb7b2",
    muted: "#7d8782",
    grid: "#222a26",
    baseline: "#2d3732",
  },
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Mischt `hex` um Anteil `t` (0..1) Richtung `toward`. */
function mix(hex: string, toward: string, t: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(toward);
  return rgbToHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
}

/** Anzahl der Slots in der kategorialen Palette (für Legenden/„Other"-Grenzen). */
export const CATEGORICAL_SLOTS = CATEGORICAL.light.length;

/** Kräftige Zielwort-Farbe für Slot `i` (zyklisch, aber Reihenfolge bleibt stabil). */
export function entityColor(i: number, mode: Mode): string {
  const slots = CATEGORICAL[mode];
  return slots[i % slots.length];
}

/** Entsättigte Cluster-Farbe (recessiver Anker-Layer), Richtung Szenenfläche gemischt. */
export function clusterColor(i: number, mode: Mode): string {
  const slots = CATEGORICAL[mode];
  return mix(slots[i % slots.length], INK[mode].page, 0.5);
}

/* ── Sequential-Rampe (Magnitude) ─────────────────────────────────────────────
 *
 * Für Wertflächen statt Serien-Identität – aktuell die Kiyama-Ähnlichkeits-
 * matrizen (`viz/similarity.ts`). Regel des dataviz-Skills für Sequential:
 * **eine Farbe, monotone Helligkeit, hell→dunkel; im Dunkelmodus kippt der
 * Anker** (die flächennahe Stufe bleibt „wenig", der Kontrast wächst nach oben).
 *
 * Quelle der Stufen ist die **Marken-Grün-Rampe aus `styles/tokens.css`**
 * (`--lt-g-100 … --lt-g-800`) – keine freihändigen Werte. `--lt-g-50` ist
 * bewusst NICHT dabei: gegen `--lt-g-100` beträgt der Helligkeitsabstand nur
 * ΔL 0.044 und fällt damit unter den Stufenboden von 0.06.
 *
 * Validiert mit `scripts/validate_palette.js --ordinal` des dataviz-Skills:
 * - hell (Fläche #ffffff):  Monotonie PASS · ΔL-Abstände PASS · Einfarbigkeit
 *   PASS (Hue-Spanne 3°)
 * - dunkel (Fläche #0e1412): dieselben drei PASS
 *
 * Der Check „Light-end contrast ≥ 2:1" meldet FAIL und ist hier **nicht
 * anwendbar**: er gilt für ORDINALE Rampen (diskrete geordnete Marken). Bei
 * einer echten Sequential-Fläche darf die hellste Stufe „nahe null" bedeuten
 * und gegen die Fläche zurücktreten – genau das trägt die Kiyama-Lesart, weil
 * so die dunkle Blockstruktur hoher Ähnlichkeit hervorspringt. Nicht
 * „reparieren": eine angehobene Untergrenze würde die Matrix zumatschen.
 *
 * Weil „wenig Ähnlichkeit" damit flächennah rendert, darf **fehlende Daten
 * NIE als Farbe** kodiert werden – sonst sind beide ununterscheidbar. Zellen
 * ohne Beleg bekommen die Textur-Schraffur (`MASK`), siehe similarity.ts.
 */
const SEQUENTIAL_STEPS = [
  "#d4ebde", "#a7d6bd", "#79bf9b", "#4ea87b",
  "#2d8159", "#246a48", "#1c5238", "#143b29",
] as const;

/** Rampen-Stufen in Leserichtung „wenig → viel" für den jeweiligen Modus.
 * Hell: hell→dunkel. Dunkel: gekippter Anker, also dunkel→hell. */
export function sequentialSteps(mode: Mode): readonly string[] {
  return mode === "light" ? SEQUENTIAL_STEPS : [...SEQUENTIAL_STEPS].reverse();
}

/** Sequential-Farbe für einen normierten Wert `t` ∈ [0,1] (0 = wenig, 1 = viel).
 * Zwischen den dokumentierten Stufen wird linear interpoliert – die Stufen sind
 * bereits perzeptuell gestaffelt, die Monotonie bleibt damit erhalten. */
export function sequentialColor(t: number, mode: Mode): string {
  const steps = sequentialSteps(mode);
  const clamped = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0;
  const pos = clamped * (steps.length - 1);
  const i = Math.min(Math.floor(pos), steps.length - 2);
  return mix(steps[i], steps[i + 1], pos - i);
}

/** Farbe der Schraffur für „kein Beleg" (freq==0 / kein Vektor). Bewusst ein
 * neutraler Linienton, keine Rampenstufe – „keine Daten" ist kein kleiner Wert. */
export const MASK: Record<Mode, { ink: string; ground: string }> = {
  light: { ink: "#b8c1bd", ground: "#ffffff" },
  dark: { ink: "#3e4944", ground: "#0e1412" },
};

/** Facettenwert-Farbe (Facettiert-Modus). Nutzt dieselbe kategoriale Palette in
 * fester Reihenfolge – im Facettiert-Layer trägt Farbe die Facette (Publikation),
 * nicht die Entity, also kein Konflikt innerhalb der Ansicht. Zusätzlich sind die
 * Linien beschriftbar/hover-bar (Sekundärkodierung). */
export function facetColor(i: number, mode: Mode): string {
  const slots = CATEGORICAL[mode];
  return slots[i % slots.length];
}
