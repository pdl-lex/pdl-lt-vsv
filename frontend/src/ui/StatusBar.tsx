/**
 * Statuszeile (LexoTerm `grid-area: stat`): Mono-Kennzahlen zum geladenen
 * Datensatz — Quelle, Wort-/Scheibenzahl, Projektion/Dimension, aktuelle Scheibe.
 * Reiner Statusanzeiger, keine Interaktion.
 */
import type { ReactNode } from "react";
import { useViz } from "../state/store";

function Item({ dot, k, v }: { dot?: string; k?: string; v: ReactNode }) {
  return (
    <div className="status__item">
      {dot && <span className="status__dot" style={{ background: dot }} />}
      {k && <span className="status__k">{k}</span>}
      <span className="status__v">{v}</span>
    </div>
  );
}

export function StatusBar() {
  const { indexed, loaded, status, listError } = useViz();
  const sliceT = useViz((s) => s.sliceT);

  if (!indexed) {
    return (
      <footer className="status">
        <Item
          dot={status === "loading" ? "var(--lt-warn)" : "var(--lt-fg-4)"}
          k="Status:"
          v={status === "loading" ? "lädt…" : "kein Datensatz"}
        />
        {listError && <Item dot="var(--lt-warn)" k="Backend:" v={listError} />}
        <span className="status__spacer" />
        <Item v="Vektor-Viz 0.1" />
      </footer>
    );
  }

  const meta = indexed.bundle.meta;
  const source =
    loaded?.source.kind === "file"
      ? `📄 ${loaded.source.filename}`
      : loaded?.source.kind === "api"
        ? loaded.source.id
        : "—";
  const idx = Math.max(0, Math.min(Math.round(sliceT), indexed.sliceCount - 1));
  const slice = indexed.sortedSlices[idx];

  return (
    <footer className="status">
      <Item dot="var(--lt-primary)" k="Quelle:" v={source} />
      <Item k="Wörter:" v={indexed.tracks.length} />
      <Item k="Scheiben:" v={indexed.sliceCount} />
      <Item k="Projektion:" v={meta.projection ?? "—"} />
      <Item k="dim:" v={meta.vector_dim ?? "?"} />
      <span className="status__spacer" />
      <Item k="Scheibe:" v={slice?.label ?? slice?.id ?? "—"} />
    </footer>
  );
}
