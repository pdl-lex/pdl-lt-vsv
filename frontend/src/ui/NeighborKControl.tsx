/**
 * Regler für die Länge der Nachbarliste (früher `VocabRadiusControl.tsx`, ein
 * Radius in Szeneneinheiten — s. `viz/neighborPoints.ts` zur Begründung des
 * Wechsels). Der Radius hat im Bild gesucht und dabei Bildnähe mit Ähnlichkeit
 * verwechselt; k schneidet nur eine Liste ab, die im vollen Vektorraum
 * entstanden ist.
 *
 * Der Regler reicht bis `NEIGHBOR_K_MAX` (100), höchstens aber bis zur Länge der
 * aktuellen Listen (`maxNeighborK`): ältere Bundles liefern 8 Nachbarn je Zelle,
 * neue 150, eine Abfrage mit Filtern bis 1000.
 */
import { NEIGHBOR_K_MAX, useVizPick } from "../state/store";

export function NeighborKControl() {
  const { indexed, neighborK, setNeighborK } = useVizPick("indexed", "neighborK", "setNeighborK");
  if (!indexed) return null;

  const top = indexed.maxNeighborK;
  const max = Math.min(NEIGHBOR_K_MAX, top);
  const quelle = indexed.neighborSource === "query" ? "abgefragt" : "im Bundle";

  return (
    <div className="vocabctl">
      <div className="vocabctl__row">
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={Math.min(neighborK, max)}
          onChange={(e) => setNeighborK(parseInt(e.target.value, 10))}
          title={`Wie viele der Nachbarn im Bild gezeigt werden – bis zu ${max} der ${top} je Zeitscheibe (${quelle})`}
        />
        <span className="vocabctl__value lt-mono">{Math.min(neighborK, max)}</span>
      </div>
      <p className="vocabctl__note">
        {neighborK <= 0
          ? "0 = aus: keine Nachbarn im Bild."
          : `${Math.min(neighborK, max)} der Top ${top}`}
      </p>
    </div>
  );
}
