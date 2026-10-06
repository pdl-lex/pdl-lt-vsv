/**
 * Umschalter Kosinus ↔ Nachbarschafts-Überlappung, geteilt von Matrizen und
 * Drift (`state/metricOptions.ts`). Bei Überlappung kommen k-Regler und der
 * Filterhinweis dazu: die Zahl hängt an den gefilterten Nachbarlisten.
 */
import { useViz } from "../state/store";
import { useMetricOptions, type Metric } from "../state/metricOptions";
import { OVERLAP_K_MIN, effectiveK } from "../viz/overlap";
import { NeighborFilterNote } from "./NeighborFilterNote";

const METRICS: [Metric, string][] = [
  ["kosinus", "Kosinus"],
  ["ueberlappung", "Überlappung"],
];

export function MetricControl() {
  const indexed = useViz((s) => s.indexed);
  const { metric, setMetric } = useMetricOptions();
  if (!indexed) return null;

  return (
    <div className="mode">
      <div className="mode__seg">
        {METRICS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`mode__btn ${metric === id ? "mode__btn--active" : ""}`}
            onClick={() => setMetric(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {metric === "ueberlappung" && <OverlapKControl />}

      <p className="mode__hint">
        {metric === "kosinus"
          ? "Kosinus der vollen Vektoren zweier Zeitscheiben."
          : "Anteil gemeinsamer Wörter unter den k nächsten Nachbarn zweier Zeitscheiben (Gonen et al. 2020). Kleines k reagiert auf die engsten Nachbarn, großes k auf das weitere Umfeld."}
      </p>
      {metric === "ueberlappung" && <NeighborFilterNote short />}
    </div>
  );
}

/** k-Regler für `overlap@k`; auch vom Wandel-Ranking genutzt (dasselbe k). */
export function OverlapKControl() {
  const indexed = useViz((s) => s.indexed);
  const { overlapK, setOverlapK } = useMetricOptions();
  if (!indexed) return null;

  const top = indexed.maxNeighborK;
  const k = effectiveK(indexed, overlapK);
  const step = top > 200 ? 10 : 1;

  return (
    <div className="vocabctl">
      <div className="vocabctl__row">
        <input
          type="range"
          min={Math.min(OVERLAP_K_MIN, top)}
          max={top}
          step={step}
          value={k}
          onChange={(e) => setOverlapK(parseInt(e.target.value, 10))}
          title="Wie viele der nächsten Nachbarn je Zeitscheibe verglichen werden"
        />
        <span className="vocabctl__value lt-mono">{k}</span>
      </div>
      <p className="vocabctl__note">k = {k} der Top {top}</p>
    </div>
  );
}
