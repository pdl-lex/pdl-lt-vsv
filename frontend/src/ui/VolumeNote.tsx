/**
 * Beleg-Anzeige der aktuellen Zeitscheibe für das aktive Zielwort, direkt unter
 * dem Nachbarn-Panel. Ergänzt die Konfidenz-Kodierung (Punktgröße/Deckkraft im
 * 3D-Raum) um eine lesbare Zahl — die Kodierung allein macht z.B. freq=48 gegen
 * freq=1358 (Faktor 28) nicht verlässlich unterscheidbar.
 */
import { useViz } from "../state/store";
import type { TrackSample } from "../data/model";
import { Icon } from "../design/icons";
import { InfoTooltip } from "./InfoTooltip";

const BELEG_INFO =
  "Wie oft dieses Wort in der aktuellen Zeitscheibe im Korpus vorkommt (freq), " +
  "verglichen mit dem Median über alle eigenen belegten Zeitscheiben. Ergänzt " +
  "die Punktgröße/Deckkraft im 3D-Bild um eine lesbare Zahl — kleine Werte " +
  "relativ zum eigenen Median heißen: Vorsicht bei der Deutung.";

// Eigenständige Frontend-Schwelle, absichtlich unabhängig von einer möglichen
// pipeline-seitigen Mindest-Trefferzahl: "dünn" heißt hier relativ zur eigenen
// sonstigen Belegung dieses Worts, nicht ein absoluter Wert.
const DUENN_ANTEIL_VOM_MEDIAN = 0.25;

function median(werte: number[]): number {
  const sorted = [...werte].sort((a, b) => a - b);
  const mitte = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mitte] : (sorted[mitte - 1] + sorted[mitte]) / 2;
}

export function VolumeNote() {
  const { indexed, activeEntityId, sliceT } = useViz();
  if (!indexed || !activeEntityId) return null;

  const sliceIndex = Math.max(0, Math.min(Math.round(sliceT), indexed.sliceCount - 1));
  const track = indexed.tracks.find((t) => t.entity.id === activeEntityId);
  const freq = track?.samples[sliceIndex]?.freq ?? 0;
  if (freq <= 0) return null; // NeighborPanel zeigt "nicht belegt" bereits an

  const eigeneWerte = (track?.samples ?? [])
    .filter((s): s is TrackSample => !!s && s.freq > 0)
    .map((s) => s.freq);
  const eigenerMedian = eigeneWerte.length > 0 ? median(eigeneWerte) : freq;
  const duenn = eigenerMedian > 0 && freq < DUENN_ANTEIL_VOM_MEDIAN * eigenerMedian;

  return (
    <div className="nn">
      <div className="nn__head">
        <span className="lt-eyebrow">Beleg</span>
        <InfoTooltip text={BELEG_INFO} />
      </div>
      <p className="vol__value">
        {Math.round(freq)} Vorkommen
        <span className="vol__ref"> · Median über alle Zeitscheiben dieses Worts: {Math.round(eigenerMedian)}</span>
      </p>
      {duenn && (
        <p className="warnnote">
          <Icon name="info" size={13} />
          Dünn belegt in dieser Zeitscheibe — Vorsicht bei der Deutung.
        </p>
      )}
    </div>
  );
}
