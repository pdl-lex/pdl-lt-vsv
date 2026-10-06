"""Regeln aus SCHEMA.md (`meta.neighbor_space`, Format 1) am synthetischen Bundle."""

from __future__ import annotations

import json
import os

import numpy as np
import pytest

from app import neighbors
from conftest import DEFAULT_NEIGHBORS, NEIGHBOR_SPACE, write_bundle


def labels(client, slice_id="s1", **body):
    body.setdefault("k", 50)
    res = client.post("/bundles/mini/neighbors", json=body)
    assert res.status_code == 200, res.text
    space = neighbors.get_space("mini")
    hit = res.json()["neighbors"]["a"][slice_id]
    return [e["label"] for e in neighbors.neighbor_entries(space, hit["rows"], hit["scores"])]


def test_defaults_reproduce_shipped_neighbors(client):
    res = client.post("/bundles/mini/neighbors", json={"k": 50})
    space = neighbors.get_space("mini")
    got = {
        e: {s: neighbors.neighbor_entries(space, v["rows"], v["scores"]) for s, v in per.items()}
        for e, per in res.json()["neighbors"].items()
    }
    assert got == DEFAULT_NEIGHBORS


def test_tie_broken_by_row(client):
    # Beta (row 3) und Gamma (row 4) gleich nah; Zeta (row 7) und Theta (row 9) ebenso
    assert labels(client)[1:3] == ["Beta-Anker", "Gamma"]
    assert labels(client, "s2")[:2] == ["Zeta", "Theta"]


def test_slice_rule(client):
    assert "Theta" not in labels(client, "s1")
    assert "Theta" in labels(client, "s2")


def test_null_attribute_keeps_candidate(client):
    assert labels(client, filters={"pos": ["ADV"]}) == ["Zeta", "Eta"]
    # leere Liste: nur noch der Kandidat ohne Wortart
    assert labels(client, filters={"pos": []}) == ["Zeta"]


def test_null_value_disables_filter(client):
    assert "Eps" in labels(client, filters={"n_rows": None})
    assert "Eta" in labels(client, filters={"pos": None})
    assert "Delta" in labels(client, filters={"is_speaker_name": False})
    assert "Delta" in labels(client, filters={"is_speaker_name": None})


def test_stopwords(client):
    assert "Stop" in labels(client, stopwords=[])
    got = labels(client, stopwords=["Alpha"])
    assert "Alpha" not in got and "Stop" in got
    # exakter Abgleich mit Groß-/Kleinschreibung
    assert "Alpha" in labels(client, stopwords=["alpha"])


def test_k(client):
    assert labels(client, k=2) == ["Alpha", "Beta-Anker"]
    assert len(labels(client, k=50)) == 4


def test_candidate_counts(client):
    body = client.post("/bundles/mini/neighbors", json={"k": 1}).json()
    # Voreinstellungen: Alpha, Beta, Gamma, Zeta, Theta (Eta, Delta, Eps, Stop fallen weg)
    assert (body["n_candidates"], body["n_candidates_total"]) == (5, 9)
    space = client.get("/bundles/mini/neighbor-space").json()["candidates"]
    lemma_by_row = dict(zip(space["row"], space["lemma"]))
    kept = {lemma_by_row[r] for r in body["kept_rows"]}
    assert len(body["kept_rows"]) == 5
    assert {"Eta", "Delta", "Eps", "Stop"}.isdisjoint(kept)


def test_scores_rounded_and_rows_global(client):
    hit = client.post("/bundles/mini/neighbors", json={"k": 2}).json()["neighbors"]["a"]["s1"]
    assert hit == {"rows": [2, 3], "scores": [1.0, 0.8]}


@pytest.mark.parametrize(
    "body",
    [
        {"k": 5, "filters": {"unbekannt": 1}},
        {"k": 5, "filters": {"pos": "NOUN"}},
        {"k": 5, "filters": {"pos": [1]}},
        {"k": 5, "filters": {"n_rows": "10"}},
        {"k": 5, "filters": {"n_rows": True}},
        {"k": 5, "filters": {"is_speaker_name": 1}},
    ],
)
def test_invalid_filters(client, body):
    assert client.post("/bundles/mini/neighbors", json=body).status_code == 400


@pytest.mark.parametrize("k", [0, neighbors.K_MAX + 1])
def test_k_bounds(client, k):
    assert client.post("/bundles/mini/neighbors", json={"k": k}).status_code == 422


def test_top_k_ties_at_boundary():
    # drei gleiche Werte an der Grenze k = 2: die mit kleinerer Position gewinnen
    scores = np.array([0.5, 0.9, 0.5, 0.5, 0.1])
    assert neighbors._top_k(scores, 2).tolist() == [1, 0]
    assert neighbors._top_k(scores, 10).tolist() == [1, 0, 2, 3, 4]


@pytest.mark.parametrize(
    ("change", "status"),
    [
        ({"format": 2}, 422),
        ({"similarity": "euclid"}, 422),
        ({"vectors": "../mini.vectors.npy"}, 422),
        ({"vectors": "fehlt.npy"}, 404),
        ({"filters": [{"column": "pos", "type": "range", "label": "x"}]}, 422),
        ({"filters": [{"column": "gibtsnicht", "type": "minimum", "label": "x"}]}, 422),
        ({"filters": [{"column": "pos", "type": "minimum", "label": "x"}]}, 422),
    ],
)
def test_unusable_space(bundle_dir, client, change, status):
    write_bundle(bundle_dir, "kaputt", {**NEIGHBOR_SPACE, **change})
    assert client.get("/bundles/kaputt/neighbor-space").status_code == status
    assert client.post("/bundles/kaputt/neighbors", json={"k": 3}).status_code == status


def test_bundle_without_space(bundle_dir, client):
    path = write_bundle(bundle_dir, "alt")
    data = json.loads(path.read_text(encoding="utf-8"))
    del data["meta"]["neighbor_space"]
    path.write_text(json.dumps(data), encoding="utf-8")
    assert client.get("/bundles/alt/neighbor-space").status_code == 404
    assert client.get("/bundles/gibtsnicht/neighbor-space").status_code == 404


def test_neighbor_space_endpoint(client):
    res = client.get("/bundles/mini/neighbor-space")
    assert res.status_code == 200
    body = res.json()
    assert body["format"] == 1 and body["k_max"] == neighbors.K_MAX
    assert body["stopwords"] == ["Stop"]
    pos, n_rows, speaker = body["filters"]
    assert pos["values"][0] == {"value": "NOUN", "count": 5}
    assert pos["null_count"] == 1 and pos["default"] == ["NOUN", "PROPN", "VERB"]
    assert (n_rows["min"], n_rows["max"]) == (2, 20)
    assert speaker["count_true"] == 1
    cands = body["candidates"]
    assert cands["row"] == list(range(2, 11))
    assert cands["label"][1] == "Beta-Anker" and cands["group"][1] == "X"
    assert cands["slice"][7] == "s2"
    assert cands["attributes"]["pos"][5] is None
    assert cands["attributes"]["n_rows"][0] == 20


def test_gzip(client):
    res = client.post("/bundles/mini/neighbors", json={"k": 50}, headers={"Accept-Encoding": "gzip"})
    assert res.status_code == 200  # Antwort hier zu klein für Kompression; Middleware darf nicht stören


def test_cache_reloads_changed_bundle(bundle_dir, client):
    assert "Stop" not in labels(client)
    path = bundle_dir / "mini.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    data["meta"]["neighbor_space"]["stopwords"] = []
    path.write_text(json.dumps(data), encoding="utf-8")
    stat = path.stat()
    os.utime(path, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000))
    assert "Stop" in labels(client)
