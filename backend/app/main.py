"""FastAPI-Einstiegspunkt für das Vektor-Viz-Backend.

Serving-Layer für statische Bundles (siehe specs.md §3). Reine UI-Interaktion
(Slider, Hover, Trajektorien) geht nie hierher – nur Bundle-Laden und später
teure On-demand-Operationen (Re-Projektion, dynamische NN).
"""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .bundles import router as bundles_router

app = FastAPI(
    title="pdl-lt-vectorviz API",
    version="0.1.0",
    description="Serving-Layer für diachrone Vektor-Bundles.",
)

# Dev: Vite läuft auf 5173 und proxyt /bundles hierher; für den direkten Zugriff
# (z.B. curl, andere Origins) trotzdem CORS offen halten. Per Env einschränkbar.
_origins = os.environ.get("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins],
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(bundles_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
