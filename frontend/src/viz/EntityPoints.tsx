/**
 * Die bewegten Zielwort-Punkte an der aktuellen (interpolierten) Zeitposition.
 * Größe/Deckkraft ∝ freq (Konfidenz); `freq==0` → unsichtbar, d.h. das Wort
 * "existiert" zu dieser Zeit noch nicht. Jeder Punkt trägt ein direktes Label
 * (Sekundärkodierung der Identität) und ist anklickbar (setzt das aktive Wort).
 */
import { Html } from "@react-three/drei";
import type { IndexedBundle } from "../data/model";
import { sampleTrackAt, toWorld } from "../data/model";
import { confidence } from "./encoding";
import { daempfung } from "./resolution";
import { entityColor, type Mode } from "./theme";

const BASE_RADIUS = 0.22;

interface Props {
  idx: IndexedBundle;
  mode: Mode;
  sliceT: number;
  selected: Set<string>;
  activeEntityId: string | null;
  onPick: (id: string) => void;
}

export function EntityPoints({ idx, mode, sliceT, selected, activeEntityId, onPick }: Props) {
  return (
    <group>
      {idx.tracks.map((track, ei) => {
        if (!selected.has(track.entity.id)) return null;
        const s = sampleTrackAt(track, sliceT);
        if (!s) return null;
        const conf = confidence(s.freq, idx.aggFreqMax);
        if (conf.opacity <= 0) return null; // Wort zu dieser Zeit nicht belegt

        // Zweite, unabhängige Dämpfung: freq sagt, wie viele Belege die Zelle
        // hat, kontrast sagt, ob der daraus gebaute Vektor überhaupt etwas
        // aussagt. Beides kann auseinanderfallen - `Wehrpflicht 2025` hat 191
        // Vorkommen und trotzdem kontrast 0,21. Ohne diesen Faktor sieht so
        // eine Zelle so verlässlich aus wie `Bundeswehr`.
        const daempf = daempfung(s.kontrast);
        const punktOpacity = conf.opacity * daempf;

        const pos = toWorld(idx, s.coords);
        const color = entityColor(ei, mode);
        const isActive = track.entity.id === activeEntityId;
        const r = BASE_RADIUS * conf.sizeFactor;
        const label = track.entity.label ?? track.entity.id;

        return (
          <group key={track.entity.id} position={pos}>
            {/* Ring beim aktiven Wort */}
            {isActive && (
              <mesh>
                <sphereGeometry args={[r * 1.5, 24, 24]} />
                <meshBasicMaterial color={color} transparent opacity={0.15} />
              </mesh>
            )}
            <mesh
              onClick={(e) => {
                e.stopPropagation();
                onPick(track.entity.id);
              }}
              onPointerOver={(e) => {
                e.stopPropagation();
                document.body.style.cursor = "pointer";
              }}
              onPointerOut={() => {
                document.body.style.cursor = "auto";
              }}
            >
              <sphereGeometry args={[r, 24, 24]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={isActive ? 0.45 : 0.2}
                transparent
                opacity={punktOpacity}
              />
            </mesh>
            <Html center distanceFactor={9} position={[0, r + 0.25, 0]} style={{ pointerEvents: "none" }}>
              <span
                style={{
                  color,
                  fontSize: 13,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  textShadow:
                    mode === "dark"
                      ? "0 1px 3px rgba(0,0,0,0.9)"
                      : "0 1px 3px rgba(255,255,255,0.95)",
                  fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
                  // Mit dämpfen: ein helles Label an einem blassen Punkt zieht
                  // den Blick trotzdem auf die unaufgelöste Zelle.
                  opacity: daempf,
                  border: isActive ? `1px solid ${color}` : "none",
                  borderRadius: 4,
                  padding: isActive ? "0 4px" : 0,
                  background: isActive
                    ? mode === "dark"
                      ? "rgba(0,0,0,0.35)"
                      : "rgba(255,255,255,0.6)"
                    : "transparent",
                }}
              >
                {label}
              </span>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
