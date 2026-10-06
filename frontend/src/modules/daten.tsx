/**
 * Modul „Datenquelle": Bundle laden (Backend-Picker / Datei / Drag-and-Drop) und
 * das Geladene inspizieren, BEVOR man es visualisiert.
 *
 * Der Hauptbereich ist bewusst kein Deko-Panel: er beantwortet die Fragen, die
 * über die Belastbarkeit jeder späteren Grafik entscheiden — welche Projektion,
 * welche Dimension, wie viele Zeitscheiben, und vor allem **wo Zellen leer
 * sind**. `freq == 0` heißt bundleweit „im Korpus nicht belegt"; die Abdeckungs-
 * spalte macht sichtbar, wieviel eines Zielworts überhaupt Substanz hat.
 */
import { useViz } from "../state/store";
import { useWorkbench } from "../state/workbench";
import { useMode } from "../viz/useMode";
import { entityColor } from "../viz/theme";
import { similaritySourceOf } from "../viz/similarity";
import { BundlePicker } from "../ui/BundlePicker";
import { Section } from "../ui/Section";
import { Icon } from "../design/icons";

export function DatenConfig() {
  return (
    <Section title="Datenquelle" icon="file">
      <BundlePicker />
    </Section>
  );
}

/** Belegungsbalken: Anteil der Zeitscheiben mit freq > 0. */
function Coverage({ filled, total }: { filled: number; total: number }) {
  const pct = total > 0 ? (filled / total) * 100 : 0;
  const complete = filled === total;
  return (
    <div className="cov" title={`${filled} von ${total} Zeitscheiben belegt`}>
      <div className="cov__bar">
        <div className="cov__fill" style={{ width: `${pct}%` }} />
      </div>
      <span className={`cov__num lt-mono ${complete ? "" : "cov__num--partial"}`}>
        {filled}/{total}
      </span>
    </div>
  );
}

export function DatenMain() {
  const { indexed, loaded, status } = useViz();
  const setActiveId = useWorkbench((s) => s.setActiveId);
  const mode = useMode();

  if (!indexed) {
    return (
      <div className="main__placeholder">
        {status === "loading" ? "Lade Bundle…" : "Wähle links einen Datensatz."}
      </div>
    );
  }

  const { bundle, sortedSlices, sliceCount } = indexed;
  const meta = bundle.meta;
  const first = sortedSlices[0];
  const last = sortedSlices[sliceCount - 1];
  const source =
    loaded?.source.kind === "file"
      ? loaded.source.filename
      : loaded?.source.kind === "api"
        ? loaded.source.id
        : "—";
  const simSource = similaritySourceOf(indexed);

  return (
    <div className="pane">
      <div className="pane__head">
        <div>
          <div className="lt-eyebrow">Bundle</div>
          <h2 className="pane__title">{meta.name}</h2>
        </div>
      </div>

      <div className="pane__grid">
        <div className="pane__col">
          <section className="card">
            <h3 className="card__title">Quelle</h3>
            <dl className="deflist">
              <dt>Korpus</dt>
              <dd>{meta.source ?? "—"}</dd>
              <dt>Zeitraum</dt>
              <dd className="lt-mono">
                {first?.label ?? first?.id ?? "—"} – {last?.label ?? last?.id ?? "—"}
              </dd>
              <dt>Facetten</dt>
              <dd className="lt-mono">{bundle.facets_schema.length}</dd>
            </dl>
          </section>

          <section className="card">
            <h3 className="card__title">Parameter</h3>
            <dl className="deflist">
              <dt>Bundle</dt>
              <dd className="lt-mono deflist__clip" title={source}>{source}</dd>
              <dt>Zielwörter</dt>
              <dd className="lt-mono">{bundle.entities.length}</dd>
              <dt>Zeitscheiben</dt>
              <dd className="lt-mono">{sliceCount}</dd>
              <dt>Anker</dt>
              <dd className="lt-mono">{bundle.anchors.length}</dd>
              <dt>Zellen</dt>
              <dd className="lt-mono">
                {bundle.aggregates.length} von {bundle.entities.length * sliceCount}
              </dd>
              {bundle.facets_schema.length > 0 && (
                <>
                  <dt>Facetten-Zellen</dt>
                  <dd className="lt-mono">{bundle.records.length}</dd>
                </>
              )}
              {meta.eig_p != null && (
                <>
                  <dt title="Gewichtung der Zeilenvektoren U·S^p nach der SVD">p (U·Sᵖ)</dt>
                  <dd className="lt-mono">{meta.eig_p}</dd>
                </>
              )}
              <dt title="Anteil der Varianz der vollen Vektoren, den die 3D-Ansicht abbildet">
                Erklärte Varianz (3D)
              </dt>
              <dd className="lt-mono">
                {meta.explained_variance_ratio_3d != null
                  ? `${(meta.explained_variance_ratio_3d * 100).toFixed(1)} %`
                  : "—"}
              </dd>
            </dl>
            <p className="card__note">
              Zellen = Kombinationen aus Zielwort und Zeitscheibe, für die das Bundle
              einen Vektor liefert ({bundle.entities.length} Wörter × {sliceCount}{" "}
              Scheiben möglich; leer, wo das Wort im Korpus nicht vorkommt).
              {bundle.facets_schema.length > 0 &&
                " Facetten-Zellen schlüsseln dieselben Zellen zusätzlich nach Facettenwert auf."}
            </p>
          </section>

          <section className="card">
            <h3 className="card__title">Projektion</h3>
            <dl className="deflist">
              <dt>Verfahren</dt>
              <dd>{meta.projection ?? "—"}</dd>
              <dt>Vektordimension</dt>
              <dd className="lt-mono">{meta.vector_dim ?? "?"} (nach SVD)</dd>
              <dt>Zäsur</dt>
              <dd className="lt-mono">{meta.shift_point ?? "keine"}</dd>
              <dt>Ähnlichkeiten berechnet auf</dt>
              <dd>
                {simSource === "vector" ? (
                  <>volle Vektoren ({meta.vector_dim ?? "?"} Dim.), nicht der 3D-Ansicht</>
                ) : (
                  <span className="warnnote">
                    <Icon name="info" size={12} />
                    3D-Koordinaten — Rückfall, das Bundle liefert keine vollen Vektoren
                  </span>
                )}
              </dd>
            </dl>
          </section>

          {bundle.facets_schema.length > 0 && (
            <section className="card">
              <h3 className="card__title">Facetten</h3>
              {bundle.facets_schema.map((f) => (
                <div key={f.id} className="facetrow">
                  <div className="facetrow__head">
                    <span>{f.label ?? f.id}</span>
                    <span className="section__badge lt-mono">{f.values.length}</span>
                  </div>
                  <div className="facetrow__values">
                    {f.values.map((v) => (
                      <span key={v.id} className="facetrow__chip">
                        {v.label ?? v.id}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>

        <div className="pane__col">
          <section className="card">
            <h3 className="card__title">Zielwörter</h3>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Wort</th>
                  <th>Kategorie</th>
                  <th className="tbl__num">Belegung</th>
                </tr>
              </thead>
              <tbody>
                {indexed.tracks.map((t, i) => {
                  const filled = t.samples.reduce((n, s) => n + (s && s.freq > 0 ? 1 : 0), 0);
                  return (
                    <tr key={t.entity.id}>
                      <td>
                        <span className="tbl__word">
                          <span className="swatch" style={{ background: entityColor(i, mode) }} />
                          <span title={t.entity.note ?? ""}>{t.entity.label ?? t.entity.id}</span>
                        </span>
                      </td>
                      <td className="tbl__muted">{t.entity.category ?? "—"}</td>
                      <td className="tbl__num">
                        <Coverage filled={filled} total={sliceCount} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="card__note">
              Belegung = Zeitscheiben mit <code>freq &gt; 0</code>. Leere Zellen werden
              überall konsequent ausgespart: Trajektorien setzen aus, Matrixfelder
              bleiben schraffiert. Ein Wort mit geringer Belegung ist keine schwache
              Visualisierung, sondern ein dünner Korpus.
            </p>
          </section>

          <section className="card">
            <h3 className="card__title">Weiter zu</h3>
            <div className="jump">
              <button type="button" className="jump__btn" onClick={() => setActiveId("wortraum")}>
                <Icon name="orbit" size={15} />
                <span>
                  <strong>Wortraum</strong>
                  <em>Trajektorien im 3D-Vektorraum über die Zeit</em>
                </span>
              </button>
              <button type="button" className="jump__btn" onClick={() => setActiveId("matrizen")}>
                <Icon name="matrix" size={15} />
                <span>
                  <strong>Ähnlichkeitsmatrizen</strong>
                  <em>T×T-Selbstähnlichkeit je Zielwort (Kiyama)</em>
                </span>
              </button>
              <button type="button" className="jump__btn" onClick={() => setActiveId("drift")}>
                <Icon name="trend" size={15} />
                <span>
                  <strong>Drift-Kurven</strong>
                  <em>Abstand zu einem Bezugszeitpunkt über die Zeit</em>
                </span>
              </button>
              <button type="button" className="jump__btn" onClick={() => setActiveId("paare")}>
                <Icon name="compare" size={15} />
                <span>
                  <strong>Wort gegen Wort</strong>
                  <em>Annäherung und Divergenz zweier Zielwörter</em>
                </span>
              </button>
              <button type="button" className="jump__btn" onClick={() => setActiveId("nachbarn")}>
                <Icon name="flow" size={15} />
                <span>
                  <strong>Nachbarschafts-Fluss</strong>
                  <em>Die k nächsten Nachbarn je Zeitscheibe als Bump-Diagramm</em>
                </span>
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
