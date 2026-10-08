# ---- Stage 1: Frontend bauen (React + Vite) ----
FROM node:22-slim AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: Backend (FastAPI) + statisches Frontend ----
FROM python:3.14-slim
WORKDIR /app

# uv für Dependency-Management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Python-Dependencies (ohne Dev-Gruppe). --frozen: exakt der committete Lock.
# --no-install-project: der Quellcode ist noch nicht da, so bleibt der
# Dependency-Layer bei Code-Änderungen gecacht.
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --no-dev --frozen --no-install-project

COPY backend/app/ ./app/
RUN uv sync --no-dev --frozen

# Gebautes Frontend an den von main.py erwarteten Ort (backend/frontend/dist)
COPY --from=frontend /frontend/dist ./frontend/dist

# Die Bundles (JSON + vectors.npy + index.parquet) kommen NICHT ins Image,
# sondern zur Laufzeit als Volume unter /data/bundles (auf dem Server per
# Bind-Mount, analog zu den anderen Apps unter /wb/data/apps/pdl-lt-vsv/).
RUN mkdir -p /data/bundles
ENV BUNDLES_DIR=/data/bundles

EXPOSE 8000

# FastAPI liefert /bundles und /health sowie das Frontend unter / aus.
# uvicorn direkt aus dem venv: kein uv-Sync beim Container-Start.
CMD ["/app/.venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
