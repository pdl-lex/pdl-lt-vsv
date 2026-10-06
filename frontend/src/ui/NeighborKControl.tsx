/**
 * Regler für die Länge der Nachbarliste (früher `VocabRadiusControl.tsx`, ein
 * Radius in Szeneneinheiten — s. `viz/neighborPoints.ts` zur Begründung des
 * Wechsels). Der Radius hat im Bild gesucht und dabei Bildnähe mit Ähnlichkeit
 * verwechselt; k schneidet nur eine Liste ab, die im vollen Vektorraum
 * entstanden ist.
 *
 * Obergrenze kommt aus den aktuellen Listen (`maxNeighborK`), nicht aus einer
 * geratenen Konstante: ältere Bundles liefern 8 Nachbarn je Zelle, neue 150,
 * eine Abfrage mit Filtern bis 1000.
 */
import { useViz } from "../state/store";
import { MAX_RENDERED } from "../viz/NeighborPoints";

export function NeighborKControl() {
  const { indexed, neighborK, setNeighborK } = useViz();
  if (!indexed) return null;

  const max = indexed.maxNeighborK;
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
          title={`Wie viele der Nachbarn gezeigt werden – bis zu ${max} je Zeitscheibe (${quelle})`}
        />
        <span className="vocabctl__value lt-mono">{Math.min(neighborK, max)}</span>
      </div>
      <p className="vocabctl__note">
        {neighborK <= 0
          ? "0 = aus: keine Nachbarn in Liste und Bild."
          : `von ${max} ${quelle}${
              neighborK > MAX_RENDERED
                ? ` · im Bild nur die ersten ${MAX_RENDERED}, die Liste zeigt alle`
                : ""
            }`}
      </p>
    </div>
  );
}
