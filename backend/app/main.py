"""FastAPI-Einstiegspunkt für das Vektor-Viz-Backend.

Serving-Layer für statische Bundles (siehe specs.md §3). Reine UI-Interaktion
(Slider, Hover, Trajektorien) geht nie hierher – nur Bundle-Laden und
On-demand-Operationen: Nachbarabfragen mit Filtern (`neighbors.py`), später
ggf. Re-Projektion.
"""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from .bundles import router as bundles_router
from .neighbors import router as neighbors_router

app = FastAPI(
    title="pdl-lt-vsv API",
    version="0.1.0",
    description="Serving-Layer für diachrone Vektor-Bundles.",
)

# Dev: Vite läuft auf 5173 und proxyt /bundles hierher; für den direkten Zugriff
# (z.B. curl, andere Origins) trotzdem CORS offen halten. Per Env einschränkbar.
_origins = os.environ.get("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
# Nachbarlisten mit k = 1000 sind mehrere MB JSON; komprimiert ein Bruchteil.
# Stufe 5 statt der Voreinstellung 9: bei 3,6 MB 86 statt 394 ms, Ergebnis
# praktisch gleich groß (1,22 gegen 1,21 MB, gemessen 2026-10-06).
app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=5)

app.include_router(bundles_router)
app.include_router(neighbors_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
