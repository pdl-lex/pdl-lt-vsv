# pdl-lt-vsv
Visualisierungstool für **diachrone Vektor-Datensätze** – im Geist des TensorFlow
Projectors, aber mit der **Zeit als wichtigster Achse**. Primärer Anwendungsfall
ist das DNB-Zeitenwende-Projekt (Wandel deutschen Militär-/Verteidigungsvokabulars
2010–2025); das Tool ist aber **domänenunabhängig** und rendert jeden Datensatz im
vereinbarten Bundle-Schema (siehe [`data/test/SCHEMA.md`](data/test/SCHEMA.md)).

Wie die Daten aussehen müssen: [`data/test/SCHEMA.md`](data/test/SCHEMA.md),
einschließlich des Suchraums für Nachbarabfragen (`meta.neighbor_space`). Die
Datengenerierung liegt im separaten Repo `pdl-lt-vsv-pipeline`; dort beschreibt
`internal/Readme Datenmodell.md`, was jede Visualisierung aus den Daten rechnet.

## Aktueller Stand

Eine **Workbench mit mehreren Werkzeugen** über demselben Bundle. Navigation
über die Icon-Rail links. Das Bundle wird einmal geladen und von allen Modulen geteilt — ein
Modulwechsel verliert weder Auswahl noch Zeitposition.

| Modul | Was es zeigt |
|---|---|
| **Datenquelle** | Bundle laden und prüfen: Projektion, Zeitraum, Facetten, Belegung je Zielwort |
| **Nachbar-Filter** | Welche Wörter als Nachbarn infrage kommen (Wortart, Mindestbelegung, Stoppwörter …); gilt in allen Modulen |
| **Wortraum (3D)** | Trajektorien durch den gemeinsamen Vektorraum, Zeit als Achse |
| **Ähnlichkeitsmatrizen** | T×T-Selbstähnlichkeit je Zielwort (Kiyama) |
| **Drift-Kurven** | Abstand zu einem Bezugszeitpunkt über die Zeit (Hamilton) |
| **Wort gegen Wort** | Kreuzähnlichkeit zweier Zielwörter je Zeitscheibe |
| **Nachbarschafts-Fluss** | Top-k-Nachbarn je Zeitscheibe als Bump-Diagramm |

### Datenquelle

- **Domänenunabhängiger Bundle-Loader** mit Laufzeit-Validierung (zod). Zwei
  gleichwertige Quellen hinter einer Schnittstelle: Backend-**Picker** und
  **Datei öffnen / Drag-and-Drop** beliebiger Schema-JSONs.
- **Bundle-Übersicht**: Kennzahlen, Projektionsverfahren, Facetten-Schema und
  ein Belegungsbalken je Zielwort (Zeitscheiben mit `freq > 0`). Macht dünne
  Korpusstellen sichtbar, bevor man sie visualisiert.

### Wortraum (3D)

- **3D-Punktwolke** (react-three-fiber): Anker als beschriftete Landmarken,
  Zielwörter als bewegte Punkte, Kamera-Navigation.
- **Zeitachse**: kontinuierlicher Slider mit Interpolation, Abspiel-Button,
  Markierung der Zäsur (`meta.shift_point`).
- **Trajektorien** je Zielwort mit Lücken-Behandlung (leere `freq==0`-Zellen
  unterbrechen den Pfad statt Bewegung zu erfinden).
- **Nearest-Neighbour-Overlay** + Panel (score/group) beim Scrubben, Länge per
  Regler einstellbar (Standard 8, bis zur Listenlänge: 1000 bei Abfragen über
  das Backend, sonst die Länge der vorberechneten Listen im Bundle). Ausgewählt
  wird im vollen Vektorraum, der Regler schneidet nur die Anzeigeliste ab.
  Positionen kommen aus `anchors`, aus der Kandidatentabelle des Suchraums bzw.
  aus `vocab_points`. Im Panel blendet „×“ einen Nachbarn aus (als Stoppwort).
  Eine Zeile über der Liste sagt, welche Filter gelten.
- **Auflösungs-Gating**: liefert ein Bundle die optionalen Gütemaße `kontrast`/
  `generik` je Zelle (bislang das SGNS-Bundle), dämpft die Szene Punkte, Labels
  und Linien unterhalb gemessener Schwellen, statt sie zu verstecken – ohne
  diese Felder sieht die Ansicht unverändert aus.
- **Hinweiskarten** unter dem Nachbarn-Panel: Beleg-Anzeige (`freq` vs. Median
  des Worts) und ein Kasten zur zweistufigen Dimensionsreduktion SVD → PCA.
- **Konfidenz-Kodierung**: Punktgröße/Deckkraft ∝ `freq`.
- **Farbpalette** aus dem dataviz-Standard, hell/dunkel-fähig, CVD-validiert
  (Identität der Zielwörter zusätzlich per Direkt-Label gesichert).
- **Facetten-Filter + drei Ansichtsmodi** (Faceted Search, Multi-Select je
  Facette, aktive Filter als Chips, UND-Verknüpfung):
  - **Aggregiert** – eine Trajektorie je Wort (aus `aggregates`).
  - **Facettiert** – eine Linie je Facettenwert (aus `records`), Farbe trägt die
    Facette → Quellenunterschiede werden sichtbar.
  - **Streuung** – facettenaufgelöste Punktwolke je Wort (Unsicherheit/Konsens).

### Nachbar-Filter

Eine Seite, auf der festgelegt wird, welche Wörter als Nachbarn infrage kommen.
Die Filter wirken in allen Modulen: Nachbarn-Panel, Punkte im Wortraum,
Nachbarschafts-Fluss.

- **Gerechnet wird im Backend**, im vollen Vektorraum und nach rohem Kosinus,
  nur unter den Kandidaten, die alle Filter passieren. Voraussetzung ist ein
  Bundle mit Suchraum (`meta.neighbor_space` plus `.vectors.npy` und
  `.index.parquet` neben dem JSON). Die Regeln stehen in `SCHEMA.md`.
- **Welche Filter es gibt, bestimmt das Bundle**; die Bedienelemente entstehen
  aus der Deklaration: Auswahl mit Anzahl je Wert (z. B. Wortart), Untergrenze
  (z. B. Mindestbelegung), Ausblenden-Schalter (z. B. Rednernamen). Je Filter
  lässt sich die Voreinstellung wiederherstellen.
- **Stoppwörter:** Das Bundle liefert eine Liste mit; gearbeitet wird mit einer
  Kopie (ergänzen, entfernen, als Textdatei herunter- und hochladen, auf die
  mitgelieferte Liste zurücksetzen). Abgleich über das Lemma. Die geänderte
  Liste bleibt je Bundle im Browser gespeichert.
- **Rückfall:** Ohne Suchraum, bei einer aus einer Datei geöffneten Bundle-Datei
  oder wenn das Backend nicht antwortet, gelten die vorberechneten `neighbors`
  des Bundles, mit Hinweis. Sie entsprechen genau den Voreinstellungen.

### Ähnlichkeitsmatrizen (Kiyama)

Für jedes Zielwort eine **T×T-Matrix** `M[i][j] = cos(v_ti, v_tj)`: das Wort mit
sich selbst zu je zwei Zeitpunkten verglichen. Die Trajektorie zeigt, *wohin* ein
Wort gewandert ist; die Matrix zeigt, *wie* — Bruch, stetige Drift oder Rückkehr.

- **Small Multiples** über die ausgewählten Wörter, Klick öffnet die Detailansicht
  mit Achsen und Zellenauslesung; Hovern liest überall exakte Werte aus.
- **Gerechnet wird auf den vollen Vektoren**, nicht auf `coords_3d` — die
  3D-Projektion ist verlustbehaftet, Kosinuswerte daraus wären verzerrt. Liefert
  ein Bundle keine `vector`-Felder, wird der Rückfall angeschrieben.
- **Unbelegte Zeitscheiben (`freq == 0`) sind schraffiert, nicht eingefärbt.**
  „Kein Beleg" ist kein kleiner Wert — und die Sequential-Rampe lässt geringe
  Ähnlichkeit absichtlich gegen die Fläche zurücktreten.
- **Skala umschaltbar** gemeinsam ↔ je Matrix: gemeinsam macht Wörter
  vergleichbar, je Matrix macht die Binnenstruktur maximal sichtbar.
- Die **Zäsur** (`meta.shift_point`) liegt als Hilfslinie auf beiden Achsen —
  damit prüfbar ist, ob ein Blockwechsel wirklich dort sitzt.

### Drift-Kurven (Hamilton)

`1 − cos(v_ref, v_t)` als Zeitreihe: **wie weit** hat sich ein Wort von seinem
Bezugspunkt entfernt? Das ist eine Zeile der Matrix, an der Achse gespiegelt —
und damit ablesbar statt nur sichtbar.

- **Bezugspunkt umschaltbar**, weil er bestimmt, welche Zeile man ansieht:
  *Erstbeleg* (je Wort der eigene erste Beleg — fair für Wörter, die erst später
  auftauchen), *Zeitpunkt* (dieselbe Scheibe für alle, streng vergleichbar) oder
  *Vorgänger* (Abstand zur Vorscheibe = Änderungsrate; Spitzen zeigen den
  Zeitpunkt der Bewegung).
- Wörter **ohne Beleg am gewählten Bezugspunkt** werden angeschrieben statt
  stillschweigend auf etwas anderes ausgewichen.
- Die Achse ist bei 0 verankert: Distanz 0 heißt „identisch mit dem Bezugspunkt"
  und ist ein echter Nullpunkt.
- Kennzahlentabelle: Drift zuletzt und stärkste Drift mit Zeitpunkt.

### Wort gegen Wort

`cos(v_a^t, v_b^t)` je Zeitscheibe — die einzige Ansicht, die zwei
*verschiedene* Zielwörter in Beziehung setzt: nähern sie sich an oder driften
sie auseinander? Gezeigt wird **ein Bezugswort gegen alle anderen** (n−1 Kurven
statt k·(k−1)/2 Paare, die keine Palette mehr trennt). Das Bezugswort ist
dasselbe „aktive Wort" wie im Wortraum.

### Nachbarschafts-Fluss

Bump-Diagramm der Top-k-Nachbarn: x = Zeit, y = Rang, eine Linie je Nachbarwort.
Die Ansicht, die eine gemessene Verschiebung **in Wörter übersetzt**.

- **Zahl der Rangplätze = Regler „Nachbarn“** (derselbe wie im Wortraum,
  Standard 8); die Filter der Seite „Nachbar-Filter“ gelten auch hier.
- **Farbe steht für die Nachbar-Gruppe**, nicht für das einzelne Wort — bei
  vielen Nachbarn trennt keine Palette alle Serien, und der Befund ist ohnehin,
  welche *Art* Umfeld welche ablöst. Die Wortidentität trägt die
  Direktbeschriftung.
- **Lücke = raus aus den Top-k**; kehrt ein Nachbar zurück, beginnt ein neues
  Segment. Zeitscheiben ohne Beleg sind schraffiert — auch dann, wenn das Bundle
  dort Nachbarn mitliefert.
- **Umschlag-Streifen** (↻) unter dem Plot: Anteil der Top-k, der gegenüber der
  Vorscheibe neu ist. Auf den Demo-Daten liegt der stärkste Umschlag für
  *Bundeswehr* mit 63 % genau auf der Zäsur.
- Tabelle aller Nachbarn mit Gruppe, bestem Rang, Dauer und Zeitraum.

Noch nicht enthalten (dokumentiert in [`specs.md`](specs.md) §9): serverseitige
Re-Projektion, facettenaufgelöste Ähnlichkeit, CSV-Export, UMAP/Sentiment.

## Architektur

```
backend/app/           FastAPI: bundles.py (listet + liefert Bundles) ·
                       neighbors.py (Nachbarabfragen über den Suchraum)
backend/tests/         pytest: Regeln aus SCHEMA.md + Konformitätstest
frontend/src/
  modules/registry.tsx Modul-Registry — verbindet Rail, Konfigurator, Hauptbereich
  modules/*.tsx        je ein Werkzeug (daten, nachbarfilter, wortraum, matrizen,
                       drift, paare, nachbarn)
  state/               store.ts (Bundle/Zeit/Auswahl, global) · workbench.ts (Navigation)
                       · neighborFilters.ts (Nachbar-Filter, Abfrage beim Backend)
                       · je Modul ein kleiner Options-Store
  viz/                 3D-Szene + Farbtokens; Rechenschicht: similarity.ts
                       (Kosinus/Kiyama) → series.ts (Drift, Paare) ·
                       neighborFlow.ts (Nachbarn) · neighborPoints.ts +
                       resolution.ts (NN-Bildauflösung, Auflösungs-Gating);
                       Renderer: *Canvas.tsx, LineChart.tsx, hatch.ts (die eine
                       „kein Beleg"-Textur)
  ui/                  Shell-Bausteine (Rail, Header, Sektionen, Zeitachse,
                       NeighborKControl, VolumeNote, ProjectionNote …)
specs/                  Rohmaterial + Demo-Bundles (unverändert)  (git-ignored)
```

**Ein neues Visualisierungswerkzeug** = eine Datei in `modules/` plus ein Eintrag
in `MODULES`. Die Shell (`App.tsx`) kennt kein einzelnes Werkzeug.

Der Renderer kennt keine Domäne – alles Konkrete (Entities, Zeitscheiben,
Facetten, Cluster) stammt aus dem geladenen Bundle.

## Starten (Entwicklung)

**Backend** (Port **8077** – per `--port` änderbar):

```bash
cd backend
uv sync                                                # legt .venv an und installiert exakt nach uv.lock
uv run uvicorn app.main:app --reload --port 8077
```

`uv sync`/`uv run` verwenden immer das `.venv` im `backend/`-Ordner – auch wenn
in der Shell ein anderes venv aktiv ist. Aktivieren ist nicht nötig.
Abhängigkeiten ändern: `uv add <paket>` (aktualisiert `pyproject.toml` und `uv.lock`).

- `GET /bundles` – Übersicht aller Bundles im `BUNDLES_DIR` (Default
  `backend/bundles/`, per Env überschreibbar).
- `GET /bundles/{id}` – Roh-JSON eines Bundles.
- `GET /bundles/{id}/neighbor-space` – Suchraum eines Bundles: Filter mit
  vorkommenden Werten, Stoppwörter, Kandidatentabelle (404 ohne Suchraum).
- `POST /bundles/{id}/neighbors` – Nachbarn aller Zielwörter und Zeitscheiben
  für `{k, filters, stopwords}`; `k` höchstens 1000 (Env `NEIGHBORS_K_MAX`).
  Antworten werden gzip-komprimiert.

Tests: `uv run pytest`. Neben den Regeltests an einem synthetischen Bundle
prüft ein Konformitätstest jedes Bundle in `BUNDLES_DIR` mit Suchraum: Eine
Abfrage mit den Voreinstellungen muss genau die mitgelieferten `neighbors`
ergeben (SCHEMA.md, „Konsistenz mit `neighbors`“).

**Frontend** (Vite-Dev-Server auf 5173, proxyt `/bundles` ans Backend):

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

Zeigt das Backend auf einem anderen Port/Host, per Env setzen:
`VITE_API_TARGET=http://localhost:8077 npm run dev`.

Weitere Skripte: `npm run build`, `npm run typecheck`, `npm test` (vitest:
Schema gegen die Demo-Bundles, Rechenschicht, Nachbar-Filter).

## Eigene Datensätze anzeigen

- **Ad-hoc:** JSON per „Datei öffnen…" wählen oder in den Header ziehen.
- **Dauerhaft:** JSON nach `backend/bundles/` legen → erscheint im Picker.
  Für Nachbar-Filter die Suchraum-Dateien aus `meta.neighbor_space`
  (`.vectors.npy`, `.index.parquet`) daneben legen; danach `uv run pytest`,
  der Konformitätstest prüft das neue Bundle mit.

Ungültige Bundles werden mit lesbarer Fehlermeldung abgewiesen (Schema- und
JSON-Syntaxfehler).

