/**
 * Vollständige Nachbarliste des aktiven Zielworts in einem Modal, mit CSV-Export
 * für die aktuelle Zeitscheibe oder alle Zeitscheiben. Die Overlay-Karte zeigt
 * nur die ersten k (Regler „Nachbarn“); hier steht die ganze Liste, die das
 * Bundle bzw. die Backend-Abfrage liefert — mit denselben Filtern.
 */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { IndexedBundle } from "../data/model";
import { neighborsAt } from "../data/model";
import { useNeighborSourceText } from "./NeighborFilterNote";

function csvCell(v: string | number | undefined | null): string {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Langformat: eine Zeile je (Zeitscheibe, Rang). */
export function neighborCsv(idx: IndexedBundle, entityId: string, sliceIndices: number[]): string {
  const rows = [["zielwort", "zeitscheibe", "rang", "nachbar", "lemma", "gruppe", "score"].join(",")];
  for (const si of sliceIndices) {
    const slice = idx.sortedSlices[si];
    neighborsAt(idx, entityId, si).forEach((n, i) => {
      rows.push(
        [entityId, slice?.id, i + 1, n.label, n.lemma, n.group, n.score]
          .map(csvCell)
          .join(","),
      );
    });
  }
  return rows.join("\n") + "\n";
}

function download(text: string, filename: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const safe = (s: string) => s.replace(/[^\p{L}\p{N}_-]+/gu, "_");

export function NeighborModal({
  idx,
  entityId,
  sliceIndex,
  onClose,
}: {
  idx: IndexedBundle;
  entityId: string;
  sliceIndex: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { text: filterText } = useNeighborSourceText();

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const entity = idx.tracks.find((t) => t.entity.id === entityId)?.entity;
  const word = entity?.label ?? entityId;
  const slice = idx.sortedSlices[sliceIndex];
  const sliceLabel = slice?.label ?? slice?.id ?? "";
  const list = neighborsAt(idx, entityId, sliceIndex);
  const bundleName = safe(idx.bundle.meta.name ?? "bundle");

  const exportSlice = () =>
    download(
      neighborCsv(idx, entityId, [sliceIndex]),
      `nachbarn_${bundleName}_${safe(entityId)}_${safe(slice?.id ?? "")}.csv`,
    );
  const exportAll = () =>
    download(
      neighborCsv(idx, entityId, idx.sortedSlices.map((_, i) => i)),
      `nachbarn_${bundleName}_${safe(entityId)}_alle.csv`,
    );

  return createPortal(
    <dialog
      ref={ref}
      className="modal"
      onClose={onClose}
      onClick={(e) => {
        // Klick auf den Hintergrund (das <dialog> selbst, nicht sein Inhalt) schließt.
        if (e.target === e.currentTarget) ref.current?.close();
      }}
    >
      <div className="modal__body">
        <div className="modal__head">
          <div>
            <div className="lt-eyebrow">Nächste Nachbarn</div>
            <h2 className="modal__title">
              {word} <span className="modal__sub lt-mono">{sliceLabel}</span>
            </h2>
            <div className="modal__meta">{list.length} Einträge · {filterText}</div>
          </div>
          <button type="button" className="modal__close" onClick={() => ref.current?.close()} aria-label="Schließen">
            ×
          </button>
        </div>
        <div className="modal__scroll">
          {list.length === 0 ? (
            <p className="nn__empty">Keine Nachbarn für diese Zeitscheibe.</p>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th className="tbl__num">#</th>
                  <th>Wort</th>
                  <th>Gruppe</th>
                  <th className="tbl__num">Kosinus</th>
                </tr>
              </thead>
              <tbody>
                {list.map((n, i) => (
                  <tr key={`${n.label}-${i}`}>
                    <td className="tbl__num lt-mono">{i + 1}</td>
                    <td>{n.label}</td>
                    <td className="tbl__muted">{n.group ?? "—"}</td>
                    <td className="tbl__num lt-mono">{typeof n.score === "number" ? n.score.toFixed(3) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="modal__foot">
          <span className="modal__meta">CSV-Export:</span>
          <button type="button" className="nf-btn" onClick={exportSlice} disabled={list.length === 0}>
            diese Zeitscheibe
          </button>
          <button type="button" className="nf-btn" onClick={exportAll}>
            alle Zeitscheiben
          </button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
