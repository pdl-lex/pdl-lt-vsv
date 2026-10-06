"""Nachbarabfragen über den Suchraum eines Bundles (`meta.neighbor_space`).

Setzt den normativen Abschnitt „`meta.neighbor_space` – Suchraum für
Nachbarabfragen (Format 1)“ aus `data/test/SCHEMA.md` um. Das Modul kennt keine
Domäne und keine Pipeline: Welche Filter es gibt und mit welchen
Voreinstellungen, steht in der Deklaration des Bundles; wie sie wirken, legt das
Schema fest. Die Pipeline rechnet die mitgelieferten `neighbors` nach derselben
Regel, der Konformitätstest (`tests/test_conformance.py`) hält beide zusammen.

Zwei Endpunkte:
- `GET  /bundles/{id}/neighbor-space`: Filterdeklaration mit verfügbaren Werten,
  Stoppwörter und Kandidatentabelle (einmal je Bundle).
- `POST /bundles/{id}/neighbors`: Nachbarn aller Zielwörter und Zeitscheiben für
  die gewählten Filter, als Zeilennummern + Scores (Auflösung über die
  Kandidatentabelle im Frontend).
"""

from __future__ import annotations

import json
import os
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import polars as pl
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import bundles

SUPPORTED_FORMATS = {1}
FILTER_TYPES = {"categorical", "minimum", "exclude_if_true"}
# Gruppe für Nachbarn, die kein Anker sind (SCHEMA.md, Auswertung Schritt 5).
FALLBACK_GROUP = "KONTEXT"
# Obergrenze für k. Die Listenlänge im Frontend ist 1000 (nextsteps.md §2).
K_MAX = int(os.environ.get("NEIGHBORS_K_MAX", "1000"))
SCORE_DIGITS = 4

router = APIRouter(prefix="/bundles", tags=["neighbors"])


class SpaceError(Exception):
    """Suchraum vorhanden, aber nicht nutzbar (Format, Dateien, Spalten)."""


class SpaceMissing(Exception):
    """Bundle hat keinen Suchraum oder die Dateien fehlen."""


@dataclass
class FilterColumn:
    """Ein deklarierter Filter mit den Werten der Kandidaten (in Kandidatenreihenfolge)."""

    decl: dict[str, Any]
    column: str
    type: str
    values: np.ndarray
    is_null: np.ndarray
    # Originalwerte mit None, für die Auslieferung (Typen wie in der Datei)
    raw: list


@dataclass
class NeighborSpace:
    meta: dict[str, Any]
    # alle Vektoren, float64 (SCHEMA.md: gerechnet wird in float64, ohne erneute Normierung)
    vectors: np.ndarray
    query_rows: np.ndarray
    query_entity: np.ndarray
    query_slice: np.ndarray
    # Kandidaten in aufsteigender row-Reihenfolge; die Gleichstandsregel baut darauf
    cand_rows: np.ndarray
    cand_lemma: np.ndarray
    cand_slice: np.ndarray
    cand_coords: np.ndarray
    cand_label: list[str]
    cand_group: list[str]
    filters: dict[str, FilterColumn]
    stopwords: list[str]


# ---------------------------------------------------------------------------
# Laden und Prüfen
# ---------------------------------------------------------------------------


def _space_file(bundle_path: Path, name: Any) -> Path:
    """Dateiname aus der Deklaration → Pfad neben dem Bundle. Nur nackte Namen."""
    if not isinstance(name, str) or not name or name != Path(name).name or name in (".", ".."):
        raise SpaceError(f"Ungültiger Dateiname im Suchraum: {name!r}")
    path = bundle_path.parent / name
    if not path.is_file():
        raise SpaceMissing(f"Suchraum-Datei '{name}' fehlt.")
    return path


def _check_meta(ns: Any) -> None:
    if not isinstance(ns, dict):
        raise SpaceError("meta.neighbor_space ist kein Objekt.")
    if ns.get("format") not in SUPPORTED_FORMATS:
        raise SpaceError(f"Suchraum-Format {ns.get('format')!r} wird nicht unterstützt.")
    if ns.get("similarity") != "cosine":
        raise SpaceError(f"Ähnlichkeit {ns.get('similarity')!r} wird nicht unterstützt.")
    if not isinstance(ns.get("filters"), list) or not isinstance(ns.get("stopwords"), list):
        raise SpaceError("meta.neighbor_space braucht 'filters' und 'stopwords' als Listen.")
    seen: set[str] = set()
    for f in ns["filters"]:
        if not isinstance(f, dict) or not isinstance(f.get("column"), str):
            raise SpaceError(f"Ungültiger Filtereintrag: {f!r}")
        if f.get("type") not in FILTER_TYPES:
            raise SpaceError(f"Filtertyp {f.get('type')!r} wird nicht unterstützt.")
        if f["column"] in seen:
            raise SpaceError(f"Filterspalte '{f['column']}' doppelt deklariert.")
        seen.add(f["column"])


def _filter_column(decl: dict[str, Any], series: pl.Series) -> FilterColumn:
    kind = decl["type"]
    is_null = series.is_null().to_numpy()
    if kind == "categorical":
        if series.dtype != pl.Utf8:
            raise SpaceError(f"Spalte '{series.name}' (categorical) muss String sein.")
        values = series.fill_null("").to_numpy().astype(object)
    elif kind == "minimum":
        if not series.dtype.is_numeric():
            raise SpaceError(f"Spalte '{series.name}' (minimum) muss numerisch sein.")
        values = series.cast(pl.Float64).fill_null(0.0).to_numpy()
    else:  # exclude_if_true
        if series.dtype != pl.Boolean:
            raise SpaceError(f"Spalte '{series.name}' (exclude_if_true) muss Boolean sein.")
        values = series.fill_null(False).to_numpy()
    return FilterColumn(decl, series.name, kind, values, is_null, series.to_list())


def _load_space(bundle_path: Path) -> NeighborSpace:
    with bundle_path.open(encoding="utf-8") as fh:
        bundle = json.load(fh)
    ns = (bundle.get("meta") or {}).get("neighbor_space")
    if ns is None:
        raise SpaceMissing("Bundle hat keinen Suchraum (meta.neighbor_space).")
    _check_meta(ns)

    vectors = np.load(_space_file(bundle_path, ns.get("vectors")), allow_pickle=False)
    index = pl.read_parquet(_space_file(bundle_path, ns.get("index")))

    required = ["row", "role", "slice", "entity_id", "lemma", "coords_3d"]
    missing = [c for c in required + [f["column"] for f in ns["filters"]] if c not in index.columns]
    if missing:
        raise SpaceError(f"Spalten fehlen in der Indextabelle: {', '.join(missing)}")
    if vectors.dtype != np.float32 or vectors.ndim != 2 or len(vectors) != len(index):
        raise SpaceError("Vektormatrix passt nicht zur Indextabelle (float32, eine Zeile je Indexzeile).")
    if not (index["row"].to_numpy() == np.arange(len(index))).all():
        raise SpaceError("Spalte 'row' ist nicht lückenlos 0 … n−1 in Tabellenreihenfolge.")
    if not index["role"].is_in(["query", "candidate"]).all():
        raise SpaceError("Spalte 'role' erlaubt nur 'query' und 'candidate'.")

    queries = index.filter(pl.col("role") == "query")
    if queries["entity_id"].null_count() or queries["slice"].null_count():
        raise SpaceError("Abfragezeilen brauchen 'entity_id' und 'slice'.")
    if queries.select(["entity_id", "slice"]).is_duplicated().any():
        raise SpaceError("Mehrere Abfragezeilen für dasselbe Zielwort und dieselbe Zeitscheibe.")
    cands = index.filter(pl.col("role") == "candidate")

    anchor_by_lemma = {
        a["lemma"]: (a["label"], a["cluster"])
        for a in bundle.get("anchors") or []
        if isinstance(a, dict) and a.get("lemma")
    }
    cand_lemma = cands["lemma"].to_list()
    labels = [anchor_by_lemma.get(lemma, (lemma, FALLBACK_GROUP)) for lemma in cand_lemma]

    return NeighborSpace(
        meta=ns,
        vectors=vectors.astype(np.float64),
        query_rows=queries["row"].to_numpy().astype(np.int64),
        query_entity=queries["entity_id"].to_numpy().astype(object),
        query_slice=queries["slice"].to_numpy().astype(object),
        cand_rows=cands["row"].to_numpy().astype(np.int64),
        cand_lemma=np.array(cand_lemma, dtype=object),
        cand_slice=cands["slice"].to_numpy().astype(object),
        cand_coords=np.array(cands["coords_3d"].to_list(), dtype=np.float64).reshape(-1, 3),
        cand_label=[label for label, _ in labels],
        cand_group=[group for _, group in labels],
        filters={f["column"]: _filter_column(f, cands[f["column"]]) for f in ns["filters"]},
        stopwords=[str(w) for w in ns["stopwords"]],
    )


_cache: dict[Path, tuple[tuple, NeighborSpace]] = {}
_cache_lock = threading.Lock()


def _signature(bundle_path: Path, space: NeighborSpace | None) -> tuple:
    """Änderungszeiten von Bundle und (soweit bekannt) Suchraum-Dateien."""
    paths = [bundle_path]
    if space is not None:
        paths += [bundle_path.parent / space.meta["vectors"], bundle_path.parent / space.meta["index"]]
    return tuple(p.stat().st_mtime_ns if p.exists() else None for p in paths)


def get_space(bundle_id: str) -> NeighborSpace:
    """Suchraum eines Bundles, zwischengespeichert bis sich eine der Dateien ändert."""
    path = bundles._bundle_path(bundle_id)
    with _cache_lock:
        hit = _cache.get(path)
        if hit and hit[0] == _signature(path, hit[1]):
            return hit[1]
        try:
            space = _load_space(path)
        except SpaceMissing as err:
            raise HTTPException(status_code=404, detail=str(err)) from err
        except SpaceError as err:
            raise HTTPException(status_code=422, detail=str(err)) from err
        _cache[path] = (_signature(path, space), space)
        return space


# ---------------------------------------------------------------------------
# Auswertung (SCHEMA.md, „Auswertung einer Abfrage“)
# ---------------------------------------------------------------------------


def candidate_mask(space: NeighborSpace, filters: dict[str, Any], stopwords: list[str]) -> np.ndarray:
    """Kandidaten, die alle Filter und die Stoppwortliste passieren.

    `filters`: Spalte → Wert; fehlende Spalten bekommen ihren `default`, der
    Wert None heißt „Filter nicht aktiv“. Fehlende Attributwerte (null) lassen
    den Kandidaten immer durch. Wirft ValueError bei unzulässigen Angaben.
    """
    unknown = sorted(set(filters) - set(space.filters))
    if unknown:
        raise ValueError(f"Unbekannte Filterspalten: {', '.join(unknown)}")

    mask = np.ones(len(space.cand_rows), dtype=bool)
    for column, fc in space.filters.items():
        value = filters[column] if column in filters else fc.decl.get("default")
        if value is None:
            continue
        if fc.type == "categorical":
            if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
                raise ValueError(f"Filter '{column}': Liste von Strings erwartet.")
            passes = np.isin(fc.values, np.array(value, dtype=object))
        elif fc.type == "minimum":
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise ValueError(f"Filter '{column}': Zahl erwartet.")
            passes = fc.values >= value
        else:  # exclude_if_true
            if not isinstance(value, bool):
                raise ValueError(f"Filter '{column}': true/false erwartet.")
            if not value:
                continue
            passes = ~fc.values
        mask &= passes | fc.is_null
    if stopwords:
        mask &= ~np.isin(space.cand_lemma, np.array(stopwords, dtype=object))
    return mask


def _top_k(scores: np.ndarray, k: int) -> np.ndarray:
    """Positionen der besten k: Score absteigend, bei Gleichstand Position aufsteigend.

    `argpartition` allein schneidet Gleichstände an der Grenze k willkürlich ab;
    deshalb werden alle Werte ≥ dem k-ten Wert genommen und stabil sortiert.
    Die Positionen sind aufsteigend nach `row`, also gilt die Regel des Schemas.
    """
    n = len(scores)
    if n <= k:
        return np.argsort(-scores, kind="stable")
    part = np.argpartition(-scores, k - 1)[:k]
    threshold = scores[part].min()
    selected = np.flatnonzero(scores >= threshold)
    return selected[np.argsort(-scores[selected], kind="stable")][:k]


def query_neighbors(
    space: NeighborSpace, k: int, filters: dict[str, Any], stopwords: list[str],
    mask: np.ndarray | None = None,
) -> dict[str, dict[str, dict[str, list]]]:
    """Nachbarn aller Abfragen: entity_id → slice → {rows, scores}."""
    if mask is None:
        mask = candidate_mask(space, filters, stopwords)
    cand_null_slice = np.array([s is None for s in space.cand_slice], dtype=bool)
    result: dict[str, dict[str, dict[str, list]]] = {}

    for slice_id in dict.fromkeys(space.query_slice):
        eligible = np.flatnonzero(mask & (cand_null_slice | (space.cand_slice == slice_id)))
        q_pos = np.flatnonzero(space.query_slice == slice_id)
        if len(eligible) == 0:
            sims = np.empty((len(q_pos), 0))
        else:
            sims = space.vectors[space.query_rows[q_pos]] @ space.vectors[space.cand_rows[eligible]].T
        for i, qp in enumerate(q_pos):
            top = _top_k(sims[i], k)
            result.setdefault(space.query_entity[qp], {})[slice_id] = {
                "rows": space.cand_rows[eligible[top]].tolist(),
                # gerundet erst nach dem Sortieren, korrekt gerundet wie round(x, 4)
                "scores": [round(float(s), SCORE_DIGITS) for s in sims[i][top]],
            }
    return result


def neighbor_entries(space: NeighborSpace, rows: list[int], scores: list[float]) -> list[dict]:
    """Zeilennummern + Scores → Einträge im Format von `neighbors` (für Tests und Rückfall)."""
    pos = np.searchsorted(space.cand_rows, rows)
    return [
        {"label": space.cand_label[p], "score": s, "group": space.cand_group[p]}
        for p, s in zip(pos.tolist(), scores)
    ]


# ---------------------------------------------------------------------------
# Endpunkte
# ---------------------------------------------------------------------------


def _filter_info(fc: FilterColumn) -> dict[str, Any]:
    info = {k: v for k, v in fc.decl.items()}
    present = ~fc.is_null
    info["null_count"] = int(fc.is_null.sum())
    if fc.type == "categorical":
        values, counts = np.unique(fc.values[present].astype(str), return_counts=True)
        order = np.lexsort((values, -counts))
        info["values"] = [{"value": str(values[i]), "count": int(counts[i])} for i in order]
    elif fc.type == "minimum":
        vals = [v for v in fc.raw if v is not None]
        info["min"] = min(vals) if vals else None
        info["max"] = max(vals) if vals else None
    else:
        info["count_true"] = int((fc.values & present).sum())
    return info


@router.get("/{bundle_id}/neighbor-space")
def get_neighbor_space(bundle_id: str) -> JSONResponse:
    """Filterdeklaration mit verfügbaren Werten, Stoppwörter und Kandidatentabelle.

    Die Kandidatentabelle ist spaltenweise (eine Liste je Feld, gleiche Länge),
    damit die Antwort bei ~30.000 Kandidaten klein bleibt. Bei SGNS kommt
    `slice` dazu; die Filterattribute stehen unter `attributes`.
    """
    space = get_space(bundle_id)
    candidates: dict[str, Any] = {
        "row": space.cand_rows.tolist(),
        "lemma": space.cand_lemma.tolist(),
        "label": space.cand_label,
        "group": space.cand_group,
        "coords_3d": np.round(space.cand_coords, 4).tolist(),
        "attributes": {col: fc.raw for col, fc in space.filters.items()},
    }
    if any(s is not None for s in space.cand_slice):
        candidates["slice"] = space.cand_slice.tolist()
    # JSONResponse direkt: FastAPIs jsonable_encoder bräuchte für große Antworten
    # ein Mehrfaches der eigentlichen Rechenzeit (wie bei GET /bundles/{id}).
    return JSONResponse({
        "format": space.meta["format"],
        "neighbor_kind": space.meta.get("neighbor_kind"),
        "similarity": space.meta["similarity"],
        "k_max": K_MAX,
        "filters": [_filter_info(fc) for fc in space.filters.values()],
        "stopwords": space.stopwords,
        "candidates": candidates,
    })


class NeighborQuery(BaseModel):
    k: int = Field(ge=1, le=K_MAX)
    # Spalte → Wert; fehlende Spalten = Voreinstellung, None = Filter aus
    filters: dict[str, Any] = {}
    # None = mitgelieferte Liste
    stopwords: list[str] | None = None


@router.post("/{bundle_id}/neighbors")
def post_neighbors(bundle_id: str, query: NeighborQuery) -> JSONResponse:
    """Nachbarn aller Zielwörter und Zeitscheiben in einer Antwort.

    Alle Zeitscheiben auf einmal, weil der Nachbarschafts-Fluss sie braucht und
    das Scrubben auf der Zeitachse lokal bleiben muss (specs.md §3).
    """
    space = get_space(bundle_id)
    stopwords = space.stopwords if query.stopwords is None else query.stopwords
    try:
        mask = candidate_mask(space, query.filters, stopwords)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    neighbors = query_neighbors(space, query.k, query.filters, stopwords, mask)
    # Kandidaten nach Filtern und Stoppwörtern (vor der Zeitscheiben-Regel),
    # als Rückmeldung für die Filterseite — so muss das Frontend die Regeln
    # nicht selbst nachbauen.
    return JSONResponse({
        "k": query.k,
        "n_candidates": int(mask.sum()),
        "n_candidates_total": len(space.cand_rows),
        # dieselben Kandidaten als Zeilen (`candidates.row`), z.B. für die
        # Wortwolke auf der Filterseite
        "kept_rows": space.cand_rows[mask].tolist(),
        "neighbors": neighbors,
    })
