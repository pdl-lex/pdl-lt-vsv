/**
 * Ehrlichkeitshinweis zur zweistufigen Dimensionsreduktion im Wortraum: die
 * Kookkurrenzmatrix wird per SVD auf k Dimensionen verdichtet, davon dann per
 * PCA auf die 3 hier sichtbaren. Zwei unterschiedliche Rechnungen mit
 * unterschiedlichen Kennzahlen (Frobenius-Norm-Anteil vs. erklärte Varianz) —
 * s. Memory neighbors-echo-effekt/frontend-caveat-plan für die Herleitung.
 * Standardmäßig eingeklappt: Inhalt ist statisch (ändert sich nicht mit Wort
 * oder Zeitscheibe), einmal lesen reicht.
 */
import { useState } from "react";
import { useViz } from "../state/store";
import { Icon } from "../design/icons";
import { InfoTooltip } from "./InfoTooltip";

const DIMENSIONSREDUKTION_INFO =
  "Die 3D-Ansicht ist eine zweistufige Verdichtung (SVD → PCA) aus dem " +
  "vollen Vektorraum. Nähe im Bild ist kein Beweis für Ähnlichkeit im vollen " +
  "Raum — für Details anklicken.";

export function ProjectionNote() {
  const { indexed } = useViz();
  const [open, setOpen] = useState(false);
  if (!indexed) return null;

  const {
    explained_variance_ratio_3d: evr3d,
    explained_variance_ratio_3d_vocab: evr3dVocab,
    explained_frobenius_ratio_k: frobK,
    vector_dim: vectorDim,
  } = indexed.bundle.meta;

  return (
    <div className="nn">
      <div className="pn__head">
        <button type="button" className="pn__toggle" onClick={() => setOpen((v) => !v)}>
          <Icon name={open ? "chevDown" : "chevron"} size={11} />
          <span className="lt-eyebrow">Dimensionsreduktion</span>
        </button>
        <InfoTooltip text={DIMENSIONSREDUKTION_INFO} />
      </div>
      {open && (
        <div className="pn__detail">
          <p className="pn__note">
            Es werden zwei Verdichtungsschritte nacheinander ausgeführt: zuerst wird die Kookkurrenzmatrix
            per SVD auf {vectorDim ?? "k"} Dimensionen reduziert
            {typeof frobK === "number" && (
              <>
                {" "}(erklärt <strong>{(frobK * 100).toFixed(0)}%</strong> der Frobenius-Norm der Matrix)
              </>
            )}
            , danach werden diese {vectorDim ?? "k"} Dimensionen per PCA auf die 3 hier sichtbaren reduziert
            {typeof evr3d === "number" && (
              <>
                {" "}(erklärt <strong>{(evr3d * 100).toFixed(0)}%</strong> der Varianz)
              </>
            )}
            .
          </p>
          {typeof evr3dVocab === "number" && (
            <p className="pn__note">
              Dieser Wert gilt für die Zielwörter und Anker, an denen die Projektion ausgerichtet wurde.
              Die übrige Wortwolke (Umgebungs-Regler) wurde nur nachträglich in dieselben Achsen
              hineingerechnet und ist dort schlechter abgebildet: <strong>{(evr3dVocab * 100).toFixed(0)}%</strong>.
              Für Wörter aus dieser Wolke ist Nähe im Bild also noch schwächerer Hinweis als für die beschrifteten Punkte.
            </p>
          )}
          <p className="pn__note">
            Die dreidimensionale Darstellung ist damit nicht falsch, sie ist unterkomplex. Es kann Ähnlichkeitsunterschiede zwischen Wörtern geben, die in dieser Projektion nicht sichtbar sind, weil sie nur in höheren Dimensionen existieren.
            Zwei Wörter können in der Visualisierung nahe beieinanderliegen, ohne im vollen Raum ähnlich zu sein — und umgekehrt.
          </p>
          <p className="pn__note">
            Verlässlicher für konkrete Vergleiche: Panel „Nächste Nachbarn“, Ähnlichkeitsmatrizen und
            Drift-Kurven, die auf dem volldimensionalen Vektor berechnet werden.
          </p>
        </div>
      )}
    </div>
  );
}
