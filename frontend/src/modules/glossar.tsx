/**
 * Modul „Glossar": die wichtigsten Begriffe des Werkzeugs, knapp und für
 * Einsteiger. Jeder Eintrag sagt, worauf sich der Begriff bezieht (Zielwörter,
 * Kontextwörter, Anker …) und welche Variable im Bundle dahintersteht.
 *
 * Die Inhalte beschreiben die Bundles der Pipeline (pdl-lt-vsv-pipeline,
 * PPMI-SVD und SGNS) und `docs/SCHEMA.md`. Ändert sich dort die Bedeutung
 * eines Felds, muss der Eintrag hier mitgezogen werden.
 */
import { useMemo, useState, type ReactNode } from "react";

type Scope = "Zielwörter" | "Kontextwörter" | "Anker" | "Nachbarn" | "Zellen" | "Zeitscheiben" | "alle Wörter";

interface Entry {
  term: string;
  /** Weitere Namen, unter denen der Begriff im Werkzeug auftaucht (für die Suche). */
  aka?: string[];
  scope: Scope[];
  /** Feld/Variable im Bundle bzw. Suchraum. */
  variable?: string;
  /** Hinweis, der hervorgehoben wird (z. B. „nur Zellen mit PPMI > 0"). */
  caveat?: string;
  text: ReactNode;
}

interface Group {
  title: string;
  entries: Entry[];
}

const GROUPS: Group[] = [
  {
    title: "Grundbegriffe",
    entries: [
      {
        term: "Zielwort",
        aka: ["Entity", "Trajektorie"],
        scope: ["Zielwörter"],
        variable: "entities",
        text: (
          <>
            Ein Wort, dessen Bedeutungswandel untersucht wird, z. B. „Zeitenwende“. Die Liste der
            Zielwörter wird zu Beginn der Korpusanalyse festgelegt. Für jedes
            Zielwort gibt es je Zeitscheibe einen eigenen Vektor; hintereinander gelesen ergibt das
            seine <em>Trajektorie</em>, den Weg durch den Wortraum.
          </>
        ),
      },
      {
        term: "Kontextwort",
        aka: ["Kandidat"],
        scope: ["Kontextwörter"],
        variable: "space_index (role = candidate)",
        text: (
          <>
            Ein Wort, das in der Nähe eines Zielworts im Text vorkommt (im PPMI-Verfahren: im selben
            Satz). Die Kontextwörter ergeben sich aus dem analysierten Korpus. Aus ihnen werden die
            Vektoren der Zielwörter gebaut, und aus ihnen werden
            die Nachbarn und die Anker ausgewählt.
          </>
        ),
      },
      {
        term: "Zeitscheibe",
        aka: ["Slice", "time_slice"],
        scope: ["Zeitscheiben"],
        variable: "time_slices",
        text: (
          <>
            Ein Zeitabschnitt des Korpus, z. B. ein Jahr oder ein Halbjahr. Alles wird je
            Zeitscheibe getrennt gezählt und berechnet; die Zeitachse in den Diagrammen läuft über
            die Zeitscheiben.
          </>
        ),
      },
      {
        term: "Zelle",
        aka: ["Aggregat"],
        scope: ["Zellen"],
        variable: "aggregates (entity_id × time_slice_id)",
        text: (
          <>
            Ein Zielwort in einer Zeitscheibe, also ein Paar wie „Krieg, 2022“. Die Zelle ist die
            kleinste Einheit: Sie hat einen Vektor, eine Frequenz und eine Position im 3D-Bild.
            Kommt das Wort in der Zeitscheibe nicht vor, ist die Zelle <em>unbelegt</em>.
          </>
        ),
      },
      {
        term: "Wortvektor",
        aka: ["Vektor", "Embedding", "Wortraum"],
        scope: ["alle Wörter"],
        variable: "vector",
        text: (
          <>
            Eine lange Zahlenreihe (z. B. 100 Zahlen), die beschreibt, in welchen Zusammenhängen ein
            Wort vorkommt. Wörter mit ähnlichen Zusammenhängen haben ähnliche Vektoren und liegen im
            <em> Wortraum</em> nah beieinander. Alle Berechnungen (Ähnlichkeit, Drift, Nachbarn)
            nutzen die vollständigen Vektoren.
          </>
        ),
      },
    ],
  },
  {
    title: "Zählen und Belegung",
    entries: [
      {
        term: "Frequenz",
        aka: ["freq", "Häufigkeit", "Treffer", "n_hits"],
        scope: ["Zielwörter", "Zellen"],
        variable: "freq",
        text: (
          <>
            Wie oft ein Zielwort in einer Zeitscheibe vorkommt — eine einfache Zählung, unabhängig
            von PPMI. Je höher, desto verlässlicher ist der Vektor der Zelle; deshalb werden Punkte
            mit kleiner Frequenz im 3D-Bild kleiner und blasser gezeichnet. Die Seite
            „Zielwörter“ summiert sie zur <em>Häufigkeit</em>.
          </>
        ),
      },
      {
        term: "Belegung (Zielwort)",
        aka: ["belegt", "unbelegt"],
        scope: ["Zielwörter"],
        variable: "Anzahl Zeitscheiben mit freq > 0",
        caveat: "SGNS: belegt erst ab 3 Vorkommen je Zeitscheibe",
        text: (
          <>
            In wie vielen Zeitscheiben ein Zielwort vorkommt. Fehlt es in einer Zeitscheibe, setzen
            Linien und Kurven dort aus, statt eine Bewegung zu erfinden. Im SGNS-Verfahren gilt ein
            Wort mit weniger als 3 Vorkommen als nicht vorhanden.
          </>
        ),
      },
      {
        term: "Belegung (Kontextwort)",
        aka: ["Mindestbelegung", "n_target_slices"],
        scope: ["Kontextwörter", "Anker", "Nachbarn"],
        variable: "n_target_slices",
        caveat: "zählt nur Zellen mit PPMI > 0",
        text: (
          <>
            In wie vielen Zellen (Zielwort × Zeitscheibe) ein Kontextwort auffällig oft auftritt.
            Ein Wort, das nur in wenigen Zellen vorkommt, ist eher Zufall; der Filter
            „Mindestbelegung“ blendet solche Wörter als Nachbarn aus. Nicht zu verwechseln mit der
            Belegung eines Zielworts.
          </>
        ),
      },
      {
        term: "Kookkurrenzen",
        aka: ["n_cooc", "Kookkurrenz", "Mindestzahl Kookkurrenzen"],
        scope: ["Kontextwörter", "Anker", "Nachbarn"],
        variable: "n_cooc",
        caveat: "zählt nur Zellen mit PPMI > 0",
        text: (
          <>
            Wie oft ein Kontextwort insgesamt gemeinsam mit einem Zielwort vorkommt, summiert über
            alle Zellen, in denen es auffällig ist. Daher immer mindestens so groß wie seine
            Belegung. Bestimmt die Schriftgröße in der Wortwolke der Seite „Nächste Nachbarn“.
          </>
        ),
      },
      {
        term: "PPMI",
        aka: ["PMI", "positive pointwise mutual information"],
        scope: ["Zellen", "Kontextwörter"],
        text: (
          <>
            Ein Maß dafür, ob zwei Wörter <em>öfter</em> zusammen vorkommen, als der Zufall
            erwarten ließe. PPMI = 0 heißt „nicht öfter als erwartet“ (auch seltener wird auf 0
            gesetzt); Werte über 0 heißen „auffällig oft“. Nur diese auffälligen Paare gehen in die
            Vektoren und in Belegung und Kookkurrenzen der Kontextwörter ein. Gibt es nur bei
            PPMI-Bundles.
          </>
        ),
      },
    ],
  },
  {
    title: "Nachbarn und Anker",
    entries: [
      {
        term: "Nächste Nachbarn",
        aka: ["Nachbarn", "NN", "k"],
        scope: ["Zielwörter", "Nachbarn"],
        variable: "neighbors (vorberechnet) bzw. Suchraum",
        text: (
          <>
            Die Wörter, deren Vektor dem Vektor eines Zielworts in einer Zeitscheibe am ähnlichsten
            ist — sie zeigen, in welchem Umfeld das Wort gerade steht. <em>k</em> ist die Zahl der
            angezeigten Nachbarn. Welche Wörter überhaupt infrage kommen, legt die Seite „Nächste
            Nachbarn“ fest (Wortart, Mindestbelegung, Stoppwörter).
          </>
        ),
      },
      {
        term: "Suchraum",
        aka: ["neighbor_space", "Kandidaten"],
        scope: ["Kontextwörter"],
        variable: "meta.neighbor_space, space_index.parquet",
        text: (
          <>
            Alle Kontextwörter mit Vektor, unter denen das Backend die Nachbarn live sucht. Ist er
            vorhanden, wirken die Filter sofort; sonst zeigt das Werkzeug die im Bundle
            vorberechneten Nachbarn.
          </>
        ),
      },
      {
        term: "Anker",
        aka: ["Landmarke", "anchors"],
        scope: ["Anker", "Kontextwörter"],
        variable: "anchors (label, cluster, lemma)",
        text: (
          <>
            Ausgewählte, inhaltlich wichtige Wörter, die im 3D-Wortraum als beschriftete Punkte
            stehen. Sie dienen als Orientierung, damit man die Wege der
            Zielwörter einordnen kann. Anker sind Kontextwörter, ausgewählt aus einer von Hand
            gepflegten Liste; auf der Seite „Anker“ lassen sie sich für die Sitzung ändern.
          </>
        ),
      },
      {
        term: "Cluster",
        aka: ["Anker-Cluster"],
        scope: ["Anker"],
        variable: "anchors.cluster",
        text: (
          <>
            Eine thematische Gruppe von Ankern, z. B. „Rüstung“ oder „Sicherheit“. Anker desselben
            Clusters haben dieselbe Farbe. Ist ein Nachbar zugleich Anker, trägt er dessen Cluster.
          </>
        ),
      },
      {
        term: "Stoppwörter",
        aka: ["Stoppwort", "ausblenden"],
        scope: ["Nachbarn"],
        variable: "meta.neighbor_space.stopwords",
        text: (
          <>
            Wörter, die als Nachbarn nichts aussagen (z. B. „Herr“, „Präsident“, „sagen“) und daher
            ausgeblendet werden. Die Liste lässt sich auf der Seite „Nächste Nachbarn“ ergänzen.
          </>
        ),
      },
      {
        term: "Wortart",
        aka: ["POS", "pos"],
        scope: ["Kontextwörter", "Nachbarn"],
        variable: "pos",
        text: (
          <>
            Grammatische Kategorie eines Kontextworts: NOUN (Substantiv), PROPN (Eigenname), ADJ
            (Adjektiv), VERB. Nachbarn lassen sich danach filtern; angegeben ist die häufigste
            Wortart des Worts.
          </>
        ),
      },
    ],
  },
  {
    title: "Messen von Wandel",
    entries: [
      {
        term: "Kosinus-Ähnlichkeit",
        aka: ["Ähnlichkeit", "cos", "score"],
        scope: ["alle Wörter"],
        text: (
          <>
            Wie ähnlich zwei Vektoren sind, von −1 bis 1; 1 heißt „gleiche Richtung“. Grundlage
            für Nachbarn, Ähnlichkeitsmatrizen und Drift. Die Zahl neben einem Nachbarn ist seine
            Kosinus-Ähnlichkeit zum Zielwort.
          </>
        ),
      },
      {
        term: "Drift",
        aka: ["Verschiebung", "Bezugspunkt"],
        scope: ["Zielwörter"],
        text: (
          <>
            Wie weit sich ein Zielwort von einem Bezugspunkt entfernt hat, z. B. von seiner ersten
            Zeitscheibe. Gemessen als 1 − Kosinus-Ähnlichkeit oder als Anteil der Nachbarn, die
            nicht mehr dieselben sind (<em>Überlappung</em>). Hoch heißt „weit weg“, nicht
            „unwichtig“.
          </>
        ),
      },
      {
        term: "Überlappung",
        aka: ["Nachbarüberlappung", "Wandel-Ranking"],
        scope: ["Zielwörter", "Nachbarn"],
        text: (
          <>
            Wie viele der k nächsten Nachbarn zwei Zeitscheiben gemeinsam haben. Wenig Überlappung
            heißt: Das Wort hat sein Umfeld gewechselt. Grundlage des Wandel-Rankings; dort zählt
            nicht die Überlappung selbst, sondern ihr Abstand zur Zufalls-Überlappung, denn
            dünn belegte Wörter haben auch ohne Wandel wenig gemeinsame Nachbarn.
          </>
        ),
      },
      {
        term: "Kontrast / Generik",
        aka: ["kontrast", "generik", "Gütemaß"],
        scope: ["Zellen"],
        variable: "kontrast, generik",
        text: (
          <>
            Optionale Gütemaße je Zelle. <em>Kontrast</em>: Sagt der Vektor etwas Eigenes über das
            Wort aus? <em>Generik</em>: Ist die Nachbarliste aussagekräftig, oder liegt alles
            ungefähr gleich nah? Fehlen sie, misst das Bundle sie nicht.
          </>
        ),
      },
    ],
  },
  {
    title: "Verfahren und Darstellung",
    entries: [
      {
        term: "PPMI-SVD",
        aka: ["SVD"],
        scope: ["alle Wörter"],
        variable: "meta.method",
        text: (
          <>
            Verfahren, bei dem die Vektoren aus gezählten Kookkurrenzen <em>berechnet</em> werden:
            erst PPMI, dann eine Verdichtung auf wenige Dimensionen (SVD). Nachvollziehbar und
            ohne Zufall; Nachbarn sind Kontextwörter.
          </>
        ),
      },
      {
        term: "SGNS",
        aka: ["word2vec", "Skip-Gram"],
        scope: ["alle Wörter"],
        variable: "meta.method",
        text: (
          <>
            Verfahren, bei dem die Vektoren je Zeitscheibe von einem kleinen neuronalen Netz
            (word2vec) <em>gelernt</em> und dann aufeinander ausgerichtet werden. Braucht mehr Text;
            Wörter mit weniger als 3 Vorkommen je Zeitscheibe fallen weg.
          </>
        ),
      },
      {
        term: "3D-Projektion",
        aka: ["PCA", "coords_3d", "Projektion"],
        scope: ["alle Wörter"],
        variable: "coords_3d",
        text: (
          <>
            Die Vektoren haben viele Dimensionen; für das 3D-Bild werden sie auf drei verkürzt
            (PCA). Dabei geht viel verloren — das Bild dient der Orientierung, belastbare Aussagen
            kommen aus den Modulen, die mit den vollen Vektoren rechnen.
          </>
        ),
      },
      {
        term: "Bundle",
        aka: ["Datensatz"],
        scope: ["alle Wörter"],
        text: (
          <>
            Ein fertig aufbereiteter Datensatz (JSON-Datei, ggf. mit Suchraum-Dateien), den die
            Pipeline erzeugt: Zielwörter, Zeitscheiben, Vektoren, Anker, Nachbarn. Gewählt wird es
            auf der Seite „Datenquelle“.
          </>
        ),
      },
    ],
  },
];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function plain(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(plain).join("");
  if (typeof node === "object" && "props" in node) return plain((node as { props: { children?: ReactNode } }).props.children);
  return "";
}

export function GlossarMain() {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return GROUPS;
    return GROUPS.map((g) => ({
      ...g,
      entries: g.entries.filter((e) =>
        norm([e.term, ...(e.aka ?? []), e.variable ?? "", e.scope.join(" "), plain(e.text)].join(" ")).includes(q),
      ),
    })).filter((g) => g.entries.length > 0);
  }, [query]);

  return (
    <div className="pane">
      <article className="doc">
        <header className="doc__head">
          <div className="lt-eyebrow">Einführung</div>
          <h2 className="doc__title">Glossar</h2>
          <p className="doc__lead">
            Die wichtigsten Begriffe, kurz erklärt. Bei jedem steht, worauf er sich bezieht —
            Zielwörter, Kontextwörter, Anker oder Nachbarn — und welches Feld im Datensatz
            dahintersteht.
          </p>
        </header>

        <input
          type="search"
          className="picker__select gl__search"
          placeholder="Begriff suchen, z. B. Belegung oder n_cooc"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {groups.length === 0 && <p className="mode__hint">Kein Eintrag gefunden.</p>}

        {groups.map((g) => (
          <section key={g.title} className="doc__section">
            <div className="lt-eyebrow">{g.title}</div>
            <dl className="gl">
              {g.entries.map((e) => (
                <div key={e.term} className="gl__entry">
                  <dt className="gl__term">{e.term}</dt>
                  <dd className="gl__body">
                    <div className="gl__meta">
                      <span className="gl__label">bezieht sich auf</span>
                      {e.scope.map((s) => (
                        <span key={s} className="gl__scope">{s}</span>
                      ))}
                      {e.variable && (
                        <>
                          <span className="gl__label">Feld</span>
                          <code className="gl__var">{e.variable}</code>
                        </>
                      )}
                    </div>
                    <p className="gl__text">{e.text}</p>
                    {e.caveat && <p className="gl__caveat">{e.caveat}</p>}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </article>
    </div>
  );
}
