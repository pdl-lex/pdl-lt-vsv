/**
 * Datenquellen-Auswahl, zwei Wege: ein fertiges Bundle des Backends wählen ODER
 * ein eigenes Bundle hochladen (Dateiauswahl oder Drag-and-Drop). Beide Wege
 * münden über den Loader in dasselbe validierte Bundle – der Kern der
 * "sehr flexibel, unterschiedliche Datenquellen"-Anforderung.
 *
 * "Hochladen" heißt hier: Die JSON wird nur im Browser geöffnet. Nachbarabfragen
 * mit eigenen Filtern gibt es deshalb nur für die fertigen Bundles.
 */
import { useRef, useState } from "react";
import { useViz } from "../state/store";
import { Icon } from "../design/icons";

export function BundlePicker() {
  const { list, listError, loaded, status, openApiBundle, openFiles } = useViz();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const currentApiId = loaded?.source.kind === "api" ? loaded.source.id : "";

  const handleFiles = (files: FileList | null) => {
    if (files && files.length > 0) void openFiles(Array.from(files));
  };

  return (
    <div
      className={`picker ${dragging ? "picker--drag" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <label className="picker__label" htmlFor="bundle-select">
        Fertiges Bundle wählen
      </label>
      <select
        id="bundle-select"
        className="picker__select"
        value={currentApiId}
        disabled={list.length === 0}
        onChange={(e) => e.target.value && void openApiBundle(e.target.value)}
      >
        {list.length === 0 && <option value="">— kein Backend-Bundle —</option>}
        {list.length > 0 && !currentApiId && <option value="">— Bundle wählen —</option>}
        {list.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name} ({b.entities} Wörter, {b.time_slices} Scheiben)
          </option>
        ))}
      </select>

      <div className="picker__or">oder</div>

      <button type="button" className="picker__file" onClick={() => fileInput.current?.click()}>
        <Icon name="upload" size={13} />
        Eigenes Bundle hochladen…
      </button>
      <div className="picker__hint">
        Bundle-JSON wählen oder hierher ziehen. Es wird nur im Browser geöffnet; die
        Nachbar-Filter gelten dann nur mit den Voreinstellungen.
      </div>
      {loaded?.source.kind === "file" && (
        <div className="picker__current">
          Geöffnet: <span className="lt-mono">{loaded.source.filename}</span>
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        // .npy/.parquet dürfen mit ausgewählt werden; geöffnet wird nur die JSON.
        accept=".json,application/json,.npy,.parquet"
        multiple
        hidden
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = ""; // dieselbe Datei erneut wählbar
        }}
      />

      {status === "loading" && <div className="picker__status">lädt…</div>}
      {listError && <div className="picker__error">Backend: {listError}</div>}
    </div>
  );
}
