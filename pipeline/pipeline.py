import marimo

__generated_with = "0.24.0"
app = marimo.App()


@app.cell
def _():
    import marimo as mo
    import polars as pl

    return mo, pl


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    # Pipeline zur Erstellung von Bundle-Daten für VSV
    Dieses Notebook bietet einen vollständige, kommentierte Pipeline zur Generierung von Daten, ausgehend von CSV-Daten hin zu dem für das "Visualisierung Semantischer Vektoren"-Tool nötigen Daten-Bundle.
    Als Beispiel-Datensatz werden die Reden-Texte der Bundestagssitzungen zwischen 2013 und 2026 genutzt.

    Quelle: Fobbe, S. (2026). Corpus der Plenarprotokolle des Deutschen Bundestages (CPP-BT) (Versions 2026-01-17) [Dataset]. Zenodo. https://doi.org/10.5281/zenodo.18177196

    Im Paket: pipeline/source_data/ (nicht Teil des Git-Repos)

    Das separate Notebook pipeline-diagnose.py enthält zusätzliche Diagnose-Funktionen, deren Erkenntnisse in die Parameterwahl in diesem Notebook eingeflossen sind.
    """)
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    # Übersicht über Quelldaten
    Bei mehreren Daten kann über diesen Auswahldialog jeweils eine Datei zur genaueren Inspektion angezeigt werden.
    """)
    return


@app.cell
def _(mo):
    dateien = {
        "Reden – Metadaten": "source_data/CPP-BT_2026-01-17_DE_CSV_Reden_Metadaten.csv",
        "Reden – Volltext": "source_data/CPP-BT_2026-01-17_DE_CSV_Reden_Gesamt.csv",
        "Plenarprotokolle – Metadaten": "source_data/CPP-BT_2026-01-17_DE_CSV_Plenarprotokolle_Metadaten.csv",
        "Plenarprotokolle – Volltext": "source_data/CPP-BT_2026-01-17_DE_CSV_Plenarprotokolle_Gesamt.csv",
    }
    datei_picker = mo.ui.dropdown(options=dateien, value="Reden – Metadaten", label="Datei")
    datei_picker
    return (datei_picker,)


@app.cell
def _(datei_picker, pl):
    vorschau = pl.read_csv(datei_picker.value, n_rows=100, null_values="NA")
    vorschau
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    # Verarbeitung
    ## Einlesen der Daten für das Analyse-Korpus
    Die ausgewählte Datei ist hier über den Dateinamen fest im Code angegeben; kein Zusammenhang mit dem Picker weiter oben.

    Hinweis: Die CSV-Dateien entahlten pro Zeile eine Rede, sowie weitere Angaben zur Rede (z.B. Datum) sowie zum Redner (z.B. Fraktion).
    """)
    return


@app.cell
def _(pl):
    spalten = ["rede_id", "sitzung_datum", "redner_vorname", "redner_nachname", "redner_fraktion", "redner_rolle_kurz", "tokens", "rede_text"]

    korpus = pl.read_csv("source_data/CPP-BT_2026-01-17_DE_CSV_Reden_Gesamt.csv", columns=spalten, null_values="NA")

    korpus
    return (korpus,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## Definition Suchwörter
    Als Suchwärter wurden nur Substantive gewählt, um Probleme mit der Flexion und Satzstellung zu vermeiden. "Drohne" und "Drohnen" als Beispiel für einfache Flexionen.
    Gesucht werden nur ganze Wörter wie genannt, keine Komposita.

    Datentyp ist hier ein code-seitig unveränderliches Set, was die Verarbeitung im Folgenden beschleunigt (im Vergleich zu einer Liste).
    """)
    return


@app.cell
def _():
    suchwoerter = {"Bundeswehr", "Wehrpflicht", "Verteidigung", "Landesverteidigung", "Drohne", "Drohnen", "Hindukusch", "Rüstung", "Rüstungsindustrie", "Sicherheit", "Frieden", "Friedenssicherung"}
    return (suchwoerter,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ##Normalisierung zum Entfernen von Satzzeichen
    Entfernt bspw. Kommata am Wortende.
    """)
    return


@app.cell
def _():
    import re

    def normalisiere(wort):
        return re.sub(r"^\W+|\W+$", "", wort)

    print(normalisiere("#Beispiel,"))
    return (normalisiere,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## KWIC-Extraktion
    (Benötigt etwa 1:20 min für einen Durchlauf)
    Die nachfolgende Zelle ist standardmäßig für die automatische Ausführung deaktiviert, weil sonst jede Code-Änderung einen neuen Lauf triggert. Stattdessen wird die Liste (darunter) aus einem CSV gelesen.
    """)
    return


@app.cell(disabled=True)
def _(korpus, mo, normalisiere, pl, suchwoerter):
    def kwic_treffer(rede_id, text, fenster=40):
        woerter = text.split()
        treffer=[]
        for i, wort_roh in enumerate(woerter):
            wort = normalisiere(wort_roh)
            if wort in suchwoerter:
                treffer.append({
                    "rede_id": rede_id,
                    "zielwort": wort,
                    "position": i,
                    "kontext_davor": " ".join(woerter[max(0, i - fenster):i]),
                    "kontext_danach": " ".join(woerter[i+1:i+1+fenster]),
                })
        return treffer

    treffer_liste = []

    for rede_id, text in mo.status.progress_bar(korpus.select(["rede_id", "rede_text"]).iter_rows(), total=len(korpus), title="KWIC-Extraktion"):
        treffer_liste.extend(kwic_treffer(rede_id, text))

    kwic=pl.DataFrame(treffer_liste)
    kwic = kwic.select(["kontext_davor", "zielwort", "kontext_danach", "rede_id", "position"])

    kwic

    kwic.write_csv("output/kwic_treffer.csv")
    return


@app.cell
def _(pl):
    # Einlesen der vorgenerierten Liste
    kwic_liste = pl.read_csv("output/kwic_treffer.csv", null_values="NA")
    kwic_liste
    return (kwic_liste,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## Lemmatisierung
    Vereinheitlichung auf Grundform (z.B. "Drohnen" => "Drohne")
    Sowohl für Kontexte (wichtig!), als auch für Zielwörter (nur wichtig bei flektierbaren Formen)
    """)
    return


@app.cell
def _():
    import spacy

    nlp = spacy.load("de_core_news_md")
    return (nlp,)


@app.cell
def _(nlp, suchwoerter):
    woerter = sorted(suchwoerter)
    lemmata = [doc[0].lemma_ for doc in nlp.pipe(woerter)]
    zielwort_lemmata = dict(zip(woerter, lemmata))
    zielwort_lemmata

    # das Ergebnis des dict wird in der nächsten Zelle als Spalte angehängt
    return (zielwort_lemmata,)


@app.cell(disabled=True)
def _(kwic_liste, mo, nlp, pl, zielwort_lemmata):
    # Standardmäßig deaktiviert aufgrund der benötigten Laufzeit. Stattdessen wird das Ergebnis in der folgenden Zelle aus einer gespeicherten Version geladen.

    kontexte = (kwic_liste["kontext_davor"] + " " + kwic_liste["kontext_danach"]).to_list()

    kontext_lemmata = []
    kontext_pos = []

    with mo.status.progress_bar(total=len(kontexte), title="Lemmatisierung Kontext") as bar:
        for doc in nlp.pipe(kontexte, disable=["parser", "ner", "senter"]):
            kontext_lemmata.append([t.lemma_ for t in doc if t.pos_ != "PUNCT"])
            kontext_pos.append([t.pos_ for t in doc if t.pos_ != "PUNCT"])
            bar.update()

    kwic_liste_lemmatisiert = kwic_liste.with_columns([
        pl.Series("kontext_lemmata", kontext_lemmata),
        pl.Series("kontext_pos", kontext_pos),
    ])

    kwic_liste_lemmatisiert = kwic_liste_lemmatisiert.with_columns(
        pl.col("zielwort").replace(zielwort_lemmata).alias("zielwort_lemma")
    )

    # Da das Ergebnis Listen innerhalb einer Liste enthält, wird es nicht mehr als CSV sondern als Parquet gespeichert.
    kwic_liste_lemmatisiert.write_parquet("output/kwic_lemmatisiert.parquet")

    kwic_liste_lemmatisiert
    return


@app.cell
def _(pl):
    kwic_liste_lemmatisiert_pq = pl.read_parquet("output/kwic_lemmatisiert.parquet")
    kwic_liste_lemmatisiert_pq
    return (kwic_liste_lemmatisiert_pq,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## Wahl der Zeitscheiben-Größe
    Die Reden werden nicht einzeln betrachtet (dazu böten sie viel zu wenig Kontext), sondern in Zeitscheiben zusammengefasst. Die Größe der Zeitscheibe kann weiter unten eingestellt werden. Zur Wahl stehen Quartale, Halbjahre und Jahre. Es werden entsprechende Kennungen (Q1-4, H1-2) generiert.
    """)
    return


@app.cell(hide_code=True)
def _(mo):
    zeitscheiben_raster_picker = mo.ui.dropdown(
        # Schlüssel = Beschriftung im UI, Wert = das, was .value liefert.
        options={
            "Quartale (4 pro Jahr)":  "quartal",
            "Halbjahre (2 pro Jahr)": "halbjahr",
            "Jahre (1 pro Jahr)":     "jahr",
        },
        value="Halbjahre (2 pro Jahr)",
        label="Zeitscheiben-Raster",
    )

    mo.style(zeitscheiben_raster_picker, width="360px")
    return (zeitscheiben_raster_picker,)


@app.cell
def _(korpus, kwic_liste_lemmatisiert_pq, pl, zeitscheiben_raster_picker):
    from datetime import date

    # Ergänzung der Quartale, berechnet aus dem Datum
    kwic_liste_quartale = kwic_liste_lemmatisiert_pq.join(
        korpus.select(["rede_id", "sitzung_datum"]),
        on="rede_id",
        how="left",
    )

    kwic_liste_quartale = kwic_liste_quartale.with_columns(
        pl.col("sitzung_datum").str.strptime(pl.Date, "%Y-%m-%d").alias("datum")
    )

    # Zeitscheiben-Kennung je nach gewähltem Raster
    # Alle drei Formen sind so gebaut, dass die lexikografische Sortierung der
    # chronologischen entspricht ("2022-H1" < "2022-H2" < "2023-H1"). Wird benötigt für den Zäsur-Vergleich (>=) und die Reihenfolge von
    # time_slices im Bundle.
    jahr_teil = pl.col("datum").dt.year().cast(pl.Utf8)
    quartal_nr = pl.col("datum").dt.quarter()

    if zeitscheiben_raster_picker.value == "quartal":
        zeitscheibe_ausdruck = jahr_teil + "-Q" + quartal_nr.cast(pl.Utf8)

    elif zeitscheiben_raster_picker.value == "halbjahr":
        # Q1,Q2 -> H1 und Q3,Q4 -> H2, per Ganzzahldivision statt Fallunterscheidung.
        halbjahr_ausdruck = ((quartal_nr - 1) // 2 + 1).cast(pl.Utf8)
        zeitscheibe_ausdruck = jahr_teil + "-H" + halbjahr_ausdruck

    else:
        zeitscheibe_ausdruck = jahr_teil

    kwic_liste_quartale = kwic_liste_quartale.with_columns(
        zeitscheibe_ausdruck.alias("zeitscheibe")
    )

    # Jetzt wird für das Datum der Zeitenwende-Rede von Olaf Scholz am 27.02.2022 die Zeitscheibe bestimmt. Je nach Zeitscheiben-Größe ändert sich diese Variable. Sie wird im Folgenden für weitere Analyseschritte verwendet.
    zaesur = (
        pl.DataFrame({"datum": [date(2022, 2, 27)]})
        .select(zeitscheibe_ausdruck)
        .item()
    )

    print(f"Zäsur-Zeitscheibe: {zaesur}")

    kwic_liste_quartale.group_by("zeitscheibe").len().sort("zeitscheibe")
    return kwic_liste_quartale, zaesur


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ##Ko-Okkurenzen
    Prüfung pro Zeitscheibe, wie oft ein Wort in der Nähe eines anderen Wortes auftaucht.
    """)
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## POS-Filterung
    Die Wortart-Angaben wurden im Zuge der Lemmatisierung miterhoben. Hier werden sie zur Filterung verwendet. Beispielsweise können Artikel (DET) problemlos entfernt werden, weil sie nahezu keine Aussagekraft haben (für den Untersuchungsgegenstand).

    Die POS-Filterung hat keinen signifkanten Effekt auf das Analyse-Ergebnis, weil die nachfolgende PPMI sowieso selbst POS-Filterung betreibt: Wörter, die permanent auftauchen, werden unterbewertet. Man kann sie dennoch aktiviert lassen, da sie die Datenmenge reduziert.

    **Kandidaten für Funktionswörter im Deutschen:**
    * DET (der/die/das)
    * ADP (Präpositionen)
    * PRON (Pronomen)
    * AUX (sein/haben/werden)
    * CCONJ + SCONJ (Konjunktionen)

    **Inhaltswörter (behalten)**
    * NOUN (Substantive)
    * PROPN (Eigennamen)
    * VERB (Verben)
    * ADJ (Adjektive)
    * ADV (Adverbien)
    * PART enthält u.a. Partikel wie "nicht", die wichtig sein können
    """)
    return


@app.cell
def _(kwic_liste_quartale):
    # Welche POS-Tags kommen in den Kontextfenstern vor und wie oft?
    # Informiert die Auswahl im POS-Filter direkt darunter.
    (
        kwic_liste_quartale
        .explode("kontext_pos", empty_as_null=True)["kontext_pos"]
        .value_counts()
        .sort("count", descending=True)
    )
    return


@app.cell
def _(mo):
    # POS-Tags, deren Kontextwörter verworfen werden sollen.
    # Leere Auswahl = Filter aus = Baseline

    pos_filter_picker = mo.ui.multiselect(
        options=["DET", "ADP", "PRON", "AUX", "CCONJ", "SCONJ", "PART",
                 "NUM", "INTJ", "SYM", "X"],
        value=["DET", "ADP", "PRON", "AUX", "CCONJ", "SCONJ"],
        label="POS-Tags verwerfen",
    )

    mo.style(pos_filter_picker, width="420px")
    return (pos_filter_picker,)


@app.cell
def _(kwic_liste_quartale, pl, pos_filter_picker):
    # kontext_lemmata enthält alle Wörter des Trefferkontextes.
    # kontext_pos enthält die korrespondierenden Wortarten.
    # .explode() mit beiden Spalten im gleichen Aufruf rollt sie parallel aus, sodass Lemma und Tag in derselben Zeile landen.
    kookkurrenz_entrollt = kwic_liste_quartale.explode(
        ["kontext_lemmata", "kontext_pos"], empty_as_null=True
    )

    # Kontrolle, dass die Listen wirklich gleich lang waren: bei ungleicher Länge
    # würde polars die kürzere mit null auffüllen.
    print(f"Kontext-Tokens gesamt: {len(kookkurrenz_entrollt):,}"
          f"   ohne POS-Tag: {kookkurrenz_entrollt['kontext_pos'].null_count()}")


    if len(pos_filter_picker.value) > 0:
        tokens_vorher = len(kookkurrenz_entrollt)

        # ~ ist die Negation: behalte alles, was NICHT in der Auswahl steht.
        kookkurrenz_entrollt = kookkurrenz_entrollt.filter(
            ~pl.col("kontext_pos").is_in(pos_filter_picker.value)
        )

        tokens_entfernt = tokens_vorher - len(kookkurrenz_entrollt)
        print(f"POS-Filter {sorted(pos_filter_picker.value)}: "
              f"{tokens_entfernt:,} Tokens verworfen ({tokens_entfernt / tokens_vorher:.1%})")

    else:
        print("POS-Filter: aus (Baseline)")

    # kookkurrenz_entrollt
    return (kookkurrenz_entrollt,)


@app.cell
def _(kookkurrenz_entrollt):
    # Langformat-Tabelle (je Zeitscheibe, Zielwort, Kontextwort).
    kookkurrenz = (
        kookkurrenz_entrollt
        .group_by(["zeitscheibe", "zielwort_lemma", "kontext_lemmata"])
        .len()
        .rename({"kontext_lemmata": "kontext_lemma", "len": "beobachtet"})
    )

    kookkurrenz
    return (kookkurrenz,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## PPMI
    ### Berechnung der PPMI aus Langform
    *PPMI = Positive Pointwise Mutual Information*

    **Vereinfachtes Beispiel für Kookurrenzen**

    |   | Bundeswehr | Europa | der | Randsumme |
    | -------- | -------- | -------- | ||
    | Bundeswehr | 30 | 10 | 60 | 100|
    | Frieden | 5 | 20 | 45 | 70|
    | Randsumme | 35 | 30 | 105 | gesamt: 170|

    **Wahrscheinlichkeit des Zielworts**
    Wie wahrscheinlich ist es, dass das Zielwort "Bundeswehr" in einer Zeitscheibe auftaucht?
    P(Zielwort) = Randsumme_Ziel / Gesamt
    P("Bundeswehr") = 100/170 = 0,588

    **Wahrscheinlichkeit des Kontextworts:**
    Wie wahrscheinlich ist es, dass das Kontextwort "Europa" in einer Zeitscheibe auftaucht?
    P(Kontextwort) = Randsumme_Kontext / Gesamt
    P("Europa") = 30/170 = 0,176

    **Erwartete Wahrscheinlichkeit für das Auftauchen beider Wörter**
    Die erwartete Wahrscheinlichkeit entspricht der unabhängigen Wahrscheinlichkeit, und für diese gilt die einfache Multiplikation.

    **Wahrscheinlichkeit für das zufällige Auftauchen beider Wörter im selben Kontext  **
    = P(beide zusammen) = P(Ziel) × P(Kontext)
    = P("Bundeswehr", "Europa") = 0,588x0,178 = 0,103

    **Erwartete Anzahl unter allen Beobachtungen**
    = diese Wahrscheinlichkeit mal Gesamt:
    = P(Ziel) × P(Kontext) × Gesamt
    = 0,588 x 0,176 x 170 = 17,593

    oder
    = (Randsumme_Ziel/Gesamt) × (Randsumme_Kontext/Gesamt) × Gesamt
    = Randsumme_Ziel × Randsumme_Kontext / Gesamt
    = 100 * 30 / 170 = 17,65   ~ 17,593 (Rundungsfehler)

    Die Randsummen können über die Zeilenanzahl passender Gruppierungen der Langform gebildet werden:

    Anzahl über die Gruppierung nach **Zeitscheibe**, **Zielwort** = Zeilensumme für Kontextwort

    Anzahl über Gruppierung nach **Zeitscheibe**, **Kontextwort** = Spaltensumme für Zielwort

    Anzahl über Gruppierung nach **Zeitscheibe** = Gesamtzahl für diese Zeitscheibe



    ### Formel für PPMI

    ppmi = max(0, log2(beobachtet/erwartet)

    beobachtet = gezählte okkurenz (siehe Tabelle)
    erwartet = siehe Berechnung oben

    Einsetzen des erwartet-Werts:
    ppmi = max(0, log2( anzahl / (randsumme_ziel × randsumme_kontext / gesamt))

    Umstellung wg. Division durch einen Bruch:
    ppmi = max(0, log2(anzahl × gesamt / (randsumme_ziel × randsumme_kontext)))

    Der Logarithmus wird verwendet, um die um die unterschiedlichen Skalenbereiche von seltener und häufiger in den gleichen Bereich zu bringen. Basis 2 wird aus Konvention verwendet. Nebenffekt: PPMI = 1: doppelt so häufig wie erwartet.
    """)
    return


@app.cell
def _(kookkurrenz, pl):
    # Randsumme je Zielwort, pro Zeitscheibe.
    # Summe von "beobachtet" über alle Kontextwörter hinweg.
    randsumme_zielwort = (
        kookkurrenz
        .group_by(["zeitscheibe", "zielwort_lemma"])
        .agg(
            pl.col("beobachtet").sum().alias("randsumme_ziel")
        )
    )


    # Randsumme je Kontextwort, pro Zeitscheibe.
    # Summe von "beobachtet" über alle Zielwörter hinweg.
    randsumme_kontextwort = (
        kookkurrenz
        .group_by(["zeitscheibe", "kontext_lemma"])
        .agg(
            pl.col("beobachtet").sum().alias("randsumme_kontext")
        )
    )


    # Gesamtsumme je Zeitscheibe.
    # Summe von "beobachtet" über die komplette Tabelle dieser
    gesamtsumme = (
        kookkurrenz
        .group_by(["zeitscheibe"])
        .agg(
            pl.col("beobachtet").sum().alias("gesamt")
        )
    )
    return gesamtsumme, randsumme_kontextwort, randsumme_zielwort


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    **Beispielausgaben**
    """)
    return


@app.cell
def _(randsumme_zielwort):
    randsumme_zielwort
    return


@app.cell
def _(gesamtsumme):
    gesamtsumme
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    In der folgenden Zelle werden die errechneten Werte wieder an die Langform-Tabelle angehängt, ein Wert pro Zeile (=beobachteter Kookurenz pro Zeitscheibe).

    Der Schlüssel besteht aus "zeitscheibe" und "zielwort_lemma", bzw. "zeitscheibe" und "kontext_lemma", die prinzipbedingt nur einmal auftauchen dürfen und damit eindeutige Schlüssel sind. Check: Die Zeilenzahl in kookkurenz und kookkurenz_ppmi muss identisch sein.
    """)
    return


@app.cell
def _(
    gesamtsumme,
    kookkurrenz,
    kwic_liste_quartale,
    randsumme_kontextwort,
    randsumme_zielwort,
):
    # Randsumme des Zielworts anhängen
    kookkurrenz_ppmi = kookkurrenz.join(
        randsumme_zielwort,
        on=["zeitscheibe", "zielwort_lemma"],
        how="left",
    )

    # Randsumme des Kontextworts anhängen
    kookkurrenz_ppmi = kookkurrenz_ppmi.join(
        randsumme_kontextwort,
        on=["zeitscheibe", "kontext_lemma"],
        how="left",
    )

    # Gesamtsumme der Zeitscheibe anhängen
    kookkurrenz_ppmi = kookkurrenz_ppmi.join(
        gesamtsumme,
        on=["zeitscheibe"],
        how="left",
    )

    # Echte Zielwort-Trefferzahl anhängen (nicht zu verwechseln mit randsumme_ziel)

    zielwort_haeufigkeit = (
        kwic_liste_quartale
        .group_by(["zeitscheibe", "zielwort_lemma"])
        .len()
        .rename({"len": "zielwort_haeufigkeit"})
    )

    kookkurrenz_ppmi = kookkurrenz_ppmi.join(
        zielwort_haeufigkeit,
        on=["zeitscheibe", "zielwort_lemma"],
        how="left",
    )

    kookkurrenz_ppmi
    return (kookkurrenz_ppmi,)


@app.cell
def _(kookkurrenz, kookkurrenz_ppmi):
    len(kookkurrenz_ppmi) == len(kookkurrenz)
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ### Berechnung des PPMI-Wertes
    """)
    return


@app.cell
def _(kookkurrenz_ppmi, pl):
    # Erwarteter Wert unter Unabhängigkeit:
    # randsumme_ziel * randsumme_kontext / gesamt
    kookkurrenz_ppmi_komplett = kookkurrenz_ppmi.with_columns(
        (
            (pl.col("randsumme_ziel") * pl.col("randsumme_kontext"))
            / pl.col("gesamt")
        ).alias("erwartet")
    )

    # PMI: log2(beobachtet / erwartet)  # noch ohne "positiv"
    kookkurrenz_ppmi_komplett = kookkurrenz_ppmi_komplett.with_columns(
        (pl.col("beobachtet") / pl.col("erwartet")).log(2).alias("pmi")
    )

    # PPMI: PMI nach unten bei 0 kappen, also max(0, pmi)
    kookkurrenz_ppmi_komplett = kookkurrenz_ppmi_komplett.with_columns(
        pl.col("pmi").clip(lower_bound=0).alias("ppmi")
    )
    return (kookkurrenz_ppmi_komplett,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ### Interpretation der Ergebnisse (PPMI)

    **Wie viele Beobachtungen braucht PPMI, um verlässlich zu sein?**

    Kommt ein Zielwort in einer Zeitscheibe nur sehr selten vor, beruht sein
    gesamtes PPMI-Profil auf entsprechend wenig Material – im Extremfall auf
    einem einzigen Satzkontext. Jedes Wort aus diesem einen Fenster wirkt dann
    "besonders eng verbunden" mit dem Zielwort, einfach weil keine zweite
    Beobachtung existiert, die das relativieren könnte. Die Rangliste sieht
    plausibel aus, spiegelt aber eher Zufall als ein wiederkehrendes
    sprachliches Muster wider.

    Ähnliches gilt umgekehrt für seltene Kontextwörter. Ein Wort, das insgesamt
    nur ein- oder zweimal in den Kontextfenstern eines Quartals auftaucht und
    dabei zufällig immer neben demselben Zielwort steht, bekommt einen hohen
    PPMI-Wert – unabhängig davon, ob dahinter eine echte inhaltliche Verbindung
    steckt oder schlicht Zufall (Eigennamen, Tippfehler, die Wortwahl einzelner
    Redner). Erst wenn ein Kontextwort öfter auftaucht, zeigt sich, ob es
    wirklich bevorzugt in der Nähe eines bestimmten Zielworts steht oder
    allgemein häufig vorkommt.

    Praktisch heißt das: PPMI-Werte sind erst ab einer gewissen Mindestanzahl
    an Beobachtungen aussagekräftig – sowohl beim Zielwort als auch bei den
    Kontextwörtern. Ein einzelner auffällig hoher Wert lohnt sich immer
    gegenzuchecken, wie viele tatsächliche Treffer dahinterstehen, bevor man
    ihn als inhaltlichen Befund interpretiert.

    ***Einmalige Kontextwörter (1 Vorkommen)***
    ppmi ist ein Verhältnis: log2(beobachtet / erwartet). Bei einem exklusiven Kontextwort ist randsumme_kontext == beobachtet, und dann kürzt sich beobachtet aus dem Bruch heraus. Übrig bleibt log2(gesamt / randsumme_ziel) — eine Konstante, die nur noch vom Zielwort abhängt. Deshalb sind z.B. 12 Treffer und 7 Treffer nicht mehr unterscheidbar. Lösen lässt sich dieses Problem, in dem man die Trefferzahl wieder mit einberechnet. Hierzu werden zwei Metriken angeboten:

    **Local-MI**
    PPMI misst die Bindungsstärke *einer einzelnen* Kookkurrenz – wie überraschend es ist, dieses Wortpaar einmal zu sehen. Es sagt aber nichts darüber, wie oft man diese Überraschung tatsächlich beobachtet hat. Local-MI multipliziert deshalb Stärke mit Menge: `beobachtet × ppmi`, also der Gesamtbeitrag dieses Wortpaars zur Bindung der ganzen Tabelle (formal der Anteil dieser Zelle an der Transinformation). Damit verschwindet der Deckeneffekt, denn bei einem exklusiven Kontextwort ist PPMI eine Konstante und Local-MI wird streng linear in der Trefferzahl – zwölf Treffer stehen dann wieder sichtbar über sieben. Der Preis ist, dass diese lineare Gewichtung häufige Wörter stark bevorzugt: ohne einen zusätzlichen POS- oder Stoppwortfilter schiebt sich in diesem Korpus etwa `wir` fast an die Spitze. Local-MI ist deshalb als Diagnosespalte nützlich, aber aus demselben Grund kein geeigneter Input für die spätere SVD.

    **t-Score**
    Statt zu fragen „*wievielmal* häufiger als erwartet?" (ein Verhältnis) fragt der t-Score „*wie viel* häufiger als erwartet, gemessen in Standardfehlern?" (eine Differenz). Zählungen streuen näherungsweise poissonverteilt, weshalb die Wurzel aus der Trefferzahl als Standardfehler   dient. Der Wert beantwortet damit eine andere Frage als PPMI: nicht *wie eng* die Bindung ist, sondern *wie gut belegt* sie ist. Weil es sich um eine Differenz und nicht um ein Verhältnis handelt, existiert hier keine Decke –  für ein exklusives Kontextwort vereinfacht sich die Formel zu `√beobachtet × (1 − P(Zielwort))`, wächst also mit der Wurzel der Trefferzahl weiter. In der Praxis führt das dazu, dass gut belegte Paare die Rangliste anführen, während seltene exklusive Treffer dorthin rutschen, wo ihre schmale Beobachtungsgrundlage sie hingehören lässt.
    """)
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ### Berechnung von Local MI und t-Score
    """)
    return


@app.cell
def _(kookkurrenz_ppmi_komplett, pl):
    # Local-MI: PPMI, gewichtet mit der tatsächlichen Trefferzahl.
    kookkurrenz_ppmi_komplett_erg = kookkurrenz_ppmi_komplett.with_columns(
        (pl.col("beobachtet") * pl.col("ppmi")).alias("local_mi")
    )

    # t-Score: Differenz statt Verhältnis, gemessen in Standardfehlern.
    # sqrt(beobachtet) ist der Standardfehler einer poissonverteilten Zählung.
    # Bewusst nicht bei 0 gekappt – negative Werte ("seltener als erwartet")
    # sind für die Anzeige informativ. Für einen späteren SVD-Versuch käme
    # hier noch ein .clip(lower_bound=0) dazu.
    kookkurrenz_ppmi_komplett_erg = kookkurrenz_ppmi_komplett.with_columns(
        (
            (pl.col("beobachtet") - pl.col("erwartet"))
            / pl.col("beobachtet").sqrt()
        ).alias("t_score")
    )

    kookkurrenz_ppmi_komplett_erg
    return (kookkurrenz_ppmi_komplett_erg,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## SVD - Singular Value Decomposition
    In den folgenden Zellen wird die Langform einer SVD unterzogen - die Langform stellt dabei bereits die Matrix dar.

    Bis hierher ist jedes Zielwort in jeder Zeitscheibe durch eine *Liste* von  Kontextwörtern beschrieben. Die SVD macht daraus einen *Vektor*: sie sucht die 100 Achsen, entlang derer sich die Zeilen am stärksten unterscheiden,    und drückt jede Zeile in diesen 100 Koordinaten aus.
    Entscheidend ist, dass das **eine einzige** Zerlegung über alle Zeitscheiben gemeinsam ist. Eine SVD pro Quartal würde 50 zufällig gedrehte Räume liefern, in denen ein Vergleich *zwischen* Quartalen nichts bedeutet.
    """)
    return


@app.cell
def _():
    import numpy as np

    return (np,)


@app.cell
def _(mo):
    # Effekt wurde getestet; Normierung wirkt sich negativ aus.
    # Empfehlung: Deaktiviert lassen.

    zeilennormierung_schalter = mo.ui.switch(
        label="Zeilen vor der SVD auf Länge 1 normieren"
    )

    zeilennormierung_schalter
    return (zeilennormierung_schalter,)


@app.cell
def _():
    # Ein globaler Mindesthäufigkeits-Filter auf den Kontextwörtern (Schwellenregler # + Vokabular-Aggregation) wurde getestet und verworfen (Readme, Stolperstein "Globaler Mindesthäufigkeits-Filter"): er schneidet fast ausschließlich bei den dichten Zeilen Spalten weg, nicht bei den dünnen, wie ursprünglich erhofft. Der Code wurde in pipeline-diagnose.py verschoben. Hier bleibt die Matrix ungefiltert (Schwelle 1 = aus).
    return


@app.cell
def _(kookkurrenz_ppmi_komplett_erg, pl):
    # nur Zellen mit ppmi > 0
    # Ein ppmi < 0 bedeutet nicht, dass die Kombination nicht vorkam, nur dass sie seltener als erwartet vorkam. ppmi == 0 wäre in der Matrix ohnehin leer.

    svd_input = kookkurrenz_ppmi_komplett_erg.filter(pl.col("ppmi") > 0)


    # Indizes vergeben
    # Eine Matrixzeile ist ein (Zielwort, Zeitscheibe)-Paar.
    # Sortierung für Reproduzierbarkeit.

    zeilen_tabelle = (
        svd_input
        .select(["zielwort_lemma", "zeitscheibe"])
        .unique()
        .sort(["zielwort_lemma", "zeitscheibe"])
        .with_row_index("zeile_i")
    )

    # Eine Matrixspalte ist ein Kontextwort.
    spalten_tabelle = (
        svd_input
        .select("kontext_lemma")
        .unique()
        .sort("kontext_lemma")
        .with_row_index("spalte_j")
    )

    svd_input = svd_input.join(
        zeilen_tabelle,
        on=["zielwort_lemma", "zeitscheibe"],
        how="left",
    )

    svd_input = svd_input.join(
        spalten_tabelle,
        on="kontext_lemma",
        how="left",
    )
    return spalten_tabelle, svd_input, zeilen_tabelle


@app.cell
def _(np, spalten_tabelle, svd_input, zeilen_tabelle):
    # Erstellen der eigentlichen Matrix aus Zeilennummer, Spaltennummer und ppmi-Wert. Zunächst als leere Matrix, dann befüllt. Kürzung auf float32.

    matrix = np.zeros(
        (len(zeilen_tabelle), len(spalten_tabelle)),
        dtype=np.float32,
    )

    matrix[
        svd_input["zeile_i"].to_numpy(),
        svd_input["spalte_j"].to_numpy(),
    ] = svd_input["ppmi"].to_numpy()

    print(f"Matrix im Speicher: {matrix.nbytes / 1e6:.0f} MB")
    return (matrix,)


@app.cell
def _(matrix, np, zeilennormierung_schalter):
    # Länge (L2-Norm) jeder Matrixzeile. Immer berechnet, damit die Spannweite
    # sichtbar ist.
    matrix_zeilennormen = np.linalg.norm(matrix, axis=1, keepdims=True)

    print(f"Zeilennorm: min {matrix_zeilennormen.min():.1f}"
          f"  Median {np.median(matrix_zeilennormen):.1f}"
          f"  max {matrix_zeilennormen.max():.1f}")


    if zeilennormierung_schalter.value:
        # np.maximum(..., 1e-12) ist reine Vorsicht gegen Division durch 0.
        matrix_svd = matrix / np.maximum(matrix_zeilennormen, 1e-12)
    else:
        # Aus: unveränderte Matrix, also der bisherige Zustand.
        matrix_svd = matrix


    print("SVD-Input:", "zeilennormiert" if zeilennormierung_schalter.value else "roh")
    return (matrix_svd,)


@app.cell
def _(matrix_svd, np):
    # Der eigentlich Dekompositions-Schritt: Matrixzerlegung

    # Dauer
    # Jahre: 7 sek
    # Halbjahre: 1 min
    # Quartale: 3 min 16s

    # Decomposition/Zerlegung M = U * S * Vt
    # full_matrices=False: numpy rechnet nur die 502 Dimensionen aus,
    # die es überhaupt geben kann, statt einer 64.165 x 64.165 großen Matrix V.
    U, S, Vt = np.linalg.svd(matrix_svd, full_matrices=False)

    print("U :", U.shape)   # Zeilen im neuen Raum
    print("S :", S.shape)   # Wichtigkeit jeder Achse
    print("Vt:", Vt.shape)  # Kontextwort-Seite, erst später für anchors gebraucht
    return S, U, Vt


@app.cell
def _(S, U):
    # Auf k Dimensionen kürzen
    # SVD ist zunächst nur eine Matrix-Umrechnung. Der Gewinn entsteht erst durch die Kürzung des "weniger wichtigen" Teils. Die Kürzung soll substantiells ein, aber nicht zu stark. Ausgangswert ist die Zeilenzahl.
    # Bei Quartalen (502 Zeilen) sind 100 Dimensionen ein Fünftel des Spektrums. Bei Jahresscheiben (~130 Zeilen) wären 100 praktisch der volle Rang, und die Kürzung wäre sinnlos. Regel: Ein Drittel der Zeilen, gedeckelt bei 100 nach oben und 30 nach unten.
    svd_zeilen = U.shape[0]
    k = min(100, max(30, svd_zeilen // 3))

    # Der Vektor einer Zeile ist U * S, gekürzt auf die ersten k Spalten.
    # Das "* S" ist wesentlich: U allein ist auf Länge 1 normiert, der Faktor S enthält die Wichtigkeit.
    vektoren = U[:, :k] * S[:k]

    # Diese Metrik gibt den Kompressionsgrad an: wie viel der ursprünglichen PPMI-Matrix ist noch enthalten nach der Reduktion auf k Dimensionen.
    # Sie ist vor allem wichtig als Indikator für die Kompression, sowie als Vergleichswert bei verschiedenen Läufen mit unterschiedlichen Parametern.
    svd_frobenius_anteil = (S[:k] ** 2).sum() / (S ** 2).sum()

    print(f"{svd_zeilen} Zeilen -> k = {k}, Vektoren: {vektoren.shape}")
    print(f"erklärter Anteil der Frobenius-Norm: {svd_frobenius_anteil:.1%}")
    return svd_frobenius_anteil, vektoren


@app.cell
def _(np, pl, vektoren, zaesur, zeilen_tabelle):
    # Plausibilitätsprüfung über Kosinus-Ähnlichkeit
    # Vektoren auf Länge 1 normieren, dann ist das Skalarprodukt = Kosinus.
    laengen = np.linalg.norm(vektoren, axis=1, keepdims=True)
    vektoren_normiert = vektoren / laengen

    aehnlichkeit = vektoren_normiert @ vektoren_normiert.T

    # Beispielzeile und nächste Nachbarn
    beispiel_i = zeilen_tabelle.filter(
        (pl.col("zielwort_lemma") == "Sicherheit")
        & (pl.col("zeitscheibe") == zaesur)
    )["zeile_i"][0]

    # argsort sortiert aufsteigend, das Minus dreht die Reihenfolge um.
    top_indizes = np.argsort(-aehnlichkeit[beispiel_i])[:50]

    nachbarn = (
        zeilen_tabelle[top_indizes.tolist()]
        .with_columns(
            pl.Series("cos", aehnlichkeit[beispiel_i][top_indizes]).round(3)
        )
    )

    nachbarn

    # Top-Wert cos sollte 1 sein
    # Werte in zeile_i sollten nah beieinander liegen; Gegenteil deutet auf verschobene Indizes hin
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    #Vorbereitung des Bundles
    Das Lexoterm-Tool VSV (Visualisierung Semantischer Vektoren) erwartet die Daten in einem definierten Format (siehe unten bzw. Readme Datenmodell.md)
    In den Folgenden Schritten werden aus den bisher erzeugten Daten die nötigen Daten für das Bundle erstellt.
    """)
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## Datenmodell

    ```
    bundle_xyz.json
    ├── meta            Metadaten
    ├── entities        Zielwörter
    ├── time_slices     Zeitscheiben
    ├── facets_schema   deklarierte Facetten-Achsen
    ├── records         nicht-aggregierte Zellen
    ├── aggregates      aggregierte Zelle
    ├── anchors         Ankerwörter
    └── neighbors       Nächste Nachbarn
    ```
    """)
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    **Metadaten (meta)**
    Beschreibung, Vektordimension, Projektion, Zäsur

    **Zielwörter (entities)**
    händisch erstellte Liste, in diesem Notebook hart-codiert in "Definition Suchwörter"

    **Zeitscheiben (time_slices)**
    Die Größe der Zeitscheiben kann gewählt werden: Quartale, Halbjahre, Jahre. Prinzipiell wären auch noch feinere (und gröbere) Auflösungen denkbar, aber dafür müssen ausreichend Daten vorhanden sein.
    Umfasst der Untersuchungszeitraum 10 Jahre, und man wählt die Auflösung Quartale, ergeben sich 10 x 4 = 40 Zeitscheiben.

    **deklarierte Facetten-Achsen (facets_schema)**
    Grundsätzlich lassen sich weitere Analyse-Dimensionen definieren. Bei der Analyse von Zeitungskorpora böte sich z.B. "Publikation" an.
    Die Anzahl der Facetten ist nicht beschränkt, das Frontend (VSV) kann momentan aber nur eine weitere Facette farblich unterscheidbar darstellen.

    **nicht-aggregierte Zellen (records)**
    Hier befinden sich die nicht aggregierten Messwerte. Die Anzahl der Zellen errechnet sich aus: Zielwörter x Zeitscheiben x Facetten.
    Bei 20 Zielwörtern, 40 Zeitscheiben und 3 Facetten-Achsen ergeben sich so 2.400 Zellen.

    **aggregierte Zellen (aggregates)**
    Wie zuvor, aber ohne Facetten-Auflösung, also aggregiert: Zielwörter x Zeitscheiben.

    **Ankerwörter**
    In diesem Notebook wird (in relativ aufwändiger Weise) eine Vorschlagsliste für Ankerwörter generiert. Aus dieser werden die eigentlichen Wörter händisch ausgewählt und zusätzlich Clustern zugeordnet. Ankerwörter bilden quasi das semantische Grundgerüst des 3D-Raums, in den die Trajektorien der semantischen Verschiebung projiziert werden. Ohne sie sähe man zwar die Verschiebungspfade, aber ohne jegliche Anhaltspunkte.

    **Nächste Nachbarn (neighbors)**
    Vorberechnete 8 nächste Nachbarn pro Zielwort/Zeitscheibe. Der Wert 8 ist hart codiert vorgegeben (aber änderbar). Die Nachbarn werden im multimensionalen Raum nach SVD (also in einem Raum mit min. 30 und max. 100 Dimensionen) berechnet. Für die 3D-Darstellung im Frontend wird danach eine weitere PCA-Reduktion auf 3 Dimensionen durchgeführt. Das Frontend bietet zudem auf dieser Basis die Möglichkeit, weitere Wörter im Umfeld einzublenden. Die Nähe bzw. Kosinusdistanz der beiden Verfahren (hochdimensional vs dreidimensional) ist allerdings nicht klar vergleichbar. (Eventuell muss das Konzept im Frontend nochmal überarbeitet werden - Vermischung verschiedener Konzepte.)
    """)
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    Für die Vorbereitung des Bundles wird mit den Ankern begonnen, weil dieser Teil am komplexesten ist.
    """)
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## Anker
    Anker sind händisch ausgewählte Wörter, die im VSV-Tool innerhalb des Wortraums dargestellt werden. Dabei handelt es sich um thematisch besonders wichtige Wörter.
    Die Pipeline generiert eine Liste von Vorschlägen, die dann noch händisch kuratiert werden sollte. Als Zielgröße sind ca. 100 Anker und maximal 6 Cluster empfehlenswert. Mehr ist möglich, aber die optische Unterscheidbarkeit leidet.
    """)
    return


@app.cell
def _(Vt, np, pl, spalten_tabelle, vektoren, zaesur, zeilen_tabelle):
    # Extraktion von Kontextwort-Vektoren aus der Spaltenseite der SVD 
    # Die SVD hat M ≈ U · S · Vt zerlegt. U beschreibt die Zeilen der Matrix
    # (Zielwort × Quartal), Vt die Spalten (Kontextwörter).

    # Dimensionen der Zielwortvektoren
    anker_k = vektoren.shape[1]

    # Vt hat die Form (Achsen × Kontextwörter). Wir wollen eine Zeile je
    # Kontextwort, also transponieren.
    anker_vektoren = Vt[:anker_k].T

    print("Kontextwort-Vektoren:", anker_vektoren.shape)

    print(f"Beispielwort/Scheibe: Bundeswehr - {zaesur}")

    # Test-Zeile
    anker_probe = zeilen_tabelle.filter(
        (pl.col("zielwort_lemma") == "Bundeswehr")
        & (pl.col("zeitscheibe") == zaesur)
    )

    anker_zeile_i = anker_probe["zeile_i"][0]
    anker_zielwort_vektor = vektoren[anker_zeile_i]


    # Kosinus gegen jedes Kontextwort
    # Kosinus = Skalarprodukt zweier auf Länge 1 gebrachter Vektoren. Ohne diese
    # Normierung gewönnen schlicht die Kontextwörter mit der größten Vektorlänge,
    # unabhängig von der Richtung.

    anker_laengen = np.linalg.norm(anker_vektoren, axis=1, keepdims=True)
    anker_vektoren_normiert = anker_vektoren / np.maximum(anker_laengen, 1e-12)

    anker_zielwort_normiert = (
        anker_zielwort_vektor / np.linalg.norm(anker_zielwort_vektor)
    )

    anker_kosinus = anker_vektoren_normiert @ anker_zielwort_normiert


    # Top 20 nächste Kontextwörter = Wörter, die "Bundeswehr" in der gewählten Zeitscheibe am ähnlichsten sind. Dient einem Qualitätsprüfungscheck.
    # Mit der gleichen Methodik wird die Vorschlagsliste für die Anker erzeugt.

    # argsort sortiert aufsteigend, Minus dreht die Reihenfolge um.
    anker_top = np.argsort(-anker_kosinus)[:20]

    # spalten_tabelle ist durch .sort(...).with_row_index("spalte_j") nach
    # spalte_j geordnet: Zeile j von anker_vektoren gehört zu Zeile j dieser
    # Tabelle.
    anker_nachbarn = (
        spalten_tabelle[anker_top.tolist()]
        .with_columns(
            pl.Series("kosinus", anker_kosinus[anker_top]).round(3)
        )
        .select(["kontext_lemma", "kosinus"])
    )

    anker_nachbarn
    return anker_kosinus, anker_nachbarn, anker_vektoren


@app.cell
def _(
    anker_kosinus,
    anker_nachbarn,
    pl,
    spalten_tabelle,
    svd_input,
    zeilen_tabelle,
):
    # Ankerwörter sollen in möglichst vielen Scheiben vorkommen

    anker_belegung = (
        svd_input
        .group_by("kontext_lemma")
        .agg([
            pl.col("zeile_i").n_unique().alias("zellen"),
            pl.col("beobachtet").sum().alias("haeufigkeit"),
        ])
    )

    # Diagnose: wie belegt waren die 20 Wörter von eben?
    anker_diagnose = anker_nachbarn.join(
        anker_belegung, on="kontext_lemma", how="left"
    )
    print("bisherige Top-20 — Median belegter Zellen:",
          anker_diagnose["zellen"].median())


    # Einstellbarer Parameter: Wie oft soll ein Ankerwort mindestens Vorkommen?
    # Höher = wenige, sehr allgemeine Anker; niedriger =
    # spezifischer, aber wieder anfälliger für den Echo-Effekt.
    # Default: relativ zur Zeilenzahl
    anker_mindestzellen = max(10, round(len(zeilen_tabelle) * 0.02))

    anker_erlaubt = anker_belegung.filter(
        pl.col("zellen") >= anker_mindestzellen
    )

    print(f"Ankerkandidaten: {len(anker_erlaubt):,} von {len(anker_belegung):,} "
          f"(Mindestbelegung {anker_mindestzellen} von {len(zeilen_tabelle)} Zeilen)")


    # Rangliste wie in voriger Zelle, mit Mindestbelegung
    # Der Kosinus wird nicht neu gerechnet — er steht schon in anker_kosinus.
    anker_rangliste = (
        spalten_tabelle
        .with_columns(pl.Series("kosinus", anker_kosinus))
        .join(anker_erlaubt, on="kontext_lemma", how="inner")
        .sort("kosinus", descending=True)
        .head(20)
        .with_columns(pl.col("kosinus").round(3))
        .select(["kontext_lemma", "kosinus", "zellen", "haeufigkeit"])
    )

    anker_rangliste
    return (anker_erlaubt,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ### Eliminierung von Echos
    Manche Kontextwörter kommen im Korpus nur extrem selten vor (wenige belegte Matrixzellen). Mit so wenig Datenbasis hat die SVD kaum Information, um ihre Position im reduzierten Vektorraum zuverlässig zu bestimmen — solche Wörter landen dann fast zufällig nah beieinander, weil ihnen schlicht die Daten fehlen, um sich voneinander zu unterscheiden. Sichtbares Symptom: mehrere, inhaltlich völlig unzusammenhängende Wörter (Forstbetrieb, Euskirchen, Hauptrout, …) tauchen mit identischem Kosinuswert in einer Nachbarschaftsliste auf — sie „echoen" sich gegenseitig, statt echte semantische Nähe zum Zielwort widerzuspiegeln. Der anker_mindestzellen-Filter begegnet dem, indem er Wörter mit zu wenig Belegung von vornherein aus dem Kandidatenpool nimmt.
     „Echo": Man fragt den Vektorraum nach Nachbarn (schickt ein Signal rein), und statt einer echten, unabhängigen Antwort von woanders bekommt man das eigene Signal — die Zeile, nach der man gefragt hat — mehrfach zurückgeworfen, verkleidet als scheinbar unterschiedliche Wörter
    """)
    return


@app.cell
def _(anker_erlaubt, pl):
    # Prüfen, ob die alten Echo-Verdächtigen die Mindestbelegung 
    # noch überstehen. Tauchen sie nicht in der List auf, war die Filterung erfolgreich.
    verdaechtige = ["Forstbetrieb", "Euskirchen", "Hauptrout",
                    "Ampelkoalitionäre", "Eingangsworten", "zweitstärk"]
    anker_erlaubt.filter(pl.col("kontext_lemma").is_in(verdaechtige))

    pruefliste = verdaechtige + ["Sondervermögen", "Zeitenwende", "Attraktivität"]
    anker_erlaubt.filter(pl.col("kontext_lemma").is_in(pruefliste)).sort("zellen")
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ### Lemmawahl bei verschiedenen Wortarten
    """)
    return


@app.cell
def _(kwic_liste_quartale, pl):
    # Dominante Wortart je Lemma
    # Ein Lemma kann verschiedene Tags tragen ("gut" ist 4.068x ADV und 3.584x
    # ADJ). Für die Anker-Vorschlagsliste wird nur die häufigere Katgeorie aufgenommen. Vermutlich nicht besonders wichtig, ggf. beobachten.

    anker_pos_je_lemma = (
        kwic_liste_quartale
        .select(["kontext_lemmata", "kontext_pos"])
        .explode(["kontext_lemmata", "kontext_pos"], empty_as_null=True)
        .rename({"kontext_lemmata": "kontext_lemma", "kontext_pos": "pos"})
        .group_by(["kontext_lemma", "pos"])
        .len()
        # je Lemma das Tag mit der größten Zahl. Bewusst nicht über
        # .sort().unique(keep="first") — dessen Reihenfolge ist nicht garantiert.
        .group_by("kontext_lemma")
        .agg(pl.col("pos").sort_by("len", descending=True).first())
    )
    return (anker_pos_je_lemma,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ### Gesamtraum
    """)
    return


@app.cell
def _(
    anker_erlaubt,
    anker_pos_je_lemma,
    anker_vektoren,
    np,
    pl,
    spalten_tabelle,
    vektoren,
    zeilen_tabelle,
):
    # Von einer Zelle zur Ankerliste für den ganzen Raum 
    # Bisher wurde nur eine Zelle analysiert. Fürs Bundle brauchen wir eine  feste Liste von Ankern für den ganzen Raum. 
    # Ansatz: jede der 502 Zellen
    # nennt ihre k nächsten Kontextwörter, und wir zählen die Nennungen. Wörter,
    # die vielen Zellen nahe sind, steigen von selbst auf — die Liste balanciert
    # sich über Zielwörter und Quartale aus.

    anker_top_k = 10      # wie viele Nachbarn jede Zelle nennen darf

    # Kandidaten: belegt genug und inhaltstragend
    # Anker sind Begriffe, keine Füllwörter. 

    anker_pos_erlaubt = ["NOUN", "PROPN", "ADJ", "VERB"]

    anker_kandidaten = (
        spalten_tabelle
        .join(anker_erlaubt, on="kontext_lemma", how="inner")
        .join(anker_pos_je_lemma, on="kontext_lemma", how="inner")
        .filter(pl.col("pos").is_in(anker_pos_erlaubt))
    )

    anker_kandidaten_vektoren = anker_vektoren[
        anker_kandidaten["spalte_j"].to_numpy()
    ]

    print(f"Kandidaten: {len(anker_kandidaten):,}")


    # Kosinus-Berechnung
    # Beide Seiten auf Länge 1 normieren, dann ist das Matrixprodukt die komplette Kosinus-Tabelle: eine Zeile je Zelle, eine Spalte je Kandidat.
    anker_zeilen_normiert = vektoren / np.linalg.norm(
        vektoren, axis=1, keepdims=True
    )

    anker_kandidaten_normiert = anker_kandidaten_vektoren / np.maximum(
        np.linalg.norm(anker_kandidaten_vektoren, axis=1, keepdims=True), 1e-12
    )

    anker_kosinus_alle = anker_zeilen_normiert @ anker_kandidaten_normiert.T

    print("Kosinus-Tabelle:", anker_kosinus_alle.shape,
          f"({anker_kosinus_alle.nbytes / 1e6:.0f} MB)")


    # Die k nächsten Kandidaten je Zelle
    # axis=1 heißt "innerhalb jeder Zeile"; das Minus dreht auf absteigend.
    anker_top_je_zelle = np.argsort(-anker_kosinus_alle, axis=1)[:, :anker_top_k]


    # Auszählen
    # Aus (502 x 10) wird eine flache Liste von 5.020 Nennungen. Dazu merken wir
    # uns, aus welcher Matrixzeile jede Nennung stammt: np.repeat wiederholt jede
    # Zeilennummer k-mal, genau passend zur Reihenfolge von .ravel().
    anker_nennung_kandidat = anker_top_je_zelle.ravel()
    anker_nennung_zeile = np.repeat(np.arange(len(zeilen_tabelle)), anker_top_k)

    # Indizes in Wörter bzw. Zielwörter übersetzen.
    # zeilen_tabelle ist nie umsortiert worden, Position == zeile_i == Vektorzeile.
    anker_nennungen_lang = pl.DataFrame({
        "kontext_lemma": anker_kandidaten["kontext_lemma"].to_numpy()[
            anker_nennung_kandidat
        ],
        "zielwort_lemma": zeilen_tabelle["zielwort_lemma"].to_numpy()[
            anker_nennung_zeile
        ],
    })

    # Zwei Kennzahlen je Wort:
    #   nennungen   – wie oft insgesamt genannt, also Reichweite im Raum
    #   zielwoerter – von wie vielen VERSCHIEDENEN Zielwörtern

    anker_liste = (
        anker_nennungen_lang
        .group_by("kontext_lemma")
        .agg([
            pl.len().alias("nennungen"),
            pl.col("zielwort_lemma").n_unique().alias("zielwoerter"),
        ])
        .sort("nennungen", descending=True)
    )

    print(f"genannte Wörter insgesamt: {len(anker_liste):,}")

    print(f"Interpretationshilfe: Deutschland landete bei 38 der 502 Zeilen unter deren jeweils 10 nächsten Nachbarn. Es bedeutet also nicht 38 Vorkommen im Korpus, sondern 38 Zeilen (von maximal 502 möglichen), die dieses Wort als einen ihrer engsten Nachbarn ausgewählt haben.")

    anker_liste.head(60)
    return anker_kandidaten, anker_kosinus_alle, anker_liste


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ### Kontrast

    Kontrast ist die Antwort auf ein Problem, das die vorige Metrik (nennungen/zielwoerter) hatte: diese belohnte Wörter, die vielen Zeilen mittelmäßig nah sind — generische Wörter wie „sagen", „gehen", „finden", „Deutschland" tauchten bei 8–10 von 11 Zielwörtern in den Top-10 auf, einfach weil sie im Schwerpunkt des Raums sitzen und von überall aus ungefähr gleich weit weg sind. Genau solche Wörter sind als Anker aber nutzlos — an einem Punkt, der aus jeder Richtung gleich nah liegt, lässt sich keine Bewegung ablesen.

    Der nächste Schrit liest dieselbe Kosinus-Tabelle (anker_kosinus_alle, 502 Zeilen × Kandidaten) deshalb nicht mehr zeilenweise, sondern spaltenweise — pro Kandidatenwort über alle 502 Zeilen hinweg:

    * mittel = Durchschnitts-Kosinus zu allen 502 Zeilen → wie zentral/generisch das Wort im Gesamtraum liegt.
    * spitze = Durchschnitts-Kosinus nur zu seinen 10 nächsten Zeilen → wie nah es seinen besten Treffern kommt.
    * kontrast = spitze − mittel.

    Zwei Beispiele machen den Unterschied klar:

    „sagen" ist überall ungefähr gleich nah → spitze ≈ mittel → Kontrast ≈ 0. Es hat keine bevorzugte Richtung.
    „Afghanistan" ist einer Handvoll Zeilen sehr nah, dem Rest des Raums aber fern → spitze hoch, mittel niedrig → großer Kontrast.

    Kontrast misst also nicht „wie oft nah dran", sondern „wie sehr sticht das Wort in eine Richtung heraus, statt gleichmäßig zu streuen".
    """)
    return


@app.cell
def _(
    anker_kandidaten,
    anker_kosinus_alle,
    anker_liste,
    np,
    pl,
    zeilen_tabelle,
):
    anker_spitze_n = 10

    # 3 Kennzahlen
    anker_mittel = anker_kosinus_alle.mean(axis=0)
    anker_spitze = np.sort(
        anker_kosinus_alle, axis=0
    )[-anker_spitze_n:, :].mean(axis=0)
    anker_kontrast = anker_spitze - anker_mittel

    # Die nächstgelegene Zelle je Kandidat. Für die Kuratierung ist das die
    # wichtigste Spalte: man sieht auf einen Blick, welches Zielwort in welchem
    # Quartal das Wort anzieht - und kann daraus die Cluster bilden.
    anker_beste_zeile = anker_kosinus_alle.argmax(axis=0)

    # Zusammenbauen
    # WICHTIG: Spalte i von anker_kosinus_alle gehört zu Zeile i von
    # anker_kandidaten - so wurde anker_kandidaten_vektoren in 8a gezogen.
    # anker_kandidaten zwischen 8a und hier also nicht umsortieren.
    anker_rangliste_kontrast = (
        anker_kandidaten
        .with_columns([
            pl.Series("mittel", anker_mittel),
            pl.Series("spitze", anker_spitze),
            pl.Series("kontrast", anker_kontrast),
            # argmax gibt int64, zeile_i ist u32 - für den Join angleichen.
            pl.Series("beste_zeile", anker_beste_zeile).cast(pl.UInt32),
        ])
        # Zeilennummer in "Zielwort | Quartal" übersetzen
        .join(
            zeilen_tabelle.rename({
                "zeile_i": "beste_zeile",
                "zielwort_lemma": "bestes_zielwort",
                "zeitscheibe": "bestes_quartal",
            }),
            on="beste_zeile",
            how="left",
        )
        # die alte Nennungszahl zum Vergleich danebenlegen
        .join(anker_liste, on="kontext_lemma", how="left")
        .sort("kontrast", descending=True)
        .with_columns(pl.col(["kontrast", "spitze", "mittel"]).round(3))
        .select([
            "kontext_lemma", "pos", "kontrast", "spitze", "mittel",
            "bestes_zielwort", "bestes_quartal",
            "zellen", "haeufigkeit", "nennungen",
        ])
    )

    # Zum Kuratieren außerhalb des Notebooks (Tabellenkalkulation, Editor):
    anker_rangliste_kontrast.head(300).write_csv("output/anker_kandidaten.csv")

    anker_rangliste_kontrast.head(200)
    return


@app.cell
def _(anker_kandidaten, anker_kosinus_alle, pl, zaesur, zeilen_tabelle):
    # Kontrast über die Zeit
    # Der obenstehende Durchgang misst, was ein Zielwort von den anderen zehn trennt. Deshalb
    # fehlte "Sondervermögen": es gehört zu Bundeswehr UND Verteidigung UND
    # Rüstung gleichzeitig und hat in diesem Sinn wenig Kontrast - obwohl genau
    # solche Wörter die Zeitachse tragen.
    #
    # Zusätzliche Frage: welche Wörter trennen die Quartale vor der Zäsur
    # von denen danach? Begrenzung auf die militärischen Zielwörter, sonst gibt es Überlagerung durch Sicherheits- und Energie-Diskurse.

    anker_zeit_zielwoerter = [
        "Bundeswehr", "Verteidigung", "Landesverteidigung",
        "Rüstung", "Rüstungsindustrie", "Drohne",
    ]

    anker_zaesur = zaesur


    # Boolesche Masken über die 502 Matrixzeilen. Zeitscheiben sind Strings der
    # Form "2022-Q1" - lexikografisch sortierbar, ein einfacher Vergleich reicht,
    # kein Datumsparsen nötig.

    # Maske auf Zeilen mit militärischen Begriffen
    anker_ist_militaerisch = (
        zeilen_tabelle["zielwort_lemma"]
        .is_in(anker_zeit_zielwoerter)
        .to_numpy()
    )

    # Maske auf Zeilen nach Zäsur
    anker_ist_danach = (
        zeilen_tabelle["zeitscheibe"] >= anker_zaesur
    ).to_numpy()


    # Kombination auf militärisch+davor und militärisch+danach
    anker_danach_maske = anker_ist_militaerisch & anker_ist_danach
    anker_davor_maske = anker_ist_militaerisch & ~anker_ist_danach

    print(f"Zeilen davor: {anker_davor_maske.sum()}, "
          f"danach: {anker_danach_maske.sum()}")


    # Zeitsprung
    # Mittlere Nähe zu den Quartalen nach der Zäsur minus mittlere Nähe zu denen
    # davor. Positiv = neues Vokabular. Ein Wort, das es vorher gar nicht gab,
    # hat "vor_zaesur" nahe null und landet automatisch oben.
    anker_nach = anker_kosinus_alle[anker_danach_maske].mean(axis=0)
    anker_vor = anker_kosinus_alle[anker_davor_maske].mean(axis=0)

    anker_zeitsprung = anker_nach - anker_vor


    # Rangliste
    # Wie zuvor gilt: Spalte i von anker_kosinus_alle gehört zu Zeile i von
    # anker_kandidaten. Nicht umsortieren.
    anker_rangliste_zeit = (
        anker_kandidaten
        .with_columns([
            pl.Series("zeitsprung", anker_zeitsprung),
            pl.Series("nach_zaesur", anker_nach),
            pl.Series("vor_zaesur", anker_vor),
        ])
        .sort("zeitsprung", descending=True)
        .with_columns(
            pl.col(["zeitsprung", "nach_zaesur", "vor_zaesur"]).round(3)
        )
        .select([
            "kontext_lemma", "pos", "zeitsprung",
            "nach_zaesur", "vor_zaesur", "zellen", "haeufigkeit",
        ])
    )

    anker_rangliste_zeit.head(300).write_csv("output/anker_kandidaten_zeit.csv")

    anker_rangliste_zeit.head(60)
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ### Händische Kuratierung der Anker
    Die Ergebnisse der Kontrastuntersuchungen sind im order pipeline/output als "anker_kandidaten.csv" und "output/anker_kandidaten_zeit.csv" gespeichert.

    Diese beiden Listen werden nun kombiniert (z.B. in einer Tabellkalkulation), und es werden händisch geeignete Kandidaten ausgewählt.

    Die Liste sollte ca. 50-100 Anker enthalten, die auf idealerweise max 6 Cluster gemappt werden - dann ist die Darstellung im VSV-Tool übersichtlich.

    Das Ergebnis wird als anchors.csv im Ordner pipeline gespeichert. Es muss die Spalten "lemma", "label" und "cluster" enthalten. "label" können angegeben werden, müssen aber nicht: Hier können falsch lemmatisierte Wörter korrigiert werden (Soldatinn => Soldatin). "lemma" hingegen darf nicht verändert werden (aber es können ganze Zeilen gelöscht werden).

    Die Datei anchors.csv wird im Folgenden eingelesen und verarbeitet.
    Achtung: Neue Parameter führen zu neuen Kandidaten-Listen. Das ändert aber nichts an anchors.csv, die händisch erstellt werden muss. Sie wird durch den Notebook-Code nicht editiert.

    Bei einem ersten Durchlauf, zum Zeit sparen: Das VSV-Tool funktioniert auch ohne Anker. Aber ohne semantische Bezugspunkte sind räumliche Verschiebungen kaum zu interpretieren.
    """)
    return


@app.cell
def _(anker_vektoren, pl, spalten_tabelle):
    # Ankerliste einlesen und Vektoren zuordnen
    anker_liste_datei = pl.read_csv("anchors.csv")

    # Leeres label heißt "lemma unverändert anzeigen". Polars liest leere Felder
    # als null; coalesce nimmt den ersten nicht-null-Wert, hier also das Lemma.
    anker_liste_datei = anker_liste_datei.with_columns(
        pl.coalesce([pl.col("label"), pl.col("lemma")]).alias("label")
    )

    # Anker-Statistik
    print(f"Ankerliste: {len(anker_liste_datei)} Wörter in "
          f"{anker_liste_datei['cluster'].n_unique()} Clustern")
    print(anker_liste_datei.group_by("cluster").len().sort("len", descending=True))


    # Prüfung auf Vorkommen
    # Jedes Lemma braucht eine Matrixspalte, sonst gibt es keinen Vektor. Ein
    # fehlendes Lemma ist entweder ein Tippfehler in der CSV oder ein Wort, das
    # nach einem Parameterwechsel aus dem Vokabular gefallen ist. Beides muss
    # auffallen statt stillschweigend zu verschwinden - dieselbe Regel wie bei den Suchwörtern.
    anker_zugeordnet = anker_liste_datei.join(
        spalten_tabelle,
        left_on="lemma",
        right_on="kontext_lemma",
        how="left",
    )

    anker_fehlend = anker_zugeordnet.filter(pl.col("spalte_j").is_null())

    if len(anker_fehlend) > 0:
        print(f"ACHTUNG: {len(anker_fehlend)} Lemmata nicht im Vokabular")
        print(anker_fehlend.select(["lemma", "cluster"]))
    else:
        print("alle Lemmata im Vokabular gefunden")


    # Vektoren ergänzen
    anker_zugeordnet = anker_zugeordnet.filter(pl.col("spalte_j").is_not_null())

    # Wie überall: die Zuordnung läuft über spalte_j, nicht über die
    # Zeilenreihenfolge. Zwischen diesem Zugriff und dem Zusammenbau unten darf
    # anker_zugeordnet trotzdem nicht umsortiert werden.
    anker_bundle_vektoren = anker_vektoren[
        anker_zugeordnet["spalte_j"].to_numpy()
    ]

    anchors = (
        anker_zugeordnet
        .select(["lemma", "label", "cluster"])
        .with_columns(pl.Series("vector", anker_bundle_vektoren.tolist()))
    )

    anchors.write_parquet("output/anchors.parquet")

    print(f"anchors: {len(anchors)} Zeilen, Vektorlänge "
          f"{len(anchors['vector'][0])}")
    anchors
    return anchors, anker_bundle_vektoren, anker_liste_datei


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## Grundgerüst
    """)
    return


@app.cell
def _(pl, zeilen_tabelle):
    # Die verschiedenen Blöcke des JSON-Bundles sind über IDs verbunden, ähnlich einer relationalen DB. 

    # Die folgende Funktion erzeugt für die Suchwörter einfache IDs. Prinzipiell könnten dabei verschiedene Wörter ("Maß", "Mass") fälschlicherweise auf die gleiche ID abgebildet werden, aber da die Suchwort-Liste klein und bekannt ist, ist das Risiko gering. Die assert-bedingung führt eine einfache Prüfung diesbezüglich durch.

    def zu_id(spalte):
        """Lemma -> entity_id: klein, Umlaute transliteriert."""
        return (
            spalte
            .str.to_lowercase()
            .str.replace_all("ä", "ae")
            .str.replace_all("ö", "oe")
            .str.replace_all("ü", "ue")
            .str.replace_all("ß", "ss")
            .str.replace_all("-", "_")
        )

    # Zielwörter/Suchwörter 
    entities = (
        zeilen_tabelle
        .select("zielwort_lemma")
        .unique()
        .sort("zielwort_lemma")
        .with_columns([
            zu_id(pl.col("zielwort_lemma")).alias("id"),
            pl.col("zielwort_lemma").alias("label"),
        ])
        .select(["id", "label"])
    )

    assert entities["id"].n_unique() == entities.height, "zu_id()-Kollision: Es wurden mindesten zwei Lemmata auf dieselbe ID abgebildet."
    return entities, zu_id


@app.cell
def _(pl, zeilen_tabelle):
    # time_slices
    # Die Werte müssen lückenlos und in Reihenfolge sein
    # Aufgrund der Label-Form (z.B. "2013-Q4") entspricht eine alphabetische Sortierung auch einer chronologischen.
    time_slices = (
        zeilen_tabelle
        .select("zeitscheibe")
        .unique()
        .sort("zeitscheibe")
        .with_row_index("index")
        .with_columns([
            pl.col("zeitscheibe").alias("id"),
            pl.col("zeitscheibe").alias("label"),
        ])
        .select(["id", "label", "index"])
    )
    return (time_slices,)


@app.cell
def _(kwic_liste_quartale):
    # freq: Trefferzahl je Zelle
    # freq ist die Zahl der KWIC-Treffer, gezählt vor dem Explode.
    bundle_freq = (
        kwic_liste_quartale
        .group_by(["zeitscheibe", "zielwort_lemma"])
        .len()
        .rename({"len": "freq"})
    )
    return (bundle_freq,)


@app.cell
def _(bundle_freq, entities, time_slices):
    print(f"{len(entities)} entities, {len(time_slices)} time_slices, "
          f"{len(bundle_freq)} freq-Zellen")
    #entities
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## Dreidimensionale Vektoren mittels PCA
    """)
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    Zur visuellen Darstellung in einer 3D-Ansicht müssen die Wortvektoren aus dem hochdimensionalen Raum in den dreidimensionalen überführt werden. Dies geschieht mittels Principal Component Analysis, welche die Achsen der größten Varianz (Annahme: größte Erklärungskraft für Unterschiede) selektiert.

    Konzeptionell wichtig ist, dass alle Koordinaten in den gleichen Raum projiziert werden, und nicht etwa pro Zeitscheibe in verschieden Räume. Würde man die Zeitscheiben unabhängig voneinander einer PCA unterziehen, so wären die entstehenden Koordinatenräume nicht vergleichbar.
    """)
    return


@app.cell
def _(anker_bundle_vektoren, np, vektoren, zeilen_tabelle):
    # Alle Vektoren in einen Stapel, Aggregate zuerst
    # Quelle von "vektoren": SVD
    pca_alle = np.vstack([vektoren, anker_bundle_vektoren])
    pca_grenze = len(zeilen_tabelle)      # ab hier beginnen die Anker

    print(f"Stapel: {pca_alle.shape}  "
          f"({pca_grenze} Aggregate + {len(pca_alle) - pca_grenze} Anker)")
    return pca_alle, pca_grenze


@app.cell
def _(np, pca_alle):
    # Normierung auf Länge 1
    # Die Vektoren sind unterschiedlich lange (euklidische Norm, nicht Dimensionalität), resultierend aus der Datenmenge einer Zelle (weil höheres Redevolumen => mehr Text => mehr Kookkurenzen => mehr nicht-null Zellen und größere Werte => größere geometrische Länge). Weil diese Längen zwischen den Zellen um Faktor 24 (im synthetischen Datensatz) streuen, ist genau dieser Längenunterschied unnormiert die größte Streuung im Datensatz. Die PCA würde daraus ihre erste Achse bauen, statt aus den eigentlichen (semantisch interessanten) Richtungsunterschieden.

    # Die Ähnlichkeitsberechnung via Kosinus ist längeninvariant, aber die Auswahl der richtigen Achsen ist entscheidend.

    # Die Normierung an dieser Stelle ist nicht zu verwechseln mit der Zeilennormierung **vor** der SVD, die verworfen wurde.
    pca_laengen = np.linalg.norm(pca_alle, axis=1, keepdims=True)
    pca_alle_normiert = pca_alle / np.maximum(pca_laengen, 1e-12)

    pca_alle_normiert.shape
    return (pca_alle_normiert,)


@app.cell
def _(np, pca_alle_normiert):
    # Zentrierung und SVD
    # Mathematisch gilt: PCA ist die SVD einer spaltenweise zentrierten Matrix. # Unterschied zur früheren SVD: Längenormierung und Zentrierung

    # Spaltenmittelwert über alle Punkte (Aggregate + Anker), also der "Schwerpunkt" der Punktwolke im n-dimensionalen, längennormierten Raum. Ein Vektor mit n Einträgen. n = Anzahl der Zeilen nach SVD 
    pca_mittelwert = pca_alle_normiert.mean(axis=0)

    # Zentrierung (der n-dim Mittelwertvektor wird von jeder Zeile abgezogen) der Punktwolke, so dass ihr Schwerpunkt im Ursprung liegt. Nötig, weil SVD/PCA nur auf zentrierten Daten die "richtigen" Achsen findet.
    pca_zentriert = pca_alle_normiert - pca_mittelwert

    # Zerlegung/Decompositon
    # Umgekehrt gilt: pca_zentriert = U @ diag(S) @ Vt. 
    # Vt's Zeilen sind die Hauptachsen, sortiert nach erklärter Varianz absteigend; S die zugehörigen Singulärwerte (Stärke jeder Achse); U die auf Einheitslänge normierten Koordinaten der Trainingspunkte in diesem neuen Achsensystem.
    pca_U, pca_S, pca_Vt = np.linalg.svd(pca_zentriert, full_matrices=False)

    # Kappung auf die drei stärksten Achsen
    pca_achsen = pca_Vt[:3]

    # Für die gefitteten Punkte ist das identisch mit U[:, :3] * S[:3] - hier
    # aber als allgemeine Formel, die genauso für neue Vektoren funktioniert:
    #   (neuer_vektor_normiert - pca_mittelwert) @ pca_achsen.T
    pca_coords = pca_zentriert @ pca_achsen.T

    pca_erklaert = (pca_S[:3] ** 2).sum() / (pca_S ** 2).sum()
    print(f"erklärte Varianz (3 Komponenten): {pca_erklaert:.1%}")
    return pca_achsen, pca_coords, pca_erklaert, pca_mittelwert


@app.cell
def _(
    anchors,
    bundle_freq,
    pca_alle_normiert,
    pca_coords,
    pca_grenze,
    pl,
    zeilen_tabelle,
    zu_id,
):
    # Vektoren und 3D-Koordinaten mit bestehenden Daten kombinieren
    # Reihenfolge im Stapel = Reihenfolge in zeilen_tabelle bzw. anker_zugeordnet. Beide wurden seit ihrer Entstehung nicht umsortiert.
    bundle_aggregates = (
        zeilen_tabelle
        .with_columns([
            pl.Series("vector", pca_alle_normiert[:pca_grenze].tolist()),
            pl.Series("coords_3d", pca_coords[:pca_grenze].tolist()),
        ])
        # freq ergänzen, dann auf die Schema-Namen umschreiben
        .join(bundle_freq, on=["zeitscheibe", "zielwort_lemma"], how="left")
        .with_columns([
            zu_id(pl.col("zielwort_lemma")).alias("entity_id"),
            pl.col("zeitscheibe").alias("time_slice_id"),
        ])
        .select(["entity_id", "time_slice_id", "vector", "coords_3d", "freq"])
    )

    bundle_anchors = anchors.with_columns([
        pl.Series("vector", pca_alle_normiert[pca_grenze:].tolist()),
        pl.Series("coords_3d", pca_coords[pca_grenze:].tolist()),
    ])

    bundle_aggregates.write_parquet("output/bundle_aggregates.parquet")
    bundle_anchors.write_parquet("output/bundle_anchors.parquet")

    # Kontrolle: kein freq darf null sein - das hieße, eine Matrixzeile hat keine Treffer, was unmöglich ist und auf einen kaputten Join hindeutet.
    print(f"freq null: {bundle_aggregates['freq'].null_count()}")
    bundle_aggregates
    return bundle_aggregates, bundle_anchors


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## Nearest Neighbours
    Anker und Nachbarn erfüllen verschiedene Zwecke. Anker sind dauerhaft beschriftete, sinntragende Wörter, die als Punkte im 3D-Raum angezeigt werden. Deswegen sind die Anker umfangreich gefiltert und händisch kuratiert.

    Für Nachbarn gibt es zunächst nur das Kriterium der Mindestbelegung, ansonsten sind es sind die im Vektorraum nächsten Begriffe.
    """)
    return


@app.cell
def _(anker_erlaubt, anker_vektoren, np, spalten_tabelle, vektoren):
    neighbor_kandidaten = spalten_tabelle.join(
        anker_erlaubt, on="kontext_lemma", how="inner"
    )

    neighbor_kandidaten_vektoren = anker_vektoren[
        neighbor_kandidaten["spalte_j"].to_numpy()
    ]

    # Gleiche Berechnungsschritte wie bei den Ankern, nur aus dem breiteren Pool
    neighbor_zeilen_normiert = vektoren / np.linalg.norm(
        vektoren, axis=1, keepdims=True
    )
    neighbor_kandidaten_normiert = neighbor_kandidaten_vektoren / np.maximum(
        np.linalg.norm(neighbor_kandidaten_vektoren, axis=1, keepdims=True), 1e-12
    )
    neighbor_kosinus_alle = neighbor_zeilen_normiert @ neighbor_kandidaten_normiert.T

    print(f"Nachbar-Kandidaten: {len(neighbor_kandidaten):,} von "
          f"{len(spalten_tabelle):,} (Mindestbelegung, kein POS-Filter)")
    print("Kosinus-Tabelle:", neighbor_kosinus_alle.shape,
          f"({neighbor_kosinus_alle.nbytes / 1e6:.0f} MB)")
    return neighbor_kandidaten, neighbor_kosinus_alle


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ### Kontrast

    Vorgehen wie bei Anker > Kontrast.
    """)
    return


@app.cell
def _(neighbor_kosinus_alle, np):
    neighbor_mittel = neighbor_kosinus_alle.mean(axis=0)
    neighbor_kontrast_alle = neighbor_kosinus_alle - neighbor_mittel[np.newaxis, :]
    return (neighbor_kontrast_alle,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ### Erstellung
    Struktur laut Schema: neighbors[entity_id][time_slice_id] = Neighbor[]
    Die Array-Reihenfolge ist der Rang, das VSV-Tool sortiert nicht um.

    k: Es werden nicht nur die Nachbarn für die Top-10-Liste erzeugt, sondern auch die für die Wortwolke um das Zielwort. Deswegen ist der Wert mit 150 relativ hoch.
    """)
    return


@app.cell
def _(
    anker_liste_datei,
    neighbor_kandidaten,
    neighbor_kontrast_alle,
    neighbor_kosinus_alle,
    np,
    pl,
    zeilen_tabelle,
    zu_id,
):
    neighbors_k = 150

    # Auswahl per Kontrast
    nb_top = np.argsort(-neighbor_kontrast_alle, axis=1)[:, :neighbors_k]
    nb_scores = np.take_along_axis(neighbor_kosinus_alle, nb_top, axis=1)


    # Langform
    # np.repeat wiederholt jede Zeilenangabe k-mal (passend zu .ravel()),
    # np.tile zählt innerhalb jeder Zeile 1..k durch. 
    # Der Rang wird benötigt, weil der folgende Join die Zeilenreihenfolge beeinträchtigen kann.
    nb_entity_ids = (
        zeilen_tabelle
        .with_columns(zu_id(pl.col("zielwort_lemma")).alias("entity_id"))
        ["entity_id"].to_numpy()
    )

    nb_lang = pl.DataFrame({
        "entity_id": np.repeat(nb_entity_ids, neighbors_k),
        "time_slice_id": np.repeat(
            zeilen_tabelle["zeitscheibe"].to_numpy(), neighbors_k
        ),
        "rang": np.tile(np.arange(1, neighbors_k + 1), len(zeilen_tabelle)),
        "lemma": neighbor_kandidaten["kontext_lemma"].to_numpy()[nb_top.ravel()],
        "score": nb_scores.ravel(),
    })


    # Anker-Labels und Cluster anhängen
    # Hier greift die Mapping-Tabelle aus anchors.csv: ist der Nachbar ein Anker,
    # bekommt er dessen Anzeigetext (Einsatzkräft -> Einsatzkräfte) und dessen
    # Cluster als group. Ohne diesen Schritt fände das Frontend die Landmarke
    # nicht, weil es Nachbarn über anchorByLabel auflöst.
    nb_anker_info = anker_liste_datei.select([
        pl.col("lemma"),
        pl.col("label").alias("anker_label"),
        pl.col("cluster").alias("anker_cluster"),
    ])

    nb_lang = (
        nb_lang
        .join(nb_anker_info, on="lemma", how="left")
        .with_columns([
            pl.coalesce([pl.col("anker_label"), pl.col("lemma")]).alias("label"),
            pl.coalesce([pl.col("anker_cluster"), pl.lit("KONTEXT")]).alias("group"),
            pl.col("score").round(4),
        ])
        # Der Join gibt keine Reihenfolgegarantie - Rang wiederherstellen.
        .sort(["entity_id", "time_slice_id", "rang"])
    )


    # Verschachteltes Dict bauen
    neighbors = {}

    for zeile in nb_lang.iter_rows(named=True):
        je_entity = neighbors.setdefault(zeile["entity_id"], {})
        je_scheibe = je_entity.setdefault(zeile["time_slice_id"], [])
        je_scheibe.append({
            "label": zeile["label"],
            "score": round(float(zeile["score"]), 4),
            "group": zeile["group"],
        })
    return nb_lang, nb_scores, neighbors, neighbors_k


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ### Ähnlichkeitsprüfung auf Rang k
    Eine Liste von k (=150) nächsten Nachbarn garantiert nicht, dass sich die Einträge (am Ende der Liste) wirklich ähnlich sind. Deswegen wird nun an verschiedenen Stichproben geprüft, wie der Kosinus ausfällt. Es sollte sich idealerweise/normalerweise eine abfallende Kurve zeigen, die nicht bei 0 endet, sondern deutlich darüber (über dem Grundpegel).

    Erreicht die Kurve schneller den Grundpegel, sollte k niedriger angesetzt werden.
    """)
    return


@app.cell
def _(nb_lang, nb_scores, neighbor_kosinus_alle, neighbors_k, np):
    # Grundpegel-Berechnung
    # Wie ähnlich ist ein sich ein beliebiges Wortpaar?

    grundpegel_mittel = neighbor_kosinus_alle.mean()
    grundpegel_median = np.median(neighbor_kosinus_alle)

    print(f"Grundpegel (beliebiges Wortpaar): "
          f"Mittel {grundpegel_mittel:+.3f}, Median {grundpegel_median:+.3f}")

    # Kosinus je Rang
    nb_kosinus_je_rang = nb_scores.mean(axis=0)     # Spaltenmittel = je Rang

    print("Roher Kosinus im Mittel, je Rang:")
    for r in [0, 7, 24, 49, 99, neighbors_k - 1]:
        if r < neighbors_k:
            print(f"   Rang {r + 1:4d}: {nb_kosinus_je_rang[r]:+.3f}")
    print(f"   Einträge mit Kosinus <= {grundpegel_mittel}: {(nb_scores <= grundpegel_mittel).mean():.1%}")

    print(f"Verschiedene Nachbar-Lemmata insgesamt: "
          f"{nb_lang['lemma'].n_unique():,}")


    return


@app.cell
def _(neighbors, zaesur):
    # Stichprobe
    neighbors["bundeswehr"][zaesur][:10]
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## Koordinaten des gesamten Vokabulars
    Die Anker (und Aggregate) definieren mittels SVD den Koordinaten-Raum. Deswegen wurden ihre Koordinaten weiter oben im SVD-Schritt berechnet.

    Das gilt aber nicht für die Nachbarn, die nur in den gleichen Raum projiziert werden, ihn aber nicht definieren.

    Deswegen erfolgt nun noch die Berechnung der Koordinaten aller sonstigen Wörter: Nachbarn, Sonstige (falls vorhanden), aber keine Anker (oder Zielwörter). Aus diesem Reservoir (vocab_points) werden die Koordinaten bei Bedarf ausgelesen.
    """)
    return


@app.cell
def _(
    anchors,
    anker_vektoren,
    nb_lang,
    neighbor_kandidaten,
    np,
    pca_achsen,
    pca_mittelwert,
    pl,
):
    # Lemmata, die in mindestens einer Nachbarliste vorkommen.
    vocab_gebraucht = (
        nb_lang
        .select(pl.col("lemma").alias("kontext_lemma"))
        .unique()
    )

    # neighbour_kanidaten: neighbours-Kandidaten mit Mindestbelegung
    # vocab_gebraucht ist nur eine wortliste, neighbour_kandidaten ist eine matrix, deswegen wird letztere verwendet und schrittweise reduziert.
    # join vocab_gebraucht, semi: behalte nur die, die rechts vorkommen
    # join anchors, anti: aber keine anchors
    # label: berücksichtige auch korrigierte anzeige-label
    vocab_kandidaten = (
        neighbor_kandidaten
        .join(vocab_gebraucht, on="kontext_lemma", how="semi")
        .join(anchors, left_on="kontext_lemma", right_on="lemma", how="anti")
        .join(
            anchors.select(pl.col("label").alias("kontext_lemma")),
            on="kontext_lemma",
            how="anti",
        )
    )

    # anker_vektoren ist an dieser stelle irreführend benannt, es enthält die Vektoren aller Kontextwörter.
    # Erzeugt ein neues array aus Basis der Index-Spalte J.
    vocab_vektoren = anker_vektoren[vocab_kandidaten["spalte_j"].to_numpy()]

    # Gleiche Normierung wie beim PCA-Fit
    vocab_laengen = np.linalg.norm(vocab_vektoren, axis=1, keepdims=True)
    vocab_vektoren_normiert = vocab_vektoren / np.maximum(vocab_laengen, 1e-12)

    # Out-of-Sample-Projektion mit den gefitteten pca_mittelwert/pca_achsen
    vocab_coords = (vocab_vektoren_normiert - pca_mittelwert) @ pca_achsen.T

    # Formatierung als Bundle-Inhalt
    bundle_vocab_points = vocab_kandidaten.with_columns(
        pl.Series("coords_3d", vocab_coords.tolist())
    ).select(["kontext_lemma", "coords_3d"])
    return (bundle_vocab_points,)


@app.cell
def _(anchors, bundle_vocab_points, nb_lang, pl):
    # Kontrolle: Hat jeder Anker und jeder Neighbour eine Koordinate?
    # Was hier übrig bleibt, wäre ein Label, das das Frontend nicht zeichnen kann. Prüfung über Label, nicht lemma.

    abgedeckte_labels = pl.concat([
        anchors.select("label"),
        bundle_vocab_points.select(pl.col("kontext_lemma").alias("label")),
    ]).unique()

    ohne_koordinate = (
        nb_lang
        .join(abgedeckte_labels, on="label", how="anti")
        ["label"].n_unique()
    )


    print(f"vocab_points: {len(bundle_vocab_points):,} Koordinaten "
          f"(aus {nb_lang['lemma'].n_unique():,} verschiedenen Nachbar-Lemmata, "
          f"Rest sind Anker)")
    print(f"  Nachbar-Lemmata ohne Koordinate: {ohne_koordinate}  <- muss 0 sein")

    # bundle_vocab_points
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## Metadaten und JSON-Export
    """)
    return


@app.cell
def _(
    bundle_aggregates,
    bundle_anchors,
    bundle_vocab_points,
    entities,
    neighbors,
    pca_erklaert,
    svd_frobenius_anteil,
    time_slices,
    zaesur,
    zeitscheiben_raster_picker,
):
    import json
    import os


    # Dimensionen bestimmen
    bundle_vector_dim = len(bundle_aggregates["vector"][0])

    # Raster-Bezeichnung 
    raster_kuerzel = zeitscheiben_raster_picker.value
    raster_titel = {
        "quartal":  "Quartale",
        "halbjahr": "Halbjahre",
        "jahr":     "Jahre",
    }[raster_kuerzel]

    # Meta-Daten
    bundle_meta = {
        "name": f"Zeitenwende im Bundestag ({raster_titel})",
        "description": (
            f"11 Zielwörter aus dem Zeitenwende-Wortfeld über "
            f"{len(time_slices)} Zeitscheiben ({raster_titel.lower()}) der "
            f"Plenarprotokolle des Deutschen Bundestages (CPP-BT, Fobbe 2026, "
            f"CC BY-SA 4.0). Vektoren sind per PPMI-SVD über ein ±40-Wörter-"
            f"Kontextfenster KONSTRUIERT, nicht trainiert. Die 3D-Ansicht zeigt "
            f"nur {pca_erklaert:.0%} der Struktur - belastbare Aussagen kommen "
            f"aus den Modulen, die mit vector rechnen."
        ),
        "vector_dim": bundle_vector_dim,
        "projection": (
            f"PPMI-SVD (k={bundle_vector_dim}), danach joint PCA "
            f"(3 Komponenten) über Aggregate + Anker"
        ),
        "shift_point": zaesur,
        "explained_variance_ratio_3d": round(float(pca_erklaert), 4),
        "explained_frobenius_ratio_k": round(float(svd_frobenius_anteil), 4),
    }

    # Zahlen runden
    # json kann numpy-Typen nicht serialisieren (float() baut sie um),
    # und volle Fließkommagenauigkeit bläht die Datei ohne Erkenntnisgewinn auf.
    def runde(werte, stellen=5):
        return [round(float(x), stellen) for x in werte]

    bundle_aggregates_json = [
        {
            "entity_id": z["entity_id"],
            "time_slice_id": z["time_slice_id"],
            "facets": {},                       # ggw. noch leer wg. zu wenig Daten
            "vector": runde(z["vector"]),
            "coords_3d": runde(z["coords_3d"], 4),
            "freq": int(z["freq"]),
        }
        for z in bundle_aggregates.iter_rows(named=True)
    ]

    bundle_anchors_json = [
        {
            "label": z["label"],
            "cluster": z["cluster"],
            "vector": runde(z["vector"]),
            "coords_3d": runde(z["coords_3d"], 4),
            # nicht im Schema, aber es ist .passthrough() - und für die
            # Nachvollziehbarkeit ist das Ausgangslemma Gold wert.
            "lemma": z["lemma"],
        }
        for z in bundle_anchors.iter_rows(named=True)
    ]

    bundle_vocab_points_json = [
        {
            "label": z["kontext_lemma"],
            "coords_3d": runde(z["coords_3d"], 4),
        }
        for z in bundle_vocab_points.iter_rows(named=True)
    ]


    # Zusammenbauen
    bundle = {
        "meta": bundle_meta,
        "facets_schema": [],        # kommt mit den Records (z.B. Fraktion)
        "entities": entities.to_dicts(),
        "time_slices": time_slices.to_dicts(),
        "anchors": bundle_anchors_json,
        "vocab_points": bundle_vocab_points_json,
        "records": [],              # bewusst leer
        "aggregates": bundle_aggregates_json,
        "neighbors": neighbors,
    }

    # Raster im Dateinamen: mehrere Fassungen liegen nebeneinander
    bundle_pfad = f"output/bundestag_zeitenwende_{raster_kuerzel}.json"

    # ensure_ascii=False: Umlaute bleiben Umlaute
    with open(bundle_pfad, "w", encoding="utf-8") as f:
        json.dump(bundle, f, ensure_ascii=False, separators=(",", ":"))

    nb_eintraege = sum(
        len(liste)
        for je_entity in bundle["neighbors"].values()
        for liste in je_entity.values()
    )

    print(f"{bundle_pfad}: {os.path.getsize(bundle_pfad) / 1e6:.1f} MB")
    print(f"Raster {raster_kuerzel}, Zäsur {zaesur}, vector_dim {bundle_vector_dim}")
    print(f"{len(bundle['aggregates'])} aggregates, "
          f"{len(bundle['anchors'])} anchors, "
          f"{len(bundle['vocab_points']):,} vocab_points, "
          f"{nb_eintraege:,} Nachbar-Einträge, "
          f"{len(bundle['entities'])} entities, "
          f"{len(bundle['time_slices'])} time_slices")
    return bundle_pfad, raster_kuerzel


@app.cell
def _(mo):
    kopier_schalter = mo.ui.switch(
        value=True,
        label="Nach backend/bundles kopieren (sonst nur output/)",
    )
    kopier_schalter
    return (kopier_schalter,)


@app.cell
def _(bundle_pfad, kopier_schalter, raster_kuerzel):
    # Ins Backend kopieren
    # output/ ist die Werkbank der Pipeline, backend/bundles/ ist das, was die
    # App tatsächlich lädt.
    import shutil

    if kopier_schalter.value:
        backend_pfad = f"../backend/bundles/bundestag_zeitenwende_{raster_kuerzel}.json"
        shutil.copy2(bundle_pfad, backend_pfad)
        print(f"kopiert nach {backend_pfad}")
    else:
        print("nicht kopiert (Schalter aus) - liegt nur in output/")
    return


if __name__ == "__main__":
    app.run()
