# Vektor-Bundle-Schema (v0.1)

Der Vertrag zwischen Datenproduktion (eure Pipeline / jeder andere Lieferant)
und dem Visualisierungstool. Das Tool kennt **keine** Domäne – es kennt nur
Entities, Zeitscheiben, Facetten und Vektoren. Jedes Projekt liefert ein
Bundle in dieser Form; das Frontend rendert es identisch.

Zwei Beispiel-Bundles liegen bei:
- `zeitenwende_demo.json` – realistischer Fall, Facette `publication`
- `generic_demo.json` – fachfremd, Facette `korpus` (belegt Domänenunabhängigkeit)

## Top-Level

| Feld | Typ | Zweck |
|---|---|---|
| `meta` | object | Name, Beschreibung, `vector_dim`, Projektionsverfahren, `shift_point`, erklärte Varianz (s.u.) |
| `facets_schema` | array | Deklariert die Facetten-Achsen (Publikation, Region, Sprecher …) |
| `entities` | array | Die Zielwörter (das, was sich über die Zeit bewegt) |
| `time_slices` | array | Zeitscheiben in Reihenfolge (`index`) |
| `anchors` | array | Kontext-/Landmarkenwörter: feste Punkte im Raum für NN + Orientierung |
| `vocab_points` | array | Optional. Koordinaten-Tabelle (Label + `coords_3d`) für Nachbarn, die keine `anchors` sind — damit das Frontend sie im 3D-Bild zeichnen kann |
| `records` | array | Facettenaufgelöste Zellen (Wort × Scheibe × Facettenwert) |
| `aggregates` | array | Über Facetten aggregierte Zellen (`facets: {}`) |
| `neighbors` | object | Vorberechnete Nearest-Neighbour-Listen je Wort/Scheibe |

### Erklärte Varianz in `meta` – zwei Zahlen, nicht eine

- `explained_variance_ratio_3d` – **in-sample**: gilt für die Punkte, auf denen
  die joint PCA gefittet wurde (Aggregate + Anker).
- `explained_variance_ratio_3d_vocab` – optional, **out-of-sample**: dieselben
  drei Achsen, angewandt auf die `vocab_points`. Die wurden nur hineinprojiziert,
  nicht mitgefittet, und werden deshalb schlechter abgebildet — im SGNS-Bundle
  **20 % gegen 37 %**. Da genau diese Wolke der Radius-Regler zeigt, wäre der
  In-Sample-Wert dort fast doppelt zu optimistisch. Fehlt das Feld, zeigt das
  Frontend nur die erste Zahl.

## `facets_schema` – der Kern der Wiederverwendbarkeit

Facetten sind **nicht** hart codiert. Jede Facette ist eine benannte Achse mit
kategorialen Werten. Ein zweites Projekt tauscht nur diesen Block aus:

```json
{"id": "publication", "label": "Publikation", "type": "categorical",
 "values": [{"id": "SZ", "label": "Süddeutsche Zeitung", "ausrichtung": "mitte-links"}, ...]}
```

Mehrere Facetten gleichzeitig sind erlaubt (`facets: {publication: "SZ", ressort: "Politik"}`).
Zusätzliche Facetten = weitere Keys, kein Code- oder Schemaänderung nötig. Grenze
ist nicht die Architektur, sondern die Zell-Sparsity (siehe unten).

## `records` / `aggregates`

```json
{
  "entity_id": "bundeswehr",
  "time_slice_id": "2022Q3",
  "facets": {"publication": "SZ"},   // {} bei aggregates
  "vector": [ ... vector_dim floats ... ],
  "coords_3d": [x, y, z],            // vorprojiziert (joint PCA)
  "freq": 313,                       // Stichprobengröße der Zelle -> Konfidenz
  "sentiment": 0.14,                 // optionaler Skalar-Overlay
  "kontrast": 0.47,                  // optional: sagt der Vektor etwas aus?
  "generik": 0.31                    // optional: ist die NN-Liste lesbar?
}
```

- `vector`: der volle Vektor im **gemeinsamen** Raum. Ermöglicht Re-Projektion
  auf gefilterte Wortauswahlen im Frontend/Backend.
- `coords_3d`: vom Lieferanten vorberechnete gemeinsame PCA – ein Basisraum über
  **alle** Vektoren (Anker + Aggregat + facettenaufgelöst). Alignment-frei, weil
  ein einziger Raum. Für schnelles Erst-Rendering ohne Server-Roundtrip.
- `freq`: pro Zelle. Frontend sollte Punktgröße/Deckkraft ∝ freq koppeln, damit
  dünn besetzte Zellen (kleine n) nicht optisch überinterpretiert werden.
- `sentiment`: optional; im Zeitenwende-Bundle ein **synthetischer Platzhalter**
  für die noch offene Achsen-Projektionsmethode ("ins Positive").
- `kontrast` / `generik`: optionale **Gütemaße** des Lieferanten. Sie beantworten
  zwei verschiedene Fragen, die `freq` beide nicht beantwortet — eine Zelle kann
  viele Belege haben und trotzdem einen nichtssagenden Vektor:
  - `kontrast` — **sagt der Vektor etwas über sein Wort aus?** Reproduzierbarkeit
    über zwei Datenhälften, abzüglich der Ähnlichkeit zu zufälligen anderen
    Wörtern. Hoch = individuiert, niedrig = im generischen Bereich.
  - `generik` — **ist die Nachbarliste interpretierbar?** Wie ähnlich der Vektor
    dem Vokabular im Allgemeinen ist. Hoch = alles ist ungefähr gleich nah, "am
    nächsten" zeichnet nichts mehr aus.

  **Nicht ineinander umrechenbar** — insbesondere ist `kontrast + generik` *nicht*
  der Selbst-Kosinus; die beiden stammen typischerweise aus verschiedenen
  Modellen und Vergleichsmengen. `null` heißt "sollte gemessen werden, ging
  nicht"; das Feld ganz wegzulassen heißt "misst dieser Lieferant nicht".
  **Beides führt zu keinerlei Gating** — Bundles ohne die Felder sehen aus wie
  bisher. Auswertung im Frontend ausschließlich über `viz/resolution.ts`.

  Warum das im Vertrag steht und nicht nur im Lieferanten: bei trainierten
  (statt konstruierten) Vektoren zeigt die 3D-Ansicht ohne dieses Gating
  ausgerechnet die *unaufgelösten* Wörter am auffälligsten — am SGNS-Bundle
  gemessen korreliert die 3D-Weglänge mit dem Kontrast zu **r = −0,65**.

## `anchors`

Feste Kontextwörter mit Cluster-Label und Koordinaten. Dienen als (a) Kandidaten
für Nearest-Neighbour-Listen und (b) beschriftete Landmarken im 3D-Raum, an denen
man die Wanderung eines Zielworts ablesen kann. Im Zeitenwende-Bundle sind es
reale Dornseiff-Lemmata der einschlägigen Sachgruppen.

## `vocab_points`

Optionales Feld, nur `{"label": ..., "coords_3d": [x,y,z]}` — kein `cluster`,
kein `vector`. Per Out-of-Sample-Projektion in denselben Raum gelegt (keine neue
PCA, damit sich die Koordinaten von `anchors`/`aggregates` nicht verschieben).

**Zweck: Koordinaten-Nachschlagewerk zu den `neighbors`-Listen.** Ein Nachbar
wird im Bild nur gezeichnet, wenn seine Position bekannt ist; Anker bringen sie
mit, alle anderen Nachbarn finden sie hier. Das Feld ist *kein* eigener
Suchraum — ausgewählt wird ausschließlich im vollen Vektorraum beim Lieferanten
(s. `neighbors`).

Zwei Bedingungen, beide von der Frontend-Seite her zwingend:

- **Abdeckung.** Jedes Label aus `neighbors`, das kein `anchors`-Eintrag ist,
  braucht hier einen Punkt. Praktisch heißt das: `vocab_points` aus demselben
  Kandidatenpool ziehen wie die Nachbarn, insbesondere ohne zusätzlichen
  Wortart-Filter. Ein strengerer Filter als bei der Nachbarauswahl hinterlässt
  Löcher im Bild.
- **Eindeutigkeit.** Ein Label darf nicht gleichzeitig in `anchors` und in
  `vocab_points` stehen — auch nicht über die *Anzeigeform* eines Ankers
  (`anchors[].label` kann von seinem Ausgangslemma abweichen). Das Frontend löst
  Nachbarn über den Text auf; derselbe Text an zwei Positionen ist mehrdeutig.
  Es gibt dann dem Anker den Vorrang, aber der Vertrag sollte den Fall gar nicht
  erst liefern.

Fehlt das Feld (ältere Bundles), werden nur diejenigen Nachbarn im Raum
gezeichnet, die zugleich Anker sind — der Rest bleibt auf die Liste beschränkt.

## `neighbors`

```json
{"bundeswehr": {"2022Q3": [{"label": "Wehrhaftigkeit", "score": 0.89, "group": "WEHR"}, ...]}}
```

Vorberechnet auf Aggregat-Ebene gegen die belegungsgefilterte Kontextwort-
Liste (nicht nur `anchors` — deutlich breiter, kein Wortart-Filter).
**Die Array-Reihenfolge IST der Rang; das Tool sortiert nicht um.** Angezeigt
wird `score` als roher Kosinus.

**Listenlänge k legt der Lieferant fest**, und sie ist gleichzeitig die
Obergrenze eines Reglers im Frontend: dieselbe Liste speist die Textanzeige und
die beschrifteten Punkte im 3D-Bild, der Regler schneidet sie nur ab. Kurze
Listen (8) reichen für die Textanzeige; für das Bild sind längere (50–150)
sinnvoll, weil dort erst sichtbar wird, wie weit echte Nachbarn in der
Projektion auseinanderliegen. Wer k erhöht, sollte prüfen, ob der rohe Kosinus
am letzten Rang noch deutlich über dem Grundpegel liegt (dem mittleren Kosinus
einer Zelle gegen beliebige Kandidaten) — sonst rankt das Verfahren nur noch
Rauschen. Die Positionen dazu kommen aus `anchors` bzw. `vocab_points`.

Das **Auswahlverfahren legt der Lieferant fest** — der Vertrag schreibt es
bewusst nicht vor, weil die richtige Wahl vom Vektorverfahren abhängt:
- *Konstruierte* Vektoren (PPMI-SVD): Auswahl per Kosinus-**Kontrast** (Rohwert
  minus Durchschnitt dieses Kandidaten über alle Zellen). Filtert Wörter raus,
  die einfach allem ähnlich sind ("Echo"-Effekt).
- *Trainierte* Vektoren (SGNS): Auswahl per **rohem Kosinus**. Dort gibt es kaum
  Echo (551 von 689 Nachbarwörtern kommen in genau einer Liste vor), und der
  Kontrast richtet aktiv Schaden an: bei einer unaufgelösten Zelle ist der
  Kosinus zu allem etwa gleich groß, "Kosinus minus Spaltenmittel" wird dann der
  Rangfolge nach zum negativen Spaltenmittel — gewählt würden die *unähnlichsten*
  Wörter. Solche Zellen markiert man über `generik`, statt sie umzusortieren.

Ist der Nachbar zufällig ein kuratierter Anker, übernimmt er
dessen Anzeigelabel + `group` (Cluster); sonst ist `group` ein generisches
Fallback-Tag. Für facettenspezifische NN könnte das Backend on-demand
nachrechnen (Vektoren liegen ja im Bundle).

## Konventionen / Fallstricke

- **Ein Raum, kein Alignment.** Alle Vektoren stammen aus derselben Projektion.
  Niemals pro Facette separat projizieren – sonst driften Koordinatensysteme
  auseinander und Bewegung ist nicht mehr als Bedeutungswandel lesbar.
- **Sparsity ist eine Datenfrage, keine Toolgrenze.** Bei feiner Facettierung
  (Wort × Quartal × Publikation × Ressort) können Zellen auf wenige Sätze
  fallen. `freq` transportiert das; das Tool macht es sichtbar statt es zu
  kaschieren. (Zeitenwende-Bundle enthält bewusst leere/dünne Frühzellen, z.B.
  "Zeitenwende" vor 2022.)
- **Terminologie:** die realen Vektoren sind später *konstruiert* (PPMI-SVD),
  nicht *trainiert*. Diese Demo-Vektoren sind weder – sie sind synthetische
  Stand-ins, die nur die Raum-Eigenschaften nachbilden.
