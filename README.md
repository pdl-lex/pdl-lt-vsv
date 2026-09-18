# pdl-lt-vsv
Visualisierungstool für **diachrone Vektor-Datensätze** – im Geist des TensorFlow
Projectors, aber mit der **Zeit als wichtigster Achse**. Primärer Anwendungsfall
ist das DNB-Zeitenwende-Projekt (Wandel deutschen Militär-/Verteidigungsvokabulars
2010–2025); das Tool ist aber **domänenunabhängig** und rendert jeden Datensatz im
vereinbarten Bundle-Schema (siehe [`data/test/SCHEMA.md`](data/test/SCHEMA.md)).

Wie die Daten aussehen müssen und was jede Visualisierung daraus rechnet:
[`Readme Datenmodell.md`](pipeline/Readme%20Datenmodell.md).

## Aktueller Stand

Eine **Workbench mit mehreren Werkzeugen** über demselben Bundle. Navigation
über die Icon-Rail links. Das Bundle wird einmal geladen und von allen Modulen geteilt — ein
Modulwechsel verliert weder Auswahl noch Zeitposition.

| Modul | Was es zeigt |
|---|---|
| **Datenquelle** | Bundle laden und prüfen: Projektion, Zeitraum, Facetten, Belegung je Zielwort |
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
  Regler einstellbar (Standard 8, bis zur Listenlänge des Bundles – die echten
  Bundestags-Bundles liefern bis zu 150). Positionen kommen aus `anchors` und,
  seit dem Umbau vom 2026-09-11, aus `vocab_points`: gefiltert wird im vollen
  Vektorraum beim Lieferanten, der Regler schneidet nur die Anzeigeliste ab.
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

- **Farbe steht für die Nachbar-Gruppe**, nicht für das einzelne Wort — bei ~20
  Nachbarn trennt keine Palette 20 Serien, und der Befund ist ohnehin, welche
  *Art* Umfeld welche ablöst. Die Wortidentität trägt die Direktbeschriftung.
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
backend/               FastAPI-Serving-Layer: listet + liefert Bundles
frontend/src/
  modules/registry.tsx Modul-Registry — verbindet Rail, Konfigurator, Hauptbereich
  modules/*.tsx        je ein Werkzeug (daten, wortraum, matrizen, drift,
                       paare, nachbarn)
  state/               store.ts (Bundle/Zeit/Auswahl, global) · workbench.ts (Navigation)
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
uv venv .venv
uv pip install --python .venv/Scripts/python.exe -r requirements.txt   # Linux/macOS: .venv/bin/python
.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8077  # Linux/macOS: .venv/bin/python
```

Hinweis: Falls in der Shell eine `VIRTUAL_ENV`-Variable von einem anderen Projekt
gesetzt ist, installiert `uv pip install` sonst dorthin statt in dieses `.venv` —
daher der explizite `--python`-Pfad.

- `GET /bundles` – Übersicht aller Bundles im `BUNDLES_DIR` (Default
  `backend/bundles/`, per Env überschreibbar).
- `GET /bundles/{id}` – Roh-JSON eines Bundles.

**Frontend** (Vite-Dev-Server auf 5173, proxyt `/bundles` ans Backend):

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

Zeigt das Backend auf einem anderen Port/Host, per Env setzen:
`VITE_API_TARGET=http://localhost:8077 npm run dev`.

Weitere Skripte: `npm run build`, `npm run typecheck`, `npm test` (validiert das
Schema gegen beide Demo-Bundles).

## Eigene Datensätze anzeigen

- **Ad-hoc:** JSON per „Datei öffnen…" wählen oder in den Header ziehen.
- **Dauerhaft:** JSON nach `backend/bundles/` legen → erscheint im Picker.

Ungültige Bundles werden mit lesbarer Fehlermeldung abgewiesen (Schema- und
JSON-Syntaxfehler).

