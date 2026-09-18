/**
 * Modul „Ähnlichkeitsmatrizen" — die Kiyama-Ansicht (specs.md §7.6).
 *
 * Die 3D-Trajektorie zeigt, WOHIN ein Wort gewandert ist. Sie zeigt schlecht,
 * WIE: ob der Weg ein Bruch war, eine stetige Drift oder eine Rückkehr. Genau
 * das liest man an der T×T-Selbstähnlichkeit ab — deshalb ein eigenes Werkzeug
 * neben der Punktwolke, nicht in ihr.
 *
 * Aufbau: Small Multiples über die ausgewählten Zielwörter (Vergleich zwischen
 * Wörtern ist der Hauptzweck), Klick öffnet eine große Matrix mit Achsen und
 * Zellenauslesung.
 */
import { useMemo, useState } from "react";
import { useViz } from "../state/store";
import { useMode } from "../viz/useMode";
import { Section } from "../ui/Section";
import { TargetWords } from "../ui/Legend";
import { SourceNote } from "../ui/SourceNote";
import { Icon } from "../design/icons";
import {
  buildSimilarityMatrix,
  sharedDomain,
  similaritySourceOf,
  type SimilarityMatrix,
} from "../viz/similarity";
import {
  SimilarityLegend,
  SimilarityMatrixCanvas,
  type HoverCell,
} from "../viz/SimilarityMatrixCanvas";
import { useMatrixOptions, type ScaleMode } from "../state/matrixOptions";

const SMALL = 208; // Kantenlänge einer Small-Multiple-Matrix
const LARGE = 520; // Kantenlänge der Detailmatrix

export function MatrizenConfig() {
  const { indexed } = useViz();
  const { scaleMode, setScaleMode } = useMatrixOptions();
  if (!indexed) return <p className="prose">Erst im Modul „Datenquelle" ein Bundle laden.</p>;

  return (
    <>
      <Section title="Zielwörter" icon="target" badge={indexed.tracks.length}>
        <TargetWords />
      </Section>

      <Section title="Skalierung" icon="layers">
        <div className="mode">
          <div className="mode__seg">
            {(
              [
                ["gemeinsam", "Gemeinsam"],
                ["einzeln", "Je Matrix"],
              ] as [ScaleMode, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`mode__btn ${scaleMode === id ? "mode__btn--active" : ""}`}
                onClick={() => setScaleMode(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mode__hint">
            {scaleMode === "gemeinsam"
              ? "Eine Farbskala über alle gezeigten Wörter — Farben sind zwischen den Matrizen vergleichbar, ein sehr stabiles Wort kann dabei flach wirken."
              : "Jede Matrix spannt ihre eigene Skala aus — die Binnenstruktur wird maximal sichtbar, aber Farben bedeuten von Matrix zu Matrix Verschiedenes."}
          </p>
        </div>
      </Section>

      <Section title="Lesehilfe" icon="info" defaultOpen={false}>
        <dl className="readkey">
          <dt>gleichmäßig dunkel</dt>
          <dd>stabiles Wort — der Gebrauch ändert sich über den ganzen Zeitraum kaum.</dd>
          <dt>zwei scharfe Blöcke</dt>
          <dd>ein abrupter Bruch; die Blockgrenze ist der Zeitpunkt der Verschiebung.</dd>
          <dt>Verlauf von der Diagonale weg</dt>
          <dd>stetige Drift — je weiter zwei Zeitpunkte auseinanderliegen, desto unähnlicher.</dd>
          <dt>wiederkehrende Blöcke</dt>
          <dd>Rückkehr zu einem früheren Gebrauch.</dd>
        </dl>
        <p className="card__note">
          Nach Kiyama et al., „Analyzing Continuous Semantic Shifts with Diachronic
          Word Similarity Matrices".
        </p>
      </Section>
    </>
  );
}

/** Achsen-Beschriftung: so viele Ticks, dass die Labels nicht kollidieren. */
function axisTicks(labels: string[], target = 8): { index: number; label: string }[] {
  const n = labels.length;
  const step = Math.max(1, Math.round(n / target));
  const out: { index: number; label: string }[] = [];
  for (let i = 0; i < n; i += step) out.push({ index: i, label: labels[i] });
  return out;
}

function MatrixCard({
  matrix,
  domain,
  onOpen,
}: {
  matrix: SimilarityMatrix;
  domain: { min: number; max: number };
  onOpen: () => void;
}) {
  const mode = useMode();
  const indexed = useViz((s) => s.indexed)!;
  const [hover, setHover] = useState<HoverCell | null>(null);
  const first = indexed.sortedSlices[0];
  const last = indexed.sortedSlices[indexed.sliceCount - 1];

  return (
    <figure className="simmat">
      <figcaption className="simmat__cap">
        <span className="simmat__word">{matrix.entityLabel}</span>
        <button type="button" className="simmat__open" onClick={onOpen} title="Groß anzeigen">
          <Icon name="search" size={12} />
        </button>
      </figcaption>
      {matrix.presentCount > 1 ? (
        <>
          <SimilarityMatrixCanvas
            matrix={matrix}
            domain={domain}
            mode={mode}
            size={SMALL}
            shiftSliceIndex={indexed.shiftSliceIndex}
            onHover={setHover}
          />
          {/* Beim Hovern wird die Achsenzeile zur Zellenauslesung – bei ~3px
              Zellen ist ein Tooltip am Zeiger unbrauchbar, ein fester Platz
              unter der Matrix dagegen ruhig zu lesen. */}
          <div className="simmat__axis lt-mono">
            {hover ? (
              <>
                <span>
                  {indexed.sortedSlices[hover.i]?.label ?? "—"}
                  <span className="simdetail__vs"> ↔ </span>
                  {indexed.sortedSlices[hover.j]?.label ?? "—"}
                </span>
                <span className={Number.isFinite(hover.value) ? "simmat__val" : "simdetail__val--muted"}>
                  {Number.isFinite(hover.value) ? hover.value.toFixed(3) : "kein Beleg"}
                </span>
              </>
            ) : (
              <>
                <span>{first?.label ?? first?.id}</span>
                <span>{last?.label ?? last?.id}</span>
              </>
            )}
          </div>
        </>
      ) : (
        <div className="simmat__empty" style={{ width: SMALL, height: SMALL }}>
          zu wenig belegte Zeitscheiben
        </div>
      )}
    </figure>
  );
}

function MatrixDetail({
  matrix,
  domain,
  onClose,
}: {
  matrix: SimilarityMatrix;
  domain: { min: number; max: number };
  onClose: () => void;
}) {
  const mode = useMode();
  const indexed = useViz((s) => s.indexed)!;
  const [hover, setHover] = useState<HoverCell | null>(null);

  const labels = indexed.sortedSlices.map((s) => s.label ?? s.id);
  const ticks = axisTicks(labels);
  const cell = LARGE / matrix.n;

  const readout = (() => {
    if (!hover) return null;
    const a = labels[hover.i];
    const b = labels[hover.j];
    if (!Number.isFinite(hover.value)) {
      return { a, b, text: "kein Beleg", muted: true };
    }
    return { a, b, text: hover.value.toFixed(4), muted: false };
  })();

  return (
    <div className="simdetail">
      <div className="simdetail__head">
        <button type="button" className="simdetail__back" onClick={onClose}>
          <Icon name="chevron" size={12} style={{ transform: "rotate(180deg)" }} />
          Alle Matrizen
        </button>
        <h3 className="simdetail__title">{matrix.entityLabel}</h3>
        <span className="simdetail__meta lt-mono">
          {matrix.n} × {matrix.n} · {matrix.presentCount} belegt
        </span>
      </div>

      <div className="simdetail__plot">
        <div className="simdetail__ylab">
          {ticks.map((t) => (
            <span key={t.index} className="simdetail__tick lt-mono" style={{ top: t.index * cell }}>
              {t.label}
            </span>
          ))}
        </div>
        <div>
          <SimilarityMatrixCanvas
            matrix={matrix}
            domain={domain}
            mode={mode}
            size={LARGE}
            shiftSliceIndex={indexed.shiftSliceIndex}
            onHover={setHover}
          />
          <div className="simdetail__xlab" style={{ width: LARGE }}>
            {ticks.map((t) => (
              <span
                key={t.index}
                className="simdetail__tick lt-mono"
                style={{ left: t.index * cell }}
              >
                {t.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="simdetail__readout">
        {readout ? (
          <>
            <span className="lt-mono">{readout.a}</span>
            <span className="simdetail__vs">↔</span>
            <span className="lt-mono">{readout.b}</span>
            <span className={`simdetail__val lt-mono ${readout.muted ? "simdetail__val--muted" : ""}`}>
              {readout.text}
            </span>
          </>
        ) : (
          <span className="simdetail__hint">Über die Matrix fahren, um Zellenwerte abzulesen.</span>
        )}
      </div>
    </div>
  );
}

export function MatrizenMain() {
  const { indexed, status, selectedEntityIds } = useViz();
  const { scaleMode } = useMatrixOptions();
  const mode = useMode();
  const [detailId, setDetailId] = useState<string | null>(null);

  const matrices = useMemo(() => {
    if (!indexed) return [];
    return indexed.tracks
      .filter((t) => selectedEntityIds.has(t.entity.id))
      .map((t) => buildSimilarityMatrix(indexed, t.entity.id))
      .filter((m): m is SimilarityMatrix => m !== null);
  }, [indexed, selectedEntityIds]);

  const shared = useMemo(() => sharedDomain(matrices), [matrices]);

  if (!indexed) {
    return (
      <div className="main__placeholder">
        {status === "loading" ? "Lade Bundle…" : "Wähle links einen Datensatz."}
      </div>
    );
  }

  if (matrices.length === 0) {
    return <div className="main__placeholder">Links mindestens ein Zielwort auswählen.</div>;
  }

  const domainFor = (m: SimilarityMatrix) =>
    scaleMode === "gemeinsam" ? shared : { min: m.min, max: m.max };

  const detail = detailId ? matrices.find((m) => m.entityId === detailId) : undefined;
  const anyMasked = matrices.some((m) => m.presentCount < m.n);
  const source = similaritySourceOf(indexed);

  return (
    <div className="pane">
      <div className="pane__head">
        <div>
          <div className="lt-eyebrow">Diachrone Selbstähnlichkeit</div>
          <h2 className="pane__title">Ähnlichkeitsmatrizen</h2>
          <p className="pane__desc">
            Jede Zelle vergleicht ein Zielwort mit sich selbst zu zwei Zeitpunkten:{" "}
            <code>M[i][j] = cos(v_ti, v_tj)</code>. Das Muster verrät die <em>Art</em>{" "}
            der Verschiebung, nicht nur ihr Ausmaß.
          </p>
        </div>
        {/* In der Detailansicht gilt die Skala genau dieser Matrix; in der
            Übersicht die gemeinsame Spanne (bei „Je Matrix" nur als Orientierung,
            siehe Hinweis unter dem Raster). */}
        <SimilarityLegend
          domain={detail ? domainFor(detail) : shared}
          mode={mode}
          masked={anyMasked}
        />
      </div>

      <SourceNote source={source} />

      {detail ? (
        <MatrixDetail matrix={detail} domain={domainFor(detail)} onClose={() => setDetailId(null)} />
      ) : (
        <>
          <div className="simgrid">
            {matrices.map((m) => (
              <MatrixCard
                key={m.entityId}
                matrix={m}
                domain={domainFor(m)}
                onOpen={() => setDetailId(m.entityId)}
              />
            ))}
          </div>
          {scaleMode === "einzeln" && (
            <p className="card__note">
              Bei „Je Matrix" hat jede Matrix ihre eigene Skala — Farben sind
              zwischen den Matrizen <strong>nicht</strong> vergleichbar. Die
              Legende oben zeigt dann die gemeinsame Spanne nur zur Orientierung.
            </p>
          )}
        </>
      )}
    </div>
  );
}
