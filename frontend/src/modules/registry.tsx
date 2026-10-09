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
import { EinfuehrungMain } from "./einfuehrung";
import { InfoMain } from "./info";
import { DatenConfig, DatenMain } from "./daten";
import { WortraumConfig, WortraumFooter, WortraumMain } from "./wortraum";
import { MatrizenConfig, MatrizenMain } from "./matrizen";
import { DriftConfig, DriftMain } from "./drift";
import { PaareConfig, PaareMain } from "./paare";
import { NachbarnConfig, NachbarnMain } from "./nachbarn";
import { WandelConfig, WandelMain } from "./wandel";
import { NachbarfilterConfig, NachbarfilterMain } from "./nachbarfilter";
import { AnkerConfig, AnkerMain } from "./anker";

export interface ModuleDef {
  id: string;
  /** Kurzname in der Rail. */
  label: string;
  group: string;
  icon: IconName;
  eyebrow: string;
  title: string;
  /** Kurzbeschreibung unter dem Titel; fehlt sie, bleibt die Zeile weg. */
  description?: string;
  /** Konfigurator-Spalte; fehlt sie, nimmt der Hauptbereich die volle Breite. */
  Config?: FC;
  Main: FC;
  /** Optionale Fußzeile über die volle Breite (nur der Wortraum hat eine). */
  Footer?: FC;
}

export const MODULES: ModuleDef[] = [
  {
    id: "einfuehrung",
    label: "Einführung",
    group: "Einführung",
    icon: "home",
    eyebrow: "Start",
    title: "Einführung",
    Main: EinfuehrungMain,
  },
  {
    id: "daten",
    label: "Datenquelle",
    group: "Daten",
    icon: "database",
    eyebrow: "Daten",
    title: "Datenquelle",
    Config: DatenConfig,
    Main: DatenMain,
  },
  {
    id: "nachbarfilter",
    label: "Filter für nächste Nachbarn",
    group: "Daten",
    icon: "filter",
    eyebrow: "Daten",
    title: "Filter für nächste Nachbarn",
    description:
      "Welche Wörter als nächste Nachbarn infrage kommen — Wortart, Mindestbelegung, Stoppwörter. Gilt in allen Modulen.",
    Config: NachbarfilterConfig,
    Main: NachbarfilterMain,
  },
  {
    id: "anker",
    label: "Anker",
    group: "Daten",
    icon: "pin",
    eyebrow: "Daten",
    title: "Anker",
    description:
      "Welche Wörter im Wortraum als Landmarken stehen, mit Label und Cluster. Gilt für diese Sitzung.",
    Config: AnkerConfig,
    Main: AnkerMain,
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
      "Die k nächsten Nachbarn je Zeitscheibe als Bump-Diagramm — welches Umfeld ein Wort wann hatte.",
    Config: NachbarnConfig,
    Main: NachbarnMain,
  },
  {
    id: "wandel",
    label: "Wandel-Ranking",
    group: "Visualisierung",
    icon: "ranking",
    eyebrow: "Visualisierung",
    title: "Wandel-Ranking",
    description:
      "Welches Wort hat zwischen zwei Zeiträumen seine Nachbarn am stärksten gewechselt (Gonen)?",
    Config: WandelConfig,
    Main: WandelMain,
  },
];

/** Info-Seite: kein Werkzeug, daher in keiner Gruppe; sitzt unten in der Rail. */
export const INFO_MODULE: ModuleDef = {
  id: "info",
  label: "Informationen",
  group: "",
  icon: "info",
  eyebrow: "Über",
  title: "Informationen",
  Main: InfoMain,
};

/** Reihenfolge der Gruppen in der Rail (nicht alphabetisch: nach der Einführung
 * kommt Daten, weil ohne Bundle kein Werkzeug etwas anzeigen kann). */
export const MODULE_GROUPS = ["Einführung", "Daten", "Visualisierung"] as const;

export const GROUP_ICON: Record<string, IconName> = {
  Einführung: "home",
  Daten: "database",
  Visualisierung: "chart",
};

export function moduleById(id: string): ModuleDef {
  if (id === INFO_MODULE.id) return INFO_MODULE;
  return MODULES.find((m) => m.id === id) ?? MODULES[0];
}
