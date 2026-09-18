/**
 * Aufklappbare Karten-Sektion für die Konfigurator-Spalte (LexoTerm `SectionFold`).
 * Kopf mit Chevron + Titel + optionalem Mono-Badge; Inhalt ein-/ausklappbar.
 */
import { useState, type ReactNode } from "react";
import { Icon, type IconName } from "../design/icons";

export function Section({
  title, badge, icon, defaultOpen = true, children,
}: {
  title: string;
  badge?: ReactNode;
  icon?: IconName;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="section">
      <button type="button" className="section__head" onClick={() => setOpen((v) => !v)}>
        <Icon name={open ? "chevDown" : "chevron"} size={11} className="section__chev" />
        {icon && <Icon name={icon} size={13} className="section__icon" />}
        <span className="section__title">{title}</span>
        {badge != null && <span className="section__badge lt-mono">{badge}</span>}
      </button>
      {open && <div className="section__body">{children}</div>}
    </div>
  );
}
