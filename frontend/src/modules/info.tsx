/**
 * Info-Seite (Icon unten in der Rail): Quellen, Methoden, Software, Impressum.
 * Aufbau wie die Info-Seite des Fischer-Registers. Esc oder ein zweiter Klick
 * auf das Icon führt zum vorigen Modul zurück.
 */
import { useEffect, type ReactNode } from "react";
import { useViz } from "../state/store";
import { useWorkbench } from "../state/workbench";

const REPO = "https://github.com/pdl-lex/pdl-lt-vsv";

function Ext({ href, children }: { href: string; children?: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children ?? href}
    </a>
  );
}

export function InfoMain() {
  const indexed = useViz((s) => s.indexed);
  const toggleInfo = useWorkbench((s) => s.toggleInfo);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") toggleInfo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleInfo]);

  return (
    <div className="pane">
      <article className="doc">
        <header className="doc__head">
          <div className="lt-eyebrow">Über dieses Werkzeug</div>
          <h2 className="doc__title">Informationen</h2>
        </header>

        <section className="doc__section">
          <div className="lt-eyebrow">VSV – Visualisierung Semantischer Vektoren</div>
          <p>
            Ein Werkzeug der LexoTerm Tools zur Visualisierung diachroner Vektor-Datensätze,
            mit der Zeit als wichtigster Achse. Es ist nicht an ein Thema gebunden: Jeder
            Datensatz im vereinbarten Bundle-Schema lässt sich anzeigen (
            <Ext href={`${REPO}/blob/main/docs/SCHEMA.md`}>Schema-Beschreibung</Ext>).
          </p>
        </section>

        <section className="doc__section">
          <div className="lt-eyebrow">Daten</div>
          <p>
            Die mitgelieferten Bundestag-Bundles beruhen auf dem Corpus der Plenarprotokolle
            des Deutschen Bundestages (CPP-BT): Fobbe, S. (2026), Version 2026-01-17, Zenodo,{" "}
            <Ext href="https://doi.org/10.5281/zenodo.18177196">doi:10.5281/zenodo.18177196</Ext>,
            Lizenz CC BY-SA 4.0.
          </p>
          {indexed && (
            <p>
              Geladen ist gerade <em>{indexed.bundle.meta.name}</em>
              {indexed.bundle.meta.source ? <>, Quelle: {indexed.bundle.meta.source}</> : null}.
            </p>
          )}
        </section>

        <section className="doc__section">
          <div className="lt-eyebrow">Methoden</div>
          <p>
            Je nach Bundle sind die Wortvektoren aus Kookkurrenzen konstruiert (PPMI-SVD) oder
            mit Skip-Gram trainiert (SGNS); welches Verfahren, steht auf der Seite
            „Datenquelle" unter „Projektion". Ähnlichkeitsmatrizen, Drift-Kurven und
            Wandel-Ranking folgen:
          </p>
          <ul className="doc__refs">
            <li>
              Kiyama, H., Aida, T., Komachi, M., Ogiso, T., Takamura, H. &amp; Mochihashi, D.
              (2025): Analyzing continuous semantic shifts with diachronic word similarity
              matrices. <em>Proceedings of COLING 2025</em>, 1613–1631.{" "}
              <Ext href="https://aclanthology.org/2025.coling-main.109/">
                aclanthology.org/2025.coling-main.109
              </Ext>
            </li>
            <li>
              Hamilton, W. L., Leskovec, J. &amp; Jurafsky, D. (2016): Diachronic word
              embeddings reveal statistical laws of semantic change. <em>Proceedings of ACL
              2016</em>, 1489–1501.{" "}
              <Ext href="https://doi.org/10.18653/v1/P16-1141">doi:10.18653/v1/P16-1141</Ext>
            </li>
            <li>
              Gonen, H., Jawahar, G., Seddah, D. &amp; Goldberg, Y. (2020): Simple,
              interpretable and stable method for detecting words with usage change across
              corpora. <em>Proceedings of ACL 2020</em>, 538–555.{" "}
              <Ext href="https://doi.org/10.18653/v1/2020.acl-main.51">
                doi:10.18653/v1/2020.acl-main.51
              </Ext>
            </li>
          </ul>
        </section>

        <section className="doc__section">
          <div className="lt-eyebrow">Quellcode und Lizenz</div>
          <p>
            Quellcode und Dokumentation stehen unter der Lizenz{" "}
            <Ext href="https://creativecommons.org/licenses/by/4.0/deed.de">CC BY 4.0</Ext>.
          </p>
          <p>
            <Ext href={REPO} />
          </p>
        </section>

        <section className="doc__section">
          <div className="lt-eyebrow">Genutzte Software</div>
          <p>Wir danken den Autorinnen und Autoren der verwendeten Software:</p>
          <p>
            <Ext href="https://react.dev/">React</Ext>,{" "}
            <Ext href="https://threejs.org/">three.js</Ext>,{" "}
            <Ext href="https://r3f.docs.pmnd.rs/">React Three Fiber</Ext>,{" "}
            <Ext href="https://zod.dev/">Zod</Ext>,{" "}
            <Ext href="https://zustand.docs.pmnd.rs/">Zustand</Ext>,{" "}
            <Ext href="https://fastapi.tiangolo.com/">FastAPI</Ext>,{" "}
            <Ext href="https://numpy.org/">NumPy</Ext>,{" "}
            <Ext href="https://pola.rs/">Polars</Ext>
          </p>
        </section>

        <section className="doc__section">
          <div className="lt-eyebrow">Konzeption &amp; Programmierung</div>
          <p>
            Wolfgang Huang
            <br />
            <Ext href="https://pdl.badw.de">Neue Potenziale für die Digitale Lexikographie des Deutschen</Ext>
            <br />
            Bayerische Akademie der Wissenschaften
          </p>
        </section>

        <section className="doc__section">
          <div className="lt-eyebrow">Impressum</div>
          <p>
            <Ext href="https://badw.de/impressum">Siehe Impressum der BAdW</Ext>
          </p>
        </section>
      </article>
    </div>
  );
}
