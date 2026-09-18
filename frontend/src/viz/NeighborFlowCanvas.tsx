/**
 * Bump-Diagramm des Nachbarschafts-Flusses: x = Zeit, y = Rang (1 oben), eine
 * Linie je Nachbarwort.
 *
 * Gestalterische Festlegungen und ihr Grund:
 *
 * - **Farbe kodiert die Nachbar-Gruppe, nicht das einzelne Wort.** Bei ~20
 *   Nachbarn trennt keine Palette 20 Serien; die Gruppen (dieselben wie die
 *   Anker-Cluster) sind dagegen wenige und tragen die eigentliche Aussage:
 *   *welche Art* von Umfeld löst welche ab. Die Wort-Identität trägt die
 *   Direktbeschriftung — die Sekundärkodierung, die der dataviz-Skill für
 *   „mehr Serien als Farbslots" vorsieht.
 * - **Voller Farbton statt der recessiven Cluster-Farbe des 3D-Raums**: dort
 *   sind Cluster Kontext hinter den Zielwörtern, hier sind sie das Motiv. Die
 *   Slot-Reihenfolge ist dieselbe (`neighborGroups`), also bleibt die Gruppe im
 *   selben Farbton wie ihre Anker in der Punktwolke.
 * - **Lücke = raus aus den Top-k.** Verschwindet ein Nachbar und kommt später
 *   zurück, sind das zwei Segmente — keine durchgezogene Linie, die eine
 *   Anwesenheit behauptet, die es nicht gab.
 * - **Umschlag-Streifen** unter dem Plot: Anteil der Top-k, der gegenüber der
 *   Vorscheibe neu ist. Er beantwortet „wann kippte das Umfeld?" in einer Zeile
 *   und liegt auf derselben x-Achse wie das Diagramm darüber.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Mode } from "./theme";
import { INK, entityColor } from "./theme";
import { hatchPattern } from "./hatch";
import type { NeighborFlow } from "./neighborFlow";

const PAD = { top: 14, left: 34, right: 158, bottom: 20 };
const STRIP_H = 26;
const STRIP_GAP = 12;
const FONT_MONO = '10px "Noto Sans Mono", ui-monospace, monospace';
const FONT_SANS = '11px "Noto Sans", system-ui, sans-serif';

export interface FlowHover {
  sliceIndex: number;
  label: string | null;
  group: string | null;
  rank: number | null;
  score: number | null;
  turnover: number | null;
}

function useElementWidth(ref: React.RefObject<HTMLElement | null>, fallback = 820): number {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(360, el.clientWidth));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

export function NeighborFlowCanvas({
  flow,
  xLabels,
  mode,
  shiftSliceIndex,
  height,
}: {
  flow: NeighborFlow;
  xLabels: string[];
  mode: Mode;
  shiftSliceIndex: number | null;
  height?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = useElementWidth(wrapRef);
  const [hover, setHover] = useState<FlowHover | null>(null);

  const n = xLabels.length;
  const rowH = 30;
  const plotH = flow.k * rowH;
  const total = height ?? PAD.top + plotH + STRIP_GAP + STRIP_H + PAD.bottom;

  const plotW = Math.max(10, width - PAD.left - PAD.right);
  const stepX = n > 1 ? plotW / (n - 1) : 0;
  const xAt = (i: number) => PAD.left + (n > 1 ? i * stepX : plotW / 2);
  const yAt = (rank: number) => PAD.top + (rank - 0.5) * (plotH / flow.k);

  /** (Zeitscheibe, Rang) → Nachbar, für das Picking unter dem Zeiger. */
  const cellIndex = useMemo(() => {
    const map = new Map<string, { label: string; group: string | null; score: number | null }>();
    for (const l of flow.labels) {
      for (const p of l.points) {
        map.set(`${p.sliceIndex}:${p.rank}`, { label: l.label, group: l.group, score: p.score });
      }
    }
    return map;
  }, [flow]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(total * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, total);

    const ink = INK[mode];
    const highlight = hover?.label ?? null;

    // 1) Unbelegte Zeitscheiben schraffieren — „kein Beleg" ist kein leerer Rang.
    const hatch = hatchPattern(ctx, mode);
    let runStart: number | null = null;
    const paintGap = (from: number, to: number) => {
      const x0 = xAt(from) - stepX / 2;
      const x1 = xAt(to) + stepX / 2;
      ctx.fillStyle = hatch;
      ctx.fillRect(Math.max(PAD.left, x0), PAD.top, Math.min(PAD.left + plotW, x1) - Math.max(PAD.left, x0), plotH);
    };
    for (let i = 0; i < n; i++) {
      if (!flow.slicePresent[i]) {
        if (runStart === null) runStart = i;
      } else if (runStart !== null) {
        paintGap(runStart, i - 1);
        runStart = null;
      }
    }
    if (runStart !== null) paintGap(runStart, n - 1);

    // 2) Rangzeilen + Rangzahlen.
    ctx.font = FONT_MONO;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let r = 1; r <= flow.k; r++) {
      const y = Math.round(yAt(r)) + 0.5;
      ctx.strokeStyle = ink.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(PAD.left + plotW, y);
      ctx.stroke();
      ctx.fillStyle = ink.muted;
      ctx.fillText(String(r), PAD.left - 8, y);
    }

    // 3) Zäsur — dieselbe Hilfslinie wie in Matrix und Kurven.
    if (shiftSliceIndex !== null && shiftSliceIndex >= 0 && shiftSliceIndex < n) {
      const x = Math.round(xAt(shiftSliceIndex)) + 0.5;
      ctx.save();
      ctx.strokeStyle = mode === "light" ? "#b03a3a" : "#d97676";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, PAD.top);
      ctx.lineTo(x, PAD.top + plotH + STRIP_GAP + STRIP_H);
      ctx.stroke();
      ctx.restore();
    }

    // 4) Rang-Linien je Nachbar, Lauf für Lauf.
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const l of flow.labels) {
      const color = l.groupIndex >= 0 ? entityColor(l.groupIndex, mode) : ink.muted;
      const dimmed = highlight !== null && highlight !== l.label;
      ctx.save();
      // Beim Hervorheben treten die übrigen Bahnen zurück, verschwinden aber
      // nicht: der Rang einer Linie ist nur im Bündel der anderen ablesbar.
      // (Im Plot liegt fast immer eine Linie unter dem Zeiger, also ist der
      // gedimmte Zustand der Normalfall beim Lesen.)
      ctx.globalAlpha = dimmed ? 0.3 : highlight === l.label ? 1 : 0.85;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = highlight === l.label ? 3 : 2;
      for (const run of l.runs) {
        if (run.length === 1) {
          ctx.beginPath();
          ctx.arc(xAt(run[0].sliceIndex), yAt(run[0].rank), 3, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        ctx.beginPath();
        run.forEach((p, k) =>
          k === 0
            ? ctx.moveTo(xAt(p.sliceIndex), yAt(p.rank))
            : ctx.lineTo(xAt(p.sliceIndex), yAt(p.rank)),
        );
        ctx.stroke();
        // Ein- und Austrittspunkt markieren: dort wechselt die Top-k-Menge.
        if (!dimmed) {
          for (const p of [run[0], run[run.length - 1]]) {
            ctx.beginPath();
            ctx.arc(xAt(p.sliceIndex), yAt(p.rank), 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.restore();
    }

    // 5) Beschriftung: rechts für Nachbarn, die am Ende noch dabei sind;
    //    inline (mit Fläche hinterlegt) am Eintritt für alle anderen.
    ctx.font = FONT_SANS;
    ctx.textBaseline = "middle";
    const lastPresent = flow.slicePresent.lastIndexOf(true);
    const rightLabels: { y: number; text: string; color: string; dim: boolean }[] = [];

    for (const l of flow.labels) {
      const color = l.groupIndex >= 0 ? entityColor(l.groupIndex, mode) : ink.muted;
      const dim = highlight !== null && highlight !== l.label;
      if (l.lastIndex === lastPresent && lastPresent >= 0) {
        const last = l.points[l.points.length - 1];
        rightLabels.push({ y: yAt(last.rank), text: l.label, color, dim });
      } else {
        const run = l.runs[0];
        if (!run || run.length < 2) continue; // Eintagsfliegen nicht beschriften
        const p = run[0];
        const x = xAt(p.sliceIndex) + 6;
        const y = yAt(p.rank) - 11;
        const w = ctx.measureText(l.label).width;
        if (x + w > PAD.left + plotW) continue;
        ctx.save();
        ctx.globalAlpha = dim ? 0.4 : 1;
        ctx.fillStyle = ink.surface;
        ctx.fillRect(x - 3, y - 7, w + 6, 14); // Halo, damit Text über Linien lesbar bleibt
        ctx.fillStyle = ink.secondary;
        ctx.textAlign = "left";
        ctx.fillText(l.label, x, y);
        ctx.fillStyle = color;
        ctx.fillRect(x - 3, y + 6, w + 6, 1.5);
        ctx.restore();
      }
    }

    rightLabels.sort((a, b) => a.y - b.y);
    for (let i = 1; i < rightLabels.length; i++) {
      if (rightLabels[i].y - rightLabels[i - 1].y < 14) rightLabels[i].y = rightLabels[i - 1].y + 14;
    }
    ctx.textAlign = "left";
    for (const l of rightLabels) {
      ctx.save();
      ctx.globalAlpha = l.dim ? 0.2 : 1;
      const x = PAD.left + plotW + 8;
      ctx.strokeStyle = l.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, l.y);
      ctx.lineTo(x + 10, l.y);
      ctx.stroke();
      ctx.fillStyle = ink.secondary;
      ctx.fillText(l.text, x + 15, l.y);
      ctx.restore();
    }

    // 6) Umschlag-Streifen (Balken je Zeitscheibe) + x-Achse.
    const stripTop = PAD.top + plotH + STRIP_GAP;
    ctx.strokeStyle = ink.baseline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.left, Math.round(stripTop + STRIP_H) + 0.5);
    ctx.lineTo(PAD.left + plotW, Math.round(stripTop + STRIP_H) + 0.5);
    ctx.stroke();

    const barW = Math.max(1.5, Math.min(10, stepX * 0.6));
    ctx.fillStyle = ink.baseline;
    for (let i = 0; i < n; i++) {
      const t = flow.turnover[i];
      if (t === null || t <= 0) continue;
      const h = Math.max(1, t * STRIP_H);
      ctx.fillRect(xAt(i) - barW / 2, stripTop + STRIP_H - h, barW, h);
    }
    ctx.font = FONT_MONO;
    ctx.fillStyle = ink.muted;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText("↻", PAD.left - 8, stripTop + STRIP_H / 2);

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const xStep = Math.max(1, Math.round(n / 8));
    for (let i = 0; i < n; i += xStep) {
      ctx.fillText(xLabels[i], xAt(i), stripTop + STRIP_H + 5);
    }

    // 7) Fadenkreuz zuletzt.
    if (hover) {
      const x = Math.round(xAt(hover.sliceIndex)) + 0.5;
      ctx.save();
      ctx.strokeStyle = ink.primary;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(x, PAD.top);
      ctx.lineTo(x, stripTop + STRIP_H);
      ctx.stroke();
      ctx.restore();
    }
  }, [flow, xLabels, mode, width, total, plotW, plotH, stepX, n, shiftSliceIndex, hover]);

  const pick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - PAD.left;
    const y = e.clientY - rect.top - PAD.top;
    const i = n > 1 ? Math.round(x / stepX) : 0;
    if (i < 0 || i >= n) {
      setHover(null);
      return;
    }
    const rank = Math.floor(y / (plotH / flow.k)) + 1;
    const cell =
      rank >= 1 && rank <= flow.k && flow.slicePresent[i] ? cellIndex.get(`${i}:${rank}`) : undefined;
    setHover({
      sliceIndex: i,
      label: cell?.label ?? null,
      group: cell?.group ?? null,
      rank: cell ? rank : null,
      score: cell?.score ?? null,
      turnover: flow.turnover[i],
    });
  };

  const tipLeft = hover ? xAt(hover.sliceIndex) : 0;
  const flip = tipLeft > PAD.left + plotW * 0.62;

  return (
    <div className="chart" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="chart__canvas"
        style={{ width: "100%", height: total }}
        onMouseMove={pick}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={`Nachbarschafts-Fluss für ${flow.entityLabel}: Rang 1 bis ${flow.k} über ${n} Zeitscheiben`}
      />
      {hover && (
        <div
          className={`chart__tip ${flip ? "chart__tip--flip" : ""}`}
          style={{ left: tipLeft }}
          aria-hidden
        >
          <div className="chart__tiphead lt-mono">{xLabels[hover.sliceIndex]}</div>
          {!flow.slicePresent[hover.sliceIndex] ? (
            <div className="chart__tipempty">kein Beleg</div>
          ) : hover.label ? (
            <div className="chart__tiprow">
              <span className="chart__tipname">
                <span className="lt-mono">#{hover.rank}</span> {hover.label}
                {hover.group && <span className="chart__tipgroup">{hover.group}</span>}
              </span>
              <span className="chart__tipval lt-mono">
                {hover.score !== null ? hover.score.toFixed(3) : "—"}
              </span>
            </div>
          ) : (
            <div className="chart__tipempty">kein Nachbar auf diesem Rang</div>
          )}
          {hover.turnover !== null && (
            <div className="chart__tiprow chart__tiprow--sub">
              <span className="chart__tipname">Umschlag ggü. Vorscheibe</span>
              <span className="chart__tipval lt-mono">{Math.round(hover.turnover * 100)} %</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Gruppen-Legende — Farbe steht hier für die Nachbar-Gruppe.
 *
 * Gezeigt werden nur die Gruppen, die beim aktuellen Wort auch vorkommen; der
 * Farbslot bleibt aber der **globale** (`neighborGroups`), damit dieselbe Gruppe
 * beim Wortwechsel nicht die Farbe wechselt.
 */
export function FlowGroupLegend({
  items,
  mode,
}: {
  items: { group: string; index: number }[];
  mode: Mode;
}) {
  if (items.length === 0) return null;
  return (
    <div className="chartleg">
      {items.map(({ group, index }) => (
        <span key={group} className="chartleg__item">
          <span
            className="swatch swatch--xs"
            style={{ background: index >= 0 ? entityColor(index, mode) : "var(--lt-fg-4)" }}
          />
          {group}
        </span>
      ))}
    </div>
  );
}
