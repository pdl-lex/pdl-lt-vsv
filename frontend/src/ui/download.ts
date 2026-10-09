/**
 * Textdatei zum Speichern anbieten (CSV-, TSV- und Stoppwort-Export).
 *
 * Die Objekt-URL wird erst nach einer Weile freigegeben: sofort nach `click()`
 * freigegeben, bricht der Download in manchen Browsern ab. Der Link hängt kurz
 * im Dokument, weil ältere Browser einen losgelösten Link nicht anklicken.
 */
export function downloadText(text: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
