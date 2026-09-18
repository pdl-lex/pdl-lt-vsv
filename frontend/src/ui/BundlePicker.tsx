/**
 * Datenquellen-Auswahl: Dropdown der vom Backend angebotenen Bundles UND
 * "Datei öffnen"/Drag-and-Drop für beliebige eigene Schema-JSONs. Beide Wege
 * münden über den Loader in dasselbe validierte Bundle – der Kern der
 * "sehr flexibel, unterschiedliche Datenquellen"-Anforderung.
 */
import { useEffect, useRef, useState } from "react";
import { useViz } from "../state/store";
import { Icon } from "../design/icons";

export function BundlePicker() {
  const { list, listError, loaded, status, loadList, openApiBundle, openFile } = useViz();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const currentApiId = loaded?.source.kind === "api" ? loaded.source.id : "";

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void openFile(file);
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
      <select
        id="bundle-select"
        className="picker__select"
        value={currentApiId}
        disabled={list.length === 0}
        onChange={(e) => e.target.value && void openApiBundle(e.target.value)}
      >
        {list.length === 0 && <option value="">— kein Backend-Bundle —</option>}
        {loaded?.source.kind === "file" && <option value="">📄 {loaded.source.filename}</option>}
        {list.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name} ({b.entities} Wörter, {b.time_slices} Scheiben)
          </option>
        ))}
      </select>

      <button type="button" className="picker__file" onClick={() => fileInput.current?.click()}>
        <Icon name="upload" size={13} />
        Datei öffnen…
      </button>
      <div className="picker__hint">oder JSON hierher ziehen</div>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />

      {status === "loading" && <div className="picker__status">lädt…</div>}
      {listError && <div className="picker__error">Backend: {listError}</div>}
    </div>
  );
}
