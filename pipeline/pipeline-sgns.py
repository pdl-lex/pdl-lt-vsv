import marimo

__generated_with = "0.24.0"
app = marimo.App(width="medium")


@app.cell
def _():
    import marimo as mo
    import polars as pl


    return mo, pl


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    # SGNS + Procrustes: zweiter Verfahrensweg für VSV-Bundles

    Kontrollverfahren zur PPMI-SVD-Pipeline in `pipeline.py`. Statt Vektoren aus
    Kookkurrenzzählungen zu **konstruieren**, wird hier je Zeitscheibe ein
    word2vec-Modell **trainiert** (Skip-Gram mit Negative Sampling) und die
    Scheiben werden nachträglich per orthogonalem Procrustes ausgerichtet.

    Wichtigster Unterschied zu `pipeline.py`: Trainingsgrundlage ist der
    **Volltext aller Reden**, nicht der KWIC-Auszug. Begründung, Korpuszahlen und
    Stufenplan stehen in `README.md` unter "Zwei Verfahren im Vergleich" und
    "SGNS-Pfad".

    Quelle: Fobbe, S. (2026). Corpus der Plenarprotokolle des Deutschen
    Bundestages (CPP-BT), Version 2026-01-17, Zenodo,
    https://doi.org/10.5281/zenodo.18177196
    """)
    return


@app.cell
def _(pl):
    # Nur drei Spalten: die ID, das Datum (fuer die Zeitscheibe) und der Volltext.
    # Redner/Fraktion brauchen wir erst, wenn Facetten dazukommen.
    spalten = ["rede_id", "sitzung_datum", "rede_text"]

    korpus = pl.read_csv(
        "source_data/CPP-BT_2026-01-17_DE_CSV_Reden_Gesamt.csv",
        columns=spalten,
        null_values="NA",
    )

    print(f"{len(korpus):,} Reden geladen, {korpus.estimated_size('mb'):.0f} MB im Speicher")

    korpus

    return (korpus,)


@app.cell
def _(korpus, pl):
    # Jahr aus dem Datum. Anders als in pipeline.py gibt es hier keinen Umschalter
    # fuer Quartal/Halbjahr/Jahr: fuer ein trainiertes Modell sind nur
    # Jahresscheiben gross genug (Begruendung in der README unter "Korpusgroesse").
    korpus_jahre = korpus.with_columns(
        pl.col("sitzung_datum")
          .str.strptime(pl.Date, "%Y-%m-%d")
          .dt.year()
          .cast(pl.Utf8)
          .alias("zeitscheibe")
    )

    # Wie viel Text steht je Jahr zur Verfuegung?
    # Grobe Wortzahl ueber die Leerzeichen, nicht ueber spaCy: fuer eine
    # Groessenordnung reicht das und kostet unter einer Sekunde statt Minuten.
    # count_matches zaehlt die Trennstellen, +1 ergibt die Wortzahl.
    volumen = (
        korpus_jahre
        .group_by("zeitscheibe")
        .agg(
            pl.len().alias("reden"),
            (pl.col("rede_text").str.count_matches(" ") + 1).sum().alias("woerter_grob"),
        )
        .sort("zeitscheibe")
    )

    volumen

    return (korpus_jahre,)


@app.cell
def _(mo):
    # Fuer Stufe 0 arbeiten wir auf EINER Scheibe. 2022 als Default: Zaesurjahr,
    # und mit 4,75 Mio. Woertern zugleich eine realistisch grosse Scheibe - was
    # hier an Laufzeit und Qualitaet herauskommt, gilt ungefaehr auch fuer die
    # anderen elf.
    scheiben_picker = mo.ui.dropdown(
        options=[str(jahr) for jahr in range(2014, 2026)],
        value="2022",
        label="Zeitscheibe (Jahr)",
    )

    mo.style(scheiben_picker, width="360px")

    return (scheiben_picker,)


@app.cell
def _(korpus_jahre, pl, scheiben_picker):
    # Zeitscheibe gemäß Picker filtern

    scheibe = korpus_jahre.filter(pl.col("zeitscheibe") == scheiben_picker.value)

    print(f"Zeitscheibe {scheiben_picker.value}: {len(scheibe):,} Reden")

    scheibe

    return


@app.cell
def _():
    import spacy

    nlp = spacy.load("de_core_news_md")

    return (nlp,)


@app.cell
def _(korpus_jahre, mo, nlp, pl):
    import os

    os.makedirs("cache", exist_ok=True)


    def lemma_pfad(jahr):
        """Cache-Pfad einer lemmatisierten Scheibe.

        Steht hier und nicht bei den Lesern, und das ist Absicht: marimo ordnet
        Zellen NUR nach Datenfluss. Eine Zelle, die "cache/lemmata_2022.parquet"
        als Literal liest, haengt an keiner Kante zu dieser Zelle, die die Datei
        schreibt - die Reihenfolge waere dann Zufall der Registrierung. Wer den
        Pfad ueber diese Funktion holt, bekommt die Kante geschenkt.
        """
        return f"cache/lemmata_{jahr}.parquet"


    # Alle Scheiben, die im Korpus vorkommen - inklusive der Randscheiben 2013
    # und 2026. Die fliegen erst beim Training raus, nicht schon hier: im Cache
    # kosten sie fast nichts, und man kann an ihnen zeigen, WARUM sie rausfliegen,
    # statt es nur zu behaupten.
    alle_scheiben = (
        korpus_jahre
        .select("zeitscheibe")
        .unique()
        .sort("zeitscheibe")
        ["zeitscheibe"]
        .to_list()
    )

    for scheibe_id in alle_scheiben:
        ziel = lemma_pfad(scheibe_id)

        # Wiederaufnehmbar: bricht der Lauf ab oder kommt spaeter eine Scheibe
        # dazu, macht der naechste Durchgang genau dort weiter.
        if os.path.exists(ziel):
            print(f"{ziel} liegt schon vor - uebersprungen")
            continue

        scheibe_roh = korpus_jahre.filter(pl.col("zeitscheibe") == scheibe_id)
        texte = scheibe_roh["rede_text"].to_list()

        lemmata_je_rede = []
        pos_je_rede = []

        with mo.status.progress_bar(
            total=len(texte),
            title=f"Lemmatisierung {scheibe_id}",
        ) as bar:
            for doc in nlp.pipe(
                texte,
                disable=["parser", "ner", "senter"],
                n_process=8,
                batch_size=50,
            ):
                lemmata_je_rede.append([t.lemma_ for t in doc if t.pos_ not in ("PUNCT", "SPACE")])
                pos_je_rede.append([t.pos_ for t in doc if t.pos_ not in ("PUNCT", "SPACE")])
                bar.update()

        scheibe_lemmatisiert = scheibe_roh.select(["rede_id", "zeitscheibe"]).with_columns([
            pl.Series("lemmata", lemmata_je_rede),
            pl.Series("pos", pos_je_rede),
        ])

        scheibe_lemmatisiert.write_parquet(ziel)

        print(f"{ziel}: {len(scheibe_lemmatisiert):,} Reden, "
              f"{scheibe_lemmatisiert['lemmata'].list.len().sum():,} Token, "
              f"{os.path.getsize(ziel) / 1e6:.0f} MB")

    return alle_scheiben, lemma_pfad, os


@app.cell
def _(lemma_pfad, pl, scheiben_picker):
    # Lemmatisierung wird aus dem File gelesen, nicht neu berechnet.

    scheibe_lemmatisiert_pq = pl.read_parquet(lemma_pfad(scheiben_picker.value))

    print(f"{len(scheibe_lemmatisiert_pq):,} Reden, "
          f"{scheibe_lemmatisiert_pq['lemmata'].list.len().sum():,} Token")

    scheibe_lemmatisiert_pq

    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    Drei Entscheidungen, die in dem Code stecken
    Kleinschreibung: bewusst nicht. Jedes word2vec-Tutorial lowercased als Erstes. Hier nicht — aus einem harten Grund: der PPMI-Pfad tut es auch nicht, anchors.csv enthält Soldat, Einsatzkräft, Sondervermögen mit Großschreibung, und die Anker werden über exakte Lemma-Strings nachgeschlagen. Würden wir hier kleinschreiben, fänden die Anker im SGNS-Bundle stillschweigend nichts — kein Fehler, nur leere Landmarken. Im Deutschen kostet die Großschreibung ohnehin weniger als im Englischen, weil sie Wortarten trennt statt Dubletten zu erzeugen.

    POS und Lemma getrennt gespeichert. Im PPMI-Pfad lag kontext_pos monatelang ungenutzt in der Parquet-Datei — und als die Frage nach einem POS-Filter aufkam, war sie ohne neuen spaCy-Lauf testbar. Dieselbe Vorsorge hier: 1,3 Minuten je Scheibe klingen billig, über zwölf Scheiben und mehrere Filtervarianten wird daraus schnell eine Stunde.

    Die Rede bleibt die Zeile. Nicht die Scheibe, nicht der Satz. Beim Training ist die Rede die Dokumentgrenze, damit das Fenster nicht über einen Rednerwechsel läuft — und für den Split-Half-Test in Stufe 2 brauchen wir sie als Ziehungseinheit.
    """)
    return


@app.cell
def _(alle_scheiben, lemma_pfad, os, pl):
    uebersicht_zeilen = []

    for scheibe_name in alle_scheiben:
        cache_pfad = lemma_pfad(scheibe_name)

        if not os.path.exists(cache_pfad):
            continue

        cache_daten = pl.read_parquet(cache_pfad)

        uebersicht_zeilen.append({
            "zeitscheibe": scheibe_name,
            "reden": len(cache_daten),
            "token": int(cache_daten["lemmata"].list.len().sum()),
            "mb": round(os.path.getsize(cache_pfad) / 1e6, 1),
        })

    cache_uebersicht = pl.DataFrame(uebersicht_zeilen)

    # Anteil am groessten Jahr: das ist die Downsampling-Frage in einer Spalte.
    # Fuer PPMI war die Ungleichheit verkraftbar (die Randsummen kuerzen sich
    # heraus), fuer ein trainiertes Modell haengt die Vektorqualitaet direkt an
    # der Trainingsmenge.
    cache_uebersicht = cache_uebersicht.with_columns(
        (pl.col("token") / pl.col("token").max()).round(2).alias("anteil_am_groessten")
    )

    print(f"gesamt: {cache_uebersicht['token'].sum():,} Token, "
          f"{cache_uebersicht['mb'].sum():.0f} MB")

    cache_uebersicht

    return


@app.cell
def _(lemma_pfad, pl, scheiben_picker):
    # Stopword-Filterung via POS, wie wie im PPMI-Pfad. PART bleibt drin: dort steckt im Deutschen die Negation, und
    # "nicht" im Umfeld von "Bundeswehr" ist inhaltlich nicht nichts.
    pos_verboten = {"DET", "ADP", "PRON", "AUX", "CCONJ", "SCONJ"}


    def reden_der_scheibe(jahr):
        """Liest eine Scheibe aus dem Cache und wendet den POS-Filter an.

        Rueckgabe: Liste von Tokenlisten, eine je Rede - genau das Format, das
        gensim.Word2Vec erwartet.
        """
        daten = pl.read_parquet(lemma_pfad(jahr))

        return [
            [
                lemma
                for lemma, pos in zip(lemmata_einer_rede, pos_einer_rede)
                if pos not in pos_verboten
            ]
            for lemmata_einer_rede, pos_einer_rede in zip(
                daten["lemmata"].to_list(),
                daten["pos"].to_list(),
            )
        ]


    trainings_reden = reden_der_scheibe(scheiben_picker.value)

    print(f"{len(trainings_reden):,} Reden, "
          f"{sum(len(rede) for rede in trainings_reden):,} Token nach POS-Filter")
    return reden_der_scheibe, trainings_reden


@app.cell
def _(nlp):
    suchwoerter = {
        "Bundeswehr", "Wehrpflicht", "Verteidigung", "Landesverteidigung",
        "Drohne", "Drohnen", "Hindukusch", "Rüstung", "Rüstungsindustrie",
        "Sicherheit", "Frieden", "Friedenssicherung",
    }

    # Auf Lemmata bringen wie in pipeline.py: "Drohnen" -> "Drohne".
    # Aus 12 Suchwoertern werden dadurch 11 Zielwoerter.
    zielwoerter = sorted({doc[0].lemma_ for doc in nlp.pipe(sorted(suchwoerter))})

    print(f"{len(zielwoerter)} Zielwoerter:", zielwoerter)

    return (zielwoerter,)


@app.cell
def _():
    from gensim.models import Word2Vec


    def trainiere_modell(dokumente, seed, min_count=10):
        return Word2Vec(
            dokumente,
            sg=1,                   # Skip-Gram: aus dem Wort die Umgebung vorhersagen
            negative=5,             # 5 Gegenbeispiele je echtem Paar - das "NS" in SGNS
            vector_size=100,        # bewusst gleich dem k der SVD im PPMI-Pfad
            window=5,               # 5 Woerter links und rechts, nie ueber die Rede hinaus
            min_count=min_count,    # Default 10 = die Stufe-1/2-Rauschboeden bleiben
                                    # reproduzierbar; Stufe 3 uebergibt 3, weil dort
                                    # der Kontrast filtert und nicht die Haeufigkeit
            epochs=5,
            # workers=1 ist kein Vorschlag: nur damit ist ein Lauf bei festem Seed
            # bitgleich wiederholbar (s. Stolpersteine in der README).
            workers=1,
            seed=seed,
        )


    return Word2Vec, trainiere_modell


@app.cell
def _(trainiere_modell, trainings_reden, zielwoerter):
    import time

    t_start = time.time()

    modell_a = trainiere_modell(trainings_reden, seed=1)
    modell_b = trainiere_modell(trainings_reden, seed=2)

    print(f"zwei Modelle in {time.time() - t_start:.0f}s, "
          f"Vokabular je {len(modell_a.wv):,} Woerter")

    # Kein stiller Ausfall: welche Zielwoerter haben min_count nicht geschafft?
    fehlend = [w for w in zielwoerter if w not in modell_a.wv]
    print("Zielwoerter nicht im Vokabular:", fehlend if fehlend else "keine")

    return modell_a, modell_b


@app.cell
def _(mo):
    wort_feld = mo.ui.text(value="Bundeswehr", label="Wort")
    wort_feld
    return (wort_feld,)


@app.cell
def _(modell_a, modell_b, pl, wort_feld):
    wort = wort_feld.value.strip()

    if wort not in modell_a.wv:
        nachbarn_vergleich = f"'{wort}' ist nicht im Vokabular (min_count=10 nicht erreicht)."

    else:
        nachbarn_a = modell_a.wv.most_similar(wort, topn=10)
        nachbarn_b = modell_b.wv.most_similar(wort, topn=10)

        nachbarn_vergleich = pl.DataFrame({
            "rang":   list(range(1, 11)),
            "seed_1": [w for w, _ in nachbarn_a],
            "cos_1":  [round(c, 3) for _, c in nachbarn_a],
            "seed_2": [w for w, _ in nachbarn_b],
            "cos_2":  [round(c, 3) for _, c in nachbarn_b],
        })

    nachbarn_vergleich
    return


@app.cell
def _(modell_a, modell_b, pl, zielwoerter):
    import random


    def mittlere_ueberlappung(m1, m2, woerter, k=10):
        werte = []

        for w in woerter:
            if w not in m1.wv or w not in m2.wv:
                continue
            oben_1 = {x for x, _ in m1.wv.most_similar(w, topn=k)}
            oben_2 = {x for x, _ in m2.wv.most_similar(w, topn=k)}
            werte.append(len(oben_1 & oben_2) / k)

        return sum(werte) / len(werte) if werte else float("nan")


    # index_to_key ist nach Haeufigkeit sortiert: vorne die haeufigsten.
    vokabular = modell_a.wv.index_to_key
    random.seed(0)   # feste Stichprobe, damit die Zahl zwischen Laeufen vergleichbar ist

    gruppen = {
        "11 Zielwoerter": zielwoerter,
        "500 haeufigste": vokabular[:500],
        "500 zufaellige": random.sample(vokabular, 500),
        "500 seltenste":  vokabular[-500:],
    }

    rauschboden = pl.DataFrame({
        "gruppe": list(gruppen.keys()),
        "ueberlappung": [
            round(mittlere_ueberlappung(modell_a, modell_b, woerter), 3)
            for woerter in gruppen.values()
        ],
    })

    rauschboden

    return (random,)


@app.cell
def _(mo):
    vergleich_picker = mo.ui.dropdown(
        options=[str(jahr) for jahr in range(2014, 2026)],
        value="2016",
        label="Vergleichsscheibe (frueher)",
    )
    vergleich_picker

    return (vergleich_picker,)


@app.cell
def _(
    modell_a,
    reden_der_scheibe,
    scheiben_picker,
    trainiere_modell,
    vergleich_picker,
    zielwoerter,
):
    modell_frueh = trainiere_modell(reden_der_scheibe(vergleich_picker.value), seed=1)
    modell_spaet = modell_a   # die Scheibe aus scheiben_picker, Seed 1

    gemeinsam = sorted(set(modell_frueh.wv.index_to_key) & set(modell_spaet.wv.index_to_key))

    print(f"{vergleich_picker.value}: {len(modell_frueh.wv):,} Woerter  |  "
          f"{scheiben_picker.value}: {len(modell_spaet.wv):,} Woerter")
    print(f"gemeinsam: {len(gemeinsam):,} ({len(gemeinsam) / len(modell_spaet.wv):.0%} von {scheiben_picker.value})")

    # Kein stiller Ausfall - und hier faellt tatsaechlich etwas aus.
    print("Zielwoerter NICHT im gemeinsamen Vokabular:",
          [w for w in zielwoerter if w not in gemeinsam] or "keine")

    return gemeinsam, modell_frueh, modell_spaet


@app.cell
def _(gemeinsam, modell_frueh, modell_spaet, random):
    import numpy as np


    def zeilen_normiert(matrix):
        """Jede Zeile auf Laenge 1. Danach IST das Skalarprodukt der Kosinus."""
        laengen = np.linalg.norm(matrix, axis=1, keepdims=True)
        return matrix / np.maximum(laengen, 1e-12)


    def procrustes_rotation(wv_quelle, wv_ziel, stuetzwoerter):
        """Die Rotation R, die ||A @ R - B||_F minimiert (Hamilton et al. 2016).

        Nimmt wv-Objekte, keine Modelle - bei einem frisch trainierten Word2Vec
        also modell.wv uebergeben. Grund: aus dem Cache kommen nur die
        Wortvektoren zurueck (KeyedVectors), nicht das ganze Modell.

        wv[liste] liefert die Vektoren direkt als Matrix, in der Reihenfolge der
        Liste - der Schleifenaufbau von vorher ist damit ueberfluessig.
        """
        A = zeilen_normiert(wv_quelle[stuetzwoerter])
        B = zeilen_normiert(wv_ziel[stuetzwoerter])

        U, S, Vt = np.linalg.svd(A.T @ B)

        return U @ Vt


    haeufigkeit_min = {
        w: min(modell_frueh.wv.get_vecattr(w, "count"),
               modell_spaet.wv.get_vecattr(w, "count"))
        for w in gemeinsam
    }

    stuetzwoerter = sorted(gemeinsam, key=lambda w: -haeufigkeit_min[w])[:5000]

    R = procrustes_rotation(modell_frueh.wv, modell_spaet.wv, stuetzwoerter)

    print(f"Stuetzwoerter: {len(stuetzwoerter):,}")
    print(f"R orthogonal?  max|R @ R.T - I| = {np.abs(R @ R.T - np.eye(R.shape[0])).max():.2e}")

    probe = random.Random(0).sample(gemeinsam, 300)
    V_probe = zeilen_normiert(modell_frueh.wv[probe])

    cos_vorher = V_probe @ V_probe.T
    cos_nachher = (V_probe @ R) @ (V_probe @ R).T

    print(f"max|cos_vorher - cos_nachher| = {np.abs(cos_vorher - cos_nachher).max():.2e}   (muss ~0 sein)")

    return R, np, procrustes_rotation, zeilen_normiert


@app.cell
def _(
    R,
    gemeinsam,
    modell_frueh,
    modell_spaet,
    pl,
    zeilen_normiert,
    zielwoerter,
):
    V_frueh = zeilen_normiert(modell_frueh.wv[gemeinsam]) @ R
    V_spaet = zeilen_normiert(modell_spaet.wv[gemeinsam])


    # Beide Matrizen sind zeilennormiert, das zeilenweise Skalarprodukt ist also
    # direkt der Kosinus. KLEINER Wert = das Wort hat sich STARK bewegt.
    drift_cos = (V_frueh * V_spaet).sum(axis=1)

    drift = pl.DataFrame({"wort": gemeinsam, "cos": drift_cos})

    # Der Rang zaehlt mehr als der Rohwert. Zwischen zwei Jahren gibt es eine
    # Hintergrundrate der Veraenderung, die JEDES Wort mitbekommt - aus Rauschen,
    # Themenkonjunktur und echtem Wandel gemischt. Erst der Abstand dazu sagt,
    # ob ein Wort auffaellig ist.
    drift = drift.with_columns([
        pl.col("cos").rank(method="min").alias("rang"),
        (pl.col("cos") - pl.col("cos").median()).round(3).alias("abstand_median"),
    ])

    median_cos = float(drift["cos"].median())

    print(f"Median ueber {len(drift):,} gemeinsame Woerter: {median_cos:.3f}\n")
    print("staerkste Bewegung: ", drift.sort("cos")["wort"][:12].to_list())
    print("schwaechste       : ", drift.sort("cos", descending=True)["wort"][:12].to_list())

    drift.filter(pl.col("wort").is_in(zielwoerter)).sort("cos")

    return (median_cos,)


@app.cell
def _(
    Word2Vec,
    median_cos,
    np,
    pl,
    procrustes_rotation,
    random,
    scheiben_picker,
    trainings_reden,
    vergleich_picker,
    zeilen_normiert,
):
    # Dieselbe Scheibe, zufaellig halbiert, beide Haelften unabhaengig trainiert
    # und ausgerichtet. Beide beschreiben dasselbe Jahr - jeder Unterschied ist
    # reines Stichprobenrauschen. Das ist die Aufloesungsgrenze des Verfahrens.

    mischung = trainings_reden[:]          # Kopie, das Original bleibt in Ruhe
    random.Random(0).shuffle(mischung)

    haelfte_1 = mischung[:len(mischung) // 2]
    haelfte_2 = mischung[len(mischung) // 2:]


    def trainiere_haelfte(dokumente, seed):
        # min_count halbiert (10 -> 5), damit die Vokabularschwelle RELATIV zur
        # Datenmenge dieselbe bleibt. Sonst misst der Test zusaetzlich einen
        # Schwellenwechsel und der Boden faellt zu tief aus.
        return Word2Vec(dokumente, sg=1, negative=5, vector_size=100, window=5,
                        min_count=5, epochs=5, workers=1, seed=seed)


    # Seed 1 und 2, nicht zweimal 1. In gensim 4.4 heisst gleicher Seed
    # buchstaeblich dieselbe Startmatrix: init_weights -> resize_vectors(seed) ->
    # prep_vectors befuellt die Zeilen aus EINEM default_rng(seed), also nach
    # Vokabularindex. Da die Haeufigkeitsraenge oben im Vokabular zwischen zwei
    # Haelften fast identisch sind, starten dort beide Modelle am selben Punkt -
    # ausgerechnet bei den Woertern, aus denen gleich die Procrustes-Rotation
    # geschaetzt wird. Der Boden faellt dadurch zu ENG aus, das Verfahren sieht
    # praeziser aus als es ist. Die produktive Haelften-Zelle macht es schon
    # richtig; nur diese Diagnosezelle hing hinterher.
    modell_h1 = trainiere_haelfte(haelfte_1, seed=1)
    modell_h2 = trainiere_haelfte(haelfte_2, seed=2)

    gemeinsam_h = sorted(set(modell_h1.wv.index_to_key) & set(modell_h2.wv.index_to_key))
    haeufigkeit_h = {
        w: min(modell_h1.wv.get_vecattr(w, "count"), modell_h2.wv.get_vecattr(w, "count"))
        for w in gemeinsam_h
    }
    stuetzen_h = sorted(gemeinsam_h, key=lambda w: -haeufigkeit_h[w])[:5000]

    R_h = procrustes_rotation(modell_h1.wv, modell_h2.wv, stuetzen_h)

    cos_split = (
        (zeilen_normiert(modell_h1.wv[gemeinsam_h]) @ R_h)
        * zeilen_normiert(modell_h2.wv[gemeinsam_h])
    ).sum(axis=1)


    boeden = pl.DataFrame({
        "vergleich": [
            f"Split-Half {scheiben_picker.value} - halbe Daten, gleiche Scheibe",
            f"{vergleich_picker.value} nach {scheiben_picker.value} - echte Zeitdifferenz",
        ],
        "median_cos": [
            round(float(np.median(cos_split)), 3),
            round(median_cos, 3),
        ],
    })

    boeden

    return


@app.cell
def _(np, pl, procrustes_rotation, zeilen_normiert):
    def ausrichtung(wv_quelle, wv_ziel, anzahl_stuetzen=5000):
        """Stuetzwoerter bestimmen und die Rotation berechnen.

        Rueckgabe: (R, gemeinsames Vokabular beider Modelle).
        """
        gemeinsam_beide = sorted(set(wv_quelle.index_to_key) & set(wv_ziel.index_to_key))

        haeufigkeit = {
            w: min(wv_quelle.get_vecattr(w, "count"), wv_ziel.get_vecattr(w, "count"))
            for w in gemeinsam_beide
        }
        stuetzen = sorted(gemeinsam_beide, key=lambda w: -haeufigkeit[w])[:anzahl_stuetzen]

        return procrustes_rotation(wv_quelle, wv_ziel, stuetzen), gemeinsam_beide


    def kontrast_tabelle(wv_quelle, wv_ziel, stichprobe=800):
        """Drift je Wort - und zwar richtig gelesen.

        cos          Aehnlichkeit des Wortes zu SICH SELBST im anderen Modell
        hintergrund  mittlere Aehnlichkeit zu ZUFAELLIGEN anderen Woertern
        kontrast     cos - hintergrund

        Ohne die Hintergrundspalte sieht ein unindividuiertes Wort aus wie ein
        besonders stabiles: seltene Woerter erreichen cos 0,94, sind aber allem
        aehnlich. Erst der Kontrast trennt Aufloesung von Blob.
        """
        R_lokal, woerter = ausrichtung(wv_quelle, wv_ziel)

        A = zeilen_normiert(wv_quelle[woerter]) @ R_lokal
        B = zeilen_normiert(wv_ziel[woerter])

        selbst = (A * B).sum(axis=1)

        zufalls_index = np.random.default_rng(0).choice(
            len(woerter), min(stichprobe, len(woerter)), replace=False
        )
        hintergrund = (A @ B[zufalls_index].T).mean(axis=1)

        haeufigkeit = [
            min(wv_quelle.get_vecattr(w, "count"), wv_ziel.get_vecattr(w, "count"))
            for w in woerter
        ]

        return pl.DataFrame({
            "wort": woerter,
            "n": haeufigkeit,
            "cos": selbst,
            "hintergrund": hintergrund,
        }).with_columns(
            (pl.col("cos") - pl.col("hintergrund")).round(3).alias("kontrast")
        )


    return ausrichtung, kontrast_tabelle


@app.cell
def _(os, reden_der_scheibe, trainiere_modell):
    # Dauert ca. 8 min (Strix Halo)

    JAHRE = [str(_jahr) for _jahr in range(2014, 2026)]

    def modell_pfad(jahr, teil=""):
        """teil: "" = Vollmodell, "_h1"/"_h2" = die beiden Haelften."""
        return f"cache/wv_{jahr}{teil}.kv"

    for _jahr in JAHRE:
        if os.path.exists(modell_pfad(_jahr)):
            print(f"{modell_pfad(_jahr)} liegt schon vor - uebersprungen")
            continue

        # min_count=3 statt 10: die Zielwoerter sind im Volltext selten, und ob
        # eine Zelle ins Bundle darf, entscheidet spaeter der gemessene Kontrast
        # und nicht eine Haeufigkeitsschwelle. Wer hier zu frueh filtert, kann den
        # Kontrast gar nicht erst messen.
        modell = trainiere_modell(reden_der_scheibe(_jahr), seed=1, min_count=3)

        # Nur die Wortvektoren sichern. Die Ausgabegewichte (syn1neg) brauchen wir
        # nach dem Training nie wieder und sind die Haelfte der Datei: 14 statt
        # 27 MB. wv behaelt Vektoren, Haeufigkeiten und Reihenfolge.
        modell.wv.save(modell_pfad(_jahr))

        print(f"{modell_pfad(_jahr)}: {len(modell.wv):,} Woerter, "
              f"{os.path.getsize(modell_pfad(_jahr)) / 1e6:.0f} MB")


    # Quittung fuer die Ladezelle. Bis hierher lief die Reihenfolge nur deshalb
    # richtig, weil die Ladezelle zufaellig JAHRE und modell_pfad braucht, die
    # hier definiert werden - zoege man die beiden in eine eigene Zelle, waere
    # die Kante weg und die Ladezelle duerfte vor dem Training laufen.
    vollmodelle_bereit = [modell_pfad(_jahr) for _jahr in JAHRE]

    return JAHRE, modell_pfad, vollmodelle_bereit


@app.cell
def _(JAHRE, modell_pfad, os, random, reden_der_scheibe, trainiere_modell):
    for _jahr in JAHRE:
        if os.path.exists(modell_pfad(_jahr, "_h2")):
            print(f"Haelften {_jahr} liegen schon vor - uebersprungen")
            continue
        reden_jahr = reden_der_scheibe(_jahr)

        # Gemischt werden REDEN, nicht Token: die Rede ist die Ziehungseinheit.
        # Wuerde man Token mischen, saehen beide Haelften Bruchstuecke derselben
        # Rede und waeren nicht mehr unabhaengig - der Boden fiele zu hoch aus.
        mischung_jahr = reden_jahr[:]
        random.Random(0).shuffle(mischung_jahr)
        mitte = len(mischung_jahr) // 2

        # min_count=2 statt 3, weil jede Haelfte halb so viele Daten hat - die
        # Schwelle wandert relativ mit. Verschiedene Seeds, damit die beiden
        # Schaetzungen wirklich unabhaengig sind.
        h1 = trainiere_modell(mischung_jahr[:mitte], seed=1, min_count=2)
        h2 = trainiere_modell(mischung_jahr[mitte:], seed=2, min_count=2)

        h1.wv.save(modell_pfad(_jahr, "_h1"))
        h2.wv.save(modell_pfad(_jahr, "_h2"))
        print(f"{_jahr}: Haelften mit {len(h1.wv):,} / {len(h2.wv):,} Woertern")

    # Diese Zelle gab bisher NICHTS zurueck - und damit hing die Ladezelle, die
    # genau diese Dateien oeffnet, an keiner einzigen Kante zu ihr. Auf warmem
    # Cache faellt das nie auf; auf kaltem Cache oder beim Neulauf einzelner
    # Zellen ist es ein FileNotFoundError, den marimo nicht reparieren kann,
    # weil es die Abhaengigkeit gar nicht kennt.
    haelften_bereit = [
        modell_pfad(_jahr, _teil) for _jahr in JAHRE for _teil in ("_h1", "_h2")
    ]

    return (haelften_bereit,)


@app.cell
def _(JAHRE, ausrichtung, haelften_bereit, modell_pfad, np, vollmodelle_bereit):
    from gensim.models import KeyedVectors

    # vollmodelle_bereit und haelften_bereit werden nicht GELESEN, sondern nur
    # ANGEFORDERT: sie sind die Datenflusskante zu den beiden Trainingszellen und
    # damit die einzige Zusicherung, dass die Dateien existieren, bevor hier
    # geladen wird. Nicht wegoptimieren.
    assert len(vollmodelle_bereit) == len(JAHRE)
    assert len(haelften_bereit) == 2 * len(JAHRE)

    wv_voll = {_jahr: KeyedVectors.load(modell_pfad(_jahr)) for _jahr in JAHRE}
    wv_h1   = {_jahr: KeyedVectors.load(modell_pfad(_jahr, "_h1")) for _jahr in JAHRE}
    wv_h2   = {_jahr: KeyedVectors.load(modell_pfad(_jahr, "_h2")) for _jahr in JAHRE}

    # Referenz 2019. Die Begruendung ist technisch, nicht interpretativ: die
    # Verkettung zweier getrennt geschaetzter Rotationen ist NICHT die optimale
    # Direktrotation, und der Fehler waechst mit dem Abstand beider Scheiben von
    # der Referenz. Eine mittige Referenz haelt den schlimmsten Fall klein.
    # 2019 ist die Mitte von 2014-2025 und mit 4,05 Mio. Token das dichtere der
    # beiden mittleren Jahre.
    referenz = "2019"

    dimension = wv_voll[referenz].vector_size

    # Jede Scheibe DIREKT auf die Referenz drehen, nicht verkettet t -> t+1: eine
    # Kette summiert Rotationsfehler auf und liefert am Ende zwoelf leicht
    # gegeneinander verdrehte Raeume statt einen gemeinsamen.
    rotationen = {}

    for _jahr in JAHRE:
        if _jahr == referenz:
            rotationen[_jahr] = np.eye(dimension)
        else:
            rotationen[_jahr], _ = ausrichtung(wv_voll[_jahr], wv_voll[referenz])

    for _jahr in JAHRE:
        abweichung = np.abs(rotationen[_jahr] @ rotationen[_jahr].T - np.eye(dimension)).max()
        print(f"  {_jahr}: {len(wv_voll[_jahr]):>7,d} Woerter   orthogonal bis {abweichung:.1e}")

    return KeyedVectors, referenz, rotationen, wv_h1, wv_h2, wv_voll


@app.cell
def _(JAHRE, kontrast_tabelle, pl, wv_h1, wv_h2, zielwoerter):
    aufloesung = pl.concat([
        kontrast_tabelle(wv_h1[jahr], wv_h2[jahr]).with_columns(pl.lit(jahr).alias("jahr"))
        for jahr in JAHRE
    ])

    # n ist hier die Haeufigkeit JE HAELFTE - in der ganzen Scheibe also grob das
    # Doppelte. kontrast sagt, ob der Vektor dieses Wortes in dieser Scheibe
    # ueberhaupt etwas ueber das Wort aussagt, oder ob er im generischen Bereich
    # liegt, in dem alles allem aehnlich ist.
    aufloesung.filter(pl.col("wort").is_in(zielwoerter)) \
              .select(["wort", "jahr", "n", "cos", "hintergrund", "kontrast"]) \
              .sort(["wort", "jahr"])

    return (aufloesung,)


@app.cell
def _(ausrichtung, zeilen_normiert):
    def drift_paar(wv_a, wv_b):
        """Kosinus jedes gemeinsamen Wortes zwischen zwei Scheiben, DIREKT ausgerichtet.

        Direkt und nicht ueber die Referenz aus Zelle 25: die Verkettung zweier
        getrennt geschaetzter Rotationen weicht im Median nur 0,013 von der
        Direktrotation ab, im Maximum aber 0,12 - und das ist die Groessenordnung
        der Effekte, die hier gesucht werden. Die gemeinsame Referenz bleibt fuer
        coords_3d zustaendig, wo ein EINZIGER Raum gebraucht wird.
        """
        R_paar, woerter = ausrichtung(wv_a, wv_b)

        A = zeilen_normiert(wv_a[woerter]) @ R_paar
        B = zeilen_normiert(wv_b[woerter])

        haeufigkeit = {
            w: min(wv_a.get_vecattr(w, "count"), wv_b.get_vecattr(w, "count"))
            for w in woerter
        }

        return dict(zip(woerter, (A * B).sum(axis=1))), haeufigkeit


    def perzentil_im_band(wort, cos_je_wort, haeufigkeit):
        """Wie viele vergleichbar haeufige Woerter haben sich WENIGER bewegt?

        Band = halb bis doppelt so haeufig wie das Wort selbst. Ein roher Kosinus
        ist ohne diesen Bezug nicht lesbar: zwischen zwei Jahren gibt es eine
        Hintergrundrate der Veraenderung, die jedes Wort mitbekommt.
        Niedriges Perzentil = das Wort hat sich auffaellig stark bewegt.
        """
        n = haeufigkeit[wort]

        band = [
            cos_je_wort[w]
            for w in cos_je_wort
            if n / 2 <= haeufigkeit[w] <= n * 2
        ]

        return sum(1 for v in band if v < cos_je_wort[wort]) / len(band)


    return drift_paar, perzentil_im_band


@app.cell
def _(JAHRE, drift_paar, np, perzentil_im_band, pl, wv_voll):
    drift_zeilen = []

    for _a, _b in zip(JAHRE, JAHRE[1:]):
        cos_je_wort, haeufigkeit_paar = drift_paar(wv_voll[_a], wv_voll[_b])

        # Hintergrundrate: Median der 500 haeufigsten Woerter dieses Paares.
        # Sie schwankt selbst - 2021->2022 ist auch fuer das uebrige Vokabular
        # ein bewegtes Jahr, und genau deshalb braucht es das Perzentil.
        haeufigste = sorted(cos_je_wort, key=lambda w: -haeufigkeit_paar[w])[:500]
        hintergrund = float(np.median([cos_je_wort[w] for w in haeufigste]))

        zeile = {"uebergang": f"{_a}->{_b}", "hintergrund": round(hintergrund, 3)}

        for _wort in ["Bundeswehr", "Frieden", "Sicherheit", "Verteidigung"]:
            if _wort in cos_je_wort:
                zeile[_wort] = round(float(cos_je_wort[_wort]), 3)
                zeile[_wort + "_pz"] = round(
                    perzentil_im_band(_wort, cos_je_wort, haeufigkeit_paar), 2
                )
            else:
                zeile[_wort] = None
                zeile[_wort + "_pz"] = None

        drift_zeilen.append(zeile)

    jahr_zu_jahr = pl.DataFrame(drift_zeilen)
    jahr_zu_jahr

    return


@app.cell(disabled=True)
def _(
    JAHRE,
    KeyedVectors,
    drift_paar,
    modell_pfad,
    os,
    perzentil_im_band,
    pl,
    reden_der_scheibe,
    trainiere_modell,
    zielwoerter,
):
    SEEDS = [1, 2, 3, 4, 5]


    def wv_fuer(jahr, seed):
        """Wortvektoren einer Scheibe fuer einen Seed.

        Seed 1 liegt aus Zelle 24 gecacht vor - das spart 10 der 40 Minuten.
        Die uebrigen Seeds werden frisch trainiert und bewusst NICHT gespeichert:
        60 Modelle waeren 840 MB, gebraucht werden sie nur fuer diese eine
        Auswertung. Was bleibt, ist die winzige Ergebnistabelle.
        """
        if seed == 1 and os.path.exists(modell_pfad(jahr)):
            return KeyedVectors.load(modell_pfad(jahr))

        return trainiere_modell(reden_der_scheibe(jahr), seed=seed, min_count=3).wv


    def pz_serie_fuer_seed(seed):
        """Die komplette Jahr-zu-Jahr-Analyse fuer EINEN Seed."""
        modelle_seed = {_j: wv_fuer(_j, seed) for _j in JAHRE}

        zeilen = []

        for _a, _b in zip(JAHRE, JAHRE[1:]):
            cos_je_wort, haeufigkeit_paar = drift_paar(modelle_seed[_a], modelle_seed[_b])

            for _wort in zielwoerter:
                if _wort not in cos_je_wort:
                    continue

                zeilen.append({
                    "seed": seed,
                    "uebergang": f"{_a}->{_b}",
                    "wort": _wort,
                    "cos": float(cos_je_wort[_wort]),
                    "pz": perzentil_im_band(_wort, cos_je_wort, haeufigkeit_paar),
                })

        return pl.DataFrame(zeilen)


    for _seed in SEEDS:
        _ziel = f"cache/pz_seed{_seed}.parquet"

        if os.path.exists(_ziel):
            print(f"{_ziel} liegt schon vor - uebersprungen")
            continue

        # Wiederaufnehmbar je SEED, nicht je Scheibe - die Granularitaet ist
        # ~8 Minuten. Feiner lohnt sich nicht, weil die Perzentile eines Seeds
        # nur zusammen Sinn ergeben.
        pz_serie_fuer_seed(_seed).write_parquet(_ziel)
        print(f"{_ziel} geschrieben")

    return (SEEDS,)


@app.cell(disabled=True)
def _(SEEDS, pl):
    pz_alle = pl.concat([
        pl.read_parquet(f"cache/pz_seed{_seed}.parquet") for _seed in SEEDS
    ])

    # Wo liegt je Wort und Seed das Minimum?
    minima = (
        pz_alle
        .group_by(["wort", "seed"])
        .agg([
            pl.col("uebergang").sort_by("pz").first().alias("minimum_bei"),
            pl.col("pz").min().round(3).alias("pz_min"),
        ])
        .sort(["wort", "seed"])
    )

    # Die eigentliche Frage in einer Tabelle: bei wie vielen der fuenf Seeds
    # faellt das Minimum auf die Zaesur? Erwartung bei Zufall: 5 / 11 = 0,45,
    # also praktisch nie mehr als einer.
    stabilitaet = (
        minima
        .group_by("wort")
        .agg([
            (pl.col("minimum_bei") == "2021->2022").sum().alias("seeds_mit_min_2022"),
            pl.col("pz_min").mean().round(3).alias("pz_min_mittel"),
        ])
        .sort("seeds_mit_min_2022", descending=True)
    )

    stabilitaet

    return (pz_alle,)


@app.cell(disabled=True)
def _(pl, pz_alle):
    verlauf = (
        pz_alle
        .filter(pl.col("wort").is_in(["Bundeswehr", "Verteidigung", "Frieden", "Sicherheit"]))
        .group_by(["wort", "uebergang"])
        .agg([
            pl.col("pz").mean().round(2).alias("pz_mittel"),
            pl.col("pz").min().round(2).alias("pz_min"),
            pl.col("pz").max().round(2).alias("pz_max"),
        ])
        .sort(["wort", "uebergang"])
    )

    verlauf

    return


@app.cell
def _(JAHRE, pl, zielwoerter):
    # ── Bundle-Grundgerüst: IDs, entities, time_slices ────────────────────────
    # Das Schema verlangt, dass IDs auflösen: jede aggregates.entity_id muss in
    # entities vorkommen, jede time_slice_id in time_slices. Deshalb werden sie an
    # EINER Stelle gebildet. zu_id ist absichtlich zeichengleich zu pipeline.py:
    # nur so tragen PPMI- und SGNS-Bundle dieselben entity_ids, und man kann die
    # beiden Verfahren im Frontend nebeneinanderlegen.

    def zu_id(spalte):
        """Lemma -> entity_id: klein, Umlaute transliteriert ("Rüstung" -> "ruestung")."""
        return (
            spalte
            .str.to_lowercase()
            .str.replace_all("ä", "ae")
            .str.replace_all("ö", "oe")
            .str.replace_all("ü", "ue")
            .str.replace_all("ß", "ss")
            .str.replace_all("-", "_")
        )


    entities = (
        pl.DataFrame({"zielwort_lemma": zielwoerter})
        .sort("zielwort_lemma")
        .with_columns([
            zu_id(pl.col("zielwort_lemma")).alias("id"),
            pl.col("zielwort_lemma").alias("label"),
        ])
        .select(["id", "label"])
    )


    # Anders als im PPMI-Pfad gibt es hier kein Raster-Dropdown: die Rumpfjahre
    # 2013 und 2026 sind schon beim Training rausgefallen, JAHRE IST die
    # Scheibenliste. index muss lückenlos und in Reihenfolge sein - das Tool
    # zeichnet die Scheiben gleichabständig, index ist eine Reihenfolge, kein
    # Kalender.
    time_slices = (
        pl.DataFrame({"id": JAHRE})
        .with_row_index("index")
        .with_columns(pl.col("id").alias("label"))
        .select(["id", "label", "index"])
    )

    print(f"{len(entities)} entities, {len(time_slices)} time_slices "
          f"({time_slices['id'][0]}-{time_slices['id'][-1]})")

    entities

    return entities, time_slices, zu_id


@app.cell
def _(
    JAHRE,
    aufloesung,
    pl,
    rotationen,
    wv_voll,
    zeilen_normiert,
    zielwoerter,
):
    # ── Aggregate: je (Zielwort, Scheibe) ein auf die Referenz gedrehter Vektor ─

    aggregat_zeilen = []
    aggregat_stapel = []

    for _jahr in JAHRE:
        for _wort in zielwoerter:
            # Kein stiller Ausfall - aber hier ist Überspringen richtig: fehlt das
            # Wort in dieser Scheibe, gibt es die Zelle wirklich nicht. Gezählt wird
            # unten, damit die Lücke sichtbar bleibt.
            if _wort not in wv_voll[_jahr]:
                continue

            aggregat_zeilen.append({
                "wort": _wort,
                "jahr": _jahr,
                # freq = Vorkommen des Lemmas in dieser Scheibe nach dem POS-Filter.
                # gensim führt den Zähler ohnehin mit, er kostet uns nichts. Dieselbe
                # Größe wie freq im PPMI-Bundle (Treffer des ZIELWORTS) - nicht die
                # Zahl der Kontext-Token, das war dort der Stolperstein.
                "freq": int(wv_voll[_jahr].get_vecattr(_wort, "count")),
            })

            # wv[[wort]] mit doppelter Klammer gibt eine (1 x 100)-Matrix, weil
            # zeilen_normiert 2D erwartet; [0] holt die Zeile wieder heraus.
            # Erst normieren, dann drehen - die Reihenfolge ist gleichgültig, weil R
            # orthogonal ist und Längen nicht ändert, aber sie bleibt dieselbe wie
            # in drift_paar.
            aggregat_stapel.append(
                zeilen_normiert(wv_voll[_jahr][[_wort]])[0] @ rotationen[_jahr]
            )


    # Kontrast aus der Split-Half-Messung dazu. LEFT join, kein inner: sechs Zellen
    # existieren im Vollmodell (min_count=3), aber nicht in beiden Hälften
    # (min_count=2 auf halben Daten). Fünf der sechs liegen in 2021, der dünnsten
    # Scheibe. Genau das soll das Frontend sehen können - eine Zelle mit Vektor,
    # aber ohne belegte Auflösung ist eine andere Aussage als gar keine Zelle.
    aggregat_tabelle = (
        pl.DataFrame(aggregat_zeilen)
        .with_columns(pl.Series("vektor", aggregat_stapel))
        .join(
            aufloesung.select(["wort", "jahr", "kontrast"]),
            on=["wort", "jahr"],
            how="left",
        )
    )

    _moeglich = len(zielwoerter) * len(JAHRE)

    print(f"{len(aggregat_tabelle)} Zellen von {_moeglich} möglichen")
    print(f"  Wort nicht im Vokabular der Scheibe: {_moeglich - len(aggregat_tabelle)}")
    print(f"  ohne Kontrast (nicht in beiden Hälften): "
          f"{aggregat_tabelle['kontrast'].null_count()}")

    aggregat_tabelle.select(["wort", "jahr", "freq", "kontrast"]).sort("kontrast")

    return (aggregat_tabelle,)


@app.cell
def _(JAHRE, np, pl, rotationen, wv_voll, zeilen_normiert):
    # ── Anker: ein Vektor je Landmarke, Schwerpunkt über die Scheiben ──────────
    # Ein Anker ist eine ORTSMARKE, kein Zielwort: er soll stillstehen, damit man
    # die Wanderung der Zielwörter an ihm ablesen kann. Deshalb genau ein Vektor
    # je Anker, nicht einer je Scheibe.
    #
    # Warum der Schwerpunkt und nicht einfach der Vektor aus der Referenzscheibe:
    # in 2019 gibt es "Zeitenwende" nicht, "Taurus" nicht, "Kriegstüchtigkeit"
    # nicht, "Sonderschuld" nicht. Eine Referenzscheibe als Quelle würde also
    # ausgerechnet die Anker löschen, die den Befund tragen.

    anker_csv = pl.read_csv("anchors.csv").with_columns(
        # Leeres label heißt "Lemma unverändert anzeigen" (Einsatzkräft -> so lassen,
        # oder in der CSV korrigiert). polars liest leere Felder als null.
        pl.coalesce([pl.col("label"), pl.col("lemma")]).alias("label")
    )

    anker_zeilen = []
    anker_stapel = []

    for _lemma in anker_csv["lemma"].to_list():
        _scheiben_mit = [_j for _j in JAHRE if _lemma in wv_voll[_j]]

        if not _scheiben_mit:
            continue

        # Gemittelt wird über die GEDREHTEN Vektoren. Ungedreht zeigen dieselben
        # Wörter in zwölf willkürlich zueinander verdrehte Richtungen, und der
        # Mittelwert wäre ungefähr der Nullvektor - der Fehler wäre kein Absturz,
        # sondern ein Anker mitten im Ursprung.
        _gedreht = np.array([
            zeilen_normiert(wv_voll[_j][[_lemma]])[0] @ rotationen[_j]
            for _j in _scheiben_mit
        ])

        _schwerpunkt = _gedreht.mean(axis=0)

        anker_zeilen.append({"lemma": _lemma, "scheiben": len(_scheiben_mit)})

        # Wieder auf Länge 1. Die Mittelung verkürzt, und die Restlänge misst vor
        # allem, über WIE VIELE Scheiben gemittelt wurde (3 Scheiben -> 0,97,
        # 12 Scheiben -> 0,83). Das ist Arithmetik, kein Qualitätsmaß - nicht als
        # Stabilitätswert weiterverwenden.
        anker_stapel.append(_schwerpunkt / max(np.linalg.norm(_schwerpunkt), 1e-12))


    anker_tabelle = (
        pl.DataFrame(anker_zeilen)
        .with_columns(pl.Series("vektor", anker_stapel))
        .join(anker_csv.select(["lemma", "label", "cluster"]), on="lemma", how="left")
    )

    anker_fehlend = [
        _l for _l in anker_csv["lemma"].to_list()
        if not any(_l in wv_voll[_j] for _j in JAHRE)
    ]

    print(f"{len(anker_tabelle)} von {len(anker_csv)} Ankern haben einen Vektor")
    print("in keiner Scheibe:", anker_fehlend or "keiner")
    print(anker_tabelle.group_by("cluster").len().sort("len", descending=True))

    anker_tabelle.select(["lemma", "label", "cluster", "scheiben"]).sort("scheiben")

    return anker_csv, anker_tabelle


@app.cell
def _(aggregat_tabelle, anker_tabelle, np, pl):
    # ── Gemeinsame PCA über ALLE Vektoren: Aggregate + Anker ──────────────────
    # Schema-Invariante "Ein Raum, kein Alignment": beide Gruppen werden GEMEINSAM
    # projiziert. Zwei getrennte PCAs ergäben zwei Koordinatensysteme, in denen
    # Nähe nichts mehr bedeutet.
    #
    # Der Ähnlichkeitsraum ist der 100-dimensionale (die vektor-Spalte); diese PCA
    # liefert NUR Renderkoordinaten. Alles, was eine belastbare Aussage tragen soll,
    # rechnet mit vektor, nicht mit coords_3d.

    pca_aggregate = np.array(aggregat_tabelle["vektor"].to_list())
    pca_anker = np.array(anker_tabelle["vektor"].to_list())

    pca_stapel = np.vstack([pca_aggregate, pca_anker])
    pca_grenze = len(pca_aggregate)          # ab hier beginnen die Anker

    # Der PPMI-Pfad MUSS an dieser Stelle normieren: dort streuen die SVD-Zeilen-
    # längen um Faktor 24 und messen im Kern die Datenmenge der Zelle - die PCA
    # baute daraus sonst ihre erste Achse und die 3D-Ansicht zeigte Redevolumen.
    # Bei uns ist das schon erledigt (zeilen_normiert bei den Aggregaten, erneute
    # Normierung nach der Mittelung bei den Ankern). Die Prüfung bleibt trotzdem
    # stehen: ein Fehler hier stürzt nicht ab, er dreht nur stillschweigend die
    # erste Achse.
    pca_laengen = np.linalg.norm(pca_stapel, axis=1)
    print(f"Vektorlängen im Stapel: {pca_laengen.min():.6f} bis {pca_laengen.max():.6f} (muss 1 sein)")


    # PCA von Hand: zentrieren, dann SVD. sklearn ist nicht im venv und wird nicht
    # gebraucht - PCA IST die SVD der spaltenweise zentrierten Matrix.
    pca_mittelwert = pca_stapel.mean(axis=0)
    pca_zentriert = pca_stapel - pca_mittelwert

    pca_U, pca_S, pca_Vt = np.linalg.svd(pca_zentriert, full_matrices=False)

    # pca_mittelwert und pca_achsen bleiben als eigene Variablen stehen: die beiden
    # ZUSAMMEN sind die Projektion. Damit lässt sich jeder weitere Vektor in
    # dieselben Koordinaten bringen, ohne dass sich ein bestehender Punkt
    # verschiebt - genau das braucht die vocab_points-Zelle.
    pca_achsen = pca_Vt[:3]                       # (3 x 100)
    pca_coords = pca_zentriert @ pca_achsen.T

    pca_erklaert = (pca_S[:3] ** 2).sum() / (pca_S ** 2).sum()


    # Zurückverteilen. Die Reihenfolge im Stapel ist die Reihenfolge der beiden
    # Tabellen - seit ihrem Zusammenbau wurde keine umsortiert. Neue Namen, weil
    # marimo eine Variable nicht in zwei Zellen binden lässt; das ist hier kein
    # Umweg, sondern eine Garantie: aggregat_tabelle bleibt unverändert lesbar.
    aggregat_tabelle_3d = aggregat_tabelle.with_columns(
        pl.Series("coords_3d", pca_coords[:pca_grenze].tolist())
    )

    anker_tabelle_3d = anker_tabelle.with_columns(
        pl.Series("coords_3d", pca_coords[pca_grenze:].tolist())
    )

    print(f"Stapel {pca_stapel.shape}: {pca_grenze} Aggregate + {len(pca_anker)} Anker")
    print(f"erklärte Varianz (3 Komponenten): {pca_erklaert:.1%}")

    anker_tabelle_3d.select(["lemma", "label", "cluster", "scheiben", "coords_3d"])

    return (
        aggregat_tabelle_3d,
        anker_tabelle_3d,
        pca_achsen,
        pca_erklaert,
        pca_mittelwert,
    )


@app.cell
def _(JAHRE, anker_tabelle, lemma_pfad, pl):
    # ── Wortart je Lemma, aus dem Cache ───────────────────────────────────────
    # Hier zahlt sich die Entscheidung aus, POS getrennt neben den Lemmata zu
    # speichern (siehe die Markdown-Zelle nach der Lemmatisierung): der Filter
    # unten kostet 4 Sekunden statt eines neuen spaCy-Laufs über 50,9 Mio. Token.
    #
    # Ein Lemma kann verschiedene Wortarten tragen ("Recht" NOUN vs. "recht" ADV
    # nach der Lemmatisierung). Genommen wird die häufigste - dieselbe Regel wie in
    # pipeline.py, damit die Kandidatenlisten beider Pfade vergleichbar bleiben.
    #
    # NICHT zu verwechseln mit pos_verboten weiter oben. Das sind zwei Filter an
    # zwei Stellen mit zwei Zwecken:
    #   pos_verboten     wirkt VOR dem Training auf den Tokenstrom und entfernt,
    #                    was als KONTEXT nichts beiträgt (DET, ADP, ...).
    #   inhaltswoerter   wirkt NACH dem Training auf die Kandidatenliste und
    #                    entscheidet, was als beschrifteter PUNKT taugt.
    # Ein Wort kann trainingsrelevant und trotzdem als Punkt unbrauchbar sein -
    # "nicht" ist genau so ein Fall.

    pos_je_lemma = (
        pl.concat([
            pl.read_parquet(lemma_pfad(_jahr), columns=["lemmata", "pos"])
            for _jahr in JAHRE
        ])
        .explode(["lemmata", "pos"])
        .group_by(["lemmata", "pos"]).len()
        # sort_by(len) absteigend, dann first() = die häufigste Wortart des Lemmas.
        #
        # Zweites Sortierkriterium "pos" aufsteigend: bei GLEICHSTAND waere die
        # Auswahl sonst die zufaellige Reihenfolge, die group_by gerade liefert -
        # und Gleichstaende gibt es reichlich. Gemessen an diesem Korpus: 5.373
        # Lemmata haben einen Gleichstand an der Spitze, bei 2.198 davon
        # entscheidet er ueber inhaltstragend ja/nein ("emotional" ADJ/ADV je
        # 375 Mal). In den vocab_pool schafft es davon zwar nur eines, aber ein
        # Notebook, das sonst bitgleich reproduziert, sollte es nicht an einer
        # Sortierlaune haengen lassen.
        .group_by("lemmata").agg(
            pl.col("pos").sort_by(["len", "pos"], descending=[True, False]).first()
        )
        .rename({"lemmata": "lemma"})
    )

    pos_inhalt_erlaubt = ["NOUN", "PROPN", "ADJ", "VERB"]

    inhaltswoerter = set(
        pos_je_lemma.filter(pl.col("pos").is_in(pos_inhalt_erlaubt))["lemma"].to_list()
    )

    print(f"{len(pos_je_lemma):,} Lemmata, davon {len(inhaltswoerter):,} inhaltstragend")
    print("Anker, die den Filter NICHT passieren:",
          [_a for _a in anker_tabelle["lemma"].to_list() if _a not in inhaltswoerter] or "keiner")

    pos_je_lemma.group_by("pos").len().sort("len", descending=True)

    return (inhaltswoerter,)


@app.cell
def _(
    JAHRE,
    anker_tabelle,
    nachbar_roh,
    np,
    pca_achsen,
    pca_mittelwert,
    pl,
    rotationen,
    wv_voll,
    zeilen_normiert,
    zielwoerter,
):
    # ── vocab_points: Koordinaten-Tabelle zu den Nachbarlisten ────────────────
    # ROLLENWECHSEL. Vorher war das eine breite, frei schwebende Punktwolke, in
    # der das Frontend selbst per Radius gesucht hat - euklidisch, in den 3
    # sichtbaren Dimensionen. Das ist der falsche Filter im falschen Raum
    # (Begründung bei nb_k). Jetzt wird im vollen Vektorraum ausgewählt, und
    # vocab_points ist nur noch das Nachschlagewerk "Label -> Position" für
    # alles, was in einer Nachbarliste steht und kein Anker ist.
    #
    # Daraus folgen drei Änderungen am Pool:
    #
    # 1. Er kommt aus nachbar_roh statt aus dem Gesamtvokabular. Ein Wort, das in
    #    keiner Liste vorkommt, wird nie gezeichnet - eine Koordinate dafür ist
    #    totes Gewicht im Bundle.
    # 2. Kein inhaltswoerter-Filter mehr. Die Nachbarauswahl hat bewusst keinen
    #    (s. Begründung dort: "unbewaffnet" bei Drohne gehört in die Liste) - ein
    #    strengerer Filter hier ließe genau diese Nachbarn ohne Position zurück.
    # 3. Die "in ALLEN zwölf Scheiben"-Regel fällt. Sie stand hier aus einem
    #    guten Grund: ein Schwerpunkt aus drei Scheiben steht sonst unbeschriftet
    #    neben einem aus zwölf, und nichts im Bild unterscheidet die beiden. Das
    #    Argument trägt für eine frei schwebende Wolke - aber nicht mehr für
    #    Punkte, die nur auftauchen, WEIL sie Nachbar einer bestimmten Zelle
    #    sind. Der Preis dafür, die Regel zu behalten, wären Nachbarn ohne
    #    Position, also Löcher im Bild. Wie viele Punkte aus wie wenigen Scheiben
    #    gemittelt sind, steht deshalb unten im Protokoll - wer es enger will,
    #    setzt vocab_min_scheiben hoch.
    vocab_min_scheiben = 1

    # Schon vergebene Lemmata raus, sonst läge derselbe Punkt zweimal im Bild -
    # einmal beschriftet, einmal nicht. Anker gewinnen, sie tragen ein Label.
    # Auch die ANZEIGEFORM sperren: anchors.csv kann ein Lemma unter anderem
    # Text führen (marod -> "marode"), und ist dieser Text selbst ein Korpuswort,
    # gäbe es denselben Text an zwei Positionen. Das Frontend löst Nachbarn über
    # den Text auf und fände den Vokabelpunkt nie.
    vocab_vergeben = (
        set(zielwoerter)
        | set(anker_tabelle["lemma"].to_list())
        | set(anker_tabelle["label"].to_list())
    )

    vocab_pool = sorted(
        set(nachbar_roh["lemma"].to_list()) - vocab_vergeben
    )

    # Derselbe Schwerpunkt wie bei den Ankern: je Scheibe normieren, in den
    # Referenzraum drehen, aufsummieren. Anders als vorher darf ein Wort fehlen,
    # deshalb wird je Scheibe nur die vorhandene Teilmenge addiert und
    # mitgezählt, statt wv_voll[jahr][vocab_pool] am Stück zu nehmen (das würde
    # bei einem fehlenden Wort scheitern).
    vocab_zeile_von = {_w: _i for _i, _w in enumerate(vocab_pool)}
    vocab_summe = np.zeros(
        (len(vocab_pool), wv_voll[JAHRE[0]].vector_size), dtype=np.float64
    )
    vocab_scheiben = np.zeros(len(vocab_pool), dtype=int)

    for _jahr in JAHRE:
        _da = [_w for _w in vocab_pool if _w in wv_voll[_jahr]]
        if not _da:
            continue
        _zeilen = [vocab_zeile_von[_w] for _w in _da]
        vocab_summe[_zeilen] += (
            zeilen_normiert(wv_voll[_jahr][_da]) @ rotationen[_jahr]
        )
        vocab_scheiben[_zeilen] += 1

    # Summe statt Mittelwert: die Normierung danach macht den Faktor 1/n wirkungslos.
    vocab_vektoren = zeilen_normiert(vocab_summe)

    # KEINE neue PCA. Die Koordinaten von Aggregaten und Ankern dürfen sich nicht
    # verschieben, nur weil 5.000 Punkte dazukommen. Deshalb pca_mittelwert und
    # pca_achsen wiederverwenden und die neuen Vektoren nur HINEINPROJIZIEREN
    # (out-of-sample), nicht neu fitten.
    vocab_zentriert = vocab_vektoren - pca_mittelwert
    vocab_coords = vocab_zentriert @ pca_achsen.T

    # Wie viel von der Streuung DIESER Punkte fangen die drei geliehenen Achsen?
    #
    # Das ist NICHT pca_erklaert. Jener Wert ist in-sample: er gilt fuer die 216
    # Punkte, auf denen die PCA gefittet wurde (Aggregate + Anker). Diese Punkte
    # wurden nur hineinprojiziert, sind also out-of-sample und werden schlechter
    # abgebildet - gemessen 20 % gegen 37 %. Und an genau diesen Positionen
    # zeichnet das Frontend die Nachbarn. Ohne die zweite Zahl liest die
    # ProjectionNote dafuer einen fast doppelt so guten Wert vor, wie die
    # Projektion dort wirklich ist.
    #
    # Rechnung: der Anteil der quadrierten Laenge, der in den drei Achsen liegt.
    # Bei orthonormalen Achsen ist das genau die erklaerte Varianz.
    vocab_erklaert = (vocab_coords ** 2).sum() / (vocab_zentriert ** 2).sum()

    vocab_tabelle = (
        pl.DataFrame({"label": vocab_pool})
        .with_columns([
            pl.Series("coords_3d", vocab_coords.tolist()),
            pl.Series("scheiben", vocab_scheiben),
        ])
        .filter(pl.col("scheiben") >= vocab_min_scheiben)
    )

    # ── Kontrollrechnung ──────────────────────────────────────────────────────
    # Die Zusage lautet: JEDER Nachbar hat eine Position. Anker über anchors,
    # alle anderen über vocab_points. Was hier übrig bleibt, wäre ein Label, das
    # das Frontend nicht zeichnen kann.
    _versorgt = set(vocab_tabelle["label"].to_list()) | vocab_vergeben
    _ohne = sorted(set(nachbar_roh["lemma"].to_list()) - _versorgt)

    print(f"vocab_points: {len(vocab_tabelle):,} Koordinaten für "
          f"{nachbar_roh['lemma'].n_unique():,} verschiedene Nachbar-Lemmata "
          f"(Rest sind Anker/Zielwörter)")
    print(f"  Nachbar-Lemmata ohne Koordinate: {len(_ohne)}  <- muss 0 sein"
          + (f"  z.B. {_ohne[:5]}" if _ohne else ""))
    print(f"  gemittelt aus weniger als {len(JAHRE)} Scheiben: "
          f"{int((vocab_scheiben < len(JAHRE)).sum()):,} von {len(vocab_pool):,}"
          f"  (Median {int(np.median(vocab_scheiben))} Scheiben)")
    print(f"erklärte Varianz dieser Punkte in den 3 geliehenen Achsen: "
          f"{vocab_erklaert:.1%}  (Fit-Menge: siehe pca_erklaert)")

    vocab_tabelle

    return vocab_erklaert, vocab_tabelle


@app.cell
def _(JAHRE, np, pl, wv_voll, zeilen_normiert, zielwoerter):
    # ── neighbors: die k nächsten Wörter je Zelle ─────────────────────────────
    # Zwei Entscheidungen, beide gegen den PPMI-Pfad:
    #
    # 1. Rangfolge nach ROHEM Kosinus, nicht nach Kontrast. pipeline.py wählt über
    #    "Kosinus minus Spaltenmittel", um Echo-Wörter zu unterdrücken - Wörter, die
    #    JEDER Zelle nah sind. Im SGNS-Raum gibt es die nicht (551 von 689 Nachbarn
    #    kommen nur in EINER der 130 Listen vor). Dafür richtet der Kontrast hier
    #    aktiv Schaden an: bei einer Zelle, deren Vektor unaufgelöst ist, ist der
    #    Kosinus zu ALLEM etwa gleich groß, und dann ist "Kosinus minus
    #    Spaltenmittel" der Rangfolge nach schlicht das NEGATIVE Spaltenmittel -
    #    gewählt werden die Wörter, die den Zielwörtern im Schnitt am UNÄHNLICHSTEN
    #    sind. Wehrpflicht 2021 bekam so Lkw-Maut und Abtreibung.
    #
    # 2. Kein POS-Filter. Anker und Nachbarn sind zwei Zwecke: ein Anker wird ein
    #    dauerhafter, beschrifteter Punkt und muss ein properes Inhaltswort sein;
    #    ein Nachbar ist eine Zeile in einer Liste. "unbewaffnet" und
    #    "bewaffnungsfähig" bei Drohne 2014 sind ADJ und gehören dorthin.

    nb_min_count = 10     # Mindesthäufigkeit in DIESER Scheibe
    nb_k = 150            # wie im PPMI-Bundle
    # k war 8: genug für das Nachbarn-Panel, zu wenig für das 3D-Bild. Die
    # Wortumgebung im Frontend hat früher selbst gesucht - euklidisch, in den 3
    # sichtbaren Dimensionen. Am PPMI-Bundle gemessen ist das der falsche Filter:
    # gegen denselben Kandidatenpool erreichten nur 56 von 86 Ankern je eine
    # Trefferliste, während "Kanzler" in zwei Dritteln aller Zellen auftauchte.
    # Jetzt kommt die lange Liste von hier, aus dem vollen Vektorraum, und das
    # Frontend zeichnet sie nur noch. Die Punktkoordinaten dazu liefert
    # vocab_points - dessen Pool hängt deshalb an nachbar_roh.

    nachbar_zeilen = []
    nachbar_generik = {}

    for _jahr in JAHRE:
        _kandidaten = [
            _w for _w in wv_voll[_jahr].index_to_key
            if wv_voll[_jahr].get_vecattr(_w, "count") >= nb_min_count
        ]
        _ziele = [_w for _w in zielwoerter if _w in wv_voll[_jahr]]

        # Beide Seiten normiert, dann IST das Matrixprodukt die Kosinustabelle:
        # eine Zeile je Zelle, eine Spalte je Kandidat.
        #
        # Hier wird NICHT gedreht. R ist orthogonal und ändert keinen Winkel - die
        # Nachbarschaft innerhalb einer Scheibe ist im Rohraum dieselbe wie im
        # Referenzraum. Die Ausrichtung braucht nur, wer Scheiben VERGLEICHT.
        _kosinus = (
            zeilen_normiert(wv_voll[_jahr][_ziele])
            @ zeilen_normiert(wv_voll[_jahr][_kandidaten]).T
        )

        # Das Zielwort ist sein eigener Kandidat, mit cos = 1,0. Auf NaN setzen
        # statt die Spalte zu löschen, damit die Indizes zu _kandidaten passen.
        _spalte_von = {_w: _i for _i, _w in enumerate(_kandidaten)}

        for _r, _w in enumerate(_ziele):
            if _w in _spalte_von:
                _kosinus[_r, _spalte_von[_w]] = np.nan

        for _r, _w in enumerate(_ziele):
            # Das Zeilenmittel sagt, wie ähnlich dieser Vektor dem Vokabular
            # ÜBERHAUPT ist. 0,31 bei Bundeswehr 2022 heißt aufgelöst, 0,69 bei
            # Wehrpflicht 2021 heißt: der Vektor sagt nichts. Kostet hier nichts
            # und wandert als Feld ins Bundle - es ist genau die Zahl, an der man
            # ablesen kann, ob man dieser Liste glauben darf.
            #
            # Hieß bis 2026-09-07 "hintergrund" und kollidierte damit mit dem
            # gleichnamigen, ANDEREN Wert aus kontrast_tabelle. Dort ist
            # hintergrund das mittlere Kosinus gegen 800 zufällige Wörter des
            # ZWEITEN Halbmodells und definiert kontrast = cos - hintergrund;
            # hier ist es das Mittel gegen ALLE Kandidaten der Scheibe im
            # VOLLmodell. Zwei Größen, ein Name, und im Bundle standen sie
            # nebeneinander - wer daraus kontrast + hintergrund = cos rechnet,
            # bekommt Unsinn ohne Fehlermeldung. Deshalb heißt das Bundle-Feld
            # jetzt "generik": es misst, wie generisch die Lage des Vektors ist.
            nachbar_generik[(_w, _jahr)] = float(np.nanmean(_kosinus[_r]))

            # nan_to_num mit -9: NaN würde von argsort sonst nach vorn sortiert.
            _top = np.argsort(-np.nan_to_num(_kosinus[_r], nan=-9.0))[:nb_k]

            for _rang, _i in enumerate(_top, 1):
                nachbar_zeilen.append({
                    "wort": _w,
                    "jahr": _jahr,
                    "rang": _rang,
                    "lemma": _kandidaten[_i],
                    "score": round(float(_kosinus[_r, _i]), 4),
                })

    nachbar_roh = pl.DataFrame(nachbar_zeilen)

    print(f"{len(nachbar_roh)} Nachbarzeilen für "
          f"{len(nachbar_generik)} Zellen, k={nb_k}")
    print(f"Generik: {min(nachbar_generik.values()):.2f} bis "
          f"{max(nachbar_generik.values()):.2f}, "
          f"{sum(1 for _v in nachbar_generik.values() if _v > 0.55)} Zellen über 0,55")

    nachbar_roh

    return nachbar_generik, nachbar_roh


@app.cell
def _(anker_csv, nachbar_roh, pl, zu_id):
    # ── neighbors: Anker-Labels anhängen und ins Schema-Format bringen ─────────
    # Struktur laut Schema: neighbors[entity_id][time_slice_id] = Neighbor[].
    # Die ARRAY-REIHENFOLGE ist der Rang - das Tool sortiert nicht um.
    #
    # Ist der Nachbar zufällig ein kuratierter Anker, übernimmt er dessen
    # Anzeigetext (Einsatzkräft -> Einsatzkräfte) und dessen Cluster als group;
    # sonst das generische Fallback-Tag. Ohne diesen Schritt fände das Frontend die
    # Landmarke nicht, weil es Nachbarn über das Label auflöst.

    nachbar_tabelle = (
        nachbar_roh
        .join(
            anker_csv.select([
                pl.col("lemma"),
                pl.col("label").alias("anker_label"),
                pl.col("cluster").alias("anker_cluster"),
            ]),
            on="lemma",
            how="left",
        )
        .with_columns([
            zu_id(pl.col("wort")).alias("entity_id"),
            pl.coalesce([pl.col("anker_label"), pl.col("lemma")]).alias("label"),
            pl.coalesce([pl.col("anker_cluster"), pl.lit("KONTEXT")]).alias("group"),
        ])
        # Der Join gibt keine Reihenfolgegarantie - Rang wiederherstellen.
        .sort(["entity_id", "jahr", "rang"])
    )


    neighbors = {}

    for _z in nachbar_tabelle.iter_rows(named=True):
        _je_entity = neighbors.setdefault(_z["entity_id"], {})
        _je_scheibe = _je_entity.setdefault(_z["jahr"], [])
        _je_scheibe.append({
            "label": _z["label"],
            "score": _z["score"],
            "group": _z["group"],
        })

    _mit_anker = (nachbar_tabelle["group"] != "KONTEXT").sum()

    print(f"neighbors: {len(neighbors)} Entities, "
          f"{sum(len(_v) for _v in neighbors.values())} Zellen")
    print(f"davon Nachbarn, die zugleich Anker sind: {_mit_anker} von "
          f"{len(nachbar_tabelle)} ({_mit_anker / len(nachbar_tabelle):.0%}) - "
          f"im PPMI-Bundle sind es 16 %")

    neighbors["bundeswehr"]["2022"]

    return (neighbors,)


@app.cell
def _(
    aggregat_tabelle_3d,
    anker_tabelle_3d,
    entities,
    nachbar_generik,
    neighbors,
    os,
    pca_erklaert,
    pl,
    referenz,
    time_slices,
    vocab_erklaert,
    vocab_tabelle,
    zu_id,
):
    # ── meta und JSON-Export ──────────────────────────────────────────────────
    # NUR json importieren: os und time sind im Notebook längst gebunden (Zelle
    # Lemmatisierung bzw. Training), ein zweiter Import wäre für marimo eine
    # Mehrfachdefinition und damit ein Fehler.
    import json

    # Getrennter Dateiname, getrenntes Bundle. pipeline.py schreibt
    # bundestag_zeitenwende_{quartal,halbjahr,jahr}.json - kein Rastersuffix hier,
    # weil dieser Pfad nur Jahresscheiben kennt und ein Rastername eine Wahl
    # vortäuschen würde, die es nicht gibt.
    bundle_pfad = "output/bundestag_zeitenwende_sgns.json"

    # vector_dim nicht hart hinschreiben - es ergibt sich aus den Daten und muss zu
    # jedem Vektor im Bundle passen.
    bundle_vector_dim = len(aggregat_tabelle_3d["vektor"][0])

    # Tausenderpunkt statt -komma: die description ist deutscher Fließtext,
    # Pythons ":," liefert die englische Konvention ("5,052" statt "5.052").
    bundle_vocab_anzahl = f"{len(vocab_tabelle):,}".replace(",", ".")

    bundle_meta = {
        "name": "Zeitenwende im Bundestag (SGNS, Jahre)",
        "description": (
            f"11 Zielwörter aus dem Zeitenwende-Wortfeld über {len(time_slices)} "
            f"Jahresscheiben der Plenarprotokolle des Deutschen Bundestages "
            f"(CPP-BT, Fobbe 2026, CC BY-SA 4.0). Kontrollverfahren zum PPMI-SVD-"
            f"Bundle: die Vektoren sind je Scheibe auf dem VOLLTEXT aller Reden "
            f"TRAINIERT (Skip-Gram mit Negative Sampling) und nachträglich per "
            f"orthogonalem Procrustes auf {referenz} ausgerichtet - nicht aus "
            f"Kookkurrenzen konstruiert. Die 3D-Ansicht zeigt {pca_erklaert:.0%} "
            f"der Struktur von Zielwörtern und Ankern, auf denen sie gefittet "
            f"wurde - für die {bundle_vocab_anzahl} nur hineinprojizierten "
            f"vocab_points sind es {vocab_erklaert:.0%}. Belastbar sind nur "
            f"Zellen mit hohem kontrast (Reproduzierbarkeit über zwei "
            f"Datenhälften); wo generik über etwa 0,55 liegt, ist der Vektor "
            f"allem ähnlich und die Nachbarliste nicht interpretierbar."
        ),
        "vector_dim": bundle_vector_dim,
        "projection": (
            f"SGNS (sg=1, negative=5, d={bundle_vector_dim}, window=5, epochs=5, "
            f"seed=1, min_count=3), Procrustes-Ausrichtung auf {referenz}, "
            f"danach joint PCA (3 Komponenten) über Aggregate + Anker"
        ),
        "shift_point": "2022",
        # In-sample: gilt für die 130 Aggregate + 86 Anker, auf denen die PCA
        # gefittet wurde. Das ist der Wert, den die ProjectionNote anzeigt.
        "explained_variance_ratio_3d": round(float(pca_erklaert), 4),
        # Out-of-sample: dieselben drei Achsen, aber die vocab_points wurden nur
        # hineinprojiziert (kein Neu-Fit, sonst verschöben sich anchors und
        # aggregates). Sie werden dadurch deutlich schlechter abgebildet - und
        # an genau diesen Positionen zeichnet das Frontend die Nachbarn, die
        # keine Anker sind. Ohne diese zweite Zahl liest man für die gezeichnete
        # Nachbarschaft einen fast doppelt zu guten Wert.
        "explained_variance_ratio_3d_vocab": round(float(vocab_erklaert), 4),
    }


    # json kann numpy-Typen nicht serialisieren, float() baut sie um; volle
    # Fließkommagenauigkeit bläht die Datei ohne Erkenntnisgewinn auf. Wie im
    # PPMI-Bundle: 5 Stellen für Vektoren, 4 für Koordinaten.
    def runde(werte, stellen=5):
        return [round(float(x), stellen) for x in werte]


    bundle_aggregate_json = [
        {
            "entity_id": _z["entity_id"],
            "time_slice_id": _z["jahr"],
            "facets": {},                        # leer = Aggregat, siehe Schema
            "vector": runde(_z["vektor"]),
            "coords_3d": runde(_z["coords_3d"], 4),
            "freq": int(_z["freq"]),
            # Nicht im Schema, aber es ist .passthrough() - und ohne diese beiden
            # Zahlen kann das Frontend nicht unterscheiden, ob eine Zelle etwas
            # aussagt oder nur existiert.
            #
            #   kontrast  Reproduzierbarkeit des Vektors über zwei Datenhälften,
            #             gemessen als cos(h1, h2) minus dem mittleren cos gegen
            #             800 zufällige Wörter. Fehlt (None), wenn das Wort die
            #             Schwelle in einer der Hälften nicht erreicht hat.
            #   generik   wie generisch die Lage des Vektors ist: mittlerer cos
            #             gegen ALLE Kandidaten der Scheibe, im Vollmodell.
            #
            # ACHTUNG, das ist bewusst nicht dieselbe Bezugsgröße: kontrast +
            # generik ergibt NICHT den Selbst-Kosinus. Die beiden stammen aus
            # verschiedenen Modellen (Hälften vs. Vollmodell) und verschiedenen
            # Vergleichsmengen (800 zufällige vs. alle Kandidaten). Das Feld hieß
            # bis 2026-09-07 "hintergrund" und lud damit genau zu dieser
            # Fehlrechnung ein.
            "kontrast": None if _z["kontrast"] is None else round(float(_z["kontrast"]), 4),
            "generik": round(nachbar_generik[(_z["wort"], _z["jahr"])], 4),
        }
        for _z in aggregat_tabelle_3d
            .with_columns(zu_id(pl.col("wort")).alias("entity_id"))
            .iter_rows(named=True)
    ]

    bundle_anker_json = [
        {
            "label": _z["label"],
            "cluster": _z["cluster"],
            "vector": runde(_z["vektor"]),
            "coords_3d": runde(_z["coords_3d"], 4),
            # passthrough: Ausgangslemma und über wie viele Scheiben gemittelt wurde.
            "lemma": _z["lemma"],
            "scheiben": int(_z["scheiben"]),
        }
        for _z in anker_tabelle_3d.iter_rows(named=True)
    ]

    bundle_vocab_json = [
        {"label": _z["label"], "coords_3d": runde(_z["coords_3d"], 4)}
        for _z in vocab_tabelle.iter_rows(named=True)
    ]


    bundle = {
        "meta": bundle_meta,
        "facets_schema": [],        # keine Facetten in diesem Pfad
        "entities": entities.to_dicts(),
        "time_slices": time_slices.to_dicts(),
        "anchors": bundle_anker_json,
        "vocab_points": bundle_vocab_json,
        "records": [],
        "aggregates": bundle_aggregate_json,
        "neighbors": neighbors,
    }

    # ensure_ascii=False: Umlaute bleiben Umlaute - lesbarer UND kleiner als
    # \u00e4-Escapes. separators ohne Leerzeichen spart nochmal spürbar.
    with open(bundle_pfad, "w", encoding="utf-8") as f:
        json.dump(bundle, f, ensure_ascii=False, separators=(",", ":"))

    print(f"{bundle_pfad}: {os.path.getsize(bundle_pfad) / 1e6:.1f} MB")
    print(f"  vector_dim {bundle_vector_dim}, Referenz {referenz}, Zäsur 2022")
    print(f"  {len(bundle['aggregates'])} aggregates, {len(bundle['anchors'])} anchors, "
          f"{len(bundle['vocab_points']):,} vocab_points, "
          f"{len(bundle['entities'])} entities, {len(bundle['time_slices'])} time_slices")

    # Kontrolle: jede aggregates.entity_id muss in entities auflösen, jede
    # time_slice_id in time_slices. Ein Tippfehler hier ist im Frontend eine
    # stillschweigend fehlende Zelle, kein Fehler.
    _eids = {_e["id"] for _e in bundle["entities"]}
    _tids = {_t["id"] for _t in bundle["time_slices"]}
    print("  IDs unauflösbar:", sum(
        1 for _a in bundle["aggregates"]
        if _a["entity_id"] not in _eids or _a["time_slice_id"] not in _tids
    ))

    return (bundle_pfad,)


@app.cell
def _(mo):
    kopier_schalter = mo.ui.switch(
        value=True,
        label="Nach backend/bundles kopieren (sonst nur output/)",
    )
    kopier_schalter

    return (kopier_schalter,)


@app.cell
def _(bundle_pfad, kopier_schalter):
    # ── Ins Backend kopieren ──────────────────────────────────────────────────
    # output/ ist die Werkbank der Pipeline, backend/bundles/ ist das, was die App
    # lädt. Der Loader scannt das Verzeichnis und nimmt den Dateinamen als
    # Bundle-ID - die Datei taucht im Picker als zusätzlicher Datensatz auf, ohne
    # eine Zeile Frontend-Code.
    import shutil

    if kopier_schalter.value:
        backend_pfad = "../backend/bundles/bundestag_zeitenwende_sgns.json"
        shutil.copy2(bundle_pfad, backend_pfad)
        print(f"kopiert nach {backend_pfad}")
    else:
        print("nicht kopiert (Schalter aus) - liegt nur in output/")

    return


if __name__ == "__main__":
    app.run()
