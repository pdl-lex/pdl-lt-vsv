/**
 * Was hinter einer Überlappungszahl steckt: für ein Zielwort und zwei
 * Zeitscheiben die gemeinsamen, weggefallenen und hinzugekommenen Nachbarn
 * (`neighborDiff`). Das ist der Teil von Gonen et al., den der Kosinus nicht
 * bietet — eine Zahl, deren Zustandekommen man nachlesen kann.
 */
import { useMemo } from "react";
import { useViz } from "../state/store";
import { neighborDiff, type DiffEntry, type NeighborDiff } from "../viz/overlap";

function Column({
  title,
  entries,
  rank,
  tone,
}: {
  title: string;
  entries: DiffEntry[];
  rank: (e: DiffEntry) => string;
  tone: "shared" | "lost" | "gained";
}) {
  return (
    <div className={`ndiff__col ndiff__col--${tone}`}>
      <div className="ndiff__head">
        <span>{title}</span>
        <span className="section__badge lt-mono">{entries.length}</span>
      </div>
      <ol className="ndiff__list">
        {entries.map((e) => (
          <li key={e.label}>
            <span className="ndiff__word">{e.label}</span>
            <span className="ndiff__rank lt-mono">{rank(e)}</span>
          </li>
        ))}
        {entries.length === 0 && <li className="ndiff__empty">—</li>}
      </ol>
    </div>
  );
}

/** Drei Spalten „nur A / gemeinsam / nur B" mit Kopfzeile — geteilt von der
 * Matrix-Zelle und dem Wandel-Ranking. */
export function DiffView({
  diff,
  labelA,
  labelB,
  title,
}: {
  diff: NeighborDiff;
  labelA: string;
  labelB: string;
  title?: string;
}) {
  const denom = Math.min(diff.shared.length + diff.onlyA.length, diff.shared.length + diff.onlyB.length);
  return (
    <section className="card ndiff">
      <h3 className="card__title">
        {title ?? "Nachbarn"} <span className="lt-mono">{labelA}</span> ↔{" "}
        <span className="lt-mono">{labelB}</span>
        <span className="ndiff__sum lt-mono">
          {diff.shared.length} von {denom} gemeinsam (k = {diff.k})
        </span>
      </h3>
      <div className="ndiff__grid">
        <Column title={`nur ${labelA}`} tone="lost" entries={diff.onlyA} rank={(e) => `#${e.rankA}`} />
        <Column
          title="gemeinsam"
          tone="shared"
          entries={diff.shared}
          rank={(e) => `#${e.rankA} → #${e.rankB}`}
        />
        <Column title={`nur ${labelB}`} tone="gained" entries={diff.onlyB} rank={(e) => `#${e.rankB}`} />
      </div>
      <p className="card__note">
        Ränge in der jeweiligen Nachbarliste. Gemeinsame Nachbarn nach mittlerem Rang
        sortiert, die übrigen nach ihrem Rang.
      </p>
    </section>
  );
}

export function NeighborDiffPanel({
  entityId,
  i,
  j,
  k,
}: {
  entityId: string;
  i: number;
  j: number;
  k: number;
}) {
  const indexed = useViz((s) => s.indexed)!;
  const diff = useMemo(() => neighborDiff(indexed, entityId, i, j, k), [indexed, entityId, i, j, k]);
  const la = indexed.sortedSlices[i]?.label ?? indexed.sortedSlices[i]?.id ?? "—";
  const lb = indexed.sortedSlices[j]?.label ?? indexed.sortedSlices[j]?.id ?? "—";

  if (!diff) {
    return <p className="card__note">Mindestens eine der beiden Zeitscheiben ist nicht belegt.</p>;
  }
  return <DiffView diff={diff} labelA={la} labelB={lb} />;
}
