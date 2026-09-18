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
    # Diagnose-Notebook

    Ausgelagerte Optimierungs-Diagnosen aus `pipeline.py` (Volumeneffekt,
    Vokabularschwelle, Anker-Kontrollwörter). Erzeugt **kein Bundle** - alles ab
    "Vorbereitung des Bundles" im Hauptnotebook (anchors.csv einlesen, PCA/coords_3d,
    Bundle-Grundgerüst, Neighbours, JSON-Export) fehlt hier bewusst.

    Um die teuren spaCy-Schritte (KWIC-Extraktion ~1:20 min, Kontext-Lemmatisierung
    ~6:32 min) nicht zu wiederholen, liest dieses Notebook direkt die bereits
    vorhandenen Zwischenstände aus `output/` (`kwic_lemmatisiert.parquet`). Die
    leichten Aggregationsschritte (Kookkurrenz, PPMI, SVD) werden dagegen frisch
    berechnet - nur so lassen sich die Experimentier-Regler hier unabhängig vom
    Hauptnotebook durchspielen. Erklärungen zu Formeln und Stolpersteinen stehen
    weiterhin nur in `pipeline.py` bzw. `README.md`, um sie nicht doppelt pflegen
    zu müssen.
    """)
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## Vorverarbeitung (aus den Exporten von pipeline.py)
    """)
    return


@app.cell
def _(pl):
    spalten = ["rede_id", "sitzung_datum", "redner_vorname", "redner_nachname", "redner_fraktion", "redner_rolle_kurz", "tokens", "rede_text"]

    korpus = pl.read_csv("source_data/CPP-BT_2026-01-17_DE_CSV_Reden_Gesamt.csv", columns=spalten, null_values="NA")

    korpus
    return (korpus,)


@app.cell
def _(pl):
    kwic_liste_lemmatisiert_pq = pl.read_parquet("output/kwic_lemmatisiert.parquet")
    kwic_liste_lemmatisiert_pq
    return (kwic_liste_lemmatisiert_pq,)


@app.cell
def _(mo):
    # Default bewusst auf Quartale: alle in README dokumentierten Messreihen
    # (502 Zeilen, r-Werte, Kontrollränge) beziehen sich auf dieses Raster.
    zeitscheiben_raster_picker = mo.ui.dropdown(
        options={
            "Quartale (4 pro Jahr)":  "quartal",
            "Halbjahre (2 pro Jahr)": "halbjahr",
            "Jahre (1 pro Jahr)":     "jahr",
        },
        value="Quartale (4 pro Jahr)",
        label="Zeitscheiben-Raster",
    )

    mo.style(zeitscheiben_raster_picker, width="360px")
    return (zeitscheiben_raster_picker,)


@app.cell
def _(korpus, kwic_liste_lemmatisiert_pq, pl, zeitscheiben_raster_picker):
    from datetime import date

    kwic_liste_quartale = kwic_liste_lemmatisiert_pq.join(
        korpus.select(["rede_id", "sitzung_datum"]),
        on="rede_id",
        how="left",
    )

    kwic_liste_quartale = kwic_liste_quartale.with_columns(
        pl.col("sitzung_datum").str.strptime(pl.Date, "%Y-%m-%d").alias("datum")
    )

    jahr_teil = pl.col("datum").dt.year().cast(pl.Utf8)
    quartal_nr = pl.col("datum").dt.quarter()

    if zeitscheiben_raster_picker.value == "quartal":
        zeitscheibe_ausdruck = jahr_teil + "-Q" + quartal_nr.cast(pl.Utf8)

    elif zeitscheiben_raster_picker.value == "halbjahr":
        halbjahr_ausdruck = ((quartal_nr - 1) // 2 + 1).cast(pl.Utf8)
        zeitscheibe_ausdruck = jahr_teil + "-H" + halbjahr_ausdruck

    else:
        zeitscheibe_ausdruck = jahr_teil

    kwic_liste_quartale = kwic_liste_quartale.with_columns(
        zeitscheibe_ausdruck.alias("zeitscheibe")
    )

    zaesur = (
        pl.DataFrame({"datum": [date(2022, 2, 27)]})
        .select(zeitscheibe_ausdruck)
        .item()
    )

    print(f"Raster: {zeitscheiben_raster_picker.value} | "
          f"{kwic_liste_quartale['zeitscheibe'].n_unique()} Zeitscheiben | "
          f"Zäsur: {zaesur}")

    kwic_liste_quartale
    return kwic_liste_quartale, zaesur


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## Kookkurrenz & PPMI
    """)
    return


@app.cell
def _(mo):
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
    kookkurrenz_entrollt = kwic_liste_quartale.explode(
        ["kontext_lemmata", "kontext_pos"], empty_as_null=True
    )

    print(f"Kontext-Tokens gesamt: {len(kookkurrenz_entrollt):,}"
          f"   ohne POS-Tag: {kookkurrenz_entrollt['kontext_pos'].null_count()}")

    if len(pos_filter_picker.value) > 0:
        tokens_vorher = len(kookkurrenz_entrollt)

        kookkurrenz_entrollt = kookkurrenz_entrollt.filter(
            ~pl.col("kontext_pos").is_in(pos_filter_picker.value)
        )

        tokens_weg = tokens_vorher - len(kookkurrenz_entrollt)
        print(f"POS-Filter {sorted(pos_filter_picker.value)}: "
              f"{tokens_weg:,} Tokens verworfen ({tokens_weg / tokens_vorher:.1%})")

    else:
        print("POS-Filter: aus (Baseline)")

    kookkurrenz = (
        kookkurrenz_entrollt
        .group_by(["zeitscheibe", "zielwort_lemma", "kontext_lemmata"])
        .len()
        .rename({"kontext_lemmata": "kontext_lemma", "len": "beobachtet"})
    )

    kookkurrenz

    return (kookkurrenz,)


@app.cell
def _(kookkurrenz, pl):
    # Randsumme je ZIELWORT, pro Zeitscheibe.
    # Summe von "beobachtet" über alle Kontextwörter hinweg.

    randsumme_zielwort = (
        kookkurrenz
        .group_by(["zeitscheibe", "zielwort_lemma"])
        .agg(
            pl.col("beobachtet").sum().alias("randsumme_ziel")
        )
    )


    # Randsumme je KONTEXTWORT, pro Zeitscheibe.
    # Summe von "beobachtet" über alle Zielwörter hinweg.
    randsumme_kontextwort = (
        kookkurrenz
        .group_by(["zeitscheibe", "kontext_lemma"])
        .agg(
            pl.col("beobachtet").sum().alias("randsumme_kontext")
        )
    )


    # 4) GESAMTSUMME je Zeitscheibe.
    #    Summe von "beobachtet" über die komplette Tabelle dieser
    gesamtsumme = (
        kookkurrenz
        .group_by(["zeitscheibe"])
        .agg(
            pl.col("beobachtet").sum().alias("gesamt")
        )
    )
    return gesamtsumme, randsumme_kontextwort, randsumme_zielwort


@app.cell
def _(randsumme_zielwort):
    randsumme_zielwort
    return


@app.cell
def _(randsumme_kontextwort):
    randsumme_kontextwort
    return


@app.cell
def _(gesamtsumme):
    gesamtsumme
    return


@app.cell
def _(
    gesamtsumme,
    kookkurrenz,
    kwic_liste_quartale,
    randsumme_kontextwort,
    randsumme_zielwort,
):
    # Randsumme des Zielworts anhängen.
    kookkurrenz_ppmi = kookkurrenz.join(
        randsumme_zielwort,
        on=["zeitscheibe", "zielwort_lemma"],
        how="left",
    )

    # Randsumme des Kontextworts anhängen.
    kookkurrenz_ppmi = kookkurrenz_ppmi.join(
        randsumme_kontextwort,
        on=["zeitscheibe", "kontext_lemma"],
        how="left",
    )

    # Gesamtsumme der Zeitscheibe anhängen.
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
def _(kookkurrenz_ppmi, pl):
    # 1) Erwarteter Wert unter Unabhängigkeit:
    #    randsumme_ziel * randsumme_kontext / gesamt
    kookkurrenz_ppmi_komplett = kookkurrenz_ppmi.with_columns(
        (
            (pl.col("randsumme_ziel") * pl.col("randsumme_kontext"))
            / pl.col("gesamt")
        ).alias("erwartet")
    )

    # 2) PMI: log2(beobachtet / erwartet)
    kookkurrenz_ppmi_komplett = kookkurrenz_ppmi_komplett.with_columns(
        (pl.col("beobachtet") / pl.col("erwartet")).log(2).alias("pmi")
    )

    # 3) PPMI: PMI nach unten bei 0 kappen, also max(0, pmi)
    kookkurrenz_ppmi_komplett = kookkurrenz_ppmi_komplett.with_columns(
        pl.col("pmi").clip(lower_bound=0).alias("ppmi")
    )

    # 4) Local-MI: PPMI, gewichtet mit der tatsächlichen Trefferzahl.
    kookkurrenz_ppmi_komplett = kookkurrenz_ppmi_komplett.with_columns(
        (pl.col("beobachtet") * pl.col("ppmi")).alias("local_mi")
    )

    # 5) t-Score: Differenz statt Verhältnis, gemessen in Standardfehlern.
    #    sqrt(beobachtet) ist der Standardfehler einer poissonverteilten Zählung.
    #    Bewusst NICHT bei 0 gekappt – negative Werte ("seltener als erwartet")
    #    sind für die Anzeige informativ. Für einen späteren SVD-Versuch käme
    #    hier noch ein .clip(lower_bound=0) dazu.
    kookkurrenz_ppmi_komplett = kookkurrenz_ppmi_komplett.with_columns(
        (
            (pl.col("beobachtet") - pl.col("erwartet"))
            / pl.col("beobachtet").sqrt()
        ).alias("t_score")
    )

    kookkurrenz_ppmi_komplett
    return (kookkurrenz_ppmi_komplett,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## SVD mit Experimentier-Reglern
    Beide Regler sind im Hauptnotebook auf ihre unschädliche/deaktivierte Stellung
    fixiert (Zeilennormierung aus, Vokabularschwelle 1). Hier dürfen sie bewegt
    werden - die beiden Diagnose-Zellen darunter sind die Messlatte, an der sich
    zeigt, was das jeweils anrichtet (s. README, Abschnitt "Stolpersteine").
    """)
    return


@app.cell
def _():
    import numpy as np

    return (np,)


@app.cell
def _(mo):
    # A/B-Schalter. Umlegen rechnet SVD, Vektoren und Diagnose neu durch.
    zeilennormierung_schalter = mo.ui.switch(
        label="Zeilen vor der SVD auf Länge 1 normieren"
    )

    zeilennormierung_schalter
    return (zeilennormierung_schalter,)


@app.cell
def _(mo):
    # Mindest-Gesamthäufigkeit, die ein Kontextwort haben muss, um überhaupt
    # eine Matrixspalte zu bekommen.
    # 1 = kein Filter, also der ungefilterte Zustand
    vokabular_schwelle_picker = mo.ui.number(
        start=1,
        value=1,
        step=1,
        label="Mindest-Gesamthäufigkeit Kontextwort (global)",
    )

    mo.style(vokabular_schwelle_picker, width="420px")

    return (vokabular_schwelle_picker,)


@app.cell
def _(kookkurrenz_ppmi_komplett, pl, vokabular_schwelle_picker):
    # Globale Häufigkeit je Kontextwort
    # Summe von "beobachtet" über ALLE Zeitscheiben und alle Zielwörter.

    # Absichtlich global, nie je Zeitscheibe: ein Wort, das erst ab 2022 auftaucht, ist in seinen frühen Quartalen Hapax. Ein Filter je Zeitscheibe würde diese Vorgeschichte löschen.

    vokabular_global = (
        kookkurrenz_ppmi_komplett
        .group_by("kontext_lemma")
        .agg(
            pl.col("beobachtet").sum().alias("gesamthaeufigkeit")
        )
    )

    vokabular_schwelle = int(vokabular_schwelle_picker.value)

    vokabular_erlaubt = vokabular_global.filter(
        pl.col("gesamthaeufigkeit") >= vokabular_schwelle
    )

    print(f"Vokabular: {len(vokabular_erlaubt):,} von {len(vokabular_global):,} "
          f"Kontextwörtern bei Schwelle >= {vokabular_schwelle}")


    # nur Zellen mit ppmi > 0
    # Ein ppmi < 0 bedeutet nicht, dass die Kombination nicht vorkam, nur dass sie seltener als erwartet vorkam. ppmi == 0 wäre in der Matrix ohnehin leer.

    svd_input = kookkurrenz_ppmi_komplett.filter(pl.col("ppmi") > 0)


    # auf das erlaubte Vokabular einschränken
    # how="semi" heisst: behalte die Zeilen, deren kontext_lemma in
    # vokabular_erlaubt vorkommt – aber hänge dessen Spalten NICHT an.
    # = filtern, nicht anreichern

    svd_input = svd_input.join(
        vokabular_erlaubt,
        on="kontext_lemma",
        how="semi",
    )


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
        # Jede Zeile auf Länge 1. Danach trägt jede Zelle (Zielwort × Quartal)
        # exakt gleich viel Frobenius-Masse bei – kein dichtes Quartal kann die
        # Top-Achsen mehr allein bestimmen.
        #
        # np.maximum(..., 1e-12) ist reine Vorsicht gegen Division durch 0.
        # Hier kann keine Zeile Norm 0 haben, weil zeilen_tabelle aus svd_input
        # (gefiltert auf ppmi > 0) stammt – aber der Schutz kostet nichts.
        matrix_svd = matrix / np.maximum(matrix_zeilennormen, 1e-12)

    else:
        # Aus: unveränderte Matrix, also der bisherige Zustand.
        matrix_svd = matrix


    print("SVD-Input:", "zeilennormiert" if zeilennormierung_schalter.value else "roh")

    return (matrix_svd,)


@app.cell
def _(matrix_svd, np):
    # Decomposition/Zerlegung M = U * S * Vt
    U, S, Vt = np.linalg.svd(matrix_svd, full_matrices=False)

    print("U :", U.shape)   # Zeilen im neuen Raum
    print("S :", S.shape)   # Wichtigkeit jeder Achse
    print("Vt:", Vt.shape)  # Kontextwort-Seite, für die Anker-Kontrolle unten
    return S, U, Vt


@app.cell
def _(S, U):
    svd_zeilen = U.shape[0]
    k = min(100, max(30, svd_zeilen // 3))

    vektoren = U[:, :k] * S[:k]

    erklaerte_varianz = (S[:k] ** 2).sum() / (S ** 2).sum()

    print(f"{svd_zeilen} Zeilen -> k = {k}, Vektoren: {vektoren.shape}")
    print(f"erklärte Varianz: {erklaerte_varianz:.1%}")
    return (vektoren,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## Diagnose: Sparsity-Effekt der Vokabularschwelle
    Aussagekraft beschränkt, Tests brachten nicht das erwartete Ergebnis (s. README) -
    steht trotzdem bereit, falls die Vokabularschwelle oben erneut bewegt wird.
    """)
    return


@app.cell
def _(
    kookkurrenz_ppmi_komplett,
    pl,
    spalten_tabelle,
    svd_input,
    zeilen_tabelle,
):
    # Diagnose: schrumpft die Sparsity-Asymmetrie?
    # Das ist die Kennzahl, die Fix A sofort bewertet – ohne dass die SVD dafür
    # überhaupt laufen muss. Ausgangszustand: 344 bis 3.825 belegte Spalten,
    # also Faktor 11 zwischen dünnster und dichtester Zeile. Der soll runter.

    zellen_pro_zeile = (
        svd_input
        .group_by(["zielwort_lemma", "zeitscheibe"])
        .len()
        .rename({"len": "belegte_spalten"})
    )

    # Kontrolle, dass der Filter keine Zeile komplett gelöscht hat: eine Zelle
    # ohne einzige erlaubte Spalte fiele lautlos aus zeilen_tabelle heraus und
    # hätte danach keinen Vektor mehr.
    zeilen_ohne_filter = (
        kookkurrenz_ppmi_komplett
        .filter(pl.col("ppmi") > 0)
        .select(["zielwort_lemma", "zeitscheibe"])
        .unique()
    )

    print(f"Matrix: {len(zeilen_tabelle)} Zeilen x {len(spalten_tabelle):,} Spalten")

    if len(zeilen_tabelle) < len(zeilen_ohne_filter):
        print(f"  ACHTUNG: {len(zeilen_ohne_filter) - len(zeilen_tabelle)} "
              f"Zeile(n) komplett leergefiltert!")

    print(
        f"belegte Spalten je Zeile:"
        f"  min {zellen_pro_zeile['belegte_spalten'].min()}"
        f"  Median {zellen_pro_zeile['belegte_spalten'].median():.0f}"
        f"  max {zellen_pro_zeile['belegte_spalten'].max()}"
        f"  -> Asymmetrie-Faktor "
        f"{zellen_pro_zeile['belegte_spalten'].max() / zellen_pro_zeile['belegte_spalten'].min():.1f}"
    )

    svd_input
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## Diagnose: Anker-Kontrolle
    Prüft an einer Beispielzelle (Bundeswehr, Zäsur) und an bekannten
    Zeitenwende-Kontrollwörtern, ob die Ankerauswahl unter den aktuellen Reglern
    noch trägt oder wieder Echo-Effekte zeigt (s. README, Stolperstein
    "Die Spaltenseite der SVD gibt Echos zurück").
    """)
    return


@app.cell
def _(Vt, np, pl, spalten_tabelle, vektoren, zaesur, zeilen_tabelle):
    # ── Kontextwort-Vektoren aus der Spaltenseite der SVD ─────────────────────
    anker_k = vektoren.shape[1]
    anker_vektoren = Vt[:anker_k].T

    print("Kontextwort-Vektoren:", anker_vektoren.shape)
    print(f"Bundeswehr - {zaesur}")

    anker_probe = zeilen_tabelle.filter(
        (pl.col("zielwort_lemma") == "Bundeswehr")
        & (pl.col("zeitscheibe") == zaesur)
    )

    anker_zeile_i = anker_probe["zeile_i"][0]
    anker_zielwort_vektor = vektoren[anker_zeile_i]

    anker_laengen = np.linalg.norm(anker_vektoren, axis=1, keepdims=True)
    anker_vektoren_normiert = anker_vektoren / np.maximum(anker_laengen, 1e-12)

    anker_zielwort_normiert = (
        anker_zielwort_vektor / np.linalg.norm(anker_zielwort_vektor)
    )

    anker_kosinus = anker_vektoren_normiert @ anker_zielwort_normiert

    anker_top = np.argsort(-anker_kosinus)[:20]

    anker_nachbarn = (
        spalten_tabelle[anker_top.tolist()]
        .with_columns(
            pl.Series("kosinus", anker_kosinus[anker_top]).round(3)
        )
        .select(["kontext_lemma", "kosinus"])
    )

    anker_nachbarn

    return anker_kosinus, anker_nachbarn


@app.cell
def _(
    anker_kosinus,
    anker_nachbarn,
    pl,
    spalten_tabelle,
    svd_input,
    zeilen_tabelle,
):
    # Ankerkandidaten: Landmarken müssen in vielen Zellen vorkommen.
    anker_belegung = (
        svd_input
        .group_by("kontext_lemma")
        .agg([
            pl.col("zeile_i").n_unique().alias("zellen"),
            pl.col("beobachtet").sum().alias("haeufigkeit"),
        ])
    )

    anker_diagnose = anker_nachbarn.join(
        anker_belegung, on="kontext_lemma", how="left"
    )
    print("bisherige Top-20 — Median belegter Zellen:",
          anker_diagnose["zellen"].median())

    anker_mindestzellen = max(10, round(len(zeilen_tabelle) * 0.02))

    anker_erlaubt = anker_belegung.filter(
        pl.col("zellen") >= anker_mindestzellen
    )

    print(f"Ankerkandidaten: {len(anker_erlaubt):,} von {len(anker_belegung):,} "
          f"(Mindestbelegung {anker_mindestzellen} von {len(zeilen_tabelle)} Zeilen)")

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


@app.cell
def _(anker_erlaubt, anker_kosinus, pl, spalten_tabelle):
    # ── Gezielte Kontrollfrage statt Top-20 ────────────────────────────────────
    # Eine Top-Liste zeigt, was oben steht. Interessanter ist hier die Gegenrichtung:
    # wo landen die Wörter, von denen wir aus der reinen Zählung wissen, dass sie
    # in dieser Zelle häufig sind?

    anker_alle_raenge = (
        spalten_tabelle
        .with_columns(pl.Series("kosinus", anker_kosinus))
        .join(anker_erlaubt, on="kontext_lemma", how="inner")
        .sort("kosinus", descending=True)
        .with_row_index("rang", offset=1)     # Rang 1 = nächster Nachbar
    )

    anker_kontrollwoerter = [
        "Sondervermögen", "Milliarde", "Zeitenwende", "Beschaffung",
        "Aufrüstung", "Attraktivität", "Mali",
    ]

    anker_kontrolle = (
        anker_alle_raenge
        .filter(pl.col("kontext_lemma").is_in(anker_kontrollwoerter))
        .with_columns(pl.col("kosinus").round(3))
        .select(["rang", "kontext_lemma", "kosinus", "zellen", "haeufigkeit"])
    )

    print(f"Rangliste umfasst {len(anker_alle_raenge):,} Kandidaten")
    anker_kontrolle
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## Diagnose: Redevolumen-Effekt
    Reproduzierbare Messlatte, an der jede Fix-Variante (Zeilennormierung,
    Vokabularschwelle, gröberes Zeitscheiben-Raster) mit denselben Zahlen
    verglichen werden kann. Diese Zelle ändert nichts an der Pipeline, sie misst
    nur. Erkenntnisse sind in `README.md` dokumentiert.
    """)
    return


@app.cell
def _(kookkurrenz_ppmi_komplett, matrix, np, pl, vektoren, zeilen_tabelle):
    # ══ Diagnose: hängt die Ähnlichkeit im SVD-Raum am Redevolumen? ══════════════
    #
    # Zweck: eine reproduzierbare Messlatte, an der jede Fix-Variante (Zeilen-
    # normierung, Vokabularfilter, gröbere Zeitscheiben) mit denselben Zahlen
    # verglichen werden kann. Diese Zelle ändert nichts an der Pipeline, sie misst nur.


    # ─── 1) Volumen je Matrixzeile beschaffen ────────────────────────────────────
    # Zwei verschiedene Volumenbegriffe, bewusst beide:
    #   randsumme_ziel       = Zahl der Kontext-Tokens  (das "846 Tokens" aus der Readme)
    #   zielwort_haeufigkeit = Zahl der KWIC-Treffer    (die ehrlichere Trefferzahl)
    # Beide sind pro (zeitscheibe, zielwort_lemma) konstant, deshalb reicht unique().

    diag_volumen = (
        kookkurrenz_ppmi_komplett
        .select([
            "zeitscheibe",
            "zielwort_lemma",
            "randsumme_ziel",
            "zielwort_haeufigkeit",
        ])
        .unique()
    )


    # ─── 2) An zeilen_tabelle hängen — und danach ZWINGEND nach zeile_i sortieren ─
    # Ein Join gibt in polars keine Reihenfolgegarantie. Unten werden numpy-Arrays
    # per Position danebengelegt; ohne das .sort() bekäme jede Zeile die Kennzahlen
    # einer anderen — genau der Stolperstein, den Schritt 16 aufdeckt.

    diag_zeilen = (
        zeilen_tabelle
        .join(
            diag_volumen,
            on=["zielwort_lemma", "zeitscheibe"],
            how="left",
        )
        .sort("zeile_i")
    )


    # ─── 3) Kosinus-Matrix über alle Zeilen ──────────────────────────────────────
    # Vektoren auf Länge 1 normieren, dann ist das Skalarprodukt der Kosinus.

    diag_laengen = np.linalg.norm(vektoren, axis=1, keepdims=True)
    diag_vektoren_normiert = vektoren / diag_laengen

    diag_cos = diag_vektoren_normiert @ diag_vektoren_normiert.T


    # ─── 4) Kennzahl A: mittlere Ähnlichkeit zu den übrigen Zeilen DESSELBEN Worts
    # Das ist die "Zentralität" eines Quartals in der Bahn seines eigenen Zielworts.
    # Niedriger Wert = dieses Quartal liegt abseits. Genau diese Zahl korreliert
    # laut Readme mit r = 0,606 gegen log(Tokens).

    diag_mittlere_aehnlichkeit = np.full(len(diag_zeilen), np.nan)

    for diag_wort in diag_zeilen["zielwort_lemma"].unique().to_list():

        # zeile_i IST hier die Position im numpy-Array – aber nur, weil wir
        # in Schritt 2 nach zeile_i sortiert haben.
        diag_idx = (
            diag_zeilen
            .filter(pl.col("zielwort_lemma") == diag_wort)["zeile_i"]
            .to_numpy()
        )

        # Teilmatrix: dieses Zielwort gegen sich selbst über alle seine Quartale.
        diag_teilmatrix = diag_cos[np.ix_(diag_idx, diag_idx)].copy()

        # Die Diagonale ist die Ähnlichkeit einer Zeile mit sich selbst (= 1)
        # und würde den Mittelwert verfälschen.
        np.fill_diagonal(diag_teilmatrix, np.nan)

        diag_mittlere_aehnlichkeit[diag_idx] = np.nanmean(diag_teilmatrix, axis=1)


    # ─── 5) Kennzahl B: mittlere Ähnlichkeit zu ALLEN anderen Zeilen ─────────────
    # Gleiche Idee, aber gegen den kompletten Raum statt nur gegen das eigene Wort.
    # Zeigt, ob eine dünne Zeile generell "einsam" ist, nicht nur in ihrer Bahn.

    diag_cos_ohne_diagonale = diag_cos.copy()
    np.fill_diagonal(diag_cos_ohne_diagonale, np.nan)

    diag_mittlere_aehnlichkeit_global = np.nanmean(diag_cos_ohne_diagonale, axis=1)


    # ─── 6) Kennzahlen C: Rohmatrix statt SVD-Raum ───────────────────────────────
    # Die beiden Effekte aus der Analyse getrennt sichtbar machen:
    #   belegte_spalten -> Effekt 1 (Überlappung): wie voll ist die Zeile überhaupt?
    #   zeilennorm      -> Effekt 2 (Fit-Gewicht): wie stark zieht die Zeile die SVD-Achsen?
    # Wenn zeilennorm stark mit dem Volumen korreliert, ist Fix B (Zeilen auf Länge 1
    # normieren) tatsächlich relevant; wenn nicht, ist er wirkungslos.

    diag_zeilennorm      = np.linalg.norm(matrix, axis=1)
    diag_belegte_spalten = (matrix > 0).sum(axis=1)

    # Länge des fertigen SVD-Vektors: kurze Vektoren = schlecht rekonstruierte Zeilen.
    diag_vektorlaenge = diag_laengen[:, 0]


    # ─── 7) Alles in eine Tabelle, plus Rang je Zielwort ─────────────────────────
    # Rang 1 = zentralste Zeile dieses Worts, Rang n = entlegenste.
    # Kontrollfall aus der Readme: Sicherheit/2022-Q2 soll ganz hinten BLEIBEN.

    diagnose = (
        diag_zeilen
        .with_columns(
            pl.Series("mittlere_aehnlichkeit", diag_mittlere_aehnlichkeit).round(3),
            pl.Series("aehnlichkeit_global", diag_mittlere_aehnlichkeit_global).round(3),
            pl.Series("zeilennorm", diag_zeilennorm).round(1),
            pl.Series("belegte_spalten", diag_belegte_spalten),
            pl.Series("vektorlaenge", diag_vektorlaenge).round(1),
        )
        .with_columns(
            # log, weil das Volumen über drei Größenordnungen streut (846 ... 28.027)
            pl.col("randsumme_ziel").log().alias("log_tokens"),

            pl.col("mittlere_aehnlichkeit")
              .rank(method="ordinal", descending=True)
              .over("zielwort_lemma")
              .alias("rang"),

            pl.len().over("zielwort_lemma").alias("rang_von"),
        )
    )


    # ─── 8) Korrelationen: die eigentliche Messlatte ─────────────────────────────

    def diag_pearson(x, y):
        """Pearson-r zwischen zwei numpy-Arrays."""
        return float(np.corrcoef(x, y)[0, 1])


    diag_sammlung = []

    for diag_wort2 in sorted(diagnose["zielwort_lemma"].unique().to_list()):

        diag_tab = diagnose.filter(pl.col("zielwort_lemma") == diag_wort2)

        diag_sammlung.append({
            "zielwort_lemma": diag_wort2,
            "n_zeitscheiben": len(diag_tab),

            # DIE Zahl. Soll gegen 0 gehen. Aktuell für Sicherheit ~0,61.
            "r_aehnlichkeit": round(diag_pearson(
                diag_tab["log_tokens"].to_numpy(),
                diag_tab["mittlere_aehnlichkeit"].to_numpy(),
            ), 3),

            # Effekt 1: dünne Zeile = wenig gemeinsame Spalten.
            "r_belegung": round(diag_pearson(
                diag_tab["log_tokens"].to_numpy(),
                diag_tab["belegte_spalten"].to_numpy().astype(float),
            ), 3),

            # Effekt 2: dichte Zeile = große Norm = dominiert den SVD-Fit.
            "r_zeilennorm": round(diag_pearson(
                diag_tab["log_tokens"].to_numpy(),
                diag_tab["zeilennorm"].to_numpy(),
            ), 3),
        })

    diagnose_korrelationen = pl.DataFrame(diag_sammlung)


    # ─── 9) Gepoolt über alle Zeilen ─────────────────────────────────────────────

    print("gepoolt über alle", len(diagnose), "Zeilen:")
    print("  r(mittlere Ähnlichkeit x log Tokens) =", round(diag_pearson(
        diagnose["log_tokens"].to_numpy(),
        diagnose["mittlere_aehnlichkeit"].to_numpy()), 3))
    print("  r(globale Ähnlichkeit x log Tokens)  =", round(diag_pearson(
        diagnose["log_tokens"].to_numpy(),
        diagnose["aehnlichkeit_global"].to_numpy()), 3))
    print("  r(Zeilennorm x log Tokens)           =", round(diag_pearson(
        diagnose["log_tokens"].to_numpy(),
        diagnose["zeilennorm"].to_numpy()), 3))
    print("  r(belegte Spalten x log Tokens)      =", round(diag_pearson(
        diagnose["log_tokens"].to_numpy(),
        diagnose["belegte_spalten"].to_numpy().astype(float)), 3))
    print()


    # ─── 10) Die Kontrollfälle aus der Readme, namentlich ────────────────────────
    # 2017-Q3       – dünnstes Quartal, soll nach dem Fix NICHT mehr hinten liegen
    # 2021-Q3/Q4    – Wahl/Regierungsbildung, aktuell Rang 48 bzw. 46 von 50
    # 2022-Q1       – Zeitenwende-Rede, der eigentliche Untersuchungsgegenstand
    # 2022-Q2       – GRÖSSTES Quartal, trotzdem Rang 49: echte Distanz, muss bleiben

    print("Kontrollfälle Sicherheit:")
    print(
        diagnose
        .filter(
            (pl.col("zielwort_lemma") == "Sicherheit")
            & pl.col("zeitscheibe").is_in(
                ["2017-Q3", "2021-Q3", "2021-Q4", "2022-Q1", "2022-Q2"]
            )
        )
        .select([
            "zeitscheibe",
            "randsumme_ziel",
            "zielwort_haeufigkeit",
            "belegte_spalten",
            "zeilennorm",
            "mittlere_aehnlichkeit",
            "rang",
            "rang_von",
        ])
        .sort("zeitscheibe")
    )


    diagnose_korrelationen

    return


if __name__ == "__main__":
    app.run()
