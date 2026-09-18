/**
 * Absicherung des Nachbarschafts-Flusses.
 *
 * Der heikle Punkt ist Regel 2 aus `neighborFlow.ts`: die Demo liefert für
 * *alle* 64 Quartale Nachbarn, auch für Quartale, in denen das Wort gar nicht
 * belegt ist (`freq == 0`). Ohne das Gating zeichnete das Diagramm eine
 * lückenlose Nachbarschaft für ein Wort, das es damals nicht gab — der Test
 * unten ist genau dagegen gerichtet.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { validateBundle } from "../types/schema";
import { indexBundle } from "../data/model";
import { buildNeighborFlow, neighborGroups } from "./neighborFlow";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "../../../data/test");

function indexed(name: string) {
  return indexBundle(validateBundle(JSON.parse(readFileSync(resolve(dataDir, name), "utf-8"))));
}

describe("buildNeighborFlow", () => {
  it("blendet unbelegte Zeitscheiben aus, obwohl das Bundle dort Nachbarn hat", () => {
    const idx = indexed("zeitenwende_demo.json");
    // Rohdaten haben Nachbarn für alle Scheiben …
    expect(Object.keys(idx.bundle.neighbors["zeitenwende"]).length).toBe(64);
    // … der Fluss zeigt aber nur die 21 belegten.
    const flow = buildNeighborFlow(idx, "zeitenwende")!;
    expect(flow.presentCount).toBe(21);
    expect(flow.slicePresent[0]).toBe(false);
    expect(flow.slicePresent[43]).toBe(true);
    expect(flow.labels.length).toBe(10);
    for (const l of flow.labels) expect(l.firstIndex).toBeGreaterThanOrEqual(43);
  });

  it("vergibt je Zeitscheibe jeden Rang genau einmal", () => {
    const idx = indexed("zeitenwende_demo.json");
    const flow = buildNeighborFlow(idx, "bundeswehr")!;
    expect(flow.k).toBe(8);
    expect(flow.presentCount).toBe(64);
    expect(flow.labels.length).toBe(20);

    const seen = new Map<string, number>();
    for (const l of flow.labels) {
      for (const p of l.points) {
        expect(p.rank).toBeGreaterThanOrEqual(1);
        expect(p.rank).toBeLessThanOrEqual(flow.k);
        const key = `${p.sliceIndex}:${p.rank}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
    }
    for (const [key, count] of seen) expect([key, count]).toEqual([key, 1]);
    expect(seen.size).toBe(64 * 8);
  });

  it("zerlegt Vorkommen in lückenlose Läufe", () => {
    const idx = indexed("zeitenwende_demo.json");
    // `bundeswehr` hat Nachbarn, die aus den Top-k fallen und zurückkommen
    // (u.a. „Debakel") — genau der Fall, den die Läufe trennen müssen.
    const flow = buildNeighborFlow(idx, "bundeswehr")!;
    const gapped = flow.labels.filter((l) => l.runs.length > 1);
    expect(gapped.length).toBe(3); // sonst prüft der Test nichts

    for (const l of flow.labels) {
      expect(l.runs.flat()).toEqual(l.points);
      for (const run of l.runs) {
        for (let i = 1; i < run.length; i++) {
          expect(run[i].sliceIndex).toBe(run[i - 1].sliceIndex + 1);
        }
      }
      expect(l.count).toBe(l.points.length);
      expect(l.bestRank).toBe(Math.min(...l.points.map((p) => p.rank)));
    }
  });

  it("misst den Umschlag als Anteil neuer Nachbarn, ohne Lücken zu überspannen", () => {
    const idx = indexed("zeitenwende_demo.json");
    const flow = buildNeighborFlow(idx, "zeitenwende")!;

    expect(flow.turnover[0]).toBeNull();
    expect(flow.turnover[43]).toBeNull(); // erste belegte Scheibe: keine Vorscheibe
    for (let i = 0; i < flow.turnover.length; i++) {
      const t = flow.turnover[i];
      if (t === null) continue;
      expect(flow.slicePresent[i] && flow.slicePresent[i - 1]).toBe(true);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
    }
  });

  it("stellt die Anker-Cluster nach vorn, damit Gruppen ihre Farbe behalten", () => {
    const idx = indexed("zeitenwende_demo.json");
    const groups = neighborGroups(idx);
    expect(groups.slice(0, idx.clusters.length)).toEqual(idx.clusters);
    // `ZIELWORT` kommt nur in neighbors vor, nicht als Anker-Cluster.
    expect(groups).toContain("ZIELWORT");
    expect(idx.clusters).not.toContain("ZIELWORT");

    const flow = buildNeighborFlow(idx, "bundeswehr")!;
    for (const l of flow.labels) {
      if (l.group) expect(flow.groups[l.groupIndex]).toBe(l.group);
    }
  });

  it("funktioniert auf dem zweiten Demo-Bundle und kennt unbekannte Wörter nicht", () => {
    const idx = indexed("generic_demo.json");
    const flow = buildNeighborFlow(idx, idx.tracks[0].entity.id)!;
    expect(flow.k).toBe(6);
    expect(flow.presentCount).toBeGreaterThan(0);
    expect(buildNeighborFlow(idx, "gibt-es-nicht")).toBeNull();
  });
});
