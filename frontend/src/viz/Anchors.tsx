/**
 * Anker als beschriftete Landmarken – der recessive "Karten"-Layer. Cluster wird
 * durch das Textlabel (+ Legende) getragen; die entsättigte Farbe ist nur ein
 * Gruppierungshinweis. Kleine, halbtransparente Punkte, damit die Zielwörter
 * davor dominieren.
 */
import { Html } from "@react-three/drei";
import type { IndexedBundle } from "../data/model";
import { toWorld } from "../data/model";
import { clusterColor, INK, type Mode } from "./theme";
import { useViz } from "../state/store";

interface Props {
  idx: IndexedBundle;
  mode: Mode;
  /** Anker-Labels, die aktuell als NN hervorgehoben sind. */
  highlighted?: Set<string>;
}

export function Anchors({ idx, mode, highlighted }: Props) {
  const clusterIndex = new Map(idx.clusters.map((c, i) => [c, i]));
  const hiddenClusters = useViz((s) => s.hiddenClusters);

  return (
    <group>
      {idx.anchors.map((a, i) => {
        const pos = toWorld(idx, a.coords_3d);
        const ci = clusterIndex.get(a.cluster) ?? 0;
        const color = clusterColor(ci, mode);
        const isHi = highlighted?.has(a.label) ?? false;
        if (!isHi && hiddenClusters.has(a.cluster)) return null;
        return (
          <group key={`${a.label}-${i}`} position={pos}>
            <mesh>
              <sphereGeometry args={[isHi ? 0.12 : 0.07, 12, 12]} />
              <meshStandardMaterial
                color={isHi ? INK[mode].primary : color}
                transparent
                opacity={isHi ? 0.95 : 0.55}
              />
            </mesh>
            <Html center distanceFactor={14} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
              <span
                style={{
                  color: isHi ? INK[mode].primary : INK[mode].muted,
                  fontSize: 11,
                  fontWeight: isHi ? 700 : 400,
                  whiteSpace: "nowrap",
                  textShadow:
                    mode === "dark"
                      ? "0 1px 2px rgba(0,0,0,0.8)"
                      : "0 1px 2px rgba(255,255,255,0.9)",
                  fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
                }}
              >
                {a.label}
              </span>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
