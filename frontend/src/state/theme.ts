/**
 * Expliziter Hell/Dunkel-Umschalter (LexoTerm-Design: `data-theme` auf `:root`,
 * NICHT `prefers-color-scheme`). Erstwert = Systemvorliebe, danach merkt sich der
 * Store die Wahl in localStorage. Das gesetzte Attribut steuert sowohl die
 * CSS-Tokens (tokens.css) als auch — über `useMode()` — die 3D-Farben (theme.ts).
 */
import { create } from "zustand";
import type { Mode } from "../viz/theme";

const STORAGE_KEY = "vsv-theme";

function initialMode(): Mode {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Setzt das `data-theme`-Attribut; einzige Stelle, die den DOM anfasst. */
function apply(mode: Mode) {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", mode);
  }
}

interface ThemeState {
  mode: Mode;
  toggle: () => void;
  setMode: (m: Mode) => void;
}

export const useTheme = create<ThemeState>((set, get) => {
  const mode = initialMode();
  apply(mode);
  return {
    mode,
    toggle: () => get().setMode(get().mode === "dark" ? "light" : "dark"),
    setMode: (m) => {
      apply(m);
      if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, m);
      set({ mode: m });
    },
  };
});
