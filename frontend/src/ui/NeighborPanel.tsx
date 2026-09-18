/**
 * Nearest-Neighbour-Panel des aktiven Zielworts an der aktuellen Zeitscheibe.
 * Schwebt als Karte über dem 3D-Explorer und ergänzt das Overlay um score/group
 * als lesbare Liste. Beim Scrubben aktualisiert es sich mit dem gerundeten
 * Slider-Wert (NN sind pro diskreter Scheibe vorberechnet).
 */
import { useViz } from "../state/store";
import { useMode } from "../viz/useMode";
import { entityFreqAt, neighborsAt, pointForLabel } from "../data/model";
import { clusterColor } from "../viz/theme";
import { Icon } from "../design/icons";
import { GENERIK_SCHRANKE, istGenerisch } from "../viz/resolution";
import { InfoTooltip } from "./InfoTooltip";

// Bewusst ohne Angabe des Auswahlverfahrens: das legt der Lieferant fest, und
// die beiden Bundles dieses Projekts machen es verschieden. Der PPMI-Pfad wählt
// per Kosinus-Kontrast (unterdrückt Wörter, die allem ähnlich sind), der
// SGNS-Pfad bewusst per rohem Kosinus — dort richtet die Kontrast-Auswahl
// Schaden an, weil sie bei unaufgelösten Zellen die UNähnlichsten Wörter nach
// vorn holt. Ein Text, der eines von beidem behauptet, ist für das andere
// Bundle schlicht falsch.
const NACHBARN_INFO =
  "Die nächsten Wörter zu diesem Wort im vollen Vektorraum (alle Dimensionen, " +
  "nicht nur die 3 sichtbaren), je Zeitscheibe vorberechnet. Angezeigt wird der " +
  "rohe Kosinus. Wie der Lieferant die Liste auswählt, steht in meta.projection " +
  "des Bundles — die Reihenfolge ist seine, das Tool sortiert nicht um. " +
  "Wie viele Einträge zu sehen sind, stellt der Regler „Nachbarn“ ein; dieselbe " +
  "Auswahl liegt als beschriftete Punkte im 3D-Bild. Dass die dort verstreut " +
  "liegen statt beieinander, ist die Projektionsverzerrung, nicht ein Fehler " +
  "der Liste (s. „Warum nur 3 Dimensionen?“).";

const GENERIK_WARNUNG =
  "Der Vektor dieser Zelle liegt im generischen Bereich: er ist dem Vokabular " +
  "im Durchschnitt so ähnlich, dass 'am nächsten' kaum noch etwas auszeichnet. " +
  "Die Liste ist dann nicht die Nachbarschaft dieses Wortes, sondern im " +
  "Wesentlichen die allgemeine Wortmitte.";

export function NeighborPanel() {
  const { indexed, activeEntityId, sliceT, neighborK } = useViz();
  const mode = useMode();
  if (!indexed || !activeEntityId) return null;

  const sliceIndex = Math.max(0, Math.min(Math.round(sliceT), indexed.sliceCount - 1));
  const slice = indexed.sortedSlices[sliceIndex];
  const present = entityFreqAt(indexed, activeEntityId, sliceIndex) > 0;
  // Die Bundles liefern inzwischen lange Listen (150 statt 8). Sichtbar ist,
  // was der k-Regler freigibt — sonst würde die Karte das Overlay sprengen.
  const alle = present ? neighborsAt(indexed, activeEntityId, sliceIndex) : [];
  const neighbors = alle.slice(0, neighborK);
  const track = indexed.tracks.find((t) => t.entity.id === activeEntityId);
  const entity = track?.entity;

  // Gütemaß der Zelle, die diese Liste erzeugt hat. Fehlt es (PPMI-Bundle,
  // Demo, Fremdlieferant), wird nichts gewarnt.
  const generik = track?.samples[sliceIndex]?.generik ?? null;
  const generisch = istGenerisch(generik);

  const clusterIndex = new Map(indexed.clusters.map((c, i) => [c, i]));

  return (
    <div className="nn">
      <div className="nn__head">
        <span className="lt-eyebrow">Nachbarn</span>
        <strong className="nn__word">{entity?.label ?? activeEntityId}</strong>
        <InfoTooltip text={NACHBARN_INFO} />
      </div>
      <div className="nn__slice lt-mono">{slice?.label ?? slice?.id}</div>
      {!present ? (
        <p className="nn__empty">Wort zu dieser Zeit nicht im Korpus belegt (freq 0).</p>
      ) : neighbors.length === 0 ? (
        <p className="nn__empty">Keine vorberechneten Nachbarn für diese Scheibe.</p>
      ) : (
        <>
          {generisch && (
            <p className="warnnote">
              <Icon name="info" size={13} />
              <span>
                Diese Liste ist nicht interpretierbar — der Vektor ist allem ungefähr gleich ähnlich
                (generik {generik?.toFixed(2)}, Schranke {GENERIK_SCHRANKE.toFixed(2)}).
                <InfoTooltip text={GENERIK_WARNUNG} />
              </span>
            </p>
          )}
          <div className={neighbors.length > 8 ? "nn__scroll" : undefined}>
          <ol className="nn__list">
          {neighbors.map((n, i) => {
            // Ein Wort ohne Koordinate im Bundle steht in der Liste, ist im Bild
            // aber nicht auffindbar - das sagt die gedämpfte Schrift.
            const matched = !!pointForLabel(indexed, n.label);
            const ci = n.group ? clusterIndex.get(n.group) : undefined;
            return (
              <li key={`${n.label}-${i}`} className="nn__item">
                <span className={`nn__name ${matched ? "" : "nn__name--nomatch"}`}>{n.label}</span>
                {n.group && (
                  <span className="nn__group">
                    <span
                      className="swatch swatch--dot"
                      style={{ background: ci !== undefined ? clusterColor(ci, mode) : "var(--lt-fg-4)" }}
                    />
                    {n.group}
                  </span>
                )}
                {typeof n.score === "number" && <span className="nn__score lt-mono">{n.score.toFixed(2)}</span>}
              </li>
            );
          })}
          </ol>
          </div>
          {alle.length > neighbors.length && (
            <p className="nn__more lt-mono">{neighbors.length} von {alle.length}</p>
          )}
        </>
      )}
    </div>
  );
}
