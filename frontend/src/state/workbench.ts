/**
 * Shell-Zustand der Workbench: welches Modul aktiv ist und ob die Modul-Rail
 * angeheftet bleibt. Bewusst getrennt von `state/store.ts` — dort liegen die
 * DATEN (Bundle, Zeit, Auswahl), hier nur die Navigation. Ein Modulwechsel
 * lädt also nie neu und verliert keine Auswahl.
 */
import { create } from "zustand";

const PIN_KEY = "vectorviz.railPinned";

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
  /** Rail angeheftet (248px, inline) statt eingeklappt (56px, Hover-Flyout). */
  railPinned: boolean;
  setActiveId: (id: string) => void;
  setRailPinned: (pinned: boolean) => void;
}

export const useWorkbench = create<WorkbenchState>((set) => ({
  activeId: "wortraum",
  railPinned: initialPinned(),
  setActiveId: (id) => set({ activeId: id }),
  setRailPinned: (railPinned) => {
    try {
      localStorage.setItem(PIN_KEY, railPinned ? "1" : "0");
    } catch {
      /* Storage nicht verfügbar – Pin gilt dann nur für diese Sitzung. */
    }
    set({ railPinned });
  },
}));
