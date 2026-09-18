/**
 * Faceted-Search-Panel: Multi-Select je Facette, aktive Filter als Chips,
 * UND-Verknüpfung über Facetten (specs.md §2). Für die Primär-Facette tragen die
 * Werte den Farb-Swatch, der sie mit den Linien im Facettiert-Modus verknüpft.
 * Ohne eigene Überschrift – die Konfigurator-Sektion liefert Titel + Badge.
 */
import { useViz } from "../state/store";
import { useMode } from "../viz/useMode";
import { facetColor } from "../viz/theme";

export function FacetFilter() {
  const { indexed, facetFilters, toggleFacetValue, clearFacet, clearAllFacets } = useViz();
  const mode = useMode();
  if (!indexed) return null;

  const facets = indexed.bundle.facets_schema;
  if (facets.length === 0) return null;

  const activeCount = Object.values(facetFilters).reduce((n, s) => n + (s?.size ?? 0), 0);
  const valueLabel = (facetId: string, valueId: string) =>
    facets.find((f) => f.id === facetId)?.values.find((v) => v.id === valueId)?.label ?? valueId;

  return (
    <div className="facets">
      {activeCount > 0 && (
        <div className="facets__active">
          <div className="facets__chips">
            {Object.entries(facetFilters).flatMap(([facetId, set]) =>
              [...(set ?? [])].map((valueId) => (
                <button
                  key={`${facetId}:${valueId}`}
                  type="button"
                  className="chip chip--on"
                  onClick={() => toggleFacetValue(facetId, valueId)}
                  title="Filter entfernen"
                >
                  {valueLabel(facetId, valueId)} <span className="chip__x">×</span>
                </button>
              )),
            )}
          </div>
          <button type="button" className="facets__clear" onClick={clearAllFacets}>
            zurücksetzen
          </button>
        </div>
      )}

      {facets.map((facet) => {
        const isPrimary = facet.id === indexed.primaryFacetId;
        const selected = facetFilters[facet.id];
        return (
          <section key={facet.id} className="facets__facet">
            <div className="facets__facetlabel">
              <span>{facet.label ?? facet.id}</span>
              {selected && selected.size > 0 && (
                <button type="button" className="facets__mini" onClick={() => clearFacet(facet.id)}>
                  alle
                </button>
              )}
            </div>
            <div className="facets__values">
              {facet.values.map((v) => {
                const on = selected?.has(v.id) ?? false;
                const vi = isPrimary ? indexed.primaryValueIndex.get(v.id) ?? 0 : -1;
                return (
                  <button
                    key={v.id}
                    type="button"
                    className={`facets__value ${on ? "facets__value--on" : ""}`}
                    onClick={() => toggleFacetValue(facet.id, v.id)}
                  >
                    {isPrimary && <span className="swatch swatch--xs" style={{ background: facetColor(vi, mode) }} />}
                    {v.label ?? v.id}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
