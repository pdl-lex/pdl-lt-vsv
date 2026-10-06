/**
 * Dünnstrichiges Inline-SVG-Icon-Set + LexoTerm-Logo (Teilmenge aus dem
 * Design-Handoff, nur was der Vektor-Viz braucht). Eigenes Set, damit keine
 * Icon-Font/Library nötig ist.
 */
import type { CSSProperties, JSX } from "react";

export type IconName =
  | "search" | "chevron" | "chevDown" | "x" | "play" | "pause" | "filter"
  | "sun" | "moon" | "upload" | "file" | "layers" | "dot" | "reset" | "target"
  | "database" | "orbit" | "matrix" | "chart" | "pin" | "info"
  | "trend" | "compare" | "flow" | "ranking";

const PATHS: Record<IconName, JSX.Element> = {
  search: <><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></>,
  chevron: <path d="M5.5 3.5 10 8l-4.5 4.5" />,
  chevDown: <path d="M3.5 5.5 8 10l4.5-4.5" />,
  x: <><path d="M4 4l8 8" /><path d="M12 4l-8 8" /></>,
  play: <path d="M5 3.5 12.5 8 5 12.5z" />,
  pause: <><path d="M5.5 4v8" /><path d="M10.5 4v8" /></>,
  filter: <path d="M2 3h12l-4.5 6V13l-3-1.5V9z" />,
  sun: <><circle cx="8" cy="8" r="3" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5 13 13M3 13l1.5-1.5M11.5 4.5 13 3" /></>,
  moon: <path d="M13 9.5A5 5 0 1 1 6.5 3a4 4 0 0 0 6.5 6.5z" />,
  upload: <><path d="M8 13V5" /><path d="M5 8l3-3 3 3" /><path d="M3 3h10" /></>,
  file: <><path d="M4 1.5h5l3 3V14a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 4 14V2a.5.5 0 0 1 .5-.5z" /><path d="M9 1.5V5h3" /></>,
  layers: <><path d="M8 1.5 1.5 5 8 8.5 14.5 5z" /><path d="M1.5 8 8 11.5 14.5 8" /><path d="M1.5 11 8 14.5 14.5 11" /></>,
  dot: <circle cx="8" cy="8" r="2.5" fill="currentColor" />,
  reset: <><path d="M13 7A5 5 0 0 0 3.5 5.5" /><path d="M3 3v3h3" /><path d="M3 9a5 5 0 0 0 9.5 1.5" /><path d="M13 13v-3h-3" /></>,
  target: <><circle cx="8" cy="8" r="5.5" /><circle cx="8" cy="8" r="2" /></>,
  database: <><ellipse cx="8" cy="3.5" rx="5.5" ry="2" /><path d="M2.5 3.5v9c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2v-9" /><path d="M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2" /></>,
  orbit: <><circle cx="8" cy="8" r="2.5" /><ellipse cx="8" cy="8" rx="6.5" ry="3" transform="rotate(-30 8 8)" /></>,
  // T×T-Matrix: Raster mit hervorgehobener Diagonale (die Kiyama-Lesart).
  matrix: <><rect x="2.5" y="2.5" width="11" height="11" rx="1" /><path d="M6.2 2.5v11M9.8 2.5v11M2.5 6.2h11M2.5 9.8h11" /><path d="M2.5 2.5h3.7v3.7h-3.7z M6.2 6.2h3.6v3.6H6.2z M9.8 9.8h3.7v3.7H9.8z" fill="currentColor" stroke="none" opacity="0.45" /></>,
  chart: <><path d="M2.5 13.5V2.5" /><path d="M2.5 13.5h11" /><path d="M4.5 10.5 7 7l2.5 2 3-4.5" /></>,
  pin: <><path d="M6 2h4l-.6 3.6 2.1 2.1H4.5l2.1-2.1z" /><path d="M8 7.7V14" /></>,
  info: <><circle cx="8" cy="8" r="6" /><path d="M8 7.2v4" /><path d="M8 4.9v.9" /></>,
  // Drift: eine steigende Kurve über der Zeitachse.
  trend: <><path d="M2 13.5h12" /><path d="M2.5 11 6 7l2.5 2L13 3" /><path d="M10.4 3H13v2.6" /></>,
  // Wort gegen Wort: zwei Verläufe, die sich annähern bzw. auseinandergehen.
  compare: <><path d="M2 3.5c4.5 0 5 9 12 9" /><path d="M2 12.5c4.5 0 5-9 12-9" /></>,
  // Nachbarschafts-Fluss: Bahnen, die die Plätze tauschen.
  ranking: <><path d="M2.5 4h11" /><path d="M2.5 8h7.5" /><path d="M2.5 12h4" /></>,
  flow: <><path d="M2 4h3c2.5 0 2.5 4 5 4h4" /><path d="M2 12h3c2.5 0 2.5-4 5-4h4" /><path d="M2 8h1.5" /></>,
};

export function Icon({
  name, size = 14, stroke = "currentColor", style, className, onClick,
}: {
  name: IconName; size?: number; stroke?: string; style?: CSSProperties; className?: string
  onClick?: () => void
}) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 16 16"
      fill="none" stroke={stroke} strokeWidth={1.4}
      strokeLinecap="round" strokeLinejoin="round"
      className={className} onClick={onClick}
      style={{ display: "inline-block", flexShrink: 0, ...style }}
    >
      {PATHS[name] ?? null}
    </svg>
  );
}

export function Logo({ size = 18, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "inline-block", ...style }}>
      <defs>
        <linearGradient id="lt-logo-g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="var(--lt-g-400)" />
          <stop offset="1" stopColor="var(--lt-g-700)" />
        </linearGradient>
      </defs>
      <path d="M12 1.5 22.5 12 12 22.5 1.5 12z" fill="url(#lt-logo-g)" />
      <path d="M12 6.5 17.5 12 12 17.5 6.5 12z" fill="var(--lt-bg-0)" opacity="0.18" />
    </svg>
  );
}
