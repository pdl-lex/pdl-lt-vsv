/**
 * Modul „Nachbarschafts-Fluss" — wer steht wann neben dem Wort?
 *
 * Die drei Vektor-Ansichten (Wortraum, Matrix, Kurven) messen Verschiebung in
 * Zahlen. Diese hier benennt sie: sie zeigt die Top-k-Nachbarn je Zeitscheibe
 * als Bump-Diagramm, also den **Austausch des Umfelds** über die Zeit. Das ist
 * die Ansicht, aus der ein Befund in Worte übersetzbar wird.
 *
 * **Ein Wort auf einmal.** Bump-Diagramme mehrerer Wörter nebeneinander wären
 * nicht mehr lesbar (schon eines hat hier bis zu 20 Linien). Gezeigt wird
 * deshalb das *aktive* Wort — dasselbe wie im Wortraum, wo das NN-Panel
 * denselben Datenblock punktuell für eine Zeitscheibe zeigt. Diese Ansicht
 * faltet ihn über die ganze Zeitachse auf.
 */
import { useMemo } from "react";
import { useViz } from "../state/store";
import { useMode } from "../viz/useMode";
import { buildNeighborFlow } from "../viz/neighborFlow";
import { FlowGroupLegend, NeighborFlowCanvas } from "../viz/NeighborFlowCanvas";
import { entityColor } from "../viz/theme";
import { Section } from "../ui/Section";
import { TargetWords } from "../ui/Legend";
import { Icon } from "../design/icons";

export function NachbarnConfig() {
  const { indexed, activeEntityId, setActiveEntity } = useViz();
  if (!indexed) return <p className="prose">Erst im Modul „Datenquelle" ein Bundle laden.</p>;

  return (
    <>
      <Section title="Wort" icon="target">
        <select
          className="picker__select"
          value={activeEntityId ?? ""}
          onChange={(e) => setActiveEntity(e.target.value)}
          aria-label="Zielwort"
        >
          {indexed.tracks.map((t) => (
            <option key={t.entity.id} value={t.entity.id}>
              {t.entity.label ?? t.entity.id}
            </option>
          ))}
        </select>
        <p className="mode__hint">
          Der Fluss zeigt immer genau ein Wort — bei bis zu {"~"}20 Nachbarlinien
          wäre ein Nebeneinander nicht mehr lesbar. Auswahl gilt auch für das
          Nachbarn-Panel im Wortraum.
        </p>
      </Section>

      <Section title="Zielwörter" icon="layers" badge={indexed.tracks.length}>
        <TargetWords />
      </Section>

      <Section title="Lesehilfe" icon="info" defaultOpen={false}>
        <dl className="readkey">
          <dt>Linie steigt (nach oben)</dt>
          <dd>der Nachbar rückt näher — kleinerer Rang.</dd>
          <dt>Linie bricht ab</dt>
          <dd>der Nachbar ist aus den Top-k gefallen; kommt er zurück, beginnt ein neues Segment.</dd>
          <dt>Farbwechsel im Bündel</dt>
          <dd>eine ganze Gruppe löst eine andere ab — der eigentliche Befund.</dd>
          <dt>Balken unten (↻)</dt>
          <dd>Umschlag: Anteil der Top-k, der gegenüber der Vorscheibe neu ist.</dd>
        </dl>
        <p className="card__note">
          Quelle ist der <code>neighbors</code>-Block des Bundles — vorberechnete
          nächste Nachbarn je Zeitscheibe, nicht hier berechnet.
        </p>
      </Section>
    </>
  );
}

export function NachbarnMain() {
  const { indexed, status, activeEntityId } = useViz();
  const mode = useMode();

  const entityId = activeEntityId ?? indexed?.tracks[0]?.entity.id ?? null;
  const flow = useMemo(
    () => (indexed && entityId ? buildNeighborFlow(indexed, entityId) : null),
    [indexed, entityId],
  );

  if (!indexed) {
    return (
      <div className="main__placeholder">
        {status === "loading" ? "Lade Bundle…" : "Wähle links einen Datensatz."}
      </div>
    );
  }
  if (!flow) {
    return <div className="main__placeholder">Links ein Zielwort auswählen.</div>;
  }

  const xLabels = indexed.sortedSlices.map((s) => s.label ?? s.id);

  if (flow.labels.length === 0) {
    return (
      <div className="pane">
        <div className="pane__head">
          <div>
            <div className="lt-eyebrow">Nachbarschaft über die Zeit</div>
            <h2 className="pane__title">Nachbarschafts-Fluss · {flow.entityLabel}</h2>
          </div>
        </div>
        <p className="warnnote warnnote--block">
          <Icon name="info" size={13} />
          Für dieses Wort liefert das Bundle keine Nachbarn (oder es ist in keiner
          Zeitscheibe belegt). Der <code>neighbors</code>-Block ist optional.
        </p>
      </div>
    );
  }

  // Nur die Gruppen dieses Wortes in die Legende, Farbslot bleibt global.
  const usedGroups = [...new Set(flow.labels.map((l) => l.group).filter((g): g is string => !!g))]
    .map((group) => ({ group, index: flow.groups.indexOf(group) }))
    .sort((a, b) => a.index - b.index);

  const turnoverValues = flow.turnover.filter((t): t is number => t !== null);
  const meanTurnover =
    turnoverValues.length > 0
      ? turnoverValues.reduce((a, b) => a + b, 0) / turnoverValues.length
      : null;
  let peakIndex = -1;
  flow.turnover.forEach((t, i) => {
    if (t !== null && (peakIndex === -1 || t > (flow.turnover[peakIndex] ?? 0))) peakIndex = i;
  });

  return (
    <div className="pane">
      <div className="pane__head">
        <div>
          <div className="lt-eyebrow">Nachbarschaft über die Zeit</div>
          <h2 className="pane__title">
            Nachbarschafts-Fluss · <span className="pane__ref">{flow.entityLabel}</span>
          </h2>
          <p className="pane__desc">
            Rang der nächsten Nachbarn je Zeitscheibe (1 = am nächsten). Wo eine
            Linie abbricht, ist der Nachbar aus den Top-{flow.k} gefallen — Farbe
            steht für seine Gruppe, nicht für das einzelne Wort.
          </p>
        </div>
        <FlowGroupLegend items={usedGroups} mode={mode} />
      </div>

      <div className="stats">
        <Stat k="Nachbarn insgesamt" v={flow.labels.length} />
        <Stat k="Rangplätze" v={flow.k} />
        <Stat k="belegte Zeitscheiben" v={`${flow.presentCount} / ${indexed.sliceCount}`} />
        <Stat
          k="Umschlag ⌀"
          v={meanTurnover !== null ? `${Math.round(meanTurnover * 100)} %` : "—"}
          hint="Mittlerer Anteil neuer Nachbarn gegenüber der Vorscheibe"
        />
        <Stat
          k="stärkster Umschlag"
          v={peakIndex >= 0 ? `${Math.round((flow.turnover[peakIndex] ?? 0) * 100)} % · ${xLabels[peakIndex]}` : "—"}
        />
      </div>

      <section className="card">
        <NeighborFlowCanvas
          flow={flow}
          xLabels={xLabels}
          mode={mode}
          shiftSliceIndex={indexed.shiftSliceIndex}
        />
      </section>

      <section className="card">
        <h3 className="card__title">Nachbarn im Zeitraum</h3>
        <table className="tbl">
          <thead>
            <tr>
              <th>Nachbar</th>
              <th>Gruppe</th>
              <th className="tbl__num">bester Rang</th>
              <th className="tbl__num">Scheiben</th>
              <th className="tbl__num">von – bis</th>
            </tr>
          </thead>
          <tbody>
            {flow.labels.map((l) => (
              <tr key={l.label}>
                <td>
                  <span className="tbl__word">
                    <span
                      className="swatch swatch--dot"
                      style={{
                        background: l.groupIndex >= 0 ? entityColor(l.groupIndex, mode) : "var(--lt-fg-4)",
                      }}
                    />
                    <span className={l.matchedAnchor ? "" : "tbl__muted"} title={l.matchedAnchor ? "" : "kein Anker im Bundle"}>
                      {l.label}
                    </span>
                  </span>
                </td>
                <td className="tbl__muted">{l.group ?? "—"}</td>
                <td className="tbl__num lt-mono">{l.bestRank}</td>
                <td className="tbl__num lt-mono">{l.count}</td>
                <td className="tbl__num lt-mono">
                  {xLabels[l.firstIndex]} – {xLabels[l.lastIndex]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="card__note">
          Grau gesetzte Nachbarn haben keinen Anker im Bundle — sie erscheinen im
          3D-Raum nicht als Landmarke, nur hier als Text. „Scheiben" zählt, in wie
          vielen Zeitscheiben der Nachbar überhaupt in den Top-{flow.k} war.
        </p>
      </section>
    </div>
  );
}

function Stat({ k, v, hint }: { k: string; v: string | number; hint?: string }) {
  return (
    <div className="stat" title={hint}>
      <div className="stat__k">{k}</div>
      <div className="stat__v lt-mono">{v}</div>
    </div>
  );
}
