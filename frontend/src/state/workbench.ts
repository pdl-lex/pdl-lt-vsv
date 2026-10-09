/**
 * Shell-Zustand der Workbench: welches Modul aktiv ist und ob die Modul-Rail
 * angeheftet bleibt. Bewusst getrennt von `state/store.ts` — dort liegen die
 * DATEN (Bundle, Zeit, Auswahl), hier nur die Navigation. Ein Modulwechsel
 * lädt also nie neu und verliert keine Auswahl.
 */
import { create } from "zustand";

const PIN_KEY = "vsv.railPinned";

function initialPinned(): boolean {
  try {
    return localStorage.getItem(PIN_KEY) === "1";
  } catch {
    return false; // z.B. blockierter Storage — dann eben eingeklappt starten
  }
}

interface WorkbenchState {
  /** ID des aktiven Moduls (siehe `modules/registry.tsx`). */
  activeId: string;
  /** Modul vor dem Öffnen der Info-Seite; dorthin führt das Schließen zurück. */
  beforeInfoId: string;
  /** Rail angeheftet (248px, inline) statt eingeklappt (56px, Hover-Flyout). */
  railPinned: boolean;
  setActiveId: (id: string) => void;
  /** Info-Seite öffnen bzw. schließen (zurück zum vorigen Modul). */
  toggleInfo: () => void;
  setRailPinned: (pinned: boolean) => void;
}

export const INFO_ID = "info";

export const useWorkbench = create<WorkbenchState>((set) => ({
  // Start auf der Einführung: erst sagen, was das Werkzeug kann.
  activeId: "einfuehrung",
  beforeInfoId: "einfuehrung",
  railPinned: initialPinned(),
  setActiveId: (id) => set({ activeId: id }),
  toggleInfo: () =>
    set((s) =>
      s.activeId === INFO_ID
        ? { activeId: s.beforeInfoId }
        : { activeId: INFO_ID, beforeInfoId: s.activeId },
    ),
  setRailPinned: (railPinned) => {
    try {
      localStorage.setItem(PIN_KEY, railPinned ? "1" : "0");
    } catch {
      /* Storage nicht verfügbar – Pin gilt dann nur für diese Sitzung. */
    }
    set({ railPinned });
  },
}));
