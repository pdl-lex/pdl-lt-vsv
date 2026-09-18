/**
 * Modul-Registry — die einzige Stelle, die weiß, welche Werkzeuge es gibt.
 *
 * Sie verbindet Navigation (Rail), Konfigurator-Spalte und Hauptbereich. Ein
 * neues Visualisierungswerkzeug ist damit ein Eintrag in `MODULES` plus eine
 * Datei in `modules/` — kein Eingriff in die Shell. Genau dafür ist die Rail
 * zurückgekommen: das Tool ist kein Einzelwerkzeug mehr.
 *
 * Was NICHT hierher gehört: der Bundle-Zustand. Der liegt global in
 * `state/store.ts`, damit ein Modulwechsel weder neu lädt noch die Auswahl
 * verliert — die Module teilen sich denselben Datensatz.
 */
import type { FC } from "react";
import type { IconName } from "../design/icons";
import { DatenConfig, DatenMain } from "./daten";
import { WortraumConfig, WortraumFooter, WortraumMain } from "./wortraum";
import { MatrizenConfig, MatrizenMain } from "./matrizen";
import { DriftConfig, DriftMain } from "./drift";
import { PaareConfig, PaareMain } from "./paare";
import { NachbarnConfig, NachbarnMain } from "./nachbarn";

export interface ModuleDef {
  id: string;
  /** Kurzname in der Rail. */
  label: string;
  group: string;
  icon: IconName;
  eyebrow: string;
  title: string;
  description: string;
  Config: FC;
  Main: FC;
  /** Optionale Fußzeile über die volle Breite (nur der Wortraum hat eine). */
  Footer?: FC;
}

export const MODULES: ModuleDef[] = [
  {
    id: "daten",
    label: "Datenquelle",
    group: "Daten",
    icon: "database",
    eyebrow: "Daten",
    title: "Datenquelle",
    description:
      "Bundle laden und prüfen: Projektion, Zeitraum, Facetten und die Belegung je Zielwort.",
    Config: DatenConfig,
    Main: DatenMain,
  },
  {
    id: "wortraum",
    label: "Wortraum (3D)",
    group: "Visualisierung",
    icon: "orbit",
    eyebrow: "Visualisierung",
    title: "Wortraum",
    description:
      "Trajektorien durch den gemeinsamen Vektorraum — Anker als Landmarken, Zeit als Achse.",
    Config: WortraumConfig,
    Main: WortraumMain,
    Footer: WortraumFooter,
  },
  {
    id: "matrizen",
    label: "Ähnlichkeitsmatrizen",
    group: "Visualisierung",
    icon: "matrix",
    eyebrow: "Visualisierung",
    title: "Ähnlichkeitsmatrizen",
    description:
      "T×T-Selbstähnlichkeit je Zielwort (Kiyama) — zeigt die Art der Verschiebung, nicht nur ihr Ausmaß.",
    Config: MatrizenConfig,
    Main: MatrizenMain,
  },
  {
    id: "drift",
    label: "Drift-Kurven",
    group: "Visualisierung",
    icon: "trend",
    eyebrow: "Visualisierung",
    title: "Drift-Kurven",
    description:
      "Abstand zu einem Bezugszeitpunkt über die Zeit (Hamilton) — das Ausmaß der Verschiebung als Zahl.",
    Config: DriftConfig,
    Main: DriftMain,
  },
  {
    id: "paare",
    label: "Wort gegen Wort",
    group: "Visualisierung",
    icon: "compare",
    eyebrow: "Visualisierung",
    title: "Wort gegen Wort",
    description:
      "Kreuzähnlichkeit zweier Zielwörter je Zeitscheibe — nähern sie sich an oder driften sie auseinander?",
    Config: PaareConfig,
    Main: PaareMain,
  },
  {
    id: "nachbarn",
    label: "Nachbarschafts-Fluss",
    group: "Visualisierung",
    icon: "flow",
    eyebrow: "Visualisierung",
    title: "Nachbarschafts-Fluss",
    description:
      "Top-k-Nachbarn je Zeitscheibe als Bump-Diagramm — welches Umfeld ein Wort wann hatte.",
    Config: NachbarnConfig,
    Main: NachbarnMain,
  },
];

/** Reihenfolge der Gruppen in der Rail (nicht alphabetisch: Daten kommt zuerst,
 * weil ohne Bundle kein Werkzeug etwas anzeigen kann). */
export const MODULE_GROUPS = ["Daten", "Visualisierung"] as const;

export const GROUP_ICON: Record<string, IconName> = {
  Daten: "database",
  Visualisierung: "chart",
};

export function moduleById(id: string): ModuleDef {
  return MODULES.find((m) => m.id === id) ?? MODULES[0];
}
