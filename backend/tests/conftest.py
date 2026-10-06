"""Synthetisches Bundle mit Suchraum, klein genug, um jede Regel aus SCHEMA.md
(`meta.neighbor_space`) einzeln nachzuprüfen.

Vektoren in 2D, damit die Kosinuswerte im Kopf nachvollziehbar sind:

    row  rolle      lemma  slice  pos    n_rows  Redner  Vektor      Zweck
    0    query      a/s1   s1                            (1, 0)
    1    query      a/s2   s2                            (0, 1)
    2    candidate  Alpha  -      NOUN   20      nein    (1, 0)
    3    candidate  Beta   -      NOUN   20      nein    (0.8, 0.6)  Anker, Gleichstand mit Gamma
    4    candidate  Gamma  -      VERB   20      nein    (0.8, 0.6)
    5    candidate  Delta  -      PROPN  20      ja      (0.6, 0.8)  Rednername
    6    candidate  Eps    -      NOUN   2       nein    (0.6, 0.8)  unter Mindestbelegung
    7    candidate  Zeta   -      null   20      nein    (0, 1)      Wortart fehlt
    8    candidate  Eta    -      ADV    20      nein    (-1, 0)     Wortart nicht erlaubt
    9    candidate  Theta  s2     NOUN   20      nein    (0, 1)      nur Zeitscheibe s2
    10   candidate  Stop   -      NOUN   20      nein    (1, 0)      Stoppwort
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import polars as pl
import pytest
from fastapi.testclient import TestClient

from app import bundles, neighbors
from app.main import app

CANDIDATES = [
    # lemma, slice, pos, n_rows, is_speaker_name, vector
    ("Alpha", None, "NOUN", 20, False, (1.0, 0.0)),
    ("Beta", None, "NOUN", 20, False, (0.8, 0.6)),
    ("Gamma", None, "VERB", 20, False, (0.8, 0.6)),
    ("Delta", None, "PROPN", 20, True, (0.6, 0.8)),
    ("Eps", None, "NOUN", 2, False, (0.6, 0.8)),
    ("Zeta", None, None, 20, False, (0.0, 1.0)),
    ("Eta", None, "ADV", 20, False, (-1.0, 0.0)),
    ("Theta", "s2", "NOUN", 20, False, (0.0, 1.0)),
    ("Stop", None, "NOUN", 20, False, (1.0, 0.0)),
]

NEIGHBOR_SPACE = {
    "format": 1,
    "vectors": "mini.vectors.npy",
    "index": "mini.index.parquet",
    "neighbor_kind": "context",
    "similarity": "cosine",
    "filters": [
        {"column": "pos", "type": "categorical", "label": "Wortart",
         "default": ["NOUN", "PROPN", "VERB"]},
        {"column": "n_rows", "type": "minimum", "label": "Mindestbelegung", "default": 10},
        {"column": "is_speaker_name", "type": "exclude_if_true",
         "label": "Rednernamen ausblenden", "default": True},
    ],
    "stopwords": ["Stop"],
}

# Ergebnis mit den Voreinstellungen, von Hand hergeleitet (s. Tabelle oben)
DEFAULT_NEIGHBORS = {
    "a": {
        "s1": [
            {"label": "Alpha", "score": 1.0, "group": "KONTEXT"},
            {"label": "Beta-Anker", "score": 0.8, "group": "X"},
            {"label": "Gamma", "score": 0.8, "group": "KONTEXT"},
            {"label": "Zeta", "score": 0.0, "group": "KONTEXT"},
        ],
        "s2": [
            {"label": "Zeta", "score": 1.0, "group": "KONTEXT"},
            {"label": "Theta", "score": 1.0, "group": "KONTEXT"},
            {"label": "Beta-Anker", "score": 0.6, "group": "X"},
            {"label": "Gamma", "score": 0.6, "group": "KONTEXT"},
            {"label": "Alpha", "score": 0.0, "group": "KONTEXT"},
        ],
    }
}


def write_bundle(directory: Path, name: str = "mini", neighbor_space: dict | None = None) -> Path:
    """Schreibt Bundle-JSON, Vektoren und Index nach `directory`."""
    ns = dict(NEIGHBOR_SPACE if neighbor_space is None else neighbor_space)
    vectors = [(1.0, 0.0), (0.0, 1.0)] + [c[5] for c in CANDIDATES]
    np.save(directory / "mini.vectors.npy", np.array(vectors, dtype=np.float32))
    index = pl.DataFrame(
        {
            "row": list(range(len(vectors))),
            "role": ["query", "query"] + ["candidate"] * len(CANDIDATES),
            "slice": ["s1", "s2"] + [c[1] for c in CANDIDATES],
            "entity_id": ["a", "a"] + [None] * len(CANDIDATES),
            "lemma": ["a", "a"] + [c[0] for c in CANDIDATES],
            "coords_3d": [[0.0, 0.0, 0.0]] * len(vectors),
            "pos": [None, None] + [c[2] for c in CANDIDATES],
            "n_rows": [None, None] + [c[3] for c in CANDIDATES],
            "is_speaker_name": [None, None] + [c[4] for c in CANDIDATES],
        },
        schema_overrides={"row": pl.UInt32, "n_rows": pl.UInt32},
    )
    index.write_parquet(directory / "mini.index.parquet")
    bundle = {
        "meta": {"name": name, "neighbor_space": ns},
        "facets_schema": [],
        "entities": [{"id": "a", "label": "a"}],
        "time_slices": [{"id": "s1", "label": "s1", "index": 0}, {"id": "s2", "label": "s2", "index": 1}],
        "anchors": [{"label": "Beta-Anker", "cluster": "X", "lemma": "Beta",
                     "coords_3d": [0, 0, 0]}],
        "records": [],
        "aggregates": [],
        "neighbors": DEFAULT_NEIGHBORS,
    }
    path = directory / f"{name}.json"
    path.write_text(json.dumps(bundle), encoding="utf-8")
    return path


@pytest.fixture
def bundle_dir(tmp_path, monkeypatch) -> Path:
    monkeypatch.setattr(bundles, "BUNDLES_DIR", tmp_path)
    neighbors._cache.clear()
    write_bundle(tmp_path)
    yield tmp_path
    neighbors._cache.clear()


@pytest.fixture
def client(bundle_dir) -> TestClient:
    return TestClient(app)
