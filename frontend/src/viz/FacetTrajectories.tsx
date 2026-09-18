/**
 * Facettierter Modus: eine Linie je Facettenwert (z.B. Publikation) aus den
 * `records`, gefiltert per Faceted-Search. Farbe trägt hier die **Facette**
 * (nicht die Entity) – so werden Quellenunterschiede sichtbar (taz reserviert,
 * JF/WELT früh + stark positiv). Zur räumlichen Orientierung liegt je Zielwort
 * eine blasse Aggregat-Referenzlinie + Label darunter (Entity-Identität).
 */
import { Fragment } from "react";
import { Html, Line } from "@react-three/drei";
import type { IndexedBundle } from "../data/model";
import { passesFacetFilter, sampleTrackAt, toWorld } from "../data/model";
import { confidence } from "./encoding";
import { entityColor, facetColor, type Mode } from "./theme";

interface Props {
  idx: IndexedBundle;
  mode: Mode;
  sliceT: number;
  selected: Set<string>;
  activeEntityId: string | null;
  filters: Record<string, Set<string>>;
}

export function FacetTrajectories({ idx, mode, sliceT, selected, activeEntityId, filters }: Props) {
  return (
    <group>
      {idx.tracks.map((track, ei) => {
        const entityId = track.entity.id;
        if (!selected.has(entityId)) return null;
        const isActive = entityId === activeEntityId;

        // Aggregat-Referenz: blasse Linie + Label als räumlicher Anker.
        const aggSample = sampleTrackAt(track, sliceT);
        const eColor = entityColor(ei, mode);
        const facetList = (idx.facetTracks.get(entityId) ?? []).filter((ft) =>
          passesFacetFilter(ft.facets, filters),
        );

        return (
          <Fragment key={entityId}>
            {track.segments.map((seg, si) => (
              <Line
                key={`agg-${entityId}-${si}`}
                points={seg.map((c) => toWorld(idx, c)) as [number, number, number][]}
                color={eColor}
                lineWidth={1}
                transparent
                opacity={0.12}
              />
            ))}
            {aggSample && aggSample.freq > 0 && (
              <Html
                center
                distanceFactor={9}
                position={toWorld(idx, aggSample.coords)}
                style={{ pointerEvents: "none" }}
              >
                <span
                  style={{
                    color: eColor,
                    fontSize: 13,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    opacity: isActive ? 1 : 0.6,
                    textShadow:
                      mode === "dark" ? "0 1px 3px rgba(0,0,0,0.9)" : "0 1px 3px rgba(255,255,255,0.95)",
                    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
                  }}
                >
                  {track.entity.label ?? entityId}
                </span>
              </Html>
            )}

            {/* Eine Linie + bewegter Punkt je Facettenwert */}
            {facetList.map((ft) => {
              const vi = ft.primaryValueId ? idx.primaryValueIndex.get(ft.primaryValueId) ?? 0 : 0;
              const color = facetColor(vi, mode);
              const s = sampleTrackAt(ft, sliceT);
              const conf = s ? confidence(s.freq, idx.recordFreqMax) : null;
              return (
                <Fragment key={`${entityId}-${ft.facetKey}`}>
                  {ft.segments.map((seg, si) => (
                    <Line
                      key={`ln-${si}`}
                      points={seg.map((c) => toWorld(idx, c)) as [number, number, number][]}
                      color={color}
                      lineWidth={isActive ? 2 : 1.25}
                      transparent
                      opacity={isActive ? 0.7 : 0.35}
                    />
                  ))}
                  {s && conf && conf.opacity > 0 && (
                    <mesh position={toWorld(idx, s.coords)}>
                      <sphereGeometry args={[0.11 * conf.sizeFactor, 16, 16]} />
                      <meshStandardMaterial
                        color={color}
                        emissive={color}
                        emissiveIntensity={0.2}
                        transparent
                        opacity={conf.opacity}
                      />
                    </mesh>
                  )}
                </Fragment>
              );
            })}
          </Fragment>
        );
      })}
    </group>
  );
}
