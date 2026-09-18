/**
 * Zielwort-Trajektorien als Pfade durch den Raum. Eine Linie je (ausgewähltem)
 * Zielwort, in dessen Identitätsfarbe. Pfade bestehen aus getrennten Segmenten:
 * leere Frühzellen (freq==0) unterbrechen die Linie – es wird keine Bewegung
 * "erfunden", wo das Wort im Korpus noch nicht vorkam.
 */
import { Line } from "@react-three/drei";
import type { IndexedBundle } from "../data/model";
import { toWorld } from "../data/model";
import { daempfung, trackAufloesung } from "./resolution";
import { entityColor, type Mode } from "./theme";

interface Props {
  idx: IndexedBundle;
  mode: Mode;
  selected: Set<string>;
  activeEntityId: string | null;
}

export function Trajectories({ idx, mode, selected, activeEntityId }: Props) {
  return (
    <group>
      {idx.tracks.map((track, ei) => {
        if (!selected.has(track.entity.id)) return null;
        const color = entityColor(ei, mode);
        const isActive = track.entity.id === activeEntityId;

        // Gedämpft wird hier je WORT, nicht je Zelle: die Linie ist ein Objekt,
        // und die Auflösung ist in diesen Daten ohnehin eine Worteigenschaft
        // (`Bundeswehr` 12/12 belastbar, `Wehrpflicht` 0/12) und keine, die
        // zwischen zwei Jahren springt. Median über die gemessenen Zellen,
        // damit ein einzelnes dünnes Jahr ein sonst brauchbares Wort nicht
        // mit herunterzieht.
        const daempf = daempfung(
          trackAufloesung(track.samples.map((s) => s?.kontrast)),
        );

        return track.segments.map((seg, si) => {
          const pts = seg.map((c) => toWorld(idx, c)) as [number, number, number][];
          if (pts.length < 2) return null;
          return (
            <Line
              key={`${track.entity.id}-${si}`}
              points={pts}
              color={color}
              // Auch die Strichstärke mitziehen: gerade die unaufgelösten
              // Wörter haben die LÄNGSTEN Wege durch das Bild (r = −0,65
              // zwischen Kontrast und 3D-Weglänge), ihre Linien dominieren die
              // Szene sonst allein durch ihre Länge.
              lineWidth={(isActive ? 3 : 1.5) * (0.5 + 0.5 * daempf)}
              transparent
              opacity={(isActive ? 0.85 : 0.4) * daempf}
            />
          );
        });
      })}
    </group>
  );
}
