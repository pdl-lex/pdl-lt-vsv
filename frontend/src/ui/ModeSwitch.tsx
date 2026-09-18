/**
 * Umschalter Aggregiert ↔ Facettiert ↔ Streuung (specs.md §2: Aggregation ist ein
 * UI-Modus, keine Vorentscheidung). Facetten-Modi sind deaktiviert, wenn das Bundle
 * keine Facetten oder keine `records` mitbringt (dann gibt es nichts aufzulösen).
 */
import { useViz, type ViewMode } from "../state/store";

const MODES: { id: ViewMode; label: string; needsFacets: boolean; hint: string }[] = [
  { id: "aggregat", label: "Aggregiert", needsFacets: false, hint: "Eine Trajektorie je Wort." },
  { id: "facettiert", label: "Facettiert", needsFacets: true, hint: "Eine Linie je Facettenwert." },
  { id: "streuung", label: "Streuung", needsFacets: true, hint: "Facetten-Punktwolke (Unsicherheit)." },
];

export function ModeSwitch() {
  const { indexed, viewMode, setViewMode } = useViz();
  const hasFacets = !!indexed && indexed.primaryFacetId !== null && indexed.bundle.records.length > 0;
  const activeHint = MODES.find((m) => m.id === viewMode)?.hint;

  return (
    <div className="mode">
      <div className="mode__seg" role="group" aria-label="Ansichtsmodus">
        {MODES.map((m) => {
          const disabled = m.needsFacets && !hasFacets;
          return (
            <button
              key={m.id}
              type="button"
              className={`mode__btn ${viewMode === m.id ? "mode__btn--active" : ""}`}
              disabled={disabled}
              title={disabled ? "Bundle hat keine facettierten records" : m.hint}
              onClick={() => setViewMode(m.id)}
            >
              {m.label}
            </button>
          );
        })}
      </div>
      {activeHint && <div className="mode__hint">{activeHint}</div>}
    </div>
  );
}
