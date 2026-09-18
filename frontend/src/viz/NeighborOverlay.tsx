/**
 * Nearest-Neighbour-Overlay beim Scrubben: verbindet das aktive Zielwort an
 * seiner aktuellen Position mit seinen Nachbarn (gestrichelte Linien).
 *
 * Die Linien sind das eigentliche Lehrmittel dieser Ansicht. Ausgewählt werden
 * die Nachbarn im vollen Vektorraum, gezeichnet wird die Projektion — dass die
 * Linien quer durchs Bild laufen statt zu einer Traube zu bündeln, zeigt genau
 * die Verzerrung, die der Kasten „Warum nur 3 Dimensionen?" beschreibt.
 *
 * Früher endeten die Linien nur an Ankern (`anchorForLabel`), also an rund 2 %
 * der Nachbar-Labels — der Rest hatte im Bundle keine Koordinate. Seit
 * `vocab_points` die Positionen zu allen Nachbarn mitliefert, greift
 * `pointForLabel` und die Linien gehen zu allen verorteten Treffern.
 */
import { Line } from "@react-three/drei";
import type { IndexedBundle } from "../data/model";
import { sampleTrackAt, toWorld } from "../data/model";
import { neighborPointsAt } from "./neighborPoints";
import { entityColor, type Mode } from "./theme";

/** Eigene, kleine Grenze: Linien überlagern sich schneller zu Unlesbarkeit als
 * Punkte, und ihre Aussage („die echten Nachbarn liegen verstreut") steht schon
 * nach einer Handvoll. Unabhängig von `MAX_RENDERED` im Punkte-Layer. */
const MAX_LINES = 12;

interface Props {
  idx: IndexedBundle;
  mode: Mode;
  activeEntityId: string | null;
  sliceT: number;
  neighborK: number;
}

export function NeighborOverlay({ idx, mode, activeEntityId, sliceT, neighborK }: Props) {
  if (!activeEntityId) return null;
  const ei = idx.tracks.findIndex((t) => t.entity.id === activeEntityId);
  if (ei < 0) return null;

  const sample = sampleTrackAt(idx.tracks[ei], sliceT);
  if (!sample || sample.freq <= 0) return null; // Wort zu dieser Zeit nicht belegt
  const from = toWorld(idx, sample.coords);

  const punkte = neighborPointsAt(idx, activeEntityId, sliceT, neighborK).slice(0, MAX_LINES);
  const color = entityColor(ei, mode);

  return (
    <group>
      {punkte.map((p) => (
        <Line
          key={`${p.label}-${p.rank}`}
          points={[from, p.pos] as [number, number, number][]}
          color={color}
          lineWidth={1.5}
          dashed
          dashSize={0.15}
          gapSize={0.1}
          transparent
          opacity={0.55}
        />
      ))}
    </group>
  );
}
