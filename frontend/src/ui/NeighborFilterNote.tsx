/**
 * Kurzanzeige, woher die gezeigten Nachbarn stammen und welche Filter wirken —
 * in jedem Modul, das Nachbarn zeigt (Nachvollziehbarkeit, nextsteps.md §2).
 * Ein Klick führt zur Seite „Nachbar-Filter“, dem einzigen Ort, an dem sich die
 * Filter ändern lassen.
 */
import { useViz } from "../state/store";
import { useWorkbench } from "../state/workbench";
import { filterSummary, shippedStopwords, useNeighborFilters } from "../state/neighborFilters";
import { Icon } from "../design/icons";

/** Text und Ton der Anzeige; getrennt, damit Panel und Seite dieselbe Aussage machen. */
export function useNeighborSourceText(): { text: string; warn: boolean } {
  const { availability, space, spaceStatus, queryStatus, values, stopwords } = useNeighborFilters();
  const source = useViz((s) => s.indexed?.neighborSource);

  if (availability.kind === "unavailable") {
    return {
      text: availability.meta
        ? "vorberechnet mit Voreinstellungen · Filter nur über das Backend"
        : "vorberechnet im Bundle · keine Filter",
      warn: false,
    };
  }
  if (spaceStatus === "error" || queryStatus === "error") {
    return { text: "Abfrage fehlgeschlagen · vorberechnete Nachbarn", warn: true };
  }
  if (source !== "query" || !space) return { text: "gefilterte Nachbarn werden geladen …", warn: false };
  const parts = filterSummary(space.filters, values, stopwords, shippedStopwords(availability));
  return {
    text: `gefiltert: ${parts.join(" · ")}${queryStatus === "loading" ? " · wird aktualisiert …" : ""}`,
    warn: false,
  };
}

export function NeighborFilterNote() {
  const setActiveId = useWorkbench((s) => s.setActiveId);
  const { text, warn } = useNeighborSourceText();
  return (
    <button
      type="button"
      className={`nfnote ${warn ? "nfnote--warn" : ""}`}
      onClick={() => setActiveId("nachbarfilter")}
      title="Filter ändern: Seite „Nachbar-Filter“"
    >
      <Icon name="filter" size={11} />
      <span>{text}</span>
    </button>
  );
}
