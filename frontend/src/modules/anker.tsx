/**
 * Modul „Anker“ — welche Wörter im Wortraum als beschriftete Landmarken stehen.
 *
 * Ausgangspunkt sind die Anker des Bundles. Ergänzt, entfernt und umbenannt
 * wird nur für diese Sitzung (`state/anchors.ts`); das Bundle bleibt
 * unverändert. Neue Anker kommen aus dem Wortbestand des Bundles, denn nur
 * dort gibt es Positionen — gerechnet wird nichts.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { anchorKey } from "../data/model";
import type { Anchor } from "../types/schema";
import {
  anchorActions,
  anchorCatalog,
  anchorDiff,
  anchorFileText,
  anchorFromWord,
  parseAnchorText,
  resolveAnchorRows,
  searchCatalog,
  type CatalogWord,
} from "../state/anchors";
import { useNeighborFilters } from "../state/neighborFilters";
import { useViz } from "../state/store";
import { useMode } from "../viz/useMode";
import { clusterColor } from "../viz/theme";
import { Section } from "../ui/Section";
import { Icon } from "../design/icons";

const SEARCH_LIMIT = 50;
const SOURCE_LABEL: Record<CatalogWord["source"], string> = {
  anchor: "Anker im Bundle",
  candidate: "Kandidat",
  vocab: "Vokabelpunkt",
};

export function AnkerConfig() {
  const { indexed } = useViz();
  if (!indexed) return <p className="prose">Erst im Modul „Datenquelle" ein Bundle laden.</p>;
  const diff = anchorDiff(indexed.anchors, indexed.bundle.anchors);
  const edited = diff.added.length + diff.removed.length + diff.changed.length > 0;

  return (
    <>
      <Section title="Wirkung" icon="pin">
        <p className="prose">
          {edited
            ? `Geändert gegenüber dem Bundle: ${diff.added.length} ergänzt, ${diff.removed.length} entfernt, ${diff.changed.length} umbenannt.`
            : "Es gelten die Anker des Bundles."}
        </p>
        <div className="nf__btns">
          <button type="button" className="nf-btn" onClick={anchorActions.reset} disabled={!edited}>
            <Icon name="reset" size={12} /> Anker des Bundles
          </button>
        </div>
      </Section>
      <Section title="So wirken die Anker" icon="info" defaultOpen={false}>
        <p className="prose">
          Anker sind beschriftete Landmarken im Wortraum. Ist ein Nachbar zugleich Anker, trägt er
          dessen Label und Cluster — im Panel „Nächste Nachbarn“, im 3D-Bild und im
          Nachbarschafts-Fluss. Zugeordnet wird über das Lemma.
        </p>
        <p className="prose">
          Die Änderungen gelten nur in dieser Sitzung: Neu laden oder ein anderes Bundle öffnen
          stellt die Anker des Bundles wieder her. Wer eine Liste behalten will, exportiert sie.
          Auswahl und Rang der Nachbarn ändern sich nicht.
        </p>
      </Section>
    </>
  );
}

export function AnkerMain() {
  const { indexed, status } = useViz();
  const space = useNeighborFilters((s) => s.space);
  const spaceStatus = useNeighborFilters((s) => s.spaceStatus);
  const searchable = useNeighborFilters((s) => s.availability.kind === "available");

  const catalog = useMemo(
    () => (indexed ? anchorCatalog(indexed.bundle.anchors, space?.candidates ?? null, indexed.vocabPoints) : []),
    [indexed?.bundle, space],
  );

  if (!indexed) {
    return (
      <div className="main__placeholder">
        {status === "loading" ? "Lade Bundle…" : "Wähle links einen Datensatz."}
      </div>
    );
  }
  const diff = anchorDiff(indexed.anchors, indexed.bundle.anchors);

  return (
    <div className="pane">
      <div className="pane__head">
        <div>
          <div className="lt-eyebrow">Daten</div>
          <h2 className="pane__title">Anker</h2>
          <p className="pane__desc">
            Welche Wörter im Wortraum als Landmarken stehen, mit Label und Cluster. Änderungen
            gelten nur für diese Sitzung; das Bundle bleibt, wie es ist.
          </p>
        </div>
      </div>

      {searchable && spaceStatus === "loading" && (
        <p className="warnnote warnnote--block">
          <Icon name="info" size={13} />
          <span>Der Suchraum wird geladen; bis dahin sind nur Anker und Vokabelpunkte des Bundles durchsuchbar.</span>
        </p>
      )}

      <div className="stats">
        <Stat k="Anker im Bundle" v={indexed.bundle.anchors.length} />
        <Stat k="Anker dieser Sitzung" v={indexed.anchors.length} />
        <Stat
          k="ergänzt / entfernt / umbenannt"
          v={`${diff.added.length} / ${diff.removed.length} / ${diff.changed.length}`}
        />
        <Stat k="Cluster" v={indexed.clusters.length} />
        <Stat
          k="Wortbestand"
          v={catalog.length.toLocaleString("de-DE")}
          hint="Wörter mit Position im Bild: Anker des Bundles, Kandidaten des Suchraums, Vokabelpunkte"
        />
      </div>

      <div className="pane__grid">
        <div className="pane__col">
          <SearchCard catalog={catalog} />
        </div>
        <div className="pane__col">
          <AnchorListCard catalog={catalog} />
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

/** Vorschläge für das Cluster-Feld: alle Cluster der Arbeitsliste. */
function ClusterOptions({ id }: { id: string }) {
  const clusters = useViz((s) => s.indexed?.clusters ?? []);
  return (
    <datalist id={id}>
      {clusters.map((c) => (
        <option key={c} value={c} />
      ))}
    </datalist>
  );
}

// ---------------------------------------------------------------------------
// Suche im Wortbestand
// ---------------------------------------------------------------------------

function SearchCard({ catalog }: { catalog: CatalogWord[] }) {
  const anchors = useViz((s) => s.indexed?.anchors ?? []);
  const [query, setQuery] = useState("");
  const [cluster, setCluster] = useState("");

  const results = useMemo(() => searchCatalog(catalog, query, SEARCH_LIMIT + 1), [catalog, query]);
  const taken = useMemo(() => new Set(anchors.map(anchorKey)), [anchors]);
  const takenLabels = useMemo(() => new Set(anchors.map((a) => a.label)), [anchors]);

  const add = (w: CatalogWord) => anchorActions.add([anchorFromWord(w, undefined, cluster)]);
  const free = results.slice(0, SEARCH_LIMIT).filter((w) => !taken.has(w.lemma) && !takenLabels.has(w.label));

  return (
    <section className="card">
      <h3 className="card__title">Wort suchen</h3>
      <div className="nf__row">
        <input
          type="search"
          className="picker__select"
          placeholder="Lemma oder Label"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && free.length > 0) add(free[0]);
          }}
          autoFocus
        />
      </div>
      <div className="nf__row an__clusterrow">
        <label className="nf__check" htmlFor="an-new-cluster">Cluster für neue Anker</label>
        <input
          id="an-new-cluster"
          type="text"
          className="picker__select an__cluster"
          placeholder="wie im Bundle, sonst _"
          list="an-clusters-search"
          value={cluster}
          onChange={(e) => setCluster(e.target.value)}
        />
        <ClusterOptions id="an-clusters-search" />
      </div>

      {query.trim() === "" ? (
        <p className="mode__hint an__hint">
          Durchsucht {catalog.length.toLocaleString("de-DE")} Wörter. Enter übernimmt den ersten
          freien Treffer.
        </p>
      ) : results.length === 0 ? (
        <p className="mode__hint an__hint">Kein Wort mit Position im Bundle gefunden.</p>
      ) : (
        <ul className="an__results">
          {results.slice(0, SEARCH_LIMIT).map((w) => {
            const isTaken = taken.has(w.lemma) || takenLabels.has(w.label);
            return (
              <li key={w.lemma} className="an__result">
                <span className="an__word">
                  {w.lemma}
                  {w.label !== w.lemma && <span className="tbl__muted"> → {w.label}</span>}
                </span>
                <span className="an__src">
                  {SOURCE_LABEL[w.source]}
                  {w.cluster && ` · ${w.cluster}`}
                </span>
                {isTaken ? (
                  <span className="an__taken">Anker</span>
                ) : (
                  <button type="button" className="nf-btn an__add" onClick={() => add(w)} title={`„${w.lemma}“ als Anker übernehmen`}>
                    + Anker
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {results.length > SEARCH_LIMIT && (
        <p className="mode__hint an__hint">Die ersten {SEARCH_LIMIT} Treffer; Suche genauer eingrenzen.</p>
      )}
      <p className="card__note">
        Gesucht wird in allen Wörtern, die eine Position im Bild haben: den Ankern des Bundles, den
        Kandidaten des Suchraums und den Vokabelpunkten. Andere Wörter können nicht Anker werden.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Arbeitsliste
// ---------------------------------------------------------------------------

function AnchorListCard({ catalog }: { catalog: CatalogWord[] }) {
  const indexed = useViz((s) => s.indexed);
  const mode = useMode();
  const [filter, setFilter] = useState("");
  const [fileMsg, setFileMsg] = useState<{ error: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const anchors = indexed?.anchors ?? [];
  const clusters = indexed?.clusters ?? [];
  const shippedKeys = useMemo(() => new Set((indexed?.bundle.anchors ?? []).map(anchorKey)), [indexed?.bundle]);
  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return anchors
      .filter((a) => !q || a.label.toLowerCase().includes(q) || anchorKey(a).toLowerCase().includes(q) || a.cluster.toLowerCase().includes(q))
      .sort((a, b) => a.cluster.localeCompare(b.cluster, "de") || a.label.localeCompare(b.label, "de"));
  }, [anchors, filter]);

  if (!indexed) return null;

  const download = () => {
    const blob = new Blob([anchorFileText(anchors, indexed.bundle.meta.name ?? "Bundle")], {
      type: "text/tab-separated-values;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "anchors.tsv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { anchors: imported, missing } = resolveAnchorRows(parseAnchorText(await file.text()), catalog);
      anchorActions.replace(imported);
      setFileMsg({
        error: missing.length > 0,
        text:
          `${imported.length} Anker aus „${file.name}“ übernommen.` +
          (missing.length > 0
            ? ` Ohne Position im Bundle und daher ausgelassen (${missing.length}): ${missing.slice(0, 20).join(", ")}${missing.length > 20 ? " …" : ""}`
            : ""),
      });
    } catch (err) {
      setFileMsg({ error: true, text: `„${file.name}“ konnte nicht gelesen werden: ${(err as Error).message}` });
    }
  };

  return (
    <section className="card">
      <div className="nf__head">
        <h3 className="card__title">Anker dieser Sitzung</h3>
        <span className="section__badge lt-mono">{anchors.length}</span>
      </div>
      {anchors.length > 12 && (
        <input
          type="search"
          className="picker__select an__filter"
          placeholder="Liste durchsuchen (Lemma, Label, Cluster)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      )}
      <ClusterOptions id="an-clusters-list" />

      {anchors.length === 0 ? (
        <p className="mode__hint">keine Anker</p>
      ) : (
        <div className="an__tablewrap">
          <table className="tbl an__tbl">
            <thead>
              <tr>
                <th>Lemma</th>
                <th>Label</th>
                <th>Cluster</th>
                <th aria-label="entfernen" />
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <AnchorRowView
                  key={anchorKey(a)}
                  anchor={a}
                  color={clusterColor(Math.max(0, clusters.indexOf(a.cluster)), mode)}
                  added={!shippedKeys.has(anchorKey(a))}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="nf__btns">
        <button type="button" className="nf-btn" onClick={download} disabled={anchors.length === 0}>
          <Icon name="file" size={12} /> exportieren
        </button>
        <button type="button" className="nf-btn" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={12} /> importieren
        </button>
        <button type="button" className="nf-btn" onClick={anchorActions.reset}>
          <Icon name="reset" size={12} /> Anker des Bundles
        </button>
        <button type="button" className="nf-btn" onClick={anchorActions.clear} disabled={anchors.length === 0}>
          <Icon name="x" size={12} /> alle entfernen
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".tsv,.csv,.txt,text/plain,text/tab-separated-values,text/csv"
          hidden
          onChange={(e) => {
            void upload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {fileMsg && <p className={fileMsg.error ? "picker__error" : "picker__status"}>{fileMsg.text}</p>}
      <p className="card__note">
        Label und Cluster lassen sich direkt ändern (Enter oder Feld verlassen übernimmt, Esc
        verwirft). Import ersetzt die Liste: Tabulator-, Semikolon- oder Komma-getrennt mit den
        Spalten <code>lemma</code>, <code>label</code>, <code>cluster</code>; Label und Cluster
        dürfen fehlen. Die Positionen kommen aus dem Bundle. Fett: nicht im Bundle.
      </p>
    </section>
  );
}

function AnchorRowView({ anchor, color, added }: { anchor: Anchor; color: string; added: boolean }) {
  const key = anchorKey(anchor);
  const [error, setError] = useState<string | null>(null);
  const report = (err: string | null) => {
    setError(err);
    return err;
  };
  return (
    <>
      <tr>
        <td className={added ? "tbl__strong" : ""} title={added ? "nicht im Bundle" : undefined}>
          {key}
        </td>
        <td>
          <EditField
            value={anchor.label}
            ariaLabel={`Label von ${key}`}
            commit={(v) => report(anchorActions.edit(key, { label: v }))}
          />
        </td>
        <td>
          <span className="tbl__word">
            <span className="swatch swatch--dot" style={{ background: color }} />
            <EditField
              value={anchor.cluster}
              ariaLabel={`Cluster von ${key}`}
              list="an-clusters-list"
              commit={(v) => report(anchorActions.edit(key, { cluster: v }))}
            />
          </span>
        </td>
        <td className="tbl__num">
          <button
            type="button"
            className="nf__wordx an__remove"
            onClick={() => anchorActions.remove(key)}
            title={`„${anchor.label}“ entfernen`}
            aria-label={`${anchor.label} entfernen`}
          >
            ×
          </button>
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={4} className="picker__error">{error}</td>
        </tr>
      )}
    </>
  );
}

/** Eingabefeld, das erst bei Enter oder beim Verlassen übernimmt (jede Änderung ordnet alle Nachbarlisten neu zu). */
function EditField({
  value, ariaLabel, list, commit,
}: {
  value: string;
  ariaLabel: string;
  list?: string;
  /** Gibt eine Fehlermeldung zurück, wenn der Wert abgelehnt wurde; das Feld zeigt dann wieder den alten. */
  commit: (v: string) => string | null;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const done = () => {
    if (draft.trim() === value || commit(draft) !== null) setDraft(value);
  };
  return (
    <input
      type="text"
      className="an__edit"
      value={draft}
      list={list}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value);
          // Verwerfen, dann verlassen: `done` sieht danach den alten Wert
          setTimeout(() => (e.target as HTMLInputElement).blur());
        }
      }}
    />
  );
}
