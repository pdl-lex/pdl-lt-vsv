/**
 * Kopfzeile im LexoTerm-Werkzeug-Look: Logo + Brotkrümel (Plattform / Werkzeug /
 * aktives Modul / Datensatz) und rechts der Hell/Dunkel-Schalter. Die Navigation
 * selbst sitzt in der Modul-Rail, hier steht nur, wo man gerade ist.
 */
import { useViz } from "../state/store";
import { useTheme } from "../state/theme";
import { useWorkbench } from "../state/workbench";
import { moduleById } from "../modules/registry";
import { Icon, Logo } from "../design/icons";

export function Header() {
  const { indexed } = useViz();
  const { mode, toggle } = useTheme();
  const activeId = useWorkbench((s) => s.activeId);
  const dark = mode === "dark";

  return (
    <header className="hdr">
      <Logo size={18} />
      <span className="hdr__brand">LexoTerm Tools</span>
      <span className="hdr__slash">/</span>
      <span className="hdr__tool">Vektor-Viz</span>
      <span className="hdr__slash">/</span>
      <span className="hdr__tool">{moduleById(activeId).title}</span>
      {indexed && (
        <>
          <span className="hdr__slash">/</span>
          <span className="hdr__crumb" title={indexed.bundle.meta.description}>
            {indexed.bundle.meta.name}
          </span>
        </>
      )}

      <span className="hdr__spacer" />

      <button
        type="button"
        className="hdr__iconbtn"
        onClick={toggle}
        title={dark ? "Heller Modus" : "Dunkler Modus"}
        aria-label={dark ? "Heller Modus" : "Dunkler Modus"}
      >
        <Icon name={dark ? "moon" : "sun"} size={14} />
      </button>
    </header>
  );
}
