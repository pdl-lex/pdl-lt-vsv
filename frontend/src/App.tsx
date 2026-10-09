/**
 * App-Shell im LexoTerm-Workbench-Layout (CSS-Grid): Kopfzeile · Modul-Rail ·
 * Konfigurator-Spalte · Hauptbereich · optionale Fußzeile · Statuszeile.
 *
 * Die Shell kennt **kein** einzelnes Werkzeug: sie holt sich Kopf, Konfigurator,
 * Hauptbereich und Fußzeile aus der Modul-Registry. Alles Domänenspezifische
 * kommt weiterhin aus dem geladenen Bundle, alles Werkzeugspezifische aus
 * `modules/`.
 */
import { useEffect } from "react";
import { useVizPick } from "./state/store";
import { useWorkbench } from "./state/workbench";
import { moduleById } from "./modules/registry";
import { Header } from "./ui/Header";
import { Rail } from "./ui/Rail";
import { StatusBar } from "./ui/StatusBar";

export default function App() {
  const { error, loadList } = useVizPick("error", "loadList");
  const activeId = useWorkbench((s) => s.activeId);
  const railPinned = useWorkbench((s) => s.railPinned);
  const mod = moduleById(activeId);

  // Bundle-Liste beim Start holen (öffnet das erste Bundle), unabhängig davon,
  // auf welcher Seite die App startet.
  useEffect(() => {
    void loadList();
  }, [loadList]);

  return (
    <div
      className={`app ${railPinned ? "app--railpinned" : ""} ${mod.Footer ? "app--footer" : ""} ${
        mod.Config ? "" : "app--nocfg"
      }`}
    >
      <Header />
      <Rail />

      {mod.Config && (
        <aside className="cfg">
          <div className="cfg__module">
            <div className="lt-eyebrow">{mod.eyebrow}</div>
            <div className="cfg__moduletitle">
              <h1>{mod.title}</h1>
            </div>
            {mod.description && <p className="cfg__moduledesc">{mod.description}</p>}
          </div>

          <div className="cfg__scroll">
            <mod.Config />
          </div>
        </aside>
      )}

      <main className="main">
        <mod.Main />

        {error && (
          <div className="main__error" role="alert">
            <strong>Bundle konnte nicht geladen werden</strong>
            <pre>{error}</pre>
          </div>
        )}
      </main>

      {mod.Footer && (
        <footer className="foot">
          <mod.Footer />
        </footer>
      )}

      <StatusBar />
    </div>
  );
}
