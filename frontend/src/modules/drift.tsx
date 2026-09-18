/**
 * Modul „Drift-Kurven" (Hamilton et al.) — das Ausmaß der Verschiebung als
 * Zeitreihe: `1 − cos(v_ref, v_t)`.
 *
 * Verhältnis zu den Nachbarmodulen: die Matrix zeigt **alle** Zeitpunktpaare
 * eines Wortes und damit die *Art* der Verschiebung; die Drift-Kurve schneidet
 * daraus eine Zeile heraus und macht sie **messbar und zwischen Wörtern
 * vergleichbar**. Deshalb ist der Bezugspunkt hier eine explizite Einstellung —
 * er entscheidet, welche Zeile der Matrix man ansieht:
 *
 * - `erstbeleg`  — jede Kurve startet bei ihrem eigenen ersten Beleg (fair für
 *                  Wörter, die erst später im Korpus auftauchen)
 * - `scheibe`    — dieselbe Referenz für alle (streng vergleichbar, aber nur
 *                  gültig für Wörter, die dort belegt sind)
 * - `vorgaenger` — Abstand zur Vorscheibe = Änderungs**rate**; Spitzen zeigen,
 *                  WANN sich etwas bewegt hat, nicht wie weit es insgesamt kam
 */
import { useMemo } from "react";
import { useViz } from "../state/store";
import { useDriftOptions, type BaselineKind } from "../state/driftOptions";
import { useMode } from "../viz/useMode";
import { entityColor } from "../viz/theme";
import { similaritySourceOf } from "../viz/similarity";
import { buildDriftSeries, seriesDomain, type DriftBaseline, type DriftSeries } from "../viz/series";
import { ChartLegend, LineChart, type LineSeries } from "../viz/LineChart";
import { Section } from "../ui/Section";
import { TargetWords } from "../ui/Legend";
import { SourceNote } from "../ui/SourceNote";

const BASELINES: [BaselineKind, string][] = [
  ["erstbeleg", "Erstbeleg"],
  ["scheibe", "Zeitpunkt"],
  ["vorgaenger", "Vorgänger"],
];

export function DriftConfig() {
  const { indexed } = useViz();
  const { baselineKind, baselineSlice, setBaselineKind, setBaselineSlice } = useDriftOptions();
  if (!indexed) return <p className="prose">Erst im Modul „Datenquelle" ein Bundle laden.</p>;

  return (
    <>
      <Section title="Zielwörter" icon="target" badge={indexed.tracks.length}>
        <TargetWords />
      </Section>

      <Section title="Bezugspunkt" icon="layers">
        <div className="mode">
          <div className="mode__seg">
            {BASELINES.map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`mode__btn ${baselineKind === id ? "mode__btn--active" : ""}`}
                onClick={() => setBaselineKind(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {baselineKind === "scheibe" && (
            <select
              className="picker__select"
              value={baselineSlice}
              onChange={(e) => setBaselineSlice(Number(e.target.value))}
              aria-label="Referenz-Zeitscheibe"
            >
              {indexed.sortedSlices.map((s, i) => (
                <option key={s.id} value={i}>
                  {s.label ?? s.id}
                  {i === indexed.shiftSliceIndex ? " · Zäsur" : ""}
                </option>
              ))}
            </select>
          )}

          <p className="mode__hint">
            {baselineKind === "erstbeleg" &&
              "Jede Kurve misst gegen den ersten eigenen Beleg. Fair für spät auftauchende Wörter — die Startpunkte liegen dafür auf verschiedenen Zeitscheiben."}
            {baselineKind === "scheibe" &&
              "Alle Kurven messen gegen dieselbe Zeitscheibe. Streng vergleichbar; Wörter ohne Beleg an dieser Scheibe können nicht gezeigt werden."}
            {baselineKind === "vorgaenger" &&
              "Abstand zur unmittelbar vorhergehenden Scheibe: die Änderungsrate. Spitzen zeigen den Zeitpunkt der Bewegung, nicht das Gesamtausmaß."}
          </p>
        </div>
      </Section>

      <Section title="Lesehilfe" icon="info" defaultOpen={false}>
        <dl className="readkey">
          <dt>steigende Kurve</dt>
          <dd>das Wort entfernt sich fortlaufend von seinem Bezugspunkt.</dd>
          <dt>Stufe</dt>
          <dd>ein Bruch — davor und danach zwei stabile Niveaus.</dd>
          <dt>Rückkehr zur Nulllinie</dt>
          <dd>der Gebrauch nähert sich dem Bezugspunkt wieder an.</dd>
          <dt>flache Kurve</dt>
          <dd>stabiles Wort; die Matrix zeigt dazu eine gleichmäßig dunkle Fläche.</dd>
        </dl>
        <p className="card__note">
          Nach Hamilton et al., „Diachronic Word Embeddings Reveal Statistical Laws
          of Semantic Change". Die Kurve ist eine Zeile der Ähnlichkeitsmatrix,
          an der Achse gespiegelt (<code>1 − cos</code>).
        </p>
      </Section>
    </>
  );
}

/** Letzter belegter Wert und das Maximum einer Kurve — die zwei Zahlen, nach
 * denen man Wörter tatsächlich sortiert („wie weit gekommen", „wie heftig"). */
function summarize(series: DriftSeries) {
  let lastValue: number | null = null;
  let maxValue: number | null = null;
  let maxIndex = -1;
  series.values.forEach((v, i) => {
    if (v === null) return;
    lastValue = v;
    if (maxValue === null || v > maxValue) {
      maxValue = v;
      maxIndex = i;
    }
  });
  return { lastValue: lastValue as number | null, maxValue: maxValue as number | null, maxIndex };
}

export function DriftMain() {
  const { indexed, status, selectedEntityIds } = useViz();
  const { baselineKind, baselineSlice } = useDriftOptions();
  const mode = useMode();

  const baseline = useMemo<DriftBaseline>(
    () => (baselineKind === "scheibe" ? { kind: "scheibe", index: baselineSlice } : { kind: baselineKind }),
    [baselineKind, baselineSlice],
  );

  const built = useMemo(() => {
    if (!indexed) return [];
    return indexed.tracks
      .map((t, i) => ({ track: t, colorIndex: i }))
      .filter(({ track }) => selectedEntityIds.has(track.entity.id))
      .map(({ track, colorIndex }) => ({
        colorIndex,
        series: buildDriftSeries(indexed, track.entity.id, baseline),
      }))
      .filter((x): x is { colorIndex: number; series: DriftSeries } => x.series !== null);
  }, [indexed, selectedEntityIds, baseline]);

  if (!indexed) {
    return (
      <div className="main__placeholder">
        {status === "loading" ? "Lade Bundle…" : "Wähle links einen Datensatz."}
      </div>
    );
  }
  if (built.length === 0) {
    return <div className="main__placeholder">Links mindestens ein Zielwort auswählen.</div>;
  }

  const xLabels = indexed.sortedSlices.map((s) => s.label ?? s.id);
  const drawable = built.filter((b) => b.series.valueCount > 0);
  const missing = built.filter((b) => b.series.baselineMissing);

  const lines: LineSeries[] = drawable.map(({ series, colorIndex }) => ({
    id: series.entityId,
    label: series.entityLabel,
    color: entityColor(colorIndex, mode),
    values: series.values,
  }));

  // Nullpunkt verankern: Distanz 0 heißt „identisch mit dem Bezugspunkt" und
  // ist ein echter Nullpunkt — eine abgeschnittene Achse würde die Kurven
  // dramatischer aussehen lassen, als sie sind.
  const domain = seriesDomain(lines.map((l) => l.values), { zeroFloor: true });

  const markIndex =
    baselineKind === "scheibe"
      ? baselineSlice
      : baselineKind === "erstbeleg" && drawable.length === 1
        ? drawable[0].series.baselineIndex
        : null;

  return (
    <div className="pane">
      <div className="pane__head">
        <div>
          <div className="lt-eyebrow">Semantische Drift</div>
          <h2 className="pane__title">Drift-Kurven</h2>
          <p className="pane__desc">
            Abstand eines Wortes zu seinem Bezugspunkt über die Zeit:{" "}
            <code>1 − cos(v_ref, v_t)</code>. Hoch heißt „weit weg vom
            Bezugspunkt", nicht „unwichtig" — und die Kurve setzt aus, wo das
            Wort nicht belegt ist.
          </p>
        </div>
      </div>

      <SourceNote source={similaritySourceOf(indexed)} />

      {missing.length > 0 && (
        <p className="warnnote warnnote--block">
          Ohne Beleg am gewählten Bezugspunkt und daher nicht gezeichnet:{" "}
          <strong>{missing.map((m) => m.series.entityLabel).join(", ")}</strong>. Für
          diese Wörter „Erstbeleg" wählen.
        </p>
      )}

      <section className="card">
        <LineChart
          series={lines}
          xLabels={xLabels}
          domain={domain}
          mode={mode}
          height={320}
          shiftSliceIndex={indexed.shiftSliceIndex}
          markIndex={markIndex}
          markLabel={markIndex !== null && markIndex !== undefined ? "Bezug" : undefined}
          format={(v) => v.toFixed(3)}
        />
        <ChartLegend series={lines} />
      </section>

      <section className="card">
        <h3 className="card__title">Kennzahlen</h3>
        <table className="tbl">
          <thead>
            <tr>
              <th>Wort</th>
              <th>Bezugspunkt</th>
              <th className="tbl__num">Drift zuletzt</th>
              <th className="tbl__num">stärkste Drift</th>
            </tr>
          </thead>
          <tbody>
            {drawable.map(({ series, colorIndex }) => {
              const { lastValue, maxValue, maxIndex } = summarize(series);
              return (
                <tr key={series.entityId}>
                  <td>
                    <span className="tbl__word">
                      <span className="swatch" style={{ background: entityColor(colorIndex, mode) }} />
                      {series.entityLabel}
                    </span>
                  </td>
                  <td className="tbl__muted lt-mono">
                    {baselineKind === "vorgaenger"
                      ? "Vorscheibe"
                      : series.baselineIndex !== null
                        ? xLabels[series.baselineIndex]
                        : "—"}
                  </td>
                  <td className="tbl__num lt-mono">{lastValue !== null ? lastValue.toFixed(3) : "—"}</td>
                  <td className="tbl__num lt-mono">
                    {maxValue !== null ? `${maxValue.toFixed(3)} · ${xLabels[maxIndex]}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="card__note">
          Werte sind nur innerhalb desselben Bezugspunkts vergleichbar. Bei
          „Erstbeleg" startet jedes Wort auf einer anderen Zeitscheibe — die
          Spalte <em>Bezugspunkt</em> schreibt an, welche das ist.
        </p>
      </section>
    </div>
  );
}
