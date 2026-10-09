/**
 * Zeitachse: kontinuierlicher Slider über die Zeitscheiben (Interpolation macht
 * die Bewegung glatt), mit Abspiel-Button und einer Markierung der Zäsur
 * (`meta.shift_point`). Reine Client-Interaktion, kein Server-Roundtrip.
 */
import { useEffect, useRef, useState } from "react";
import { useViz, useVizPick } from "../state/store";
import { Icon } from "../design/icons";

const SLICES_PER_SECOND = 6;

export function TimeSlider() {
  const { indexed, sliceT, setSliceT } = useVizPick("indexed", "sliceT", "setSliceT");
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  if (!indexed) return null;
  const { sortedSlices, sliceCount, shiftSliceIndex } = indexed;
  const maxT = Math.max(0, sliceCount - 1);
  const idxNow = Math.max(0, Math.min(Math.round(sliceT), maxT));
  const slice = sortedSlices[idxNow];

  const stop = () => {
    playingRef.current = false;
    setPlaying(false);
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  const tick = (ts: number) => {
    if (!playingRef.current) return;
    const dt = (ts - lastTsRef.current) / 1000;
    lastTsRef.current = ts;
    // Frisch aus dem Store: wird während des Abspielens ein anderes Bundle
    // geladen, gilt dessen Länge, nicht die beim Start.
    const { sliceT: cur, indexed: now } = useViz.getState();
    const end = Math.max(0, (now?.sliceCount ?? 1) - 1);
    let next = cur + dt * SLICES_PER_SECOND;
    if (next >= end) next = 0; // Schleife
    setSliceT(next);
    rafRef.current = requestAnimationFrame(tick);
  };

  const togglePlay = () => {
    if (playingRef.current) {
      stop();
    } else {
      playingRef.current = true;
      setPlaying(true);
      lastTsRef.current = performance.now();
      rafRef.current = requestAnimationFrame(tick);
    }
  };

  const shiftPct = shiftSliceIndex !== null && maxT > 0 ? (shiftSliceIndex / maxT) * 100 : null;

  return (
    <div className="timeslider">
      <button
        type="button"
        className="timeslider__play"
        onClick={togglePlay}
        aria-label={playing ? "Pause" : "Abspielen"}
      >
        <Icon name={playing ? "pause" : "play"} size={13} />
      </button>
      <div className="timeslider__track">
        <input
          type="range"
          min={0}
          max={maxT}
          step={0.01}
          value={sliceT}
          onChange={(e) => {
            stop();
            setSliceT(parseFloat(e.target.value));
          }}
        />
        {shiftPct !== null && (
          <div
            className="timeslider__shift"
            style={{ left: `${shiftPct}%` }}
            title={`Zäsur: ${indexed.bundle.meta.shift_point}`}
          />
        )}
      </div>
      <div className="timeslider__label lt-mono">{slice?.label ?? slice?.id ?? "—"}</div>
    </div>
  );
}
