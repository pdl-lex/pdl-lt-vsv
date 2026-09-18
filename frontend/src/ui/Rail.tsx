/**
 * Modul-Rail (LexoTerm `grid-area: rail`, Design-Handoff §2). Zwei Zustände:
 * eingeklappt 56px als Icon-Glyphen je Gruppe, ausgeklappt 248px als
 * Hover-Flyout oder — per Pin — inline angeheftet.
 *
 * Anders als in der Referenz-Umsetzung (sg-predict_v2, Inline-Styles) laufen die
 * Stile hier über Klassen in `index.css`, wie im restlichen Vektor-Viz.
 */
import { useState } from "react";
import { Icon } from "../design/icons";
import { GROUP_ICON, MODULES, MODULE_GROUPS } from "../modules/registry";
import { useWorkbench } from "../state/workbench";

export function Rail() {
  const { activeId, setActiveId, railPinned, setRailPinned } = useWorkbench();
  const [hover, setHover] = useState(false);
  const expanded = railPinned || hover;

  const groups = MODULE_GROUPS.map((group) => ({
    group,
    items: MODULES.filter((m) => m.group === group),
  }));
  const activeGroup = groups.find((g) => g.items.some((m) => m.id === activeId))?.group ?? null;

  return (
    <nav
      className={`rail ${railPinned ? "rail--pinned" : ""}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label="Werkzeuge"
    >
      {!railPinned && (
        <div className="rail__glyphs" onClick={() => setRailPinned(true)} title="Navigation anheften">
          {groups.map((g) => (
            <span
              key={g.group}
              className={`rail__glyph ${g.group === activeGroup ? "rail__glyph--active" : ""}`}
              title={g.group}
            >
              <Icon name={GROUP_ICON[g.group]} size={16} />
              {g.items.length > 1 && <span className="rail__count lt-mono">{g.items.length}</span>}
            </span>
          ))}
        </div>
      )}

      <div className={`rail__flyout ${expanded ? "rail__flyout--open" : ""}`}>
        <div className="rail__head">
          <span className="lt-eyebrow">Navigation</span>
          <button
            type="button"
            className={`rail__pin ${railPinned ? "rail__pin--on" : ""}`}
            onClick={() => setRailPinned(!railPinned)}
            title={railPinned ? "Einklappen" : "Anheften"}
            aria-pressed={railPinned}
          >
            <Icon name="pin" size={13} />
          </button>
        </div>

        <div className="rail__body">
          {groups.map((g) => (
            <div key={g.group} className="rail__group">
              <div className={`rail__grouphead ${g.group === activeGroup ? "rail__grouphead--active" : ""}`}>
                <Icon name={GROUP_ICON[g.group]} size={15} />
                <span>{g.group}</span>
              </div>
              {g.items.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`rail__item ${m.id === activeId ? "rail__item--active" : ""}`}
                  onClick={() => setActiveId(m.id)}
                  aria-current={m.id === activeId ? "page" : undefined}
                  title={m.description}
                >
                  {m.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </nav>
  );
}
