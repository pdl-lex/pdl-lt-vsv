/**
 * Ehrlichkeitshinweis für alle Ähnlichkeitsansichten: rechnet das Bundle auf
 * vollen Vektoren oder — mangels `vector` — auf den 3D-Projektionskoordinaten?
 *
 * Der Rückfall ist zulässig (sonst zeigten solche Bundles gar nichts), aber die
 * Werte sind dann systematisch verzerrt, weil die Projektion Varianz verliert.
 * Deshalb steht der Hinweis über der Grafik und nicht im Kleingedruckten.
 */
import { Icon } from "../design/icons";
import type { SimilaritySource } from "../viz/similarity";

export function SourceNote({ source }: { source: SimilaritySource }) {
  if (source === "vector") return null;
  return (
    <p className="warnnote warnnote--block">
      <Icon name="info" size={13} />
      Dieses Bundle liefert keine vollen Vektoren — gerechnet wird auf den
      3D-Projektionskoordinaten. Die Werte sind dadurch systematisch verzerrt.
    </p>
  );
}
