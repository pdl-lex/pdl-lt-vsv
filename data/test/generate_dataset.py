#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generator für einen synthetischen Vektor-Datensatz im generischen Schema
des geplanten Visualisierungstools (Wort × Zeitscheibe × Facette).

WICHTIG (Methodik):
  Dies sind SYNTHETISCHE Stand-in-Vektoren. Sie sind NICHT über PPMI-SVD
  konstruiert und nicht aus einem Korpus abgeleitet. Sie ahmen lediglich
  die Eigenschaften nach, die ein gemeinsam konstruierter PPMI-SVD-Raum
  hätte: ein einziger geteilter Vektorraum über alle Scheiben (kein
  Alignment nötig), interpretierbare Nachbarschaften. Die Trajektorien
  sind bewusst designt, damit das Tool etwas Sichtbares zu zeigen hat.
  Das 'sentiment'-Feld ist ebenfalls ein synthetischer Platzhalter für die
  im Projekt noch offene Achsen-Projektions-Methode ("ins Positive").

Ankerwörter (Kontext-/Landmarken) sind echte Lemmata aus dem Dornseiff,
den passenden Sachgruppen entnommen.
"""

import json
import numpy as np

RNG = np.random.default_rng(20220224)  # Datum der Zäsur als Seed, augenzwinkernd
D = 48                                  # latente Dimension (analog k, hier klein gehalten)

# ---------------------------------------------------------------------------
# 1) Semantische Cluster (Landmarken im Raum) + reale Dornseiff-Ankerwörter
# ---------------------------------------------------------------------------
CLUSTERS = {
    "SKANDAL":  ["Panne", "Skandal", "Beschaffungschaos", "Missstand", "Affäre",
                 "Debakel", "Pannenserie", "ausgedient", "marode", "Sparzwang"],
    "WEHR":     ["Verteidigung", "Wehrhaftigkeit", "Abschreckung", "Bündnis",
                 "Landesverteidigung", "einsatzbereit", "Schutz", "Sicherheit",
                 "verteidigungsfähig", "Bollwerk"],
    "KRIEG":    ["Angriffskrieg", "Aggression", "Bedrohung", "Eskalation",
                 "Invasion", "Frontlinie", "Kriegsgefahr", "Überfall"],
    "RUEST":    ["Rüstungsindustrie", "Waffensystem", "Beschaffung", "Wehretat",
                 "Panzerlieferung", "Rüstungsexport", "Wehrtechnik", "Nachrüstung"],
    "TECH":     ["Fluggerät", "Kameradrohne", "Luftaufnahme", "Sensor",
                 "Fernsteuerung", "zivil", "Hobby", "Nachtsichtgerät"],
    "POLITIK":  ["Debatte", "Beschluss", "Koalition", "Etat", "Parlament",
                 "Regierung", "Bündnispartner", "Mandat"],
}
CLUSTER_IDS = list(CLUSTERS.keys())

# Ein zufälliger, ~orthogonaler Schwerpunkt pro Cluster
def _rand_unit(dim):
    v = RNG.standard_normal(dim)
    return v / np.linalg.norm(v)

CENTROIDS = {}
_basis = []
for cid in CLUSTER_IDS:
    v = _rand_unit(D)
    # leicht dekorrelieren gegenüber bereits vergebenen Schwerpunkten
    for b in _basis:
        v = v - 0.5 * np.dot(v, b) * b
    v = v / np.linalg.norm(v)
    _basis.append(v)
    CENTROIDS[cid] = v

# Ankerwörter = Schwerpunkt + wenig Rauschen (feste Punkte im Raum)
ANCHORS = []          # {label, cluster, vector}
for cid, words in CLUSTERS.items():
    for w in words:
        vec = CENTROIDS[cid] + 0.12 * _rand_unit(D)
        vec = vec / np.linalg.norm(vec)
        ANCHORS.append({"label": w, "cluster": cid, "vector": vec})

# ---------------------------------------------------------------------------
# 2) Zeitscheiben: Quartale 2010 Q1 .. 2025 Q4
# ---------------------------------------------------------------------------
YEARS = range(2010, 2026)
SLICES = []
for y in YEARS:
    for q in (1, 2, 3, 4):
        SLICES.append({
            "id": f"{y}Q{q}",
            "label": f"{y} Q{q}",
            "start": f"{y}-{(q-1)*3+1:02d}-01",
            "year": y, "quarter": q,
        })
for i, s in enumerate(SLICES):
    s["index"] = i
# kontinuierliche Zeit in "Jahren seit 2010" für Trajektorienfunktionen
def _tyears(s):
    return (s["year"] - 2010) + (s["quarter"] - 1) / 4.0

ZASUR = _tyears({"year": 2022, "quarter": 1})   # Zeitenwende-Rede Feb 2022 -> 2022 Q1

def logistic(t, center, steep=2.2):
    return 1.0 / (1.0 + np.exp(-steep * (t - center)))

# ---------------------------------------------------------------------------
# 3) Publikationen (Facette) mit politischer Ausrichtung + Verschiebungsprofil
#    dt   : verschiebt den Wendepunkt (negativ = früher/Vorreiter)
#    amp  : Stärke der Post-Bewegung (1.0 = neutral)
#    sent : additive Sentiment-Verschiebung
# ---------------------------------------------------------------------------
PUBLICATIONS = {
    "SZ":              {"label": "Süddeutsche Zeitung", "ausrichtung": "mitte-links",
                        "dt": +0.10, "amp": 0.95, "sent": +0.00},
    "FAZ":             {"label": "Frankfurter Allgemeine", "ausrichtung": "liberal-konservativ",
                        "dt": +0.00, "amp": 1.00, "sent": +0.02},
    "taz":             {"label": "die tageszeitung", "ausrichtung": "links",
                        "dt": +0.55, "amp": 0.70, "sent": -0.18},
    "WELT":            {"label": "Die Welt", "ausrichtung": "konservativ",
                        "dt": -0.35, "amp": 1.15, "sent": +0.12},
    "Junge_Freiheit":  {"label": "Junge Freiheit", "ausrichtung": "rechts",
                        "dt": -0.45, "amp": 1.20, "sent": +0.10},
    "Handelsblatt":    {"label": "Handelsblatt", "ausrichtung": "wirtschaftsliberal",
                        "dt": -0.10, "amp": 1.05, "sent": +0.06},
}
PUB_IDS = list(PUBLICATIONS.keys())

# ---------------------------------------------------------------------------
# 4) Zielwörter mit designten Misch-Trajektorien
#    Jede Funktion liefert (mixture_weights: dict cluster->w, sentiment, freq_base)
#    in Abhängigkeit der kontinuierlichen Zeit t (Jahre seit 2010).
#    'category' folgt der Projekt-Typologie: Konnotation / Bedeutung / Häufigkeit.
# ---------------------------------------------------------------------------
def traj_bundeswehr(t):
    s = logistic(t, ZASUR)
    mix = {"SKANDAL": 0.55*(1-s)+0.05, "WEHR": 0.10+0.55*s,
           "POLITIK": 0.30, "RUEST": 0.05+0.10*s}
    sent = -0.5*(1-s) + 0.42*s
    freq = 120 + 40*np.sin(t) + 260*s
    return mix, sent, freq

def traj_ruestung(t):
    s = logistic(t, ZASUR)
    mix = {"SKANDAL": 0.35*(1-s)+0.05, "RUEST": 0.35+0.30*s,
           "WEHR": 0.05+0.25*s, "POLITIK": 0.15}
    sent = -0.58*(1-s) + 0.15*s          # bleibt umstrittener -> nur mäßig positiv
    freq = 90 + 30*np.sin(t*1.3) + 150*s
    return mix, sent, freq

def traj_wehrpflicht(t):
    s = logistic(t, ZASUR + 0.4)         # Debatte startet etwas verzögert
    mix = {"POLITIK": 0.55-0.15*s, "SKANDAL": 0.15*(1-s),
           "WEHR": 0.10+0.45*s, "RUEST": 0.05}
    sent = -0.2*(1-s) + 0.25*s
    freq = 25 + 10*np.sin(t) + 210*s     # Häufigkeit springt stark
    return mix, sent, freq

def traj_drohne(t):
    # Bedeutungswandel: zivil/Technik -> militarisiert; kontinuierlich, nicht nur 2022
    s = logistic(t, 6.0, steep=0.9)      # gradueller, Zentrum ~2016
    s2 = logistic(t, ZASUR, steep=1.6)   # zusätzlicher Schub durch Ukraine-Krieg
    mil = np.clip(0.6*s + 0.4*s2, 0, 1)
    mix = {"TECH": 0.70*(1-mil)+0.10, "KRIEG": 0.15+0.55*mil,
           "RUEST": 0.10+0.15*mil, "POLITIK": 0.05}
    sent = -0.1 - 0.25*mil               # eher ambivalent/negativ
    freq = 40 + 220*mil + 25*np.sin(t*1.7)
    return mix, sent, freq

def traj_zeitenwende(t):
    # Neologismus/Häufigkeit: ~0 vor 2022 Q1, Spike, leichter Abfall
    active = logistic(t, ZASUR, steep=9.0)
    decay = np.exp(-0.35*np.clip(t-ZASUR, 0, None))
    mix = {"WEHR": 0.35, "KRIEG": 0.20, "POLITIK": 0.40, "RUEST": 0.05}
    sent = 0.55*active                    # politischer Rallying-Begriff -> positiv
    freq = active*(60 + 900*decay)
    return mix, sent, freq

def traj_sondervermoegen(t):
    s = logistic(t, ZASUR, steep=7.0)
    mix = {"POLITIK": 0.55-0.20*s, "RUEST": 0.10+0.40*s,
           "WEHR": 0.05+0.15*s, "SKANDAL": 0.10*(1-s)}
    sent = 0.0 + 0.20*s
    freq = 15 + s*(40 + 260*np.exp(-0.4*np.clip(t-ZASUR,0,None)))
    return mix, sent, freq

TARGETS = {
    "bundeswehr":    {"label": "Bundeswehr",     "category": "Konnotationswandel", "fn": traj_bundeswehr,
                      "note": "Drift Skandal- -> Wehrhaftigkeits-Cluster (Projektplan-Beispiel)"},
    "ruestung":      {"label": "Rüstung",        "category": "Konnotationswandel", "fn": traj_ruestung,
                      "note": "Von Tabu/Kritik zu legitimer Verteidigung; bleibt kontrovers"},
    "wehrpflicht":   {"label": "Wehrpflicht",    "category": "Häufigkeitswandel",  "fn": traj_wehrpflicht,
                      "note": "Reaktivierung der Debatte; starker Frequenzanstieg"},
    "drohne":        {"label": "Drohne",         "category": "Bedeutungswandel",   "fn": traj_drohne,
                      "note": "Sense shift zivil/Technik -> militärisch; graduell"},
    "zeitenwende":   {"label": "Zeitenwende",    "category": "Häufigkeitswandel",  "fn": traj_zeitenwende,
                      "note": "Neologismus, Spike ab 2022 Q1"},
    "sondervermoegen":{"label": "Sondervermögen","category": "Häufigkeitswandel",  "fn": traj_sondervermoegen,
                      "note": "Finanzterm; springt 2022, wandert Richtung Rüstung/Beschaffung"},
}

# ---------------------------------------------------------------------------
# 5) Vektoren, Frequenzen, Sentiment erzeugen
# ---------------------------------------------------------------------------
def mixture_vector(mix, noise=0.06):
    v = np.zeros(D)
    for cid, w in mix.items():
        v += w * CENTROIDS[cid]
    v += noise * _rand_unit(D)
    n = np.linalg.norm(v)
    return v / n if n > 0 else v

records = []          # publikationsaufgelöst
aggregates = []       # über Publikationen aggregiert (facets leer)

for wid, tgt in TARGETS.items():
    for s in SLICES:
        t = _tyears(s)
        pub_vecs = []
        pub_weights = []
        for pid in PUB_IDS:
            pub = PUBLICATIONS[pid]
            # publikationsspezifisch verschobener Zeitpunkt
            mix, sent, freq_base = tgt["fn"](t - pub["dt"])
            # Amplituden-Modifikation auf "Post-Cluster"-Anteile ist implizit über dt;
            # zusätzlich amp auf Sentiment-Bewegung und Frequenz
            sent = float(np.clip(sent * pub["amp"] + pub["sent"], -1, 1))
            # Frequenz: Publikationsgröße * Rauschen; manche Zellen bewusst dünn
            size = {"SZ":1.0,"FAZ":1.0,"taz":0.6,"WELT":0.8,
                    "Junge_Freiheit":0.35,"Handelsblatt":0.7}[pid]
            lam = max(0.0, freq_base * size)
            freq = int(RNG.poisson(lam))
            vec = mixture_vector(mix)
            records.append({
                "entity_id": wid, "time_slice_id": s["id"],
                "facets": {"publication": pid},
                "vector": vec, "freq": freq, "sentiment": sent,
            })
            if freq > 0:
                pub_vecs.append(vec * freq)
                pub_weights.append(freq)
        # Aggregat = frequenzgewichteter Mittelwert der Publikationsvektoren
        if pub_weights:
            agg = np.sum(pub_vecs, axis=0) / np.sum(pub_weights)
            agg = agg / (np.linalg.norm(agg) or 1.0)
        else:
            mix, _, _ = tgt["fn"](t)
            agg = mixture_vector(mix)
        # Aggregat-Sentiment: frequenzgewichtet
        sents, wts = [], []
        for r in records[-len(PUB_IDS):]:
            sents.append(r["sentiment"]); wts.append(max(r["freq"], 0))
        agg_sent = float(np.average(sents, weights=[w+1e-6 for w in wts]))
        agg_freq = int(sum(max(r["freq"],0) for r in records[-len(PUB_IDS):]))
        aggregates.append({
            "entity_id": wid, "time_slice_id": s["id"], "facets": {},
            "vector": agg, "freq": agg_freq, "sentiment": agg_sent,
        })

# ---------------------------------------------------------------------------
# 6) Gemeinsame PCA (3D) über ALLE Vektoren (Anker + Aggregat + Publikation)
#    -> ein Basisraum, in dem alle Punkte vergleichbar liegen.
# ---------------------------------------------------------------------------
all_vecs = ([a["vector"] for a in ANCHORS]
            + [r["vector"] for r in aggregates]
            + [r["vector"] for r in records])
X = np.vstack(all_vecs)
Xc = X - X.mean(axis=0, keepdims=True)
U, Svals, Vt = np.linalg.svd(Xc, full_matrices=False)
PC = Vt[:3]                              # 3 Hauptkomponenten
def project(v):
    return (np.asarray(v) - X.mean(axis=0)) @ PC.T

for a in ANCHORS:
    a["coords_3d"] = project(a["vector"]).tolist()
for r in aggregates:
    r["coords_3d"] = project(r["vector"]).tolist()
for r in records:
    r["coords_3d"] = project(r["vector"]).tolist()

# ---------------------------------------------------------------------------
# 7) Nearest Neighbours (Aggregat-Ebene) gegen Anker + andere Zielwörter
# ---------------------------------------------------------------------------
def cos(a, b):
    a = np.asarray(a); b = np.asarray(b)
    return float(a @ b / ((np.linalg.norm(a)*np.linalg.norm(b)) or 1.0))

neighbors = {}
agg_by = {(r["entity_id"], r["time_slice_id"]): r for r in aggregates}
for wid in TARGETS:
    neighbors[wid] = {}
    for s in SLICES:
        base = agg_by[(wid, s["id"])]["vector"]
        cands = [(a["label"], cos(base, a["vector"]), a["cluster"]) for a in ANCHORS]
        for wid2 in TARGETS:
            if wid2 == wid: continue
            cands.append((TARGETS[wid2]["label"],
                          cos(base, agg_by[(wid2, s["id"])]["vector"]), "ZIELWORT"))
        cands.sort(key=lambda x: -x[1])
        neighbors[wid][s["id"]] = [
            {"label": l, "score": round(sc, 4), "group": g} for l, sc, g in cands[:8]
        ]

# ---------------------------------------------------------------------------
# 8) Serialisieren (Vektoren gerundet, um Dateigröße zu zähmen)
# ---------------------------------------------------------------------------
def round_vec(v, n=5):
    return [round(float(x), n) for x in v]

for coll in (records, aggregates):
    for r in coll:
        r["vector"] = round_vec(r["vector"])
        r["coords_3d"] = round_vec(r["coords_3d"], 4)
for a in ANCHORS:
    a["vector"] = round_vec(a["vector"])
    a["coords_3d"] = round_vec(a["coords_3d"], 4)

bundle = {
    "meta": {
        "name": "DNB-Zeitenwende (synthetisch)",
        "description": "Synthetischer Demo-Datensatz im generischen Tool-Schema. "
                       "Vektoren sind Stand-ins, KEINE PPMI-SVD-Konstruktion. "
                       "Ankerwörter sind reale Dornseiff-Lemmata.",
        "vector_dim": D,
        "projection": "joint PCA (3 Komponenten) über alle Vektoren",
        "shift_point": "2022Q1",
        "explained_variance_ratio_3d": round(float(np.sum(Svals[:3]**2)/np.sum(Svals**2)), 4),
        "warnhinweis_sentiment": "sentiment ist synthetischer Platzhalter für die noch "
                                 "offene Achsen-Projektionsmethode ('ins Positive').",
    },
    "facets_schema": [
        {"id": "publication", "label": "Publikation", "type": "categorical",
         "values": [{"id": pid, "label": PUBLICATIONS[pid]["label"],
                     "ausrichtung": PUBLICATIONS[pid]["ausrichtung"]} for pid in PUB_IDS]}
    ],
    "entities": [
        {"id": wid, "label": t["label"], "category": t["category"], "note": t["note"]}
        for wid, t in TARGETS.items()
    ],
    "time_slices": SLICES,
    "anchors": ANCHORS,
    "records": records,
    "aggregates": aggregates,
    "neighbors": neighbors,
}

with open("/home/claude/zeitenwende_demo.json", "w", encoding="utf-8") as f:
    json.dump(bundle, f, ensure_ascii=False)

print("zeitenwende_demo.json geschrieben")
print(f"  entities={len(bundle['entities'])} slices={len(SLICES)} pubs={len(PUB_IDS)}")
print(f"  records={len(records)} aggregates={len(aggregates)} anchors={len(ANCHORS)}")
print(f"  PCA 3D explained variance={bundle['meta']['explained_variance_ratio_3d']}")
