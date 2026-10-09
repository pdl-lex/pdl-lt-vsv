/**
 * Modul-Rail (LexoTerm `grid-area: rail`, Design-Handoff §2). Zwei Zustände:
 * eingeklappt 56px als Icon-Glyphen je Gruppe, ausgeklappt 248px als
 * Hover-Flyout oder — per Pin — inline angeheftet.
 *
 * Anders als in der Referenz-Umsetzung (sg-predict_v2, Inline-Styles) laufen die
 * Stile hier über Klassen in `index.css`, wie im restlichen VSV.
 *
 * Unten sitzt, getrennt von den Werkzeugen, das Info-Icon (wie im
 * Fischer-Register): ein Klick öffnet die Info-Seite, ein zweiter schließt sie.
 */
import { useState } from "react";
import { Icon } from "../design/icons";
import { GROUP_ICON, INFO_MODULE, MODULES, MODULE_GROUPS } from "../modules/registry";
import { useWorkbench } from "../state/workbench";

export function Rail() {
  const { activeId, setActiveId, toggleInfo, railPinned, setRailPinned } = useWorkbench();
  const infoActive = activeId === INFO_MODULE.id;
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
          <span className="rail__spacer" />
          <button
            type="button"
            className={`rail__glyph rail__glyph--btn ${infoActive ? "rail__glyph--active" : ""}`}
            onClick={(e) => {
              e.stopPropagation(); // nicht anheften, sondern Info öffnen
              toggleInfo();
            }}
            title={INFO_MODULE.title}
            aria-label={INFO_MODULE.title}
            aria-pressed={infoActive}
          >
            <Icon name={INFO_MODULE.icon} size={16} />
          </button>
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
          {groups.map((g) => {
            // Gruppe aus genau einem gleichnamigen Modul (Einführung): der Kopf ist der Eintrag.
            const solo = g.items.length === 1 && g.items[0].label === g.group ? g.items[0] : null;
            if (solo) {
              return (
                <div key={g.group} className="rail__group">
                  <button
                    type="button"
                    className={`rail__grouphead rail__grouphead--btn ${
                      solo.id === activeId ? "rail__grouphead--current" : ""
                    }`}
                    onClick={() => setActiveId(solo.id)}
                    aria-current={solo.id === activeId ? "page" : undefined}
                  >
                    <Icon name={GROUP_ICON[g.group]} size={15} />
                    <span>{g.group}</span>
                  </button>
                </div>
              );
            }
            return (
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
            );
          })}
        </div>

        <div className="rail__foot">
          <button
            type="button"
            className={`rail__grouphead rail__grouphead--btn ${infoActive ? "rail__grouphead--current" : ""}`}
            onClick={toggleInfo}
            aria-current={infoActive ? "page" : undefined}
          >
            <Icon name={INFO_MODULE.icon} size={15} />
            <span>{INFO_MODULE.label}</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
