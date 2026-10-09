"""FastAPI-Einstiegspunkt für das VSV-Backend.

Serving-Layer für statische Bundles (siehe specs.md §3). Reine UI-Interaktion
(Slider, Hover, Trajektorien) geht nie hierher – nur Bundle-Laden und
On-demand-Operationen: Nachbarabfragen mit Filtern (`neighbors.py`), später
ggf. Re-Projektion.
"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .bundles import router as bundles_router
from .neighbors import router as neighbors_router

app = FastAPI(
    title="pdl-lt-vsv API",
    version="0.1.0",
    description="Serving-Layer für diachrone Vektor-Bundles.",
)

# CORS nur, wenn ausdrücklich gewünscht: Frontend und API liegen in Produktion
# unter derselben Origin, im Dev-Betrieb proxyt Vite; curl braucht kein CORS.
# Andere Origins per Env freigeben, z.B. CORS_ORIGINS=https://example.org.
_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
if _origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

# Obergrenze für Anfragekörper (POST /bundles/{id}/neighbors: Filter und
# Stoppwortliste). 2 MB reichen für rund 100.000 Stoppwörter.
MAX_BODY_BYTES = int(os.environ.get("MAX_BODY_BYTES", str(2 * 1024 * 1024)))


@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    """Zu große Anfragekörper abweisen, bevor sie gelesen und geparst werden.

    Ohne `Content-Length` ließe sich die Länge erst beim Lesen feststellen;
    Browser senden sie bei `fetch` mit Text-Body immer, also wird sie verlangt.
    """
    if request.method in ("POST", "PUT", "PATCH"):
        length = request.headers.get("content-length")
        if length is None:
            return JSONResponse({"detail": "Content-Length fehlt."}, status_code=411)
        if not length.isdigit() or int(length) > MAX_BODY_BYTES:
            return JSONResponse(
                {"detail": f"Anfrage zu groß (höchstens {MAX_BODY_BYTES} Bytes)."}, status_code=413
            )
    return await call_next(request)

# Nachbarlisten mit k = 1000 sind mehrere MB JSON; komprimiert ein Bruchteil.
# Stufe 5 statt der Voreinstellung 9: bei 3,6 MB 86 statt 394 ms, Ergebnis
# praktisch gleich groß (1,22 gegen 1,21 MB, gemessen 2026-10-06).
app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=5)

app.include_router(bundles_router)
app.include_router(neighbors_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# In Produktion liefert das Backend das gebaute Frontend unter / aus (gleiche
# Origin, kein eigener Webserver). Zuletzt gemountet, damit /bundles und /health
# Vorrang haben. Lokal (Vite-Dev-Server) existiert das Verzeichnis nicht.
_DIST = Path(os.environ.get("FRONTEND_DIST", Path(__file__).resolve().parent.parent / "frontend" / "dist"))
if _DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(_DIST), html=True), name="frontend")
