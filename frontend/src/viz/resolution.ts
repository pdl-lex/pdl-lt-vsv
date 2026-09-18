/**
 * Auflösungs-Gating: welche Zellen dürfen überhaupt gelesen werden?
 *
 * Manche Lieferanten legen neben `freq` zwei Gütemaße in die Zelle. Sie messen
 * etwas anderes als `freq` und sind nicht ineinander umrechenbar:
 *
 *   kontrast  Reproduzierbarkeit des Vektors über zwei Datenhälften — misst, ob
 *             der Vektor überhaupt etwas über SEIN Wort aussagt.
 *   generik   wie ähnlich der Vektor dem Vokabular im Allgemeinen ist — misst,
 *             ob die Nachbarliste interpretierbar ist. Hoch = alles ist gleich
 *             nah, die Liste ist beliebig.
 *
 * Warum das nötig ist: ohne Gating zeigt die 3D-Szene ausgerechnet die
 * unaufgelösten Wörter am auffälligsten. Am SGNS-Bundle gemessen korreliert die
 * 3D-Weglänge mit dem Kontrast zu **r = −0,65** — `Rüstung` (kontrast 0,18)
 * legt 193 % der Bilddiagonale zurück, `Bundeswehr` (kontrast 0,40) nur 70 %.
 * Wer die Szene ohne Gating liest, greift zuverlässig die falschen Wörter.
 *
 * WICHTIG — Abwesenheit heißt "kein Gating", nicht "schlecht". Bundles ohne
 * diese Felder (der PPMI-Pfad, das Demo-Bundle, jeder Fremdlieferant) müssen
 * unverändert aussehen. Jede Funktion hier gibt für `undefined` den neutralen
 * Wert zurück. `null` ist etwas anderes als `undefined`: es heißt "gemessen
 * werden sollte, ging aber nicht" — und wird wie fehlend behandelt, weil eine
 * fehlende Messung kein Beleg für schlechte Qualität ist.
 */

/** Ab hier gilt eine Zelle als aufgelöst.
 *
 * 0,29 ist nicht gegriffen, sondern das 90-%-Quantil des Kontrasts über alle
 * Wörter im SGNS-Korpus: darunter liegt der generische Bereich, in dem ein
 * Vektor allem ungefähr gleich ähnlich ist. Bewusst eine Frontend-Konstante und
 * kein Bundle-Feld — der Lieferant misst, das Tool entscheidet, ab wann es die
 * Messung ernst nimmt. */
export const KONTRAST_SCHRANKE = 0.29;

/** Ab hier ist die Nachbarliste nicht mehr interpretierbar (SGNS-Bundle: 35 der
 * 130 Zellen). Derselbe Wert, den `meta.description` dort nennt. */
export const GENERIK_SCHRANKE = 0.55;

/** Unterhalb dieses Faktors wird nicht weiter abgedunkelt — eine unaufgelöste
 * Zelle soll gedämpft sein, aber nicht unsichtbar. Sie zu verstecken wäre
 * dieselbe Bevormundung wie sie ungedämpft zu zeigen: das Tool macht sichtbar,
 * es entscheidet nicht. */
const MIN_DAEMPFUNG = 0.35;

/** Ein Zahlenwert nur dann, wenn er wirklich eine Messung ist. */
function gemessen(wert: number | null | undefined): number | null {
  return typeof wert === "number" && Number.isFinite(wert) ? wert : null;
}

/** true, wenn die Zelle eine Kontrastmessung UNTER der Schranke trägt.
 * Fehlende Messung → false (nicht gaten, was man nicht weiß). */
export function istUnaufgeloest(kontrast: number | null | undefined): boolean {
  const k = gemessen(kontrast);
  return k !== null && k < KONTRAST_SCHRANKE;
}

/** true, wenn die Nachbarliste dieser Zelle als beliebig gelten muss. */
export function istGenerisch(generik: number | null | undefined): boolean {
  const g = gemessen(generik);
  return g !== null && g > GENERIK_SCHRANKE;
}

/**
 * Dämpfungsfaktor 0..1 für Deckkraft/Linienstärke.
 *
 * Ohne Messung 1 (unverändert). Oberhalb der Schranke 1. Darunter linear bis
 * MIN_DAEMPFUNG bei kontrast <= 0 — ein Wort, das seiner eigenen Fortsetzung
 * unähnlicher ist als einem beliebigen anderen, ist der Extremfall und wird am
 * stärksten gedämpft.
 */
export function daempfung(kontrast: number | null | undefined): number {
  const k = gemessen(kontrast);
  if (k === null || k >= KONTRAST_SCHRANKE) return 1;
  const anteil = Math.max(0, k) / KONTRAST_SCHRANKE;
  return MIN_DAEMPFUNG + (1 - MIN_DAEMPFUNG) * anteil;
}

/**
 * Auflösung einer ganzen Trajektorie: der Median über ihre gemessenen Zellen.
 *
 * Median und nicht Mittelwert, weil einzelne Ausreißerjahre (eine dünne Scheibe
 * mit 3 Vorkommen) sonst ein sonst brauchbares Wort mit herunterziehen. Der
 * Median ist hier das richtige Maß, weil die Frage lautet "ist dieses WORT
 * auswertbar", nicht "wie schlimm ist sein schlechtestes Jahr".
 *
 * Rückgabe `null`, wenn keine einzige Zelle eine Messung trägt — dann bleibt
 * die Trajektorie ungedämpft.
 */
export function trackAufloesung(kontraste: (number | null | undefined)[]): number | null {
  const werte = kontraste.map(gemessen).filter((k): k is number => k !== null);
  if (werte.length === 0) return null;
  const sortiert = [...werte].sort((a, b) => a - b);
  const mitte = Math.floor(sortiert.length / 2);
  return sortiert.length % 2 !== 0
    ? sortiert[mitte]
    : (sortiert[mitte - 1] + sortiert[mitte]) / 2;
}
