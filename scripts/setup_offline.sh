#!/usr/bin/env bash
# Install pdl-lt-vsv (VSV backend + built frontend) so it runs later without
# internet access.
#
# Run as root on the analysis machine while it still has internet:
#
#   curl -LsSf https://raw.githubusercontent.com/pdl-lex/pdl-lt-vsv/main/scripts/setup_offline.sh \
#     | sudo bash -s -- <gruppe> [/opt]
#
# Same conventions as pdl-lt-vsv-pipeline/scripts/setup_offline.sh and
# zeitenwende-sgns/scripts/setup_offline.sh (same prefix, uv-managed Python
# under <prefix>/uv/python). Install both repos under the same prefix: the
# pipeline copies its bundles to ../pdl-lt-vsv/backend/bundles.
#
# Node is only needed to build the frontend. It is downloaded into a temp
# folder and removed afterwards; nothing of it stays on the machine.
# Safe to run again: it pulls, re-syncs and rebuilds.

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/pdl-lex/pdl-lt-vsv.git}"
NAME="pdl-lt-vsv"
NODE_MAJOR=22          # same as the Dockerfile (node:22-slim)
PYTHON_VERSION=3.14    # same as the Dockerfile (python:3.14-slim)
PORT=8077

GROUP="${1:?Aufruf: setup_offline.sh <gruppe> [prefix]}"
PREFIX="${2:-/opt}"
DEST="$PREFIX/$NAME"

[[ $EUID -eq 0 ]] || { echo "Bitte als root ausführen (sudo)." >&2; exit 1; }
getent group "$GROUP" >/dev/null || { echo "Gruppe '$GROUP' existiert nicht." >&2; exit 1; }
for cmd in git curl tar sha256sum; do
    command -v "$cmd" >/dev/null || { echo "'$cmd' fehlt." >&2; exit 1; }
done

# Python goes under the prefix (readable for all users), not into /root.
export UV_PYTHON_INSTALL_DIR="$PREFIX/uv/python"
export UV_PYTHON_PREFERENCE=only-managed
export UV_LINK_MODE=copy
unset UV_OFFLINE UV_NO_SYNC

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "==> uv"
if [[ ! -x /usr/local/bin/uv ]]; then
    curl -LsSf https://astral.sh/uv/install.sh \
        | env UV_INSTALL_DIR=/usr/local/bin UV_NO_MODIFY_PATH=1 sh
fi
UV=/usr/local/bin/uv

echo "==> Repo nach $DEST"
mkdir -p "$PREFIX"
if [[ -d "$DEST/.git" ]]; then
    git -C "$DEST" pull --ff-only
else
    git clone "$REPO_URL" "$DEST"
fi
git config --system --get-all safe.directory 2>/dev/null | grep -qxF "$DEST" \
    || git config --system --add safe.directory "$DEST"
git -C "$DEST" config core.sharedRepository group

echo "==> Backend (uv sync --locked, Python $PYTHON_VERSION)"
cd "$DEST/backend"
"$UV" sync --locked --python "$PYTHON_VERSION"

echo "==> Node $NODE_MAJOR (nur für den Build, temporär)"
case "$(uname -m)" in
    x86_64)  NODE_ARCH=x64 ;;
    aarch64) NODE_ARCH=arm64 ;;
    *) echo "Unbekannte Architektur: $(uname -m)" >&2; exit 1 ;;
esac
NODE_BASE="https://nodejs.org/dist/latest-v${NODE_MAJOR}.x"
curl -fsSL "$NODE_BASE/SHASUMS256.txt" -o "$TMP/SHASUMS256.txt"
NODE_TGZ="$(grep -oE "node-v[0-9.]+-linux-${NODE_ARCH}\.tar\.gz" "$TMP/SHASUMS256.txt" | head -n1)"
curl -fsSL "$NODE_BASE/$NODE_TGZ" -o "$TMP/$NODE_TGZ"
(cd "$TMP" && grep " $NODE_TGZ\$" SHASUMS256.txt | sha256sum -c --quiet -)
mkdir -p "$TMP/node"
tar -xzf "$TMP/$NODE_TGZ" -C "$TMP/node" --strip-components=1
export PATH="$TMP/node/bin:$PATH"
export npm_config_cache="$TMP/npm-cache"
echo "    $(node --version)"

echo "==> Frontend bauen (npm ci && npm run build)"
cd "$DEST/frontend"
npm ci --no-audit --no-fund
npm run build
rm -rf node_modules    # only needed for building; dist/ is self-contained

# Bundles from the pipeline land here (git-ignored).
mkdir -p "$DEST/backend/bundles"

echo "==> Offline-Test (Backend liefert Frontend aus)"
cd "$DEST/backend"
UV_OFFLINE=1 UV_NO_SYNC=1 FRONTEND_DIST="$DEST/frontend/dist" \
    "$UV" run uvicorn app.main:app --host 127.0.0.1 --port "$PORT" >"$TMP/uvicorn.log" 2>&1 &
SERVER_PID=$!
ok=""
for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then ok=1; break; fi
    sleep 1
done
if [[ -n "$ok" ]] && curl -fsS "http://127.0.0.1:$PORT/" | grep -qi "<html"; then
    echo "    ok  /health und Frontend unter /"
else
    echo "Offline-Test fehlgeschlagen:" >&2; cat "$TMP/uvicorn.log" >&2
    kill "$SERVER_PID" 2>/dev/null || true; exit 1
fi
kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true

"$UV" cache clean

echo "==> Rechte für Gruppe '$GROUP'"
chgrp -R "$GROUP" "$DEST"
chmod -R g+rwX "$DEST"
find "$DEST" -type d -exec chmod g+s {} +
chmod -R a+rX "$PREFIX/uv"

echo "==> /etc/profile.d/pdl-lt-vsv.sh"
cat > /etc/profile.d/pdl-lt-vsv.sh <<EOF
# pdl-lt-vsv: use the preinstalled environment, never go online
export UV_PYTHON_INSTALL_DIR="$PREFIX/uv/python"
export UV_PYTHON_PREFERENCE=only-managed
export UV_OFFLINE=1
export UV_NO_SYNC=1
export FRONTEND_DIST="$DEST/frontend/dist"
EOF

cat <<EOF

Fertig. Nächste Schritte:
  1. Neu einloggen (oder: source /etc/profile.d/pdl-lt-vsv.sh)
  2. Bundles nach $DEST/backend/bundles/ legen (JSON + .space_vectors.npy + .space_index.parquet),
     oder in pipeline_post.py den Kopier-Schalter setzen.
  3. cd $DEST/backend && uv run uvicorn app.main:app --port $PORT
     und im Browser http://localhost:$PORT öffnen
EOF
