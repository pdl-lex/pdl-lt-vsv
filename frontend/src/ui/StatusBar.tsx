/**
 * Statuszeile (LexoTerm `grid-area: stat`): Mono-Kennzahlen zum geladenen
 * Datensatz — Quelle, Wort-/Scheibenzahl, Verfahren/Dimension, aktuelle Scheibe —
 * und rechtsbündig die App-Version.
 * Reiner Statusanzeiger, keine Interaktion.
 */
import type { ReactNode } from "react";
import { useViz, useVizPick } from "../state/store";

/** Von Hand gepflegt, erscheint rechts in der Statuszeile. */
const APP_VERSION = "0.2";

function Item({ dot, k, v, title }: { dot?: string; k?: string; v: ReactNode; title?: string }) {
  return (
    <div className="status__item" title={title}>
      {dot && <span className="status__dot" style={{ background: dot }} />}
      {k && <span className="status__k">{k}</span>}
      <span className="status__v">{v}</span>
    </div>
  );
}

export function StatusBar() {
  const { indexed, loaded, status, listError } = useVizPick("indexed", "loaded", "status", "listError");
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
        <Item k="Version:" v={APP_VERSION} />
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
      <Item
        k="Projektion:"
        v={meta.method ?? meta.projection ?? "—"}
        title={meta.projection}
      />
      <Item k="dim:" v={meta.vector_dim ?? "?"} />
      <Item k="Scheibe:" v={slice?.label ?? slice?.id ?? "—"} />
      <span className="status__spacer" />
      <Item k="Version:" v={APP_VERSION} />
    </footer>
  );
}
