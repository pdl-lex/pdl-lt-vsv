/**
 * Modul „Wort gegen Wort" — Kreuzähnlichkeit zweier Zielwörter je Zeitscheibe:
 * `cos(v_a^t, v_b^t)`.
 *
 * Die anderen Ähnlichkeitsansichten fragen jeweils ein Wort nach sich selbst.
 * Diese hier fragt, wie sich Wörter **zueinander** bewegen: rücken „Drohne" und
 * „Krieg" zusammen? Löst sich „Wehrpflicht" von „Sondervermögen"? Genau das ist
 * im 3D-Raum nur zu ahnen, weil die Projektion Abstände verzerrt — hier steht
 * der Wert im vollen Vektorraum.
 *
 * **Ein Bezugswort, n−1 Kurven** statt aller Paare: bei k Wörtern gäbe es
 * k·(k−1)/2 Paare (bei 6 Wörtern schon 15 Linien), die keine Palette mehr
 * trennt. Mit einem Bezugswort trägt jede Kurve die Identitätsfarbe ihres
 * *Gegenübers* — dieselbe Farbe wie überall sonst im Werkzeug.
 */
import { useMemo } from "react";
import { useVizPick } from "../state/store";
import { useMode } from "../viz/useMode";
import { entityColor } from "../viz/theme";
import { similaritySourceOf } from "../viz/similarity";
import { buildPairSeries, seriesDomain, type PairSeries } from "../viz/series";
import { ChartLegend, LineChart, type LineSeries } from "../viz/LineChart";
import { Section } from "../ui/Section";
import { TargetWords } from "../ui/Legend";
import { SourceNote } from "../ui/SourceNote";

export function PaareConfig() {
  const { indexed, activeEntityId, setActiveEntity } = useVizPick(
    "indexed", "activeEntityId", "setActiveEntity",
  );
  if (!indexed) return <p className="prose">Erst im Modul „Datenquelle" ein Bundle laden.</p>;

  return (
    <>
      <Section title="Bezugswort" icon="target">
        <select
          className="picker__select"
          value={activeEntityId ?? ""}
          onChange={(e) => setActiveEntity(e.target.value)}
          aria-label="Bezugswort"
        >
          {indexed.tracks.map((t) => (
            <option key={t.entity.id} value={t.entity.id}>
              {t.entity.label ?? t.entity.id}
            </option>
          ))}
        </select>
        <p className="mode__hint">
          Jede Kurve zeigt die Ähnlichkeit dieses Wortes zu einem anderen. Ein
          Klick auf ein Wort in der Liste unten setzt das Bezugswort ebenfalls —
          es ist dasselbe „aktive Wort" wie im Wortraum.
        </p>
      </Section>

      <Section title="Gegenüber" icon="layers" badge={indexed.tracks.length}>
        <TargetWords />
      </Section>

      <Section title="Lesehilfe" icon="info" defaultOpen={false}>
        <dl className="readkey">
          <dt>steigende Kurve</dt>
          <dd>die beiden Wörter rücken zusammen (Konvergenz).</dd>
          <dt>fallende Kurve</dt>
          <dd>sie entfernen sich voneinander (Divergenz).</dd>
          <dt>Sprung an der Zäsur</dt>
          <dd>das Verhältnis der beiden Wörter kippt am markierten Bruch.</dd>
          <dt>Lücke</dt>
          <dd>mindestens eines der beiden Wörter ist zu dieser Zeit nicht belegt.</dd>
        </dl>
        <p className="card__note">
          Gerechnet auf den vollen Vektoren, nicht auf der 3D-Projektion — Nähe
          im Bild ist nicht Nähe im Raum.
        </p>
      </Section>
    </>
  );
}

export function PaareMain() {
  const { indexed, status, selectedEntityIds, activeEntityId } = useVizPick(
    "indexed", "status", "selectedEntityIds", "activeEntityId",
  );
  const mode = useMode();

  // Bezugswort: das aktive Wort; falls keines gesetzt ist, das erste im Bundle.
  const refId = activeEntityId ?? indexed?.tracks[0]?.entity.id ?? null;

  const built = useMemo(() => {
    if (!indexed || !refId) return [];
    return indexed.tracks
      .map((t, i) => ({ track: t, colorIndex: i }))
      .filter(({ track }) => track.entity.id !== refId && selectedEntityIds.has(track.entity.id))
      .map(({ track, colorIndex }) => ({
        colorIndex,
        series: buildPairSeries(indexed, refId, track.entity.id),
      }))
      .filter((x): x is { colorIndex: number; series: PairSeries } => x.series !== null);
  }, [indexed, refId, selectedEntityIds]);

  if (!indexed) {
    return (
      <div className="main__placeholder">
        {status === "loading" ? "Lade Bundle…" : "Wähle links einen Datensatz."}
      </div>
    );
  }

  const refLabel =
    indexed.tracks.find((t) => t.entity.id === refId)?.entity.label ?? refId ?? "—";

  if (built.length === 0) {
    return (
      <div className="main__placeholder">
        Links ein zweites Zielwort auswählen — verglichen wird gegen „{refLabel}".
      </div>
    );
  }

  const xLabels = indexed.sortedSlices.map((s) => s.label ?? s.id);
  const lines: LineSeries[] = built.map(({ series, colorIndex }) => ({
    id: series.otherId,
    label: series.otherLabel,
    color: entityColor(colorIndex, mode),
    values: series.values,
  }));

  // Keine Nullpunkt-Verankerung: bei Kosinus-Ähnlichkeit ist 0 kein sinnvoller
  // Anker (reale Werte liegen eng beieinander), die Achse spannt um die Daten.
  const domain = seriesDomain(lines.map((l) => l.values));

  return (
    <div className="pane">
      <div className="pane__head">
        <div>
          <div className="lt-eyebrow">Kreuzähnlichkeit über die Zeit</div>
          <h2 className="pane__title">
            Wort gegen Wort · <span className="pane__ref">{refLabel}</span>
          </h2>
          <p className="pane__desc">
            Ähnlichkeit des Bezugsworts zu jedem anderen Zielwort je Zeitscheibe:{" "}
            <code>cos(v_bezug, v_anderes)</code>. Steigt eine Kurve, nähern sich
            die beiden Wörter im Vektorraum an.
          </p>
        </div>
      </div>

      <SourceNote source={similaritySourceOf(indexed)} />

      <section className="card">
        <LineChart
          series={lines}
          xLabels={xLabels}
          domain={domain}
          mode={mode}
          height={320}
          shiftSliceIndex={indexed.shiftSliceIndex}
          format={(v) => v.toFixed(3)}
        />
        <ChartLegend series={lines} />
      </section>

      <section className="card">
        <h3 className="card__title">Anfang und Ende</h3>
        <table className="tbl">
          <thead>
            <tr>
              <th>Gegenüber</th>
              <th className="tbl__num">erster Wert</th>
              <th className="tbl__num">letzter Wert</th>
              <th className="tbl__num">Veränderung</th>
            </tr>
          </thead>
          <tbody>
            {built.map(({ series, colorIndex }) => {
              const values = series.values.filter((v): v is number => v !== null);
              const first = values[0] ?? null;
              const last = values[values.length - 1] ?? null;
              const delta = first !== null && last !== null ? last - first : null;
              return (
                <tr key={series.otherId}>
                  <td>
                    <span className="tbl__word">
                      <span className="swatch" style={{ background: entityColor(colorIndex, mode) }} />
                      {series.otherLabel}
                    </span>
                  </td>
                  <td className="tbl__num lt-mono">{first !== null ? first.toFixed(3) : "—"}</td>
                  <td className="tbl__num lt-mono">{last !== null ? last.toFixed(3) : "—"}</td>
                  <td className="tbl__num lt-mono">
                    {delta === null
                      ? "—"
                      : `${delta > 0 ? "+" : ""}${delta.toFixed(3)} ${delta > 0 ? "↗" : delta < 0 ? "↘" : "→"}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="card__note">
          Erster und letzter <em>belegter</em> Wert — bei Wörtern mit Lücken
          liegen die also nicht zwangsläufig am Rand des Zeitraums.
        </p>
      </section>
    </div>
  );
}
