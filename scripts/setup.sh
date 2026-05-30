#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Brand Architect AI Pro — First-Time Local Setup
# Run once before starting development for the first time.
# Usage: bash scripts/setup.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC}  $1"; }
err()  { echo -e "${RED}✗${NC} $1"; exit 1; }
step() { echo -e "\n${YELLOW}──${NC} $1"; }

echo ""
echo "  Brand Architect AI Pro — Local Setup"
echo "  ======================================"
echo ""

# ── Prerequisites check ───────────────────────────────────────────────────────

step "Checking prerequisites..."

# Node.js
if ! command -v node &>/dev/null; then
  err "Node.js not found. Install Node.js 20+ from https://nodejs.org"
fi
NODE_VER=$(node -e "console.log(process.version.slice(1).split('.')[0])")
if [ "$NODE_VER" -lt 20 ]; then
  err "Node.js $NODE_VER found but 20+ required. Update at https://nodejs.org"
fi
ok "Node.js $(node -v)"

# pnpm
if ! command -v pnpm &>/dev/null; then
  warn "pnpm not found — installing globally..."
  npm install -g pnpm@latest
fi
ok "pnpm $(pnpm -v)"

# Python
if ! command -v python3 &>/dev/null; then
  err "Python 3 not found. Install Python 3.11+ from https://python.org"
fi
PY_VER=$(python3 -c "import sys; print(sys.version_info.minor)" 2>/dev/null || echo "0")
PY_MAJOR=$(python3 -c "import sys; print(sys.version_info.major)" 2>/dev/null || echo "0")
if [ "$PY_MAJOR" -lt 3 ] || [ "$PY_VER" -lt 11 ]; then
  warn "Python $(python3 --version) found. Python 3.11+ is recommended."
else
  ok "$(python3 --version)"
fi

# pip
if ! command -v pip3 &>/dev/null && ! python3 -m pip --version &>/dev/null; then
  err "pip not found. Install pip: python3 -m ensurepip"
fi
ok "pip available"

# ── Environment file ──────────────────────────────────────────────────────────

step "Setting up environment..."

if [ ! -f ".env" ]; then
  cp .env.example .env
  warn ".env created from .env.example"
  echo ""
  echo "  Please edit .env and set the following required values:"
  echo "    DATABASE_URL   — your PostgreSQL connection string"
  echo "    AUTH_JWT_SECRET — any long random string"
  echo "    OPENAI_API_KEY  — your OpenAI key (or add via Admin → API Keys)"
  echo ""
  echo "  Then re-run: bash scripts/setup.sh"
  exit 0
else
  ok ".env file found"
fi

# Check required vars
source_env() {
  set -a
  # shellcheck disable=SC1091
  [ -f ".env" ] && source .env
  set +a
}
source_env

if [ -z "${DATABASE_URL:-}" ]; then
  err "DATABASE_URL is not set in .env"
fi
if [ -z "${AUTH_JWT_SECRET:-}" ] || [ "${AUTH_JWT_SECRET}" = "change-me-to-a-long-random-secret-string-here" ]; then
  err "AUTH_JWT_SECRET is not set (or still the placeholder). Set a real random value."
fi
ok "Required env vars present"

# ── Node.js dependencies ──────────────────────────────────────────────────────

step "Installing Node.js dependencies..."
pnpm install --frozen-lockfile
ok "Node.js dependencies installed"

# ── Python dependencies ───────────────────────────────────────────────────────

step "Installing Python dependencies..."
pip3 install -r artifacts/api-server-python/requirements.txt -q
ok "Python dependencies installed"

# ── Database setup ────────────────────────────────────────────────────────────

step "Setting up database tables..."
cd artifacts/api-server-python
python3 - <<'PYEOF'
import os, sys

# Load env from project root
root = os.path.join(os.path.dirname(os.path.abspath(".")), "")
env_path = os.path.join(os.getcwd(), "../../.env")
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())

try:
    from app.models import Base
    from app.database import engine
    Base.metadata.create_all(engine)
    print("  Database tables created/verified OK")
except Exception as e:
    print(f"  Error: {e}")
    print("  Check that DATABASE_URL is correct and PostgreSQL is running.")
    sys.exit(1)
PYEOF
cd ../..
ok "Database tables ready"

# ── Done ──────────────────────────────────────────────────────────────────────

echo ""
echo -e "  ${GREEN}Setup complete!${NC}"
echo ""
echo "  Start the dev server:"
echo "    bash scripts/dev.sh"
echo ""
echo "  Then open:"
echo "    http://localhost:5000  — Frontend"
echo "    http://localhost:8080/api/docs  — API Docs (Swagger)"
echo ""
echo "  First login creates your admin account."
echo "  Add AI keys: Admin → API Keys in the sidebar."
echo ""
