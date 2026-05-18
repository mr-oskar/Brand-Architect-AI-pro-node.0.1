# Brand Architect AI Pro

> Full documentation: [`DOCUMENTATION.md`](./DOCUMENTATION.md)

## Stack

- pnpm workspace monorepo (Node 24, TypeScript 5.9)
- **Backend (active):** Python 3.11 + FastAPI + Uvicorn (`artifacts/api-server-python`) — port 8080
- **Backend (disabled):** Express 5 TypeScript (`artifacts/api-server`) — dev script is a no-op, do NOT enable
- Frontend: React 19 + Vite 7 SPA (`artifacts/brand-os`) — port 5000 (Replit webview)
- DB: PostgreSQL (Replit native) — schema via Drizzle ORM (TypeScript), read by SQLAlchemy (Python)
- AI: Replit AI Integrations (auto-set) + optional `OPENAI_API_KEY` / `GEMINI_API_KEY`
- Auth: HTTP-only cookie JWT (Python backend) — see `app/layers/auth.py`

## Python Backend — key files

```
artifacts/api-server-python/
  main.py                    ← entry point (uvicorn main:app)
  app/
    config.py                ← env var config (pydantic-settings)
    models.py                ← SQLAlchemy ORM (matches actual DB schema)
    schemas.py               ← Pydantic request/response schemas
    database.py              ← SQLAlchemy engine + SessionLocal
    deps.py                  ← FastAPI dependencies (auth, db)
    layers/
      auth.py                ← JWT + bcrypt auth (pluggable)
      credits.py             ← credit deduction/refund (disable: CREDITS_ENABLED=false)
      payments.py            ← Stripe stub (documented, not implemented)
    routes/
      auth.py / brands.py / campaigns.py / posts.py / dashboard.py / system.py
    services/
      ai/client.py           ← OpenAI/Gemini client resolver
      ai/brand_kit.py        ← brand kit generation
      ai/campaign.py         ← campaign generation
      ai/post.py             ← regenerate/variant/content
      ai/image.py            ← image generation (with logo/references)
      image_storage.py       ← local file storage for generated images
      job_store.py           ← in-memory background job tracker
  EXCLUDED_FEATURES.md       ← full list of excluded features + how to add them
```

## Configured env (Replit)

- `DATABASE_URL` — Replit Postgres (auto-set)
- `AUTH_JWT_SECRET` — JWT signing secret (set in Replit Secrets)
- `AI_INTEGRATIONS_OPENAI_API_KEY` — auto-set by Replit AI Integrations (primary AI provider)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — auto-set by Replit AI Integrations
- `OPENAI_API_KEY` — optional direct OpenAI key (overrides Replit proxy if set)
- `GEMINI_API_KEY` — optional Google Gemini fallback
- `CREDITS_ENABLED` — set to `false` to disable credit checking

## Workflows (active)

- `Python API Server` — `cd artifacts/api-server-python && uvicorn main:app --host 0.0.0.0 --port 8080 --reload` **(port 8080)**
- `Start application` — `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/brand-os run dev` **(port 5000, webview)**
- `artifacts/api-server: API Server` — disabled (dev script exits immediately — no-op)
- `artifacts/brand-os: web` — auto-managed by Replit artifact (harmless duplicate)

> **Critical:** Never run the TypeScript `API Server` alongside `Python API Server` — both target port 8080.

## Common commands

```bash
pnpm install                          # install workspace deps
pnpm --filter @workspace/db run push  # sync DB schema
pip install -r artifacts/api-server-python/requirements.txt  # Python deps
```

## Swagger / API Docs

Interactive API docs: `http://localhost:8080/api/docs` (Swagger UI)

## GitHub remote

- Origin: `https://github.com/mr-oskar/Brand-Architect-AI-pro-node.0.1`
- Push works directly from Replit Git pane (token stored in `~/.git-credentials`).

## Recent significant changes

- 2026-05-18 — **Python backend fully active:** Removed old docs (AGENTS.md, DEPLOYMENT.md, DEPLOYMENT.md, PYTHON_MIGRATION_PROMPT.md). Wrote comprehensive new DOCUMENTATION.md. Disabled TypeScript API Server dev script (no-op) to prevent port 8080 conflicts. AI provider resolves via Replit AI Integrations (auto-set keys). All 14 DB tables confirmed present.
- 2026-04-27 — **Nodes editor — Brand Kit node**: added a sixth node type `brandKit` to `/nodes`.
- 2026-04-27 — **Nodes editor — Settings + Style Extractor nodes, model picker.**
- 2026-04-27 — **Nodes editor — Krea-style redesign + model settings.**
- 2026-04-27 — **Nodes editor overhaul (`/nodes`):** sidebar, inspector, workspaces, zoom controls.
- 2026-04-26 — Added Krea-style Nodes visual editor at `/nodes`.
- 2026-04-26 — Fixed GitHub remote URL; configured persistent credential storage.
- 2026-04-26 — Unified error notification system (`apiError.ts`).

## User preferences

- Error messages to users: English only
- Arabic/RTL support maintained in frontend
- Admin panel removed from MVP scope (see EXCLUDED_FEATURES.md)
- Credits system: first registered user = admin (exempt from credits)
