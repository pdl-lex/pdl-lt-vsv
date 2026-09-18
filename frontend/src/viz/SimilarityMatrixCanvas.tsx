/**
 * Canvas-Renderer einer T×T-Ähnlichkeitsmatrix (Kiyama). Bewusst 2D-Canvas und
 * nicht die three.js-Szene: die Matrix ist ein **eigenständiges
 * Visualisierungswerkzeug**, keine Erweiterung der Punktwolke (specs.md §3).
 *
 * Rendering-Reihenfolge und der Grund dafür:
 * 1. Die gesamte Plotfläche wird mit einer 45°-Schraffur gefüllt.
 * 2. Darüber werden **nur belegte** Zellen deckend gemalt.
 *
 * Was übrig bleibt, ist genau die Maske. Das ist wichtiger als es klingt: die
 * Sequential-Rampe lässt „wenig Ähnlichkeit" absichtlich gegen die Fläche
 * zurücktreten (siehe `theme.ts`), also wäre „kein Beleg" als helle Farbe von
 * „kaum ähnlich" nicht zu unterscheiden. Textur statt Farbe trennt die beiden
 * Aussagen sauber — und ist zugleich der Kanal, der bei Farbfehlsichtigkeit,
 * im Druck und unter `forced-colors` trägt.
 */
import { useEffect, useRef, useState } from "react";
import type { Mode } from "./theme";
import { INK, sequentialColor } from "./theme";
import { hatchPattern } from "./hatch";
import { normalize, type SimilarityMatrix } from "./similarity";

export interface HoverCell {
  i: number;
  j: number;
  value: number;
}

export function SimilarityMatrixCanvas({
  matrix,
  domain,
  mode,
  size,
  shiftSliceIndex,
  onHover,
}: {
  matrix: SimilarityMatrix;
  domain: { min: number; max: number };
  mode: Mode;
  /** Kantenlänge der Plotfläche in CSS-Pixeln. */
  size: number;
  /** Index der Zäsur (`meta.shift_point`) — als Hilfslinie auf beiden Achsen. */
  shiftSliceIndex: number | null;
  onHover?: (cell: HoverCell | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<HoverCell | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const { n, values, present } = matrix;
    const cell = size / n;

    // 1) Schraffur als Grund — bleibt überall sichtbar, wo nichts belegt ist.
    ctx.fillStyle = hatchPattern(ctx, mode);
    ctx.fillRect(0, 0, size, size);

    // 2) Belegte Zellen deckend darüber. Kanten auf ganze Pixel runden, sonst
    //    entstehen bei ~4px-Zellen Fugen, die wie Struktur aussehen.
    for (let i = 0; i < n; i++) {
      if (!present[i]) continue;
      const y0 = Math.round(i * cell);
      const y1 = Math.round((i + 1) * cell);
      for (let j = 0; j < n; j++) {
        if (!present[j]) continue;
        const v = values[i * n + j];
        if (!Number.isFinite(v)) continue;
        const x0 = Math.round(j * cell);
        const x1 = Math.round((j + 1) * cell);
        ctx.fillStyle = sequentialColor(normalize(v, domain.min, domain.max), mode);
        ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
      }
    }

    const ink = INK[mode];

    // 3) Zäsur als Hilfslinie auf beiden Achsen — macht prüfbar, ob ein
    //    Blockwechsel in der Matrix wirklich auf dem markierten Bruch liegt.
    if (shiftSliceIndex !== null && shiftSliceIndex > 0 && shiftSliceIndex < n) {
      const p = Math.round(shiftSliceIndex * cell) + 0.5;
      ctx.save();
      ctx.strokeStyle = mode === "light" ? "#b03a3a" : "#d97676";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
      ctx.restore();
    }

    // 4) Fadenkreuz auf der gehoverten Zelle (Hit-Fläche ist größer als 4px).
    if (hover) {
      ctx.save();
      ctx.strokeStyle = ink.primary;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.55;
      const hx = Math.round(hover.j * cell) + 0.5;
      const hy = Math.round(hover.i * cell) + 0.5;
      ctx.beginPath();
      ctx.moveTo(hx, 0);
      ctx.lineTo(hx, size);
      ctx.moveTo(0, hy);
      ctx.lineTo(size, hy);
      ctx.stroke();
      ctx.restore();
    }

    // 5) Rahmen zuletzt, damit er nicht von Zellen überschrieben wird.
    ctx.strokeStyle = ink.baseline;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
  }, [matrix, domain.min, domain.max, mode, size, shiftSliceIndex, hover]);

  const pick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const n = matrix.n;
    const j = Math.floor(((e.clientX - rect.left) / rect.width) * n);
    const i = Math.floor(((e.clientY - rect.top) / rect.height) * n);
    if (i < 0 || j < 0 || i >= n || j >= n) return;
    const next: HoverCell = { i, j, value: matrix.values[i * n + j] };
    setHover(next);
    onHover?.(next);
  };

  const clear = () => {
    setHover(null);
    onHover?.(null);
  };

  return (
    <canvas
      ref={canvasRef}
      className="simmat__canvas"
      style={{ width: size, height: size }}
      onMouseMove={pick}
      onMouseLeave={clear}
      role="img"
      aria-label={`Ähnlichkeitsmatrix für ${matrix.entityLabel}: ${matrix.n} × ${matrix.n} Zeitscheiben`}
    />
  );
}

/** Farbschlüssel: Rampe mit den echten Domänen-Enden + die Maskentextur. */
export function SimilarityLegend({
  domain,
  mode,
  masked,
}: {
  domain: { min: number; max: number };
  mode: Mode;
  /** true, wenn irgendeine gezeigte Matrix maskierte Felder hat. */
  masked: boolean;
}) {
  const stops = Array.from({ length: 24 }, (_, i) => sequentialColor(i / 23, mode)).join(",");
  return (
    <div className="simleg">
      <span className="simleg__label">Kosinus-Ähnlichkeit</span>
      <span className="simleg__num lt-mono">{domain.min.toFixed(2)}</span>
      <span className="simleg__ramp" style={{ background: `linear-gradient(to right, ${stops})` }} />
      <span className="simleg__num lt-mono">{domain.max.toFixed(2)}</span>
      {masked && (
        <span className="simleg__mask">
          <span className="simleg__hatch" />
          kein Beleg
        </span>
      )}
    </div>
  );
}
