/**
 * Kleines Info-Icon mit Hover/Fokus-Tooltip — für die Kartenköpfe der rechten
 * Overlay-Spalte (Nachbarn/Beleg/Umgebung), die anders als ProjectionNote
 * keinen eigenen aufklappbaren Erklärtext haben. Reiner CSS-Hover
 * (`:hover`/`:focus-within`), kein State nötig.
 */
import { Icon } from "../design/icons";

export function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="infotip" tabIndex={0} aria-label="Erklärung">
      <Icon name="info" size={12} />
      <span className="infotip__bubble" role="note">{text}</span>
    </span>
  );
}
