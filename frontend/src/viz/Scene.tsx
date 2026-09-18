/**
 * 3D-Szeneninhalt (läuft innerhalb von <Canvas>): Beleuchtung, Kamera-Navigation,
 * ein dezenter Boden-Grid zur Tiefenorientierung und die vier Datenlayer –
 * Anker, Trajektorien, bewegte Zielwort-Punkte, NN-Overlay.
 */
import { useMemo } from "react";
import { OrbitControls } from "@react-three/drei";
import { anchorForLabel, entityFreqAt, neighborsAt, type IndexedBundle } from "../data/model";
import type { ViewMode } from "../state/store";
import { INK, type Mode } from "./theme";
import { Anchors } from "./Anchors";
import { NeighborPoints } from "./NeighborPoints";
import { Trajectories } from "./Trajectories";
import { EntityPoints } from "./EntityPoints";
import { FacetTrajectories } from "./FacetTrajectories";
import { DispersionCloud } from "./DispersionCloud";
import { NeighborOverlay } from "./NeighborOverlay";

interface Props {
  idx: IndexedBundle;
  mode: Mode;
  sliceT: number;
  selected: Set<string>;
  activeEntityId: string | null;
  viewMode: ViewMode;
  filters: Record<string, Set<string>>;
  neighborK: number;
  onPick: (id: string) => void;
}

export function Scene({
  idx, mode, sliceT, selected, activeEntityId, viewMode, filters, neighborK, onPick,
}: Props) {
  // Anker-Labels, die aktuell NN des aktiven Worts sind → Hervorhebung.
  const highlighted = useMemo(() => {
    const sliceIndex = Math.max(0, Math.min(Math.round(sliceT), idx.sliceCount - 1));
    const labels = new Set<string>();
    if (entityFreqAt(idx, activeEntityId, sliceIndex) <= 0) return labels; // Wort nicht belegt
    // Nur bis zum gewählten k: bei k=150 leuchtete sonst halb die Ankerkarte
    // auf und die Hervorhebung sagte nichts mehr aus.
    for (const n of neighborsAt(idx, activeEntityId, sliceIndex).slice(0, neighborK)) {
      if (anchorForLabel(idx, n.label)) labels.add(n.label);
    }
    return labels;
  }, [idx, activeEntityId, sliceT, neighborK]);

  const grid = INK[mode].grid;

  return (
    <>
      <ambientLight intensity={mode === "dark" ? 0.6 : 0.8} />
      <directionalLight position={[10, 12, 8]} intensity={0.6} />
      <directionalLight position={[-8, -6, -10]} intensity={0.25} />

      <gridHelper
        args={[28, 28, grid, grid]}
        position={[0, -7, 0]}
        material-transparent
        material-opacity={0.18}
      />

      <Anchors idx={idx} mode={mode} highlighted={highlighted} />
      <NeighborOverlay
        idx={idx}
        mode={mode}
        activeEntityId={activeEntityId}
        sliceT={sliceT}
        neighborK={neighborK}
      />

      {viewMode === "aggregat" && (
        <>
          <Trajectories idx={idx} mode={mode} selected={selected} activeEntityId={activeEntityId} />
          <EntityPoints
            idx={idx}
            mode={mode}
            sliceT={sliceT}
            selected={selected}
            activeEntityId={activeEntityId}
            onPick={onPick}
          />
          <NeighborPoints
            idx={idx}
            mode={mode}
            sliceT={sliceT}
            activeEntityId={activeEntityId}
            neighborK={neighborK}
          />
        </>
      )}
      {viewMode === "facettiert" && (
        <FacetTrajectories
          idx={idx}
          mode={mode}
          sliceT={sliceT}
          selected={selected}
          activeEntityId={activeEntityId}
          filters={filters}
        />
      )}
      {viewMode === "streuung" && (
        <DispersionCloud
          idx={idx}
          mode={mode}
          sliceT={sliceT}
          selected={selected}
          activeEntityId={activeEntityId}
          filters={filters}
          onPick={onPick}
        />
      )}

      <OrbitControls makeDefault enableDamping dampingFactor={0.1} target={[0, 0, 0]} />
    </>
  );
}
