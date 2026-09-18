/** Liefert den aktuellen Farbmodus (light/dark) aus dem Theme-Store (expliziter
 * Umschalter, siehe state/theme.ts). Ersetzt die frühere prefers-color-scheme-
 * Ableitung, damit der Nutzer den Modus über den Header-Schalter selbst wählt. */
import { useTheme } from "../state/theme";
import type { Mode } from "./theme";

export function useMode(): Mode {
  return useTheme((s) => s.mode);
}
