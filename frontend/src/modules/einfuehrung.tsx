/**
 * Modul „Einführung": Startseite. Sagt in wenigen Sätzen, was das Werkzeug kann,
 * und führt zur Datenquelle. Die Liste der Visualisierungen kommt aus der
 * Registry, damit sie mit der Rail nicht auseinanderläuft.
 */
import { useViz } from "../state/store";
import { useWorkbench } from "../state/workbench";
import { Icon } from "../design/icons";
import { MODULES } from "./registry";

export function EinfuehrungMain() {
  const indexed = useViz((s) => s.indexed);
  const setActiveId = useWorkbench((s) => s.setActiveId);
  const tools = MODULES.filter((m) => m.group === "Visualisierung");

  return (
    <div className="pane">
      <article className="doc">
        <header className="doc__head">
          <div className="lt-eyebrow">Willkommen</div>
          <h2 className="doc__title">Wie verändern Wörter ihre Bedeutung?</h2>
          <p className="doc__lead">
            Dieses Werkzeug zeigt, wie sich der Gebrauch von Wörtern über die Zeit
            verschiebt. Grundlage sind Wortvektoren, die für jeden Zeitabschnitt eines
            Korpus berechnet wurden: Wörter, die in ähnlichen Zusammenhängen vorkommen,
            liegen nah beieinander. Ändert sich das Umfeld eines Worts, wandert es durch
            diesen Raum, und genau diese Bewegung macht das Werkzeug sichtbar.
          </p>
        </header>

        <section className="doc__section">
          <div className="lt-eyebrow">So geht's</div>
          <ol className="doc__steps">
            <li>
              <strong>Daten wählen.</strong> Auf der Seite „Datenquelle" ein fertiges Bundle
              auswählen oder ein eigenes hochladen.
              {indexed && (
                <>
                  {" "}Geladen ist gerade <em>{indexed.bundle.meta.name}</em>.
                </>
              )}
            </li>
            <li>
              <strong>Bei Bedarf einstellen.</strong> Unter „Filter für nächste Nachbarn"
              festlegen, welche Wörter als Nachbarn infrage kommen, unter „Anker", welche
              Wörter im Wortraum als Orientierungspunkte stehen.
            </li>
            <li>
              <strong>Erkunden.</strong> Jede Visualisierung zeigt denselben Datensatz aus
              einem anderen Blickwinkel. Auswahl und Zeitposition bleiben beim Wechsel
              erhalten.
            </li>
          </ol>
          <button type="button" className="doc__cta" onClick={() => setActiveId("daten")}>
            Zur Datenquelle
            <Icon name="arrowRight" size={13} />
          </button>
        </section>

        <section className="doc__section">
          <div className="lt-eyebrow">Die Visualisierungen</div>
          <div className="jump">
            {tools.map((m) => (
              <button key={m.id} type="button" className="jump__btn" onClick={() => setActiveId(m.id)}>
                <Icon name={m.icon} size={15} />
                <span>
                  <strong>{m.title}</strong>
                  <em>{m.description}</em>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="doc__section">
          <div className="lt-eyebrow">Gut zu wissen</div>
          <ul className="doc__list">
            <li>
              Der 3D-Wortraum ist eine Projektion und zeigt nur einen Teil der Struktur.
              Ähnlichkeiten, Drift-Kurven und Rankings rechnen auf den vollständigen
              Vektoren.
            </li>
            <li>
              Lücken bleiben Lücken: Kommt ein Wort in einem Zeitabschnitt nicht vor,
              setzen Linien aus, statt eine Bewegung zu erfinden. Wie gut ein Wort belegt
              ist, zeigt die Seite „Datenquelle".
            </li>
            <li>
              Über das <Icon name="info" size={12} style={{ verticalAlign: "-2px" }} /> unten
              in der Leiste links geht es zu Quellen, Methoden und Impressum.
            </li>
          </ul>
        </section>
      </article>
    </div>
  );
}
