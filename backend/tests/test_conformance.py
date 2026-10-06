"""Konformitätstest (SCHEMA.md, „Konsistenz mit `neighbors`“).

Für jedes ausgelieferte Bundle mit `meta.neighbor_space` muss eine Abfrage mit
den Voreinstellungen und k = Länge der mitgelieferten Listen genau die
mitgelieferten `neighbors` ergeben: Labels, Reihenfolge, Scores. Die Pipeline
rechnet diese Listen, das Backend rechnet nach derselben Regel; weichen beide
voneinander ab, schlägt dieser Test an. Bundles ohne Suchraum werden
übersprungen.
"""

from __future__ import annotations

import json

import pytest

from app import bundles, neighbors

BUNDLE_PATHS = sorted(bundles.BUNDLES_DIR.glob("*.json"))


@pytest.mark.parametrize("path", BUNDLE_PATHS, ids=[p.stem for p in BUNDLE_PATHS])
def test_shipped_neighbors_match_default_query(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    if "neighbor_space" not in (data.get("meta") or {}):
        pytest.skip("kein Suchraum")
    neighbors._cache.clear()
    space = neighbors.get_space(path.stem)
    shipped = data["neighbors"]
    k = max(len(lst) for per in shipped.values() for lst in per.values())

    result = neighbors.query_neighbors(space, k, {}, space.stopwords)

    mismatches = []
    for entity_id, per_slice in shipped.items():
        for slice_id, expected in per_slice.items():
            hit = result[entity_id][slice_id]
            got = neighbors.neighbor_entries(space, hit["rows"], hit["scores"])
            if got != expected:
                mismatches.append(f"{entity_id}/{slice_id}")
    assert set(result) == set(shipped)
    assert not mismatches, f"{len(mismatches)} Listen weichen ab, z. B. {mismatches[:5]}"
