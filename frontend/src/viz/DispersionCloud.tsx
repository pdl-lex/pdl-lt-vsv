/**
 * Streuungs-/Unsicherheitsmodus: an der aktuellen Zeit die facettenaufgelösten
 * Punkte (records) je Zielwort als Wolke – KEINE Linien. Farbe trägt die Entity
 * (Identität), Größe/Deckkraft ∝ freq. Die Streubreite der Wolke = Uneinigkeit
 * der Quellen: eng = Konsens, breit = kontrovers. Der beschriftete Aggregat-Punkt
 * markiert das Zentrum.
 */
import { Fragment } from "react";
import { Html } from "@react-three/drei";
import type { IndexedBundle } from "../data/model";
import { passesFacetFilter, sampleTrackAt, toWorld } from "../data/model";
import { confidence } from "./encoding";
import { entityColor, type Mode } from "./theme";

interface Props {
  idx: IndexedBundle;
  mode: Mode;
  sliceT: number;
  selected: Set<string>;
  activeEntityId: string | null;
  filters: Record<string, Set<string>>;
  onPick: (id: string) => void;
}

export function DispersionCloud({ idx, mode, sliceT, selected, activeEntityId, filters, onPick }: Props) {
  return (
    <group>
      {idx.tracks.map((track, ei) => {
        const entityId = track.entity.id;
        if (!selected.has(entityId)) return null;
        const color = entityColor(ei, mode);
        const isActive = entityId === activeEntityId;

        const facetPoints = (idx.facetTracks.get(entityId) ?? [])
          .filter((ft) => passesFacetFilter(ft.facets, filters))
          .map((ft) => sampleTrackAt(ft, sliceT))
          .filter((s): s is NonNullable<typeof s> => !!s && s.freq > 0);

        const center = sampleTrackAt(track, sliceT);

        return (
          <Fragment key={entityId}>
            {/* Facetten-Wolke */}
            {facetPoints.map((s, k) => {
              const conf = confidence(s.freq, idx.recordFreqMax);
              return (
                <mesh key={k} position={toWorld(idx, s.coords)}>
                  <sphereGeometry args={[0.1 * conf.sizeFactor, 14, 14]} />
                  <meshStandardMaterial
                    color={color}
                    transparent
                    opacity={Math.min(1, conf.opacity) * 0.75}
                  />
                </mesh>
              );
            })}

            {/* Beschriftetes Zentrum (Aggregat) */}
            {center && center.freq > 0 && (
              <group position={toWorld(idx, center.coords)}>
                <mesh
                  onClick={(e) => {
                    e.stopPropagation();
                    onPick(entityId);
                  }}
                >
                  <sphereGeometry args={[0.2, 20, 20]} />
                  <meshStandardMaterial
                    color={color}
                    emissive={color}
                    emissiveIntensity={isActive ? 0.45 : 0.2}
                  />
                </mesh>
                <Html center distanceFactor={9} position={[0, 0.45, 0]} style={{ pointerEvents: "none" }}>
                  <span
                    style={{
                      color,
                      fontSize: 13,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      textShadow:
                        mode === "dark" ? "0 1px 3px rgba(0,0,0,0.9)" : "0 1px 3px rgba(255,255,255,0.95)",
                      fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
                    }}
                  >
                    {track.entity.label ?? entityId}
                  </span>
                </Html>
              </group>
            )}
          </Fragment>
        );
      })}
    </group>
  );
}
