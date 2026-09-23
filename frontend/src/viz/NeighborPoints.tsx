/**
 * Nachbarn als beschriftete Punkte im Raum (früher `VocabPoints.tsx`, das eine
 * Radius-Suche im Bild gezeichnet hat — s. `neighborPoints.ts` zur Begründung
 * des Wechsels). Gezeigt wird, was der Lieferant im vollen Vektorraum als
 * nächste Wörter ausgewählt hat, an der Stelle, an der die Projektion sie
 * ablegt.
 *
 * Kuratierte Anker bleiben ausgespart: die zeichnet `Anchors.tsx` ohnehin und
 * hebt sie hervor, wenn sie Nachbarn sind. Hier kommen nur die Wörter dazu, die
 * sonst gar nicht im Bild wären. Optik bewusst zurückhaltend (klein, kursiv,
 * mit dem Rang ausblassend) — die Zielwörter und Anker bleiben führend.
 */
import { Html } from "@react-three/drei";
import { neighborPointsAt } from "./neighborPointsData";
import type { IndexedBundle } from "../data/model";
import { INK, type Mode } from "./theme";

/** Lesbarkeitsgrenze fürs Bild, unabhängig vom gewählten k: mehr beschriftete
 * Punkte überlagern sich im Raum zu Unlesbarkeit. Wer mehr sehen will, liest
 * die Liste im Nachbarn-Panel, die bis k geht. */
export const MAX_RENDERED = 40;

interface Props {
  idx: IndexedBundle;
  mode: Mode;
  sliceT: number;
  activeEntityId: string | null;
  neighborK: number;
}

export function NeighborPoints({ idx, mode, sliceT, activeEntityId, neighborK }: Props) {
  const punkte = neighborPointsAt(idx, activeEntityId, sliceT, neighborK)
    .filter((p) => !p.isAnchor)
    .slice(0, MAX_RENDERED);
  const ink = INK[mode];

  return (
    <group>
      {punkte.map((p) => {
        // Weiter vorn im Rang = deutlicher. Bezug ist das gewählte k, nicht
        // MAX_RENDERED: bei kleinem k sollen alle kräftig sein.
        const t = 1 - (p.rank - 1) / Math.max(1, neighborK);
        const opacity = 0.25 + 0.6 * t;
        return (
          <group key={`${p.label}-${p.rank}`} position={p.pos}>
            <mesh>
              <sphereGeometry args={[0.045, 8, 8]} />
              <meshBasicMaterial color={ink.muted} transparent opacity={opacity} />
            </mesh>
            <Html center distanceFactor={16} zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
              <span
                style={{
                  color: ink.muted,
                  opacity,
                  fontSize: 10,
                  fontStyle: "italic",
                  whiteSpace: "nowrap",
                  textShadow:
                    mode === "dark"
                      ? "0 1px 2px rgba(0,0,0,0.8)"
                      : "0 1px 2px rgba(255,255,255,0.9)",
                  fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
                }}
              >
                {p.label}
              </span>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
