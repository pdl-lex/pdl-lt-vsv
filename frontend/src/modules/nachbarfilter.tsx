/**
 * Modul „Nachbar-Filter“ — der einzige Ort, an dem die Filter für die
 * Nachbarlisten eingestellt werden. Sie wirken in allen Modulen und Ansichten
 * (Nachbarn-Panel, Punkte im Wortraum, Nachbarschafts-Fluss).
 *
 * Die Bedienelemente entstehen generisch aus der Filterdeklaration des Bundles
 * (`meta.neighbor_space.filters`): welche Filter es gibt, kennt diese Datei
 * nicht. Gerechnet wird im Backend (SCHEMA.md, „meta.neighbor_space“); hier
 * werden nur Werte gesammelt (`state/neighborFilters.ts`).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { NeighborFilterInfo } from "../data/apiClient";
import {
  cloudWords,
  shippedStopwords,
  stopwordDiff,
  stopwordFileText,
  parseStopwordText,
  useNeighborFilters,
} from "../state/neighborFilters";
import { useViz } from "../state/store";
import { Section } from "../ui/Section";
import { NeighborFilterNote } from "../ui/NeighborFilterNote";
import { Icon } from "../design/icons";

export function NachbarfilterConfig() {
  const { indexed } = useViz();
  const { availability, resetFilters, resetStopwords } = useNeighborFilters();
  if (!indexed) return <p className="prose">Erst im Modul „Datenquelle" ein Bundle laden.</p>;
  const active = availability.kind === "available";

  return (
    <>
      <Section title="Wirkung" icon="filter">
        <NeighborFilterNote />
        {active && (
          <div className="nf__btns">
            <button type="button" className="nf-btn" onClick={resetFilters}>
              Filter auf Voreinstellung
            </button>
            <button type="button" className="nf-btn" onClick={resetStopwords}>
              Stoppwörter auf mitgelieferte Liste
            </button>
          </div>
        )}
      </Section>
      <Section title="So wirken die Filter" icon="info" defaultOpen={false}>
        <p className="prose">
          Die Nachbarn werden im Backend im vollen Vektorraum neu berechnet: nach
          rohem Kosinus, nur unter den Kandidaten, die alle Filter passieren. Die
          Filter gelten in allen Modulen — im Panel „Nächste Nachbarn“, für die Punkte im
          Wortraum und im Nachbarschafts-Fluss.
        </p>
        <p className="prose">
          Kandidaten ohne Wert in einem Attribut bleiben bei jedem Filter drin.
          Stoppwörter werden über das Lemma abgeglichen, exakt und mit
          Groß-/Kleinschreibung. Die geänderte Stoppwortliste bleibt in diesem
          Browser gespeichert; die mitgelieferte Liste ändert sich nicht.
        </p>
      </Section>
    </>
  );
}

export function NachbarfilterMain() {
  const { indexed, status } = useViz();
  const {
    availability, space, spaceStatus, spaceError, queryStatus, queryError, candidateCount, retry,
  } = useNeighborFilters();

  if (!indexed) {
    return (
      <div className="main__placeholder">
        {status === "loading" ? "Lade Bundle…" : "Wähle links einen Datensatz."}
      </div>
    );
  }

  return (
    <div className="pane">
      <div className="pane__head">
        <div>
          <div className="lt-eyebrow">Nächste Nachbarn</div>
          <h2 className="pane__title">Filter für nächste Nachbarn</h2>
          <p className="pane__desc">
            Welche Kontextwörter als nächste Nachbarn infrage kommen. Gilt für alle Module, die
            Nachbarn zeigen.
          </p>
        </div>
      </div>

      {availability.kind === "unavailable" ? (
        <>
          <p className="warnnote warnnote--block">
            <Icon name="info" size={13} />
            <span>{availability.reason}</span>
          </p>
          {availability.meta && <DeclaredDefaults filters={availability.meta.filters} stopwords={availability.meta.stopwords} />}
        </>
      ) : spaceStatus === "error" ? (
        <p className="warnnote warnnote--block">
          <Icon name="info" size={13} />
          <span>
            {spaceError} Angezeigt werden die vorberechneten Nachbarn.{" "}
            <button type="button" className="nf-link" onClick={retry}>erneut versuchen</button>
          </span>
        </p>
      ) : !space ? (
        <div className="main__placeholder">Lade Suchraum…</div>
      ) : (
        <>
          {queryStatus === "error" && (
            <p className="warnnote warnnote--block">
              <Icon name="info" size={13} />
              <span>
                {queryError} Angezeigt werden die vorberechneten Nachbarn.{" "}
                <button type="button" className="nf-link" onClick={retry}>erneut versuchen</button>
              </span>
            </p>
          )}
          <div className="stats">
            <Stat
              k="Kandidaten nach Filtern"
              v={candidateCount ? `${fmt(candidateCount.kept)} / ${fmt(candidateCount.total)}` : "—"}
              hint="Kontextwörter, die alle Filter und die Stoppwortliste passieren, von allen im Suchraum"
            />
            <Stat k="Listenlänge" v={indexed.neighborSource === "query" ? indexed.maxNeighborK : "—"}
              hint="So viele Nachbarn je Zielwort und Zeitscheibe werden abgefragt; der Regler „Nachbarn“ schneidet davon ab" />
            <Stat k="Art der Nachbarn" v={space.neighbor_kind === "context" ? "Kontextwörter" : (space.neighbor_kind ?? "—")}
              hint="Kontextwörter: das Kollokationsprofil (PPMI). Wörter: Nachbarn im selben Raum (SGNS)." />
            <Stat k="Status" v={queryStatus === "loading" ? "rechnet …" : queryStatus === "ready" ? "aktuell" : "—"} />
          </div>
          <div className="pane__grid">
            <div className="pane__col">
              {space.filters
                .filter((f) => f.type !== "exclude_if_true")
                .map((f) => (
                  <FilterCard key={f.column} filter={f} />
                ))}
            </div>
            {/* rechts alles, was Wörter ausblendet: Ausschlussfilter und Stoppwörter */}
            <div className="pane__col">
              {space.filters
                .filter((f) => f.type === "exclude_if_true")
                .map((f) => (
                  <FilterCard key={f.column} filter={f} />
                ))}
              <StopwordCard />
            </div>
          </div>
          <CandidateCloud />
        </>
      )}
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString("de-DE");
}

function Stat({ k, v, hint }: { k: string; v: string | number; hint?: string }) {
  return (
    <div className="stat" title={hint}>
      <div className="stat__k">{k}</div>
      <div className="stat__v lt-mono">{v}</div>
    </div>
  );
}

/** Rückfall ohne Backend: die Voreinstellungen zeigen, nach denen `neighbors` entstanden ist. */
function DeclaredDefaults({
  filters, stopwords,
}: {
  filters: { column: string; label: string; type: string; default?: unknown; out_of?: number }[];
  stopwords: string[];
}) {
  return (
    <section className="card">
      <h3 className="card__title">Voreinstellungen der vorberechneten Nachbarn</h3>
      <dl className="deflist">
        {filters.map((f) => (
          <FragmentRow key={f.column} k={f.label} v={describeDefault(f.type, f.default, f.out_of)} />
        ))}
        <FragmentRow k="Stoppwörter" v={stopwords.length > 0 ? stopwords.join(", ") : "keine"} />
      </dl>
    </section>
  );
}

function FragmentRow({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </>
  );
}

function describeDefault(type: string, value: unknown, outOf?: number): string {
  if (value === null || value === undefined) return "aus";
  if (type === "categorical" && Array.isArray(value)) return value.join(", ");
  if (type === "minimum") return `≥ ${String(value)}${outOf != null ? ` von ${fmt(outOf)}` : ""}`;
  if (type === "exclude_if_true") return value === true ? "ausblenden" : "aus";
  return String(value);
}

// ---------------------------------------------------------------------------
// Filterkarten, je Filtertyp
// ---------------------------------------------------------------------------

function FilterCard({ filter }: { filter: NeighborFilterInfo }) {
  const value = useNeighborFilters((s) => s.values[filter.column]);
  const setValue = useNeighborFilters((s) => s.setValue);
  const set = (v: unknown) => setValue(filter.column, v);
  const isDefault = JSON.stringify(value ?? null) === JSON.stringify(filter.default ?? null);

  return (
    <section className="card">
      <div className="nf__head">
        <h3 className="card__title">{filter.label}</h3>
        {!isDefault && (
          <button type="button" className="nf-link" onClick={() => set(filter.default ?? null)}>
            Voreinstellung
          </button>
        )}
      </div>
      {filter.description && <p className="prose nf__desc">{filter.description}</p>}
      {filter.type === "categorical" && <CategoricalFilter filter={filter} value={value} set={set} />}
      {filter.type === "minimum" && <MinimumFilter filter={filter} value={value} set={set} />}
      {filter.type === "exclude_if_true" && <ExcludeFilter filter={filter} value={value} set={set} />}
      {filter.null_count > 0 && (
        <p className="card__note">
          {fmt(filter.null_count)} Kandidaten ohne Wert bleiben bei diesem Filter immer drin.
        </p>
      )}
    </section>
  );
}

interface FilterProps {
  filter: NeighborFilterInfo;
  value: unknown;
  set: (v: unknown) => void;
}

function CategoricalFilter({ filter, value, set }: FilterProps) {
  const options = filter.values ?? [];
  const all = options.map((o) => o.value);
  const off = value === null || value === undefined;
  const selected = new Set(off ? all : (value as string[]));

  const toggle = (v: string) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    // Reihenfolge wie in der Liste, damit gleiche Auswahl gleich aussieht
    set(all.filter((x) => next.has(x)));
  };

  return (
    <>
      <div className="facets__values">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`facets__value ${selected.has(o.value) ? "facets__value--on" : ""}`}
            onClick={() => toggle(o.value)}
          >
            {o.value}
            <span className="nf__count lt-mono">{fmt(o.count)}</span>
          </button>
        ))}
      </div>
      <div className="nf__btns">
        <button type="button" className="nf-link" onClick={() => set(null)} disabled={off}>
          alle (Filter aus)
        </button>
        <button type="button" className="nf-link" onClick={() => set([])}>
          keine
        </button>
      </div>
    </>
  );
}

function MinimumFilter({ filter, value, set }: FilterProps) {
  const on = typeof value === "number";
  // Eingabe lokal halten, damit Zwischenstände beim Tippen nicht abgefragt werden
  const [draft, setDraft] = useState<string>(on ? String(value) : "");
  // Änderungen von außen (Voreinstellung, Zurücksetzen) ins Feld übernehmen;
  // beim Tippen ändert sich `value` nur auf gültige Zahlen, die passen schon.
  // Bewusst nur `value` als Abhängigkeit, nicht `draft`.
  useEffect(() => {
    if (typeof value === "number" && Number(draft) !== value) setDraft(String(value));
  }, [value]);
  const fallback = typeof filter.default === "number" ? filter.default : (filter.min ?? 0);

  return (
    <>
      <div className="nf__row">
        <label className="nf__check">
          <input
            type="checkbox"
            checked={on}
            onChange={(e) => {
              const v = e.target.checked ? fallback : null;
              setDraft(v === null ? "" : String(v));
              set(v);
            }}
          />
          aktiv
        </label>
        <span className="nf__ge">≥</span>
        <input
          type="number"
          className="picker__select nf__num"
          disabled={!on}
          value={on ? draft : ""}
          min={filter.min ?? undefined}
          max={filter.max ?? undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value.trim() !== "" && Number.isFinite(n)) set(n);
          }}
        />
        {filter.out_of != null && <span className="nf__ge">von {fmt(filter.out_of)}</span>}
      </div>
      {filter.min != null && filter.max != null && (
        <p className="mode__hint">
          Werte unter den Kandidaten: {fmt(filter.min)} bis {fmt(filter.max)}
        </p>
      )}
    </>
  );
}

function ExcludeFilter({ filter, value, set }: FilterProps) {
  return (
    <>
      <label className="nf__check">
        <input type="checkbox" checked={value === true} onChange={(e) => set(e.target.checked)} />
        ausblenden
      </label>
      {filter.count_true != null && (
        <p className="mode__hint">betrifft {fmt(filter.count_true)} Kandidaten</p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Kandidaten-Wortwolke
// ---------------------------------------------------------------------------

const CLOUD_LIMITS = [100, 200, 500];
const CLOUD_FONT_MIN = 11;
const CLOUD_FONT_MAX = 28;

/**
 * Die häufigsten Kandidaten, die alle Filter passieren — welche das sind,
 * meldet das Backend (`kept_rows`). Schriftgröße logarithmisch nach der
 * Häufigkeitsspalte des Bundles (`neighbor_space.frequency`); × legt das
 * Lemma auf die Stoppwortliste.
 */
function CandidateCloud() {
  const { availability, space, keptRows, candidateCount, queryStatus, addStopwords } =
    useNeighborFilters();
  const [limit, setLimit] = useState(CLOUD_LIMITS[1]);

  const freqColumn = availability.meta?.frequency;
  const freqLabel = space?.filters.find((f) => f.column === freqColumn)?.label;
  const words = useMemo(
    () => (space && keptRows ? cloudWords(space.candidates, keptRows, freqColumn, limit) : []),
    [space, keptRows, freqColumn, limit],
  );

  if (!space || !keptRows) return null;

  const freqs = words.map((w) => w.freq).filter((f): f is number => f !== null && f > 0);
  const lo = Math.log(Math.min(...freqs));
  const hi = Math.log(Math.max(...freqs));
  const size = (f: number | null) =>
    f === null || f <= 0 || hi === lo
      ? 13
      : CLOUD_FONT_MIN + ((Math.log(f) - lo) / (hi - lo)) * (CLOUD_FONT_MAX - CLOUD_FONT_MIN);

  return (
    <section className={`card ${queryStatus === "loading" ? "nf__cloud--stale" : ""}`}>
      <div className="nf__head">
        <h3 className="card__title">Kandidaten</h3>
        <label className="nf__check">
          die häufigsten
          <select
            className="picker__select nf__limit"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            {CLOUD_LIMITS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          {candidateCount && <>von {fmt(candidateCount.kept)}</>}
        </label>
      </div>
      {words.length === 0 ? (
        <p className="mode__hint">Kein Kandidat passiert die Filter.</p>
      ) : (
        <div className="nf__cloud">
          {words.map((w) => (
            <span
              key={w.lemma}
              className="nf__word"
              style={{ fontSize: `${size(w.freq).toFixed(1)}px` }}
              title={w.freq !== null && freqLabel ? `${freqLabel}: ${fmt(w.freq)}` : undefined}
            >
              {w.lemma}
              <button
                type="button"
                className="nf__wordx"
                onClick={() => addStopwords([w.lemma])}
                title={`„${w.lemma}“ ausblenden (als Stoppwort)`}
                aria-label={`${w.lemma} ausblenden`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <p className="card__note">
        {freqColumn
          ? `Schriftgröße nach ${freqLabel ?? freqColumn} (logarithmisch). `
          : "Das Bundle deklariert keine Häufigkeit; alle Wörter gleich groß. "}
        × legt das Wort auf die Stoppwortliste; rückgängig dort.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Stoppwörter
// ---------------------------------------------------------------------------

function StopwordCard() {
  const { indexed } = useViz();
  const {
    availability, space, stopwords, addStopwords, removeStopword, replaceStopwords, resetStopwords,
  } = useNeighborFilters();
  const [input, setInput] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const vocabulary = useMemo(() => new Set(space?.candidates.lemma ?? []), [space]);
  const shipped = shippedStopwords(availability);
  const diff = stopwordDiff(stopwords, shipped);

  const add = () => {
    addStopwords(input.split(/[,;\n]/));
    setInput("");
  };

  const download = () => {
    const name = indexed?.bundle.meta.name ?? "Bundle";
    const blob = new Blob([stopwordFileText(stopwords, name)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "stopwords.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      replaceStopwords(parseStopwordText(await file.text()));
      setFileError(null);
    } catch (err) {
      setFileError(`„${file.name}“ konnte nicht gelesen werden: ${(err as Error).message}`);
    }
  };

  return (
    <section className="card">
      <div className="nf__head">
        <h3 className="card__title">Stoppwörter</h3>
        <span className="section__badge lt-mono">{stopwords.length}</span>
      </div>
      <p className="prose nf__desc">
        Abgleich über das Lemma, exakt mit Groß-/Kleinschreibung. Ergänzen auch über
        „ausblenden“ im Panel „Nächste Nachbarn“.
      </p>

      <div className="nf__row">
        <input
          type="text"
          className="picker__select"
          placeholder="Lemma ergänzen (mehrere mit Komma)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        <button type="button" className="nf-btn" onClick={add} disabled={!input.trim()}>
          ergänzen
        </button>
      </div>

      <div className="nf__stopbox">
        {stopwords.length === 0 ? (
          <span className="mode__hint">keine</span>
        ) : (
          stopwords.map((w) => {
            const known = vocabulary.has(w);
            return (
              <button
                key={w}
                type="button"
                className={`chip ${known ? "" : "nf__chip--unknown"}`}
                onClick={() => removeStopword(w)}
                title={known ? "entfernen" : "kommt im Vokabular nicht vor — entfernen"}
              >
                {w} <span className="chip__x">×</span>
              </button>
            );
          })
        )}
      </div>

      {(diff.added.length > 0 || diff.removed.length > 0) && (
        <p className="mode__hint">
          gegenüber der mitgelieferten Liste: {diff.added.length} ergänzt, {diff.removed.length} entfernt
        </p>
      )}

      <div className="nf__btns">
        <button type="button" className="nf-btn" onClick={download}>
          <Icon name="file" size={12} /> herunterladen
        </button>
        <button type="button" className="nf-btn" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={12} /> hochladen
        </button>
        <button
          type="button"
          className="nf-btn"
          onClick={resetStopwords}
          disabled={diff.added.length === 0 && diff.removed.length === 0}
        >
          <Icon name="reset" size={12} /> mitgelieferte Liste
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,text/plain"
          hidden
          onChange={(e) => {
            void upload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {fileError && <p className="picker__error">{fileError}</p>}
      <p className="card__note">
        Hochladen ersetzt die Arbeitsliste (ein Lemma je Zeile, # für Kommentare).
        Grau: Lemma kommt im Vokabular dieses Bundles nicht vor.
      </p>
    </section>
  );
}
