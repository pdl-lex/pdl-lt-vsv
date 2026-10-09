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
import threading
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
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


# Übersicht je Datei, gültig solange Änderungszeit und Größe gleich bleiben.
# Ohne Cache würde jeder Aufruf der Liste alle Bundles vollständig parsen.
_summary_cache: dict[Path, tuple[tuple[int, int], BundleSummary | None]] = {}
_summary_lock = threading.Lock()


def _cached_summary(path: Path) -> BundleSummary | None:
    try:
        stat = path.stat()
    except OSError:
        return None
    signature = (stat.st_mtime_ns, stat.st_size)
    with _summary_lock:
        hit = _summary_cache.get(path)
        if hit and hit[0] == signature:
            return hit[1]
    summary = _summarize(path)
    with _summary_lock:
        _summary_cache[path] = (signature, summary)
    return summary


@router.get("", response_model=list[BundleSummary])
def list_bundles() -> list[BundleSummary]:
    """Alle im BUNDLES_DIR gefundenen, lesbaren Bundles als Übersicht."""
    if not BUNDLES_DIR.is_dir():
        return []
    paths = sorted(BUNDLES_DIR.glob("*.json"))
    with _summary_lock:
        # Gelöschte Dateien nicht ewig im Cache halten
        for gone in set(_summary_cache) - set(paths):
            del _summary_cache[gone]
    return [s for s in (_cached_summary(p) for p in paths) if s is not None]


@router.get("/{bundle_id}")
def get_bundle(bundle_id: str) -> FileResponse:
    """Liefert die Roh-JSON eines Bundles unverändert aus.

    Echter Passthrough: die Datei wird gestreamt, nicht geparst und neu
    serialisiert — schneller, ohne Feldverlust, und ein Bundle mit Werten, die
    strenges JSON nicht kennt (etwa `NaN`), führt nicht zu einem 500 des
    Servers, sondern zu einer lesbaren Fehlermeldung beim Laden im Frontend.
    """
    path = _bundle_path(bundle_id)
    return FileResponse(path, media_type="application/json")
