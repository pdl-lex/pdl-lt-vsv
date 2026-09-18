/**
 * Mehrserien-Liniendiagramm über die Zeitachse (2D-Canvas) — geteilt von den
 * Modulen „Drift-Kurven" und „Wort gegen Wort".
 *
 * Warum ein eigener Renderer statt einer Chart-Bibliothek: gebraucht wird genau
 * eine lineare Skala, Linien mit **echten Lücken** und die Zäsur-Hilfslinie —
 * dieselben drei Dinge wie in der Matrix. Eine Bibliothek würde vor allem ihre
 * eigene Farb- und Achsenlogik mitbringen, die hier ohnehin von `viz/theme.ts`
 * kommt (specs.md §3: kein D3).
 *
 * Regeln, die hier eingebaut sind und nicht am Aufrufer hängen:
 * - **`null` unterbricht die Linie.** Ein Wert fehlt, weil das Wort zu der Zeit
 *   nicht belegt ist; eine durchgezogene Linie würde Entwicklung behaupten.
 *   Ein isolierter Wert zwischen zwei Lücken wird als Punkt gezeichnet, sonst
 *   wäre er unsichtbar.
 * - **Farbe trägt Identität, Text nicht.** Beschriftungen und Zahlen stehen in
 *   den Ink-Tokens; die Serienfarbe erscheint nur als Marke daneben.
 * - **Direktbeschriftung ab ≤ 4 Serien** am letzten belegten Punkt, mit
 *   Kollisionsauflösung nach unten. Darüber trägt die Legende, weil sich sonst
 *   die Labels gegenseitig zuschieben.
 */
import { useEffect, useRef, useState } from "react";
import type { Mode } from "./theme";
import { INK } from "./theme";

export interface LineSeries {
  id: string;
  label: string;
  color: string;
  /** Ein Wert je Zeitscheibe; `null` = nicht belegt (Lücke). */
  values: (number | null)[];
}

const PAD = { top: 12, bottom: 26, left: 52 };
const PAD_RIGHT_LABELS = 104; // Platz für Direktbeschriftung
const PAD_RIGHT_PLAIN = 18;
const DIRECT_LABEL_LIMIT = 4;

const FONT_MONO = '10px "Noto Sans Mono", ui-monospace, monospace';
const FONT_SANS = '11px "Noto Sans", system-ui, sans-serif';

/** „Runde" Achsenschritte (1/2/5 × 10^k) für lesbare Tick-Zahlen.
 * Die Schwellen (1.5/3/7 statt 1/2/5) runden eher nach unten — sonst bleiben
 * bei einer Spanne knapp über einer Zehnerpotenz nur zwei, drei Gitterlinien
 * übrig und die Achse wird unlesbar grob. */
function niceTicks(min: number, max: number, count = 5): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];
  const rough = span / (count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step = (norm >= 7 ? 10 : norm >= 3 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) {
    out.push(Math.round(t / step) * step); // Gleitkomma-Drift einfangen
  }
  return out;
}

/** Breite des umgebenden Elements (responsives Diagramm ohne feste Pixelzahl). */
function useElementWidth(ref: React.RefObject<HTMLElement | null>, fallback = 720): number {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(320, el.clientWidth));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

export function LineChart({
  series,
  xLabels,
  domain,
  mode,
  height = 300,
  shiftSliceIndex,
  markIndex,
  markLabel,
  format = (v: number) => v.toFixed(3),
  yAxisLabel,
  emptyHint = "keine Werte",
}: {
  series: LineSeries[];
  xLabels: string[];
  domain: { min: number; max: number };
  mode: Mode;
  height?: number;
  /** Zäsur (`meta.shift_point`) als gestrichelte Hilfslinie. */
  shiftSliceIndex: number | null;
  /** Zusätzliche Markierung, z.B. die Referenzscheibe der Drift. */
  markIndex?: number | null;
  markLabel?: string;
  format?: (v: number) => string;
  yAxisLabel?: string;
  emptyHint?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = useElementWidth(wrapRef);
  const [hover, setHover] = useState<number | null>(null);

  const n = xLabels.length;
  const direct = series.length > 0 && series.length <= DIRECT_LABEL_LIMIT;
  const padRight = direct ? PAD_RIGHT_LABELS : PAD_RIGHT_PLAIN;
  const plotW = Math.max(10, width - PAD.left - padRight);
  const plotH = Math.max(10, height - PAD.top - PAD.bottom);
  const stepX = n > 1 ? plotW / (n - 1) : 0;
  const xAt = (i: number) => PAD.left + (n > 1 ? i * stepX : plotW / 2);
  const yAt = (v: number) =>
    PAD.top + plotH * (1 - (v - domain.min) / Math.max(1e-9, domain.max - domain.min));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const ink = INK[mode];

    // 1) Recessives Gitter + y-Achsenzahlen.
    ctx.font = FONT_MONO;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const t of niceTicks(domain.min, domain.max)) {
      const y = Math.round(yAt(t)) + 0.5;
      ctx.strokeStyle = ink.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(PAD.left + plotW, y);
      ctx.stroke();
      ctx.fillStyle = ink.muted;
      ctx.fillText(format(t), PAD.left - 8, y);
    }

    // 2) x-Achse: so viele Beschriftungen, dass sie sich nicht überlappen.
    const xStep = Math.max(1, Math.round(n / 8));
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = ink.muted;
    for (let i = 0; i < n; i += xStep) {
      ctx.fillText(xLabels[i], xAt(i), PAD.top + plotH + 7);
    }
    ctx.strokeStyle = ink.baseline;
    ctx.beginPath();
    ctx.moveTo(PAD.left, Math.round(PAD.top + plotH) + 0.5);
    ctx.lineTo(PAD.left + plotW, Math.round(PAD.top + plotH) + 0.5);
    ctx.stroke();

    // 3) Referenzmarke (Drift-Basispunkt) — hinter den Linien, vor dem Gitter.
    if (markIndex !== null && markIndex !== undefined && markIndex >= 0 && markIndex < n) {
      const x = Math.round(xAt(markIndex)) + 0.5;
      ctx.save();
      ctx.strokeStyle = ink.baseline;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, PAD.top);
      ctx.lineTo(x, PAD.top + plotH);
      ctx.stroke();
      if (markLabel) {
        ctx.font = FONT_MONO;
        ctx.fillStyle = ink.muted;
        ctx.textAlign = x > PAD.left + plotW - 60 ? "right" : "left";
        ctx.textBaseline = "top";
        ctx.fillText(markLabel, x + (x > PAD.left + plotW - 60 ? -4 : 4), PAD.top + 1);
      }
      ctx.restore();
    }

    // 4) Zäsur — dieselbe gestrichelte rote Hilfslinie wie in der Matrix.
    if (shiftSliceIndex !== null && shiftSliceIndex >= 0 && shiftSliceIndex < n) {
      const x = Math.round(xAt(shiftSliceIndex)) + 0.5;
      ctx.save();
      ctx.strokeStyle = mode === "light" ? "#b03a3a" : "#d97676";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, PAD.top);
      ctx.lineTo(x, PAD.top + plotH);
      ctx.stroke();
      ctx.restore();
    }

    // 5) Linien mit echten Lücken; isolierte Werte als Punkt.
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const s of series) {
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      let run: { x: number; y: number }[] = [];
      const flush = () => {
        if (run.length === 1) {
          ctx.beginPath();
          ctx.arc(run[0].x, run[0].y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (run.length > 1) {
          ctx.beginPath();
          run.forEach((p, k) => (k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
          ctx.stroke();
        }
        run = [];
      };
      for (let i = 0; i < n; i++) {
        const v = s.values[i];
        if (v === null || v === undefined || !Number.isFinite(v)) flush();
        else run.push({ x: xAt(i), y: yAt(v) });
      }
      flush();
    }

    // 6) Direktbeschriftung am letzten belegten Punkt (ab ≤ 4 Serien).
    if (direct) {
      const labels: { y: number; color: string; text: string }[] = [];
      for (const s of series) {
        let last = -1;
        for (let i = n - 1; i >= 0; i--) {
          const v = s.values[i];
          if (v !== null && v !== undefined && Number.isFinite(v)) {
            last = i;
            break;
          }
        }
        if (last === -1) continue;
        labels.push({ y: yAt(s.values[last] as number), color: s.color, text: s.label });
      }
      // Nach unten auseinanderschieben, damit sich nichts überlagert.
      labels.sort((a, b) => a.y - b.y);
      for (let i = 1; i < labels.length; i++) {
        if (labels[i].y - labels[i - 1].y < 13) labels[i].y = labels[i - 1].y + 13;
      }
      ctx.font = FONT_SANS;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      for (const l of labels) {
        const x = PAD.left + plotW + 8;
        ctx.strokeStyle = l.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, l.y);
        ctx.lineTo(x + 10, l.y);
        ctx.stroke();
        ctx.fillStyle = ink.secondary;
        ctx.fillText(l.text, x + 15, l.y);
      }
    }

    // 7) Fadenkreuz + Punkte an der gehoverten Zeitscheibe.
    if (hover !== null && hover >= 0 && hover < n) {
      const x = Math.round(xAt(hover)) + 0.5;
      ctx.save();
      ctx.strokeStyle = ink.primary;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, PAD.top);
      ctx.lineTo(x, PAD.top + plotH);
      ctx.stroke();
      ctx.restore();
      for (const s of series) {
        const v = s.values[hover];
        if (v === null || v === undefined || !Number.isFinite(v)) continue;
        const y = yAt(v);
        ctx.beginPath();
        ctx.arc(xAt(hover), y, 4, 0, Math.PI * 2);
        ctx.fillStyle = s.color;
        ctx.fill();
        // 2px Fläche als Ring, damit sich überlagernde Punkte trennen.
        ctx.strokeStyle = ink.surface;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }, [
    series, xLabels, domain.min, domain.max, mode, width, height, hover,
    shiftSliceIndex, markIndex, markLabel, format, n, plotW, plotH, direct,
  ]);

  const pick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - PAD.left;
    const i = n > 1 ? Math.round(x / stepX) : 0;
    setHover(i >= 0 && i < n ? i : null);
  };

  const rows =
    hover === null
      ? []
      : series
          .map((s) => ({ s, v: s.values[hover] }))
          .filter((r) => r.v !== null && r.v !== undefined && Number.isFinite(r.v))
          .sort((a, b) => (b.v as number) - (a.v as number));

  // Tooltip kippt auf die andere Seite, sobald rechts kein Platz mehr ist.
  const tipLeft = hover === null ? 0 : xAt(hover);
  const flip = tipLeft > PAD.left + plotW * 0.62;

  return (
    <div className="chart" ref={wrapRef}>
      {yAxisLabel && <div className="chart__ylabel">{yAxisLabel}</div>}
      <canvas
        ref={canvasRef}
        className="chart__canvas"
        style={{ width: "100%", height }}
        onMouseMove={pick}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={`Zeitreihe: ${series.map((s) => s.label).join(", ") || emptyHint}`}
      />
      {hover !== null && (
        <div
          className={`chart__tip ${flip ? "chart__tip--flip" : ""}`}
          style={{ left: tipLeft }}
          aria-hidden
        >
          <div className="chart__tiphead lt-mono">{xLabels[hover]}</div>
          {rows.length === 0 ? (
            <div className="chart__tipempty">kein Beleg</div>
          ) : (
            rows.map(({ s, v }) => (
              <div key={s.id} className="chart__tiprow">
                <span className="swatch swatch--xs" style={{ background: s.color }} />
                <span className="chart__tipname">{s.label}</span>
                <span className="chart__tipval lt-mono">{format(v as number)}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** Legende — bei ≥ 2 Serien immer sichtbar, unabhängig von Direktbeschriftung. */
export function ChartLegend({ series }: { series: LineSeries[] }) {
  if (series.length < 2) return null;
  return (
    <div className="chartleg">
      {series.map((s) => (
        <span key={s.id} className="chartleg__item">
          <span className="swatch swatch--xs" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}
