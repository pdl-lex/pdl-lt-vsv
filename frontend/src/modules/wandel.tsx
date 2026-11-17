/**
 * Modul „Wandel-Ranking" nach **Gonen et al.**, „Simple, Interpretable and
 * Stable Method for Detecting Words with Usage Change across Corpora" (2020).
 *
 * Die Frage ist hier nicht *wie* (Matrix) oder *wann* (Drift), sondern
 * *welches Wort* sich zwischen zwei Zeiträumen am stärksten verändert hat —
 * und *woran man das sieht*. Je Wort: Überlappung der Top-k-Nachbarn von
 * Zeitraum A und B, aufsteigend sortiert, dazu per Klick die verlorenen,
 * gemeinsamen und gewonnenen Nachbarn.
 *
 * Ergänzung gegenüber dem Paper: ein **Grundrauschen** (Permutations-Baseline,
 * siehe `splitBaseline`). Gonen vergleicht zwei Korpora; hier bestehen die
 * Zeiträume aus mehreren Scheiben, deren Listen schon untereinander schwanken.
 * Erst gegen dieses Grundrauschen sagt eine niedrige Überlappung A↔B etwas aus.
 * Die Binnen-Überlappung je Zeitraum (`withinOverlap`) steht nur beschreibend
 * daneben.
 */
import { useMemo } from "react";
import { useViz, useVizPick } from "../state/store";
import { useMetricOptions } from "../state/metricOptions";
import { useChangeOptions } from "../state/changeOptions";
import { useMode } from "../viz/useMode";
import { entityColor } from "../viz/theme";
import {
  buildChangeRanking,
  changeRankingCsv,
  defaultPeriods,
  effectiveK,
  type ChangeSort,
  type Period,
} from "../viz/overlap";
import { downloadText } from "../ui/download";
import type { IndexedBundle } from "../data/model";
import { Section } from "../ui/Section";
import { TargetWords } from "../ui/Legend";
import { OverlapKControl } from "../ui/MetricControl";
import { NeighborFilterNote } from "../ui/NeighborFilterNote";
import { DiffView } from "../ui/NeighborDiff";

function sliceLabel(idx: IndexedBundle, i: number): string {
  const s = idx.sortedSlices[i];
  return s?.label ?? s?.id ?? "—";
}

function periodLabel(idx: IndexedBundle, p: Period): string {
  const a = sliceLabel(idx, Math.min(p.from, p.to));
  const b = sliceLabel(idx, Math.max(p.from, p.to));
  return a === b ? a : `${a} – ${b}`;
}

/** Aktive Zeiträume: gewählte oder Standard, auf das Bundle geklemmt. */
function usePeriods(idx: IndexedBundle | null): { a: Period; b: Period } | null {
  const periods = useChangeOptions((s) => s.periods);
  if (!idx) return null;
  const clamp = (p: Period): Period => ({
    from: Math.max(0, Math.min(p.from, idx.sliceCount - 1)),
    to: Math.max(0, Math.min(p.to, idx.sliceCount - 1)),
  });
  const p = periods ?? defaultPeriods(idx);
  return { a: clamp(p.a), b: clamp(p.b) };
}

function PeriodPicker({
  idx,
  name,
  value,
  onChange,
}: {
  idx: IndexedBundle;
  name: string;
  value: Period;
  onChange: (p: Period) => void;
}) {
  const options = idx.sortedSlices.map((s, i) => (
    <option key={s.id} value={i}>
      {s.label ?? s.id}
    </option>
  ));
  return (
    <div className="period">
      <span className="period__name">{name}</span>
      <select
        className="picker__select"
        value={value.from}
        onChange={(e) => onChange({ ...value, from: Number(e.target.value) })}
        aria-label={`Zeitraum ${name}: von`}
      >
        {options}
      </select>
      <span className="period__dash">–</span>
      <select
        className="picker__select"
        value={value.to}
        onChange={(e) => onChange({ ...value, to: Number(e.target.value) })}
        aria-label={`Zeitraum ${name}: bis`}
      >
        {options}
      </select>
    </div>
  );
}

export function WandelConfig() {
  const indexed = useViz((s) => s.indexed);
  const { periods, setPeriods, sortBy, setSortBy } = useChangeOptions();
  const active = usePeriods(indexed);
  if (!indexed || !active) return <p className="prose">Erst im Modul „Datenquelle" ein Bundle laden.</p>;

  return (
    <>
      <Section title="Zielwörter" icon="target" badge={indexed.tracks.length}>
        <TargetWords />
      </Section>

      <Section title="Zeiträume" icon="layers">
        <div className="mode">
          <PeriodPicker idx={indexed} name="A" value={active.a} onChange={(a) => setPeriods({ ...active, a })} />
          <PeriodPicker idx={indexed} name="B" value={active.b} onChange={(b) => setPeriods({ ...active, b })} />
          {periods !== null && (
            <button type="button" className="nf-link" onClick={() => setPeriods(null)}>
              zurück: erste / zweite Hälfte
            </button>
          )}
          <p className="mode__hint">
            Die Nachbarlisten der Zeitscheiben eines Zeitraums werden per Rangpunkten
            zu einer Liste zusammengelegt; jede belegte Scheibe zählt gleich.
          </p>
        </div>
      </Section>

      <Section title="Sortieren nach" icon="layers">
        <div className="mode">
          <div className="mode__seg">
            {SORTS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`mode__btn ${sortBy === id ? "mode__btn--active" : ""}`}
                onClick={() => setSortBy(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mode__hint">
            {sortBy === "kosinus"
              ? "Abstand zur Baseline beim Kosinus-Abstand der Mittelvektoren von A und B (Lage im Raum)."
              : "Abstand zur Baseline bei der Überlappung der Nachbarlisten (Umfeld)."}{" "}
            Beide Maße stehen in der Tabelle; die Spalte „Rang anders" zeigt den Rang nach dem anderen.
          </p>
        </div>
      </Section>

      <Section title="Nachbarn (k)" icon="layers">
        <div className="mode">
          <OverlapKControl />
          <p className="mode__hint">Gilt auch für die Überlappung in Matrizen und Drift.</p>
          <NeighborFilterNote short />
        </div>
      </Section>

      <Section title="Lesehilfe" icon="info" defaultOpen={false}>
        <dl className="readkey">
          <dt>A ↔ B</dt>
          <dd>Anteil gemeinsamer Wörter unter den k nächsten Nachbarn beider Zeiträume. Niedrig = veränderter Gebrauch.</dd>
          <dt>Zufall (Strich im Balken)</dt>
          <dd>Grundrauschen: die belegten Scheiben von A und B ohne Rücksicht auf ihren Zeitraum auf zwei gleich große Gruppen verteilt, gepoolt und verglichen (Mittel über die Aufteilungen). So viel Überlappung ist ohne Unterschied zwischen A und B zu erwarten — bei derselben Pooling-Tiefe wie A ↔ B.</dd>
          <dt>Abstand</dt>
          <dd>Zufall minus A ↔ B, Sortierschlüssel der Tabelle. Nur ein deutlich positiver Abstand spricht für Wandel; um 0 ist er von der üblichen Schwankung nicht zu unterscheiden. Nach der rohen Überlappung zu sortieren hieße, dünn belegte Wörter nach oben zu holen: ihre Listen schwanken schon innerhalb eines Zeitraums.</dd>
          <dt>p</dt>
          <dd>Anteil der zufälligen Aufteilungen, deren Überlappung höchstens so groß ist wie A ↔ B, als (b + 1) / (m + 1). Klein = A ↔ B liegt tiefer als fast jede zufällige Aufteilung; fett unter 0,05. Mit wenigen Scheiben gibt es nur wenige Aufteilungen, dann kann p nicht klein werden (bei 3 + 3 Scheiben höchstens 1/21). Kein Test über alle Wörter hinweg: bei vielen Zielwörtern sind einige kleine p-Werte zufällig.</dd>
          <dt>Nur in einem Zeitraum belegt</dt>
          <dd>Wörter ohne Beleg in A oder in B haben keine Überlappung. Sie stehen getrennt, nach Belegen sortiert: neu aufgekommene (nur B) zuerst.</dd>
          <dt>1 − cos</dt>
          <dd>Kosinus-Abstand der Mittelvektoren von A und B, das klassische Maß für Wandel im Raum (Hamilton et al. 2016). Jede belegte Scheibe geht mit Länge 1 und gleichem Gewicht ein. Groß = verschobene Lage.</dd>
          <dt>Kosinus: Zufall, Abstand, p</dt>
          <dd>Wie bei der Überlappung, mit denselben zufälligen Aufteilungen, aber umgekehrter Richtung: Abstand = 1 − cos minus Zufall; p = Anteil der Aufteilungen mit mindestens so großem Abstand. Hier besonders wichtig: der Kosinus hängt stark von der Textmenge ab, dünn belegte Scheiben liegen auch ohne Wandel weit auseinander.</dd>
          <dt>Rang anders</dt>
          <dd>Rang nach dem jeweils anderen Maß. Stehen beide weit oben, ist der Befund belastbarer. Schlägt nur eins aus: Lage im Raum und Umfeld können sich getrennt ändern (Hamilton et al. 2016a).</dd>
          <dt>Binnen A / B</dt>
          <dd>Wie stabil das Umfeld innerhalb eines Zeitraums ist: seine Scheiben abwechselnd in zwei Hälften geteilt und verglichen. Beschreibend; geht nicht in den Abstand ein, weil die Hälften nur halb so viele Scheiben poolen.</dd>
        </dl>
        <p className="card__note">
          Nach Gonen et al., „Simple, Interpretable and Stable Method for Detecting
          Words with Usage Change across Corpora" (ACL 2020). Zufalls- und
          Binnen-Überlappung sind Ergänzungen für Zeiträume aus mehreren Scheiben.
        </p>
      </Section>
    </>
  );
}

const SORTS: [ChangeSort, string][] = [
  ["ueberlappung", "Überlappung"],
  ["kosinus", "Kosinus"],
];

const pct = (v: number) => (Number.isFinite(v) ? `${Math.round(v * 100)} %` : "—");
const dec = (v: number, digits = 3) => (Number.isFinite(v) ? v.toFixed(digits).replace(".", ",") : "—");
const signed = (v: number) => (Number.isFinite(v) ? `${v > 0 ? "+" : ""}${dec(v)}` : "—");

/** Balken für A ↔ B mit Strich auf Höhe des Grundrauschens. */
function OverlapBar({ value, noise }: { value: number; noise: number }) {
  return (
    <span className="ovbar" title={`A ↔ B ${pct(value)} · Zufall ${pct(noise)}`}>
      <span className="ovbar__track">
        {Number.isFinite(value) && <span className="ovbar__fill" style={{ width: `${value * 100}%` }} />}
        {Number.isFinite(noise) && <span className="ovbar__noise" style={{ left: `${noise * 100}%` }} />}
      </span>
      <span className="ovbar__num lt-mono">{pct(value)}</span>
    </span>
  );
}

export function WandelMain() {
  const { indexed, status, selectedEntityIds } = useVizPick("indexed", "status", "selectedEntityIds");
  const overlapK = useMetricOptions((s) => s.overlapK);
  const { openEntityId, setOpenEntityId, sortBy, setSortBy } = useChangeOptions();
  /** Spaltenkopf, der die Sortierung umschaltet (gleiche Optik wie auf der Seite „Zielwörter"). */
  const sortButton = (key: ChangeSort, label: string) => (
    <button
      type="button"
      className={`zw__sort ${sortBy === key ? "zw__sort--on" : ""}`}
      onClick={() => setSortBy(key)}
      title={`Nach dem Abstand zur Zufallserwartung bei ${key === "kosinus" ? "Kosinus" : "Überlappung"} sortieren`}
    >
      {label}
      <span className="zw__arrow">{sortBy === key ? "▼" : ""}</span>
    </button>
  );
  const mode = useMode();
  const periods = usePeriods(indexed);

  const rows = useMemo(() => {
    if (!indexed || !periods) return [];
    const ids = indexed.tracks.filter((t) => selectedEntityIds.has(t.entity.id)).map((t) => t.entity.id);
    return buildChangeRanking(indexed, ids, periods.a, periods.b, overlapK, sortBy);
  }, [indexed, periods?.a.from, periods?.a.to, periods?.b.from, periods?.b.to, selectedEntityIds, overlapK, sortBy]);

  if (!indexed || !periods) {
    return (
      <div className="main__placeholder">
        {status === "loading" ? "Lade Bundle…" : "Wähle links einen Datensatz."}
      </div>
    );
  }
  if (rows.length === 0) {
    return <div className="main__placeholder">Links mindestens ein Zielwort auswählen.</div>;
  }

  const la = periodLabel(indexed, periods.a);
  const lb = periodLabel(indexed, periods.b);
  const k = effectiveK(indexed, overlapK);
  const colorIndex = new Map(indexed.tracks.map((t, i) => [t.entity.id, i]));
  const open = rows.find((r) => r.entityId === openEntityId && r.diff);
  const ranked = rows.filter((r) => r.coverage === "beide" && Number.isFinite(r.between));
  const oneSided = rows.filter((r) => !(r.coverage === "beide" && Number.isFinite(r.between)));

  const download = () => {
    const name = (indexed.bundle.meta.name ?? "bundle").replace(/[^\p{L}\p{N}_-]+/gu, "_");
    downloadText(
      changeRankingCsv(rows, { periodA: la, periodB: lb, k, sortBy }),
      `wandel_${name}_k${k}_${sortBy}.csv`,
      "text/csv;charset=utf-8",
    );
  };
  const swatch = (id: string) => (
    <span className="swatch" style={{ background: entityColor(colorIndex.get(id) ?? 0, mode) }} />
  );

  return (
    <div className="pane">
      <div className="pane__head">
        <div>
          <div className="lt-eyebrow">Überlappung und Kosinus</div>
          <h2 className="pane__title">Wandel-Ranking</h2>
          <p className="pane__desc">
            Welche Zielwörter haben sich zwischen <strong>A</strong> ({la}) und{" "}
            <strong>B</strong> ({lb}) am stärksten verändert? Umfeld:{" "}
            <code>|NN_k(A) ∩ NN_k(B)| / k</code> mit k = {k}; Lage im Raum:{" "}
            <code>1 − cos(v̄_A, v̄_B)</code>. Sortiert nach dem Abstand zur
            Zufallserwartung bei {sortBy === "kosinus" ? "Kosinus" : "Überlappung"}{" "}
            (größter Abstand zuerst).
          </p>
        </div>
        <NeighborFilterNote short />
        <button type="button" className="nf-btn" onClick={download} title="Alle ausgewählten Zielwörter, Reihenfolge wie in der Tabelle">
          Als CSV speichern
        </button>
      </div>

      <section className="card">
        {ranked.some((r) => r.cos.source === "coords_3d") && (
          <p className="card__note">
            Das Bundle hat keine vollen Vektoren; der Kosinus ist aus den 3D-Koordinaten
            gerechnet und deshalb nur grob.
          </p>
        )}
        <div style={{ overflowX: "auto" }}>
        <table className="tbl tbl--rows">
          <thead>
            <tr>
              <th colSpan={2} />
              <th colSpan={4}>{sortButton("ueberlappung", "Überlappung (Umfeld)")}</th>
              <th colSpan={4}>{sortButton("kosinus", "Kosinus (Lage im Raum)")}</th>
              <th colSpan={4} />
            </tr>
            <tr>
              <th className="tbl__num">#</th>
              <th>Wort</th>
              <th>A ↔ B</th>
              <th className="tbl__num" title="Erwartete Überlappung bei zufälliger Aufteilung der Scheiben von A und B">Zufall</th>
              <th className="tbl__num" title="Zufall minus A ↔ B, in Prozentpunkten; Klick sortiert danach" aria-sort={sortBy === "ueberlappung" ? "descending" : "none"}>
                {sortButton("ueberlappung", "Abstand")}
              </th>
              <th className="tbl__num" title="Anteil zufälliger Aufteilungen mit höchstens so viel Überlappung wie A ↔ B">p</th>
              <th className="tbl__num" title="1 − cos der Mittelvektoren von A und B">1 − cos</th>
              <th className="tbl__num" title="Erwarteter Kosinus-Abstand bei zufälliger Aufteilung der Scheiben">Zufall</th>
              <th className="tbl__num" title="1 − cos minus Zufall; Klick sortiert danach" aria-sort={sortBy === "kosinus" ? "descending" : "none"}>
                {sortButton("kosinus", "Abstand")}
              </th>
              <th className="tbl__num" title="Anteil zufälliger Aufteilungen mit mindestens so großem Kosinus-Abstand">p</th>
              <th className="tbl__num" title="Rang nach dem anderen Maß">Rang anders</th>
              <th className="tbl__num" title="Stabilität innerhalb des Zeitraums (Hälften gegeneinander), beschreibend">Binnen A</th>
              <th className="tbl__num" title="Stabilität innerhalb des Zeitraums (Hälften gegeneinander), beschreibend">Binnen B</th>
              <th className="tbl__num" title="Belegte Zeitscheiben je Zeitraum">Belegung A · B</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r) => {
              const noise = r.baseline;
              const gap = r.gap;
              const isOpen = open?.entityId === r.entityId;
              const rank = sortBy === "kosinus" ? r.rankCos : r.rankOverlap;
              const other = sortBy === "kosinus" ? r.rankOverlap : r.rankCos;
              return (
                <tr
                  key={r.entityId}
                  className={`tbl__row--click ${isOpen ? "tbl__row--open" : ""}`}
                  onClick={() => setOpenEntityId(isOpen ? null : r.entityId)}
                  title="Nachbarn anzeigen"
                >
                  <td className="tbl__num tbl__muted lt-mono">{rank ?? "—"}</td>
                  <td>
                    <span className="tbl__word">
                      {swatch(r.entityId)}
                      {r.label}
                    </span>
                  </td>
                  <td>
                    <OverlapBar value={r.between} noise={noise} />
                  </td>
                  <td className="tbl__num lt-mono">{pct(noise)}</td>
                  <td className={`tbl__num lt-mono ${gap > 0.1 ? "tbl__strong" : "tbl__muted"}`}>
                    {Number.isFinite(gap) ? `${gap > 0 ? "+" : ""}${Math.round(gap * 100)}` : "—"}
                  </td>
                  <td className={`tbl__num lt-mono ${r.p < 0.05 ? "tbl__strong" : "tbl__muted"}`}>
                    {dec(r.p, 2)}
                  </td>
                  <td className="tbl__num lt-mono">{dec(r.cos.distance)}</td>
                  <td className="tbl__num lt-mono tbl__muted">{dec(r.cos.baseline)}</td>
                  <td className={`tbl__num lt-mono ${r.cos.p < 0.05 ? "tbl__strong" : "tbl__muted"}`}>
                    {signed(r.cos.gap)}
                  </td>
                  <td className={`tbl__num lt-mono ${r.cos.p < 0.05 ? "tbl__strong" : "tbl__muted"}`}>
                    {dec(r.cos.p, 2)}
                  </td>
                  <td className="tbl__num lt-mono tbl__muted">{other ?? "—"}</td>
                  <td className="tbl__num lt-mono tbl__muted">{pct(r.withinA)}</td>
                  <td className="tbl__num lt-mono tbl__muted">{pct(r.withinB)}</td>
                  <td className={`tbl__num lt-mono ${r.a.used < r.a.total || r.b.used < r.b.total ? "cov__num--partial" : "tbl__muted"}`}>
                    {r.a.used}/{r.a.total} · {r.b.used}/{r.b.total}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        <p className="card__note">
          Der Strich im Balken markiert die Zufalls-Überlappung: die Scheiben von A
          und B zufällig auf zwei gleich große Gruppen verteilt. Liegt der Balken
          deutlich links davon, unterscheiden sich die Zeiträume stärker als
          beliebige Gruppen derselben Scheiben. Beim Kosinus gilt dasselbe mit
          umgekehrter Richtung. Sortiert ist nach dem Abstand zur Zufallserwartung,
          nicht nach dem Rohwert. Klick auf eine Zeile zeigt, welche Nachbarn
          weggefallen und hinzugekommen sind.
        </p>
      </section>

      {oneSided.length > 0 && (
        <section className="card">
          <h3 className="card__title">Nur in einem Zeitraum belegt</h3>
          <table className="tbl tbl--rows">
            <thead>
              <tr>
                <th>Wort</th>
                <th>Belegt in</th>
                <th className="tbl__num" title="Summe der Belege (freq) im Zeitraum">Belege A · B</th>
                <th className="tbl__num" title="Belegte Zeitscheiben je Zeitraum">Belegung A · B</th>
              </tr>
            </thead>
            <tbody>
              {oneSided.map((r) => (
                <tr key={r.entityId}>
                  <td>
                    <span className="tbl__word">
                      {swatch(r.entityId)}
                      {r.label}
                    </span>
                  </td>
                  <td className={r.coverage === "nur B" ? "tbl__strong" : "tbl__muted"}>
                    {r.coverage === "nur B" ? "nur B (neu)" : r.coverage === "nur A" ? "nur A (weggefallen)" : "keiner"}
                  </td>
                  <td className="tbl__num lt-mono">{r.freqA} · {r.freqB}</td>
                  <td className="tbl__num lt-mono tbl__muted">
                    {r.a.used}/{r.a.total} · {r.b.used}/{r.b.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {open?.diff && (
        <DiffView diff={open.diff} labelA={`A (${la})`} labelB={`B (${lb})`} title={`${open.label}:`} />
      )}
    </div>
  );
}
