"""Bundle-Discovery und -Auslieferung.

Der Server ist bewusst ein reiner Precompute-/Serving-Layer (siehe specs.md §3):
er scannt ein Verzeichnis nach Bundle-JSONs im vereinbarten Schema, listet deren
Metadaten und liefert die Rohdaten aus. Schwere Berechnung (PCA/Re-Projektion)
ist hier noch nicht angesiedelt, der Endpoint ist aber der spätere Ansatzpunkt
dafür, ohne dass das Frontend umgebaut werden muss.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# Standard: <repo>/backend/bundles, überschreibbar per Env für andere Datenquellen.
BUNDLES_DIR = Path(os.environ.get("BUNDLES_DIR", Path(__file__).resolve().parent.parent / "bundles"))

router = APIRouter(prefix="/bundles", tags=["bundles"])


class BundleSummary(BaseModel):
    """Leichtgewichtige Übersicht für den Bundle-Picker – lädt NICHT die Vektoren."""

    id: str
    name: str
    description: str = ""
    vector_dim: int | None = None
    projection: str | None = None
    shift_point: str | None = None
    entities: int = 0
    time_slices: int = 0
    facets: list[str] = []
    records: int = 0


def _bundle_path(bundle_id: str) -> Path:
    """Löst eine Bundle-ID auf einen Dateipfad auf und wehrt Path-Traversal ab."""
    # Nur der nackte Dateiname ist erlaubt – kein "/", kein "..".
    if bundle_id != Path(bundle_id).name:
        raise HTTPException(status_code=400, detail="Ungültige Bundle-ID.")
    path = (BUNDLES_DIR / f"{bundle_id}.json").resolve()
    if BUNDLES_DIR.resolve() not in path.parents:
        raise HTTPException(status_code=400, detail="Ungültige Bundle-ID.")
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"Bundle '{bundle_id}' nicht gefunden.")
    return path


def _summarize(path: Path) -> BundleSummary | None:
    """Liest ein Bundle und extrahiert nur die Übersichtsfelder. None bei Defekt."""
    try:
        with path.open(encoding="utf-8") as fh:
            data = json.load(fh)
    except (json.JSONDecodeError, OSError):
        return None
    if not isinstance(data, dict):
        return None
    meta = data.get("meta") or {}
    facets_schema = data.get("facets_schema") or []
    return BundleSummary(
        id=path.stem,
        name=meta.get("name", path.stem),
        description=meta.get("description", ""),
        vector_dim=meta.get("vector_dim"),
        projection=meta.get("projection"),
        shift_point=meta.get("shift_point"),
        entities=len(data.get("entities") or []),
        time_slices=len(data.get("time_slices") or []),
        facets=[f.get("id") for f in facets_schema if isinstance(f, dict) and f.get("id")],
        records=len(data.get("records") or []),
    )


@lru_cache(maxsize=1)
def _list_dir_signature() -> tuple:
    """Verzeichnis-Signatur (Datei + mtime) für simples Caching der Liste."""
    files = sorted(BUNDLES_DIR.glob("*.json"))
    return tuple((p.name, p.stat().st_mtime) for p in files)


@router.get("", response_model=list[BundleSummary])
def list_bundles() -> list[BundleSummary]:
    """Alle im BUNDLES_DIR gefundenen, lesbaren Bundles als Übersicht."""
    if not BUNDLES_DIR.is_dir():
        return []
    summaries: list[BundleSummary] = []
    for path in sorted(BUNDLES_DIR.glob("*.json")):
        summary = _summarize(path)
        if summary is not None:
            summaries.append(summary)
    return summaries


@router.get("/{bundle_id}")
def get_bundle(bundle_id: str) -> JSONResponse:
    """Liefert die Roh-JSON eines Bundles unverändert aus.

    Bewusst als Passthrough (kein Re-Serialisieren über Pydantic), damit große
    Bundles ohne Kopieraufwand und ohne Feldverlust ausgeliefert werden.
    """
    path = _bundle_path(bundle_id)
    with path.open(encoding="utf-8") as fh:
        data = json.load(fh)
    return JSONResponse(content=data)
