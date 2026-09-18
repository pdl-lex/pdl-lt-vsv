/**
 * Die 45°-Schraffur für „kein Beleg" — eine einzige Implementierung, weil sie
 * über alle Ansichten hinweg dasselbe bedeuten muss.
 *
 * Textur statt Farbe ist Absicht: die Sequential-Rampe lässt kleine Werte
 * absichtlich gegen die Fläche zurücktreten (`theme.ts`), also wäre „keine
 * Daten" als blasse Farbe nicht von „wenig" zu unterscheiden. Textur trägt
 * zusätzlich bei Farbfehlsichtigkeit, im Druck und unter `forced-colors`.
 */
import type { Mode } from "./theme";
import { MASK } from "./theme";

/** 8×8-Kachel mit 45°-Linien; Rückfall auf die Grundfarbe, wenn kein 2D-Kontext. */
export function hatchPattern(ctx: CanvasRenderingContext2D, mode: Mode): CanvasPattern | string {
  const tile = document.createElement("canvas");
  tile.width = 8;
  tile.height = 8;
  const t = tile.getContext("2d");
  if (!t) return MASK[mode].ground;
  t.fillStyle = MASK[mode].ground;
  t.fillRect(0, 0, 8, 8);
  t.strokeStyle = MASK[mode].ink;
  t.lineWidth = 1;
  // Drei Segmente, damit die Kachel an allen Kanten nahtlos anschließt.
  t.beginPath();
  t.moveTo(0, 8);
  t.lineTo(8, 0);
  t.moveTo(-2, 2);
  t.lineTo(2, -2);
  t.moveTo(6, 10);
  t.lineTo(10, 6);
  t.stroke();
  return ctx.createPattern(tile, "repeat") ?? MASK[mode].ground;
}
