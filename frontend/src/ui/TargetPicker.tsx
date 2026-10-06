/**
 * Kleine Karte „Zielwort" über dem Overlay des Wortraums: legt fest, zu welchem
 * Zielwort Nachbarn und Beleg angezeigt werden. Zur Wahl stehen die links
 * eingeblendeten Zielwörter; ein Klick auf einen Punkt im 3D-Bild setzt die
 * Auswahl ebenfalls.
 */
import { useViz } from "../state/store";

export function TargetPicker() {
  const { indexed, selectedEntityIds, activeEntityId, setActiveEntity } = useViz();
  if (!indexed) return null;

  const options = indexed.tracks
    .map((t) => t.entity)
    .filter((e) => selectedEntityIds.has(e.id));

  return (
    <div className="nn">
      <label className="tp">
        <span className="lt-eyebrow">Zielwort</span>
        {options.length === 0 ? (
          <span className="nn__empty">Links kein Zielwort eingeblendet.</span>
        ) : (
          <select
            className="picker__select tp__select"
            value={activeEntityId ?? ""}
            onChange={(e) => setActiveEntity(e.target.value || null)}
          >
            {!activeEntityId && <option value="">— wählen —</option>}
            {options.map((e) => (
              <option key={e.id} value={e.id}>{e.label ?? e.id}</option>
            ))}
          </select>
        )}
      </label>
    </div>
  );
}
