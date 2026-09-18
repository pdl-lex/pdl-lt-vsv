/**
 * Konfidenz-Kodierung: Punktgröße und Deckkraft ∝ Zell-Frequenz (specs.md §2,
 * SCHEMA.md). Dünn besetzte Zellen (kleine n) bleiben sichtbar klein/blass, statt
 * optisch überinterpretiert zu werden. `freq==0` (leere Zelle) → unsichtbar.
 */

export interface Confidence {
  /** Multiplikator auf den Basisradius (nie 0, damit belegte Zellen sichtbar bleiben). */
  sizeFactor: number;
  /** Deckkraft 0..1; 0 nur bei freq<=0. */
  opacity: number;
}

/** Leitet Größe/Deckkraft aus freq relativ zum bundleweiten Maximum ab. */
export function confidence(freq: number, freqMax: number): Confidence {
  if (freq <= 0) return { sizeFactor: 0.4, opacity: 0 };
  const ratio = Math.max(0, Math.min(1, freq / freqMax));
  const s = Math.sqrt(ratio); // Fläche ~ freq → Radius ~ sqrt(freq)
  return {
    sizeFactor: 0.4 + 0.6 * s,
    opacity: 0.3 + 0.7 * s,
  };
}
