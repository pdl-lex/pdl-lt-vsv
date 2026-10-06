/**
 * Legende + Auswahl, aufgeteilt in drei Konfigurator-Sektionen:
 * - `TargetWords`   — Zielwörter (kräftige Identitätsfarben), an/abwählbar +
 *                     per Klick „aktiv" (steuert NN-Overlay/Panel).
 * - `AnchorClusters`— Anker-Cluster (recessive Farben), erklärt die Anker-Karte
 *                     und blendet Cluster per Checkbox ein/aus.
 * - `ConfidenceKey` — die freq→Größe/Deckkraft-Kopplung sichtbar gemacht
 *                     (Sektion „Häufigkeit“).
 */
import { useViz } from "../state/store";
import { useMode } from "../viz/useMode";
import { clusterColor, entityColor } from "../viz/theme";

export function TargetWords() {
  const { indexed, selectedEntityIds, activeEntityId, toggleEntity, setActiveEntity } = useViz();
  const mode = useMode();
  if (!indexed) return null;

  return (
    <div className="words">
      {indexed.tracks.map((t, i) => {
        const id = t.entity.id;
        const color = entityColor(i, mode);
        const selected = selectedEntityIds.has(id);
        const active = id === activeEntityId;
        return (
          <div key={id} className={`words__row ${active ? "words__row--active" : ""}`}>
            <input
              type="checkbox"
              className="words__check"
              checked={selected}
              onChange={() => toggleEntity(id)}
              aria-label={`${t.entity.label ?? id} anzeigen`}
            />
            <button
              type="button"
              className="words__entity"
              onClick={() => setActiveEntity(id)}
              title={t.entity.note ?? ""}
            >
              <span className="swatch" style={{ background: color }} />
              <span className="words__label" style={{ opacity: selected ? 1 : 0.5 }}>
                {t.entity.label ?? id}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function AnchorClusters() {
  const { indexed, hiddenClusters, toggleCluster } = useViz();
  const mode = useMode();
  if (!indexed || indexed.clusters.length === 0) return null;

  return (
    <div className="clusters">
      {indexed.clusters.map((c, i) => {
        const shown = !hiddenClusters.has(c);
        return (
          <label key={c} className="clusters__row">
            <input
              type="checkbox"
              className="words__check"
              checked={shown}
              onChange={() => toggleCluster(c)}
              aria-label={`Cluster ${c} anzeigen`}
            />
            <span className="swatch swatch--dot" style={{ background: clusterColor(i, mode) }} />
            <span className="clusters__label" style={{ opacity: shown ? 1 : 0.5 }}>{c}</span>
          </label>
        );
      })}
    </div>
  );
}

export function ConfidenceKey() {
  return (
    <div className="conf">
      <div className="conf__scale">
        <span className="conf__dot conf__dot--sm" />
        <span className="conf__dot conf__dot--md" />
        <span className="conf__dot conf__dot--lg" />
      </div>
      <span
        className="conf__text"
        title="Fläche wächst linear mit freq, relativ zum häufigsten Zielwort im Bundle; leere Zellen sind unsichtbar"
      >
        Größe &amp; Deckkraft: Vorkommen des Zielworts in der Zeitscheibe (freq)
      </span>
    </div>
  );
}
