/**
 * Modul „Wortraum": der 3D-Explorer — Anker als Landmarken, Zielwort-Trajektorien
 * durch den gemeinsamen Vektorraum, Zeit als Slider. Inhaltlich unverändert aus
 * der früheren Einzelwerkzeug-Shell übernommen, nur in die Modulform gebracht:
 * `Config` = Konfigurator-Sektionen, `Main` = Canvas + NN-Overlay,
 * `Footer` = Zeitachse (nur dieses Modul hat eine — die Matrizen zeigen die
 * gesamte Zeitspanne auf einmal).
 */
import { Canvas } from "@react-three/fiber";
import { useViz } from "../state/store";
import { useMode } from "../viz/useMode";
import { INK } from "../viz/theme";
import { Scene } from "../viz/Scene";
import { Section } from "../ui/Section";
import { TimeSlider } from "../ui/TimeSlider";
import { AnchorClusters, ConfidenceKey, TargetWords } from "../ui/Legend";
import { NeighborKControl } from "../ui/NeighborKControl";
import { NeighborPanel } from "../ui/NeighborPanel";
import { VolumeNote } from "../ui/VolumeNote";
import { ProjectionNote } from "../ui/ProjectionNote";
import { ModeSwitch } from "../ui/ModeSwitch";
import { FacetFilter } from "../ui/FacetFilter";

export function WortraumConfig() {
  const { indexed, viewMode, facetFilters } = useViz();
  if (!indexed) return <p className="prose">Erst im Modul „Datenquelle" ein Bundle laden.</p>;

  const activeFacetCount = Object.values(facetFilters).reduce((n, s) => n + (s?.size ?? 0), 0);

  return (
    <>
      <Section title="Ansicht" icon="layers">
        <ModeSwitch />
      </Section>

      <Section title="Zielwörter" icon="target" badge={indexed.tracks.length}>
        <TargetWords />
      </Section>

      {viewMode !== "aggregat" && (
        <Section
          title="Facetten"
          icon="filter"
          badge={activeFacetCount > 0 ? activeFacetCount : undefined}
        >
          <FacetFilter />
        </Section>
      )}

      {indexed.clusters.length > 0 && (
        <Section title="Anker-Cluster" icon="dot" badge={indexed.clusters.length} defaultOpen={false}>
          <AnchorClusters />
        </Section>
      )}

      {viewMode === "aggregat" && indexed.maxNeighborK > 0 && (
        <Section title="Nachbarn" icon="orbit" defaultOpen={false}>
          <NeighborKControl />
        </Section>
      )}

      <Section title="Konfidenz" icon="dot" defaultOpen={false}>
        <ConfidenceKey />
      </Section>
    </>
  );
}

export function WortraumMain() {
  const {
    indexed, status, selectedEntityIds, activeEntityId, sliceT, viewMode, facetFilters, neighborK,
    setActiveEntity,
  } = useViz();
  const mode = useMode();
  const ink = INK[mode];

  if (!indexed) {
    return (
      <div className="main__placeholder">
        {status === "loading" ? "Lade Bundle…" : "Wähle links einen Datensatz."}
      </div>
    );
  }

  return (
    <>
      <Canvas camera={{ position: [0, 4, 17], fov: 50, near: 0.1, far: 400 }}>
        <color attach="background" args={[ink.page]} />
        <Scene
          idx={indexed}
          mode={mode}
          sliceT={sliceT}
          selected={selectedEntityIds}
          activeEntityId={activeEntityId}
          viewMode={viewMode}
          filters={facetFilters}
          neighborK={neighborK}
          onPick={setActiveEntity}
        />
      </Canvas>
      {activeEntityId && (
        <div className="main__overlay main__overlay--right">
          <NeighborPanel />
          <VolumeNote />
          <ProjectionNote />
        </div>
      )}
    </>
  );
}

export function WortraumFooter() {
  const indexed = useViz((s) => s.indexed);
  if (!indexed) return null;
  return <TimeSlider />;
}
