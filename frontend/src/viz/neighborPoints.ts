/**
 * Die vorberechnete Nachbarliste des aktiven Worts, verortet im 3D-Bild.
 *
 * Löst den früheren Radius-Ansatz ab (`vocabProximity.ts`, entfernt). Der hat
 * im gerenderten 3D-Raum gesucht — euklidisch, in 3 von vector_dim Dimensionen.
 * Gemessen am Quartals-Bundle war das kein tragfähiger Filter: gegen denselben
 * Kandidatenpool erreichten nur 56 von 86 Ankern je eine Trefferliste, während
 * "Kanzler" in zwei Dritteln aller Zellen auftauchte. Die Projektion zieht
 * Punkte nur zusammen, nie auseinander (sie ist 1-Lipschitz) — echte Nähe
 * überlebt sie also, aber sie ist danach nicht mehr von zufälliger
 * Bildnachbarschaft zu unterscheiden.
 *
 * Deshalb jetzt: **ausgewählt wird im vollen Vektorraum** (beim Lieferanten,
 * s. `meta.projection` und SCHEMA.md), **gezeichnet wird im Bild**. Die
 * Koordinaten kommen aus `anchors` bzw. `vocab_points`, die Auswahl und ihre
 * Reihenfolge aus `neighbors`. Dass die Treffer im Bild verstreut liegen statt
 * um das Zielwort zu clustern, ist nicht der Fehler, sondern der Befund.
 */
import { entityFreqAt, neighborsAt, pointForLabel, toWorld, type IndexedBundle } from "../data/model";
import type { Coords3d } from "../types/schema";

export interface NeighborPoint {
  label: string;
  /** Roher Kosinus im vollen Vektorraum, wie vom Lieferanten geliefert. */
  score?: number;
  /** Cluster des Ankers, sonst die Lieferanten-Gruppe (meist "KONTEXT"). */
  group?: string;
  /** 1-basierter Rang in der Lieferantenliste — die Reihenfolge IST der Rang. */
  rank: number;
  /** Weltkoordinaten (nach `toWorld`). */
  pos: Coords3d;
  /** Ist das Wort ein kuratierter Anker? Die sind über `Anchors.tsx` bereits
   * beschriftet und werden dort hervorgehoben — der Punkte-Layer lässt sie
   * deshalb aus, statt sie doppelt zu zeichnen. */
  isAnchor: boolean;
}

/**
 * Die ersten `k` Nachbarn der aktuellen (gerundeten) Zeitscheibe des aktiven
 * Worts, in Lieferantenreihenfolge, auf die verortbaren eingedampft.
 *
 * Leer bei `k <= 0`, ohne aktives Wort oder an einer unbelegten Scheibe
 * (`freq <= 0`) — ein Punkt, den es nicht gibt, hat keine Nachbarschaft.
 * Nachbarn ohne Koordinate im Bundle werden übersprungen: sie stehen weiter in
 * der Liste des Nachbarn-Panels, lassen sich aber nicht zeichnen.
 */
export function neighborPointsAt(
  idx: IndexedBundle,
  activeEntityId: string | null,
  sliceT: number,
  k: number,
): NeighborPoint[] {
  if (!activeEntityId || k <= 0) return [];

  const sliceIndex = Math.max(0, Math.min(Math.round(sliceT), idx.sliceCount - 1));
  if (entityFreqAt(idx, activeEntityId, sliceIndex) <= 0) return [];

  const out: NeighborPoint[] = [];
  const neighbors = neighborsAt(idx, activeEntityId, sliceIndex);

  for (let i = 0; i < Math.min(k, neighbors.length); i++) {
    const n = neighbors[i];
    const coords = pointForLabel(idx, n.label);
    if (!coords) continue; // kein Punkt im Bundle -> nicht zeichenbar
    out.push({
      label: n.label,
      score: n.score,
      group: n.group,
      rank: i + 1,
      pos: toWorld(idx, coords),
      isAnchor: !!idx.anchorByLabel.get(n.label) || !!idx.anchorByLabel.get(n.label.toLowerCase()),
    });
  }
  return out;
}
