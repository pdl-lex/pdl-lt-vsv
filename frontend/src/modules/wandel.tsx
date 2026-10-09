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
import { buildChangeRanking, defaultPeriods, effectiveK, type Period } from "../viz/overlap";
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
      {i === idx.shiftSliceIndex ? " · Zäsur" : ""}
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
  const { periods, setPeriods } = useChangeOptions();
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
              {indexed.shiftSliceIndex !== null ? "zurück: vor / ab Zäsur" : "zurück: erste / zweite Hälfte"}
            </button>
          )}
          <p className="mode__hint">
            Die Nachbarlisten der Zeitscheiben eines Zeitraums werden per Rangpunkten
            zu einer Liste zusammengelegt; jede belegte Scheibe zählt gleich.
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
          <dd>Zufall minus A ↔ B. Nur ein deutlich positiver Abstand spricht für Wandel; um 0 ist er von der üblichen Schwankung nicht zu unterscheiden.</dd>
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

const pct = (v: number) => (Number.isFinite(v) ? `${Math.round(v * 100)} %` : "—");

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
  const { openEntityId, setOpenEntityId } = useChangeOptions();
  const mode = useMode();
  const periods = usePeriods(indexed);

  const rows = useMemo(() => {
    if (!indexed || !periods) return [];
    const ids = indexed.tracks.filter((t) => selectedEntityIds.has(t.entity.id)).map((t) => t.entity.id);
    return buildChangeRanking(indexed, ids, periods.a, periods.b, overlapK);
  }, [indexed, periods?.a.from, periods?.a.to, periods?.b.from, periods?.b.to, selectedEntityIds, overlapK]);

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

  return (
    <div className="pane">
      <div className="pane__head">
        <div>
          <div className="lt-eyebrow">Nachbarschafts-Überlappung</div>
          <h2 className="pane__title">Wandel-Ranking</h2>
          <p className="pane__desc">
            Welche Zielwörter haben zwischen <strong>A</strong> ({la}) und{" "}
            <strong>B</strong> ({lb}) ihr Umfeld am stärksten gewechselt?{" "}
            <code>|NN_k(A) ∩ NN_k(B)| / k</code> mit k = {k}, am stärksten
            verändert zuerst.
          </p>
        </div>
        <NeighborFilterNote short />
      </div>

      <section className="card">
        <table className="tbl tbl--rows">
          <thead>
            <tr>
              <th className="tbl__num">#</th>
              <th>Wort</th>
              <th>A ↔ B</th>
              <th className="tbl__num" title="Erwartete Überlappung bei zufälliger Aufteilung der Scheiben von A und B">Zufall</th>
              <th className="tbl__num" title="Zufall minus A ↔ B, in Prozentpunkten">Abstand</th>
              <th className="tbl__num" title="Stabilität innerhalb des Zeitraums (Hälften gegeneinander), beschreibend">Binnen A</th>
              <th className="tbl__num" title="Stabilität innerhalb des Zeitraums (Hälften gegeneinander), beschreibend">Binnen B</th>
              <th className="tbl__num" title="Belegte Zeitscheiben je Zeitraum">Belegung A · B</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, rank) => {
              const noise = r.baseline;
              const gap = noise - r.between;
              const isOpen = open?.entityId === r.entityId;
              return (
                <tr
                  key={r.entityId}
                  className={`${r.diff ? "tbl__row--click" : ""} ${isOpen ? "tbl__row--open" : ""}`}
                  onClick={() => r.diff && setOpenEntityId(isOpen ? null : r.entityId)}
                  title={r.diff ? "Nachbarn anzeigen" : "In einem Zeitraum nicht belegt"}
                >
                  <td className="tbl__num tbl__muted lt-mono">{Number.isFinite(r.between) ? rank + 1 : "—"}</td>
                  <td>
                    <span className="tbl__word">
                      <span
                        className="swatch"
                        style={{ background: entityColor(colorIndex.get(r.entityId) ?? 0, mode) }}
                      />
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
        <p className="card__note">
          Der Strich im Balken markiert die Zufalls-Überlappung: die Scheiben von A
          und B zufällig auf zwei gleich große Gruppen verteilt. Liegt der Balken
          deutlich links davon, unterscheiden sich die Zeiträume stärker als
          beliebige Gruppen derselben Scheiben. Klick auf eine Zeile
          zeigt, welche Nachbarn weggefallen und hinzugekommen sind.
        </p>
      </section>

      {open?.diff && (
        <DiffView diff={open.diff} labelA={`A (${la})`} labelB={`B (${lb})`} title={`${open.label}:`} />
      )}
    </div>
  );
}
