/**
 * Modul „Zielwörter" — die Datenlage je Zielwort: in wie vielen Zeitscheiben
 * es belegt ist und wie viele Belege es insgesamt hat (beides aus `freq` der
 * Aggregate, siehe `data/targetStats.ts`).
 *
 * Links die Liste aller Zielwörter, das untere Quartil je Spalte hervorgehoben;
 * ein Klick wählt ein Wort und zeigt rechts seinen Verlauf über die Zeit.
 * Die Auswahl ist bewusst lokal: sie soll Sichtbarkeit und aktives Zielwort
 * der anderen Module nicht verstellen.
 */
import { useMemo, useState } from "react";
import { isLow, summarize, targetStats, type Summary, type TargetStat } from "../data/targetStats";
import { useVizPick } from "../state/store";
import { useMode } from "../viz/useMode";
import { entityColor } from "../viz/theme";
import { LineChart, type LineSeries } from "../viz/LineChart";
import { seriesDomain } from "../viz/series";

type SortKey = "label" | "belegt" | "total";

const fmt = (v: number, digits = 0) =>
  v.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function ZielwoerterMain() {
  const { indexed, status, activeEntityId } = useVizPick("indexed", "status", "activeEntityId");
  const mode = useMode();
  const [picked, setPicked] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "label", desc: false });

  const stats = useMemo(() => (indexed ? targetStats(indexed) : []), [indexed]);
  const sumBelegt = useMemo(() => summarize(stats.map((s) => s.belegt)), [stats]);
  const sumTotal = useMemo(() => summarize(stats.map((s) => s.total)), [stats]);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const dir = sort.desc ? -1 : 1;
    return stats
      .filter((s) => !q || s.label.toLowerCase().includes(q) || s.id.toLowerCase().includes(q))
      .sort((a, b) =>
        sort.key === "label"
          ? dir * a.label.localeCompare(b.label, "de")
          : dir * (a[sort.key] - b[sort.key]) || a.label.localeCompare(b.label, "de"),
      );
  }, [stats, filter, sort]);

  if (!indexed) {
    return (
      <div className="main__placeholder">
        {status === "loading" ? "Lade Bundle…" : "Wähle links einen Datensatz."}
      </div>
    );
  }

  const T = indexed.sliceCount;
  const xLabels = indexed.sortedSlices.map((s) => s.label ?? s.id);
  // Gewählt: lokale Wahl, sonst das aktive Zielwort der anderen Module, sonst das erste.
  const current =
    stats.find((s) => s.id === picked) ?? stats.find((s) => s.id === activeEntityId) ?? stats[0];

  const cells = stats.length * T;
  const filled = stats.reduce((n, s) => n + s.belegt, 0);
  const full = stats.filter((s) => s.belegt === T).length;
  const emptySlices = Array.from({ length: T }, (_, i) => i).filter((i) =>
    stats.every((s) => s.freqs[i] <= 0),
  ).length;

  const head = (key: SortKey, label: string, num = true) => {
    const on = sort.key === key;
    return (
      <th className={num ? "tbl__num" : undefined} aria-sort={on ? (sort.desc ? "descending" : "ascending") : "none"}>
        <button
          type="button"
          className={`zw__sort ${on ? "zw__sort--on" : ""}`}
          onClick={() => setSort({ key, desc: on ? !sort.desc : key !== "label" })}
        >
          {label}
          <span className="zw__arrow">{on ? (sort.desc ? "▼" : "▲") : ""}</span>
        </button>
      </th>
    );
  };

  return (
    <div className="pane">
      <div className="pane__head">
        <div>
          <div className="lt-eyebrow">Daten</div>
          <h2 className="pane__title">Zielwörter</h2>
          <p className="pane__desc">
            Wie gut jedes Zielwort belegt ist: in wie vielen Zeitscheiben es vorkommt und wie viele
            Belege es insgesamt hat (<code>freq</code> der Aggregate). Dünn belegte Wörter
            tragen weniger verlässliche Vektoren.
          </p>
        </div>
      </div>

      <div className="stats">
        <Stat k="Zielwörter" v={stats.length} />
        <Stat k="Zeitscheiben" v={T} />
        <Stat
          k="belegte Zellen (Wort × Zeitscheibe)"
          v={`${fmt(filled)} / ${fmt(cells)} (${cells ? fmt((100 * filled) / cells) : 0} %)`}
          hint="Paare aus Zielwort und Zeitscheibe mit freq > 0"
        />
        <Stat
          k="Zeitscheiben ohne Zielwort"
          v={emptySlices}
          hint="Zeitscheiben, in denen keines der Zielwörter belegt ist"
        />
        <Stat
          k="durchgehend belegte Zielwörter"
          v={`${full} von ${stats.length}`}
          hint={`in allen ${T} Zeitscheiben belegt`}
        />
        <Stat k="Belege gesamt" v={fmt(stats.reduce((n, s) => n + s.total, 0))} hint="Summe freq über alle Zellen" />
      </div>

      <div className="pane__grid">
        <div className="pane__col">
          <section className="card">
            <div className="nf__head">
              <h3 className="card__title">Alle Zielwörter</h3>
              <span className="section__badge lt-mono">{stats.length}</span>
            </div>
            {stats.length > 12 && (
              <input
                type="search"
                className="picker__select an__filter"
                placeholder="Liste durchsuchen"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            )}
            <div className="zw__tablewrap">
              <table className="tbl zw__tbl">
                <thead>
                  <tr>
                    {head("label", "Zielwort", false)}
                    {head("belegt", "Belegung")}
                    {head("total", "Häufigkeit")}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => {
                    const sel = s.id === current?.id;
                    return (
                      <tr
                        key={s.id}
                        className={`tbl__row--click ${sel ? "zw__row--sel" : ""}`}
                        onClick={() => setPicked(s.id)}
                        aria-selected={sel}
                      >
                        <td>
                          <span className="tbl__word">
                            <span className="swatch" style={{ background: entityColor(s.colorIndex, mode) }} />
                            {s.label}
                          </span>
                        </td>
                        <LowCell v={s.belegt} summary={sumBelegt} text={`${s.belegt} / ${T}`} />
                        <LowCell v={s.total} summary={sumTotal} text={fmt(s.total)} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="card__note">
              <span className="zw__lowkey">Hervorgehoben</span>: unteres Quartil der Spalte
              (Belegung ≤ {sumBelegt ? fmt(sumBelegt.q1, 1) : "–"}, Häufigkeit ≤{" "}
              {sumTotal ? fmt(sumTotal.q1, 1) : "–"}). Klick auf eine Zeile zeigt den Verlauf,
              Klick auf eine Spaltenüberschrift sortiert.
            </p>
          </section>
        </div>

        <div className="pane__col">
          {current && <DetailCard stat={current} xLabels={xLabels} shift={indexed.shiftSliceIndex} />}

          <section className="card">
            <h3 className="card__title">Verteilung über alle Zielwörter</h3>
            <table className="tbl">
              <thead>
                <tr>
                  <th />
                  <th className="tbl__num">Min</th>
                  <th className="tbl__num">Q1</th>
                  <th className="tbl__num">Median</th>
                  <th className="tbl__num">Mittel</th>
                  <th className="tbl__num">Q3</th>
                  <th className="tbl__num">Max</th>
                </tr>
              </thead>
              <tbody>
                <SummaryRow label="Belegung" s={sumBelegt} />
                <SummaryRow label="Häufigkeit" s={sumTotal} />
              </tbody>
            </table>
            <p className="card__note">
              Belegung: Anzahl Zeitscheiben mit <code>freq &gt; 0</code> (von {T}). Häufigkeit: Summe{" "}
              <code>freq</code> über alle Zeitscheiben.
            </p>
          </section>
        </div>
      </div>
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

function LowCell({ v, summary, text }: { v: number; summary: Summary | null; text: string }) {
  const low = isLow(v, summary);
  return (
    <td
      className={`tbl__num lt-mono ${low ? "zw__low" : ""}`}
      title={low ? "unteres Quartil" : undefined}
    >
      {text}
    </td>
  );
}

function SummaryRow({ label, s }: { label: string; s: Summary | null }) {
  const cells = s ? [s.min, s.q1, s.median, s.mean, s.q3, s.max] : [];
  return (
    <tr>
      <td>{label}</td>
      {s
        ? cells.map((v, i) => (
            <td key={i} className="tbl__num lt-mono">
              {fmt(v, Number.isInteger(v) ? 0 : 1)}
            </td>
          ))
        : <td colSpan={6} className="tbl__muted">–</td>}
    </tr>
  );
}

function DetailCard({ stat, xLabels, shift }: { stat: TargetStat; xLabels: string[]; shift: number | null }) {
  const mode = useMode();
  const T = stat.freqs.length;
  const color = entityColor(stat.colorIndex, mode);

  // Unbelegte Scheiben als Lücke, nicht als 0-Linie: dort gibt es keinen Vektor.
  const series: LineSeries[] = [
    { id: stat.id, label: "freq", color, values: stat.freqs.map((f) => (f > 0 ? f : null)) },
  ];
  const domain = seriesDomain([series[0].values], { zeroFloor: true });

  const occupied = stat.freqs.map((f, i) => ({ f, i })).filter((x) => x.f > 0);
  const per = summarize(occupied.map((x) => x.f));
  const peak = occupied.reduce<{ f: number; i: number } | null>((m, x) => (!m || x.f > m.f ? x : m), null);
  const first = occupied[0]?.i;
  const last = occupied[occupied.length - 1]?.i;

  return (
    <section className="card">
      <div className="nf__head">
        <h3 className="card__title">
          <span className="tbl__word">
            <span className="swatch" style={{ background: color }} />
            {stat.label}
          </span>
        </h3>
      </div>

      <div className="zw__facts">
        <Fact k="Belegung" v={`${stat.belegt} / ${T}`} />
        <Fact k="Häufigkeit" v={fmt(stat.total)} />
        <Fact k="Median je belegter Scheibe" v={per ? fmt(per.median, Number.isInteger(per.median) ? 0 : 1) : "–"} />
        <Fact k="Maximum" v={peak ? `${fmt(peak.f)} · ${xLabels[peak.i]}` : "–"} />
        <Fact k="belegt von – bis" v={first != null && last != null ? `${xLabels[first]} – ${xLabels[last]}` : "–"} />
      </div>

      <div className="chart__ylabel">Häufigkeit (freq) je Zeitscheibe</div>
      <LineChart
        series={series}
        xLabels={xLabels}
        domain={domain}
        mode={mode}
        height={220}
        shiftSliceIndex={shift}
        format={(v) => fmt(v)}
      />

      <div className="chart__ylabel zw__striplabel">Belegung je Zeitscheibe</div>
      {/* An den x-Positionen des Diagramms ausgerichtet: LineChart zeichnet bei
          einer Serie mit 52px links / 104px rechts Rand, Punkte auf den Rändern
          des Plotbereichs — daher je Zelle eine halbe Schrittweite Überstand. */}
      <div
        className="zw__strip"
        style={
          T > 1
            ? {
                width: `calc((100% - 156px) * ${T / (T - 1)})`,
                marginLeft: `calc(52px - (100% - 156px) / ${2 * (T - 1)})`,
                gridTemplateColumns: `repeat(${T}, 1fr)`,
              }
            : { gridTemplateColumns: "1fr" }
        }
      >
        {stat.freqs.map((f, i) => (
          <span
            key={i}
            className={`zw__cell ${f > 0 ? "" : "zw__cell--empty"}`}
            style={f > 0 ? { background: color } : undefined}
            title={`${xLabels[i]}: ${f > 0 ? `belegt (freq ${fmt(f)})` : "nicht belegt"}`}
          />
        ))}
      </div>
      <p className="card__note">
        Die Kurve setzt aus, wo das Wort nicht belegt ist.
        {shift !== null && " Gestrichelt: Zäsur des Bundles."}
      </p>
    </section>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="zw__fact">
      <div className="stat__k">{k}</div>
      <div className="zw__factv lt-mono">{v}</div>
    </div>
  );
}
