#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Brand Architect AI Pro — Local Development Server
# Starts both the Python API backend (port 8080) and React frontend (port 5000).
#
# Prerequisites: run scripts/setup.sh first.
# Usage:         bash scripts/dev.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC}  $1"; }
err()  { echo -e "${RED}✗${NC} $1"; exit 1; }

# ── Load .env from project root ───────────────────────────────────────────────
if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
  ok "Loaded .env"
else
  warn ".env not found — run scripts/setup.sh first"
  warn "Continuing with environment variables already set in shell..."
fi

# ── Validate required vars ────────────────────────────────────────────────────
if [ -z "${DATABASE_URL:-}" ]; then
  err "DATABASE_URL is not set. Edit .env or run scripts/setup.sh"
fi

# ── Cleanup on exit ───────────────────────────────────────────────────────────
PYTHON_PID=""
cleanup() {
  echo ""
  echo "Shutting down..."
  if [ -n "$PYTHON_PID" ] && kill -0 "$PYTHON_PID" 2>/dev/null; then
    kill "$PYTHON_PID" 2>/dev/null
    wait "$PYTHON_PID" 2>/dev/null || true
    ok "Python API server stopped"
  fi
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# ── Print startup banner ──────────────────────────────────────────────────────
echo ""
echo "  Brand Architect AI Pro — Development Mode"
echo "  ─────────────────────────────────────────"
echo "  Frontend   →  http://localhost:5000"
echo "  Backend    →  http://localhost:8080"
echo "  API Docs   →  http://localhost:8080/api/docs"
echo ""
echo "  Press Ctrl+C to stop both servers."
echo ""

# ── Start Python API backend (background) ────────────────────────────────────
echo "Starting Python API server..."
(
  cd artifacts/api-server-python
  python3 -m uvicorn main:app \
    --host 0.0.0.0 \
    --port 8080 \
    --reload \
    --reload-dir app \
    --log-level info
) &
PYTHON_PID=$!
ok "Python API server started (PID: $PYTHON_PID)"

# Give the backend a moment to start before the frontend proxy needs it
sleep 1

# ── Start React frontend (foreground) ─────────────────────────────────────────
echo "Starting React frontend..."
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/brand-os run dev
