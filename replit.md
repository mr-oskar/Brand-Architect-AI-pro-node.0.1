# Brand Architect AI Pro

> Full documentation: [`DOCUMENTATION.md`](./DOCUMENTATION.md)

## Stack

- pnpm workspace monorepo (Node 24, TypeScript 5.9)
- **Backend:** Python 3.11 + FastAPI + Uvicorn (`artifacts/api-server-python`) — port 8080
- Frontend: React 19 + Vite 7 SPA (`artifacts/brand-os`) — port 5000 (Replit webview)
- DB: PostgreSQL (Replit native) — schema via Drizzle ORM (TypeScript), read by SQLAlchemy (Python)
- AI: Replit AI Integrations (auto-set) + optional `OPENAI_API_KEY` / `GEMINI_API_KEY`
- Auth: JWT via HTTP-only cookie + localStorage (Python backend) — see `app/layers/auth.py`

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
      ai/brand_kit.py        ← brand kit + brand story generation
      ai/campaign.py         ← campaign generation
      ai/post.py             ← regenerate/variant/long-form content
      ai/image.py            ← image generation (with logo/references)
      image_storage.py       ← local file storage for generated images
      job_store.py           ← in-memory background job tracker
      logo_processor.py      ← logo variants (black/white/grayscale) + color extraction
  EXCLUDED_FEATURES.md       ← full list of excluded features + how to add them
```

## API Endpoints (all under /api/)

### Auth
- `POST /auth/register` — register new user
- `POST /auth/login` — login
- `POST /auth/logout` — logout
- `GET  /auth/me` — get current user

### Brands
- `GET    /brands` — list brands (paginated)
- `POST   /brands` — create brand
- `GET    /brands/:id` — get brand
- `PATCH  /brands/:id` — update brand
- `DELETE /brands/:id` — delete brand
- `POST   /brands/:id/generate-kit` — generate brand kit
- `POST   /brands/:id/generate-logo-variants` — black/white/grayscale logo + colors
- `POST   /brands/:id/generate-story` — generate/regenerate brand story
- `POST   /brands/:id/generate-content` — long-form content (blog/email/newsletter)
- `GET    /brands/:id/stats` — aggregated stats
- `POST   /brands/:id/generate-campaign` — start async campaign generation (returns jobId)
- `POST   /brands/:id/campaign-brief-job` — full pipeline with step progress (returns jobId)
- `GET    /brands/:id/campaigns` — list campaigns for brand

### Campaigns & Posts
- `GET  /campaigns/:id` — get campaign + posts
- `POST /posts/campaigns/:campaign_id/generate-all-images` — bulk image generation (returns jobId)
- `GET  /posts/:id` — get post
- `PATCH /posts/:id` — update post
- `DELETE /posts/:id` — delete post
- `POST /posts/:id/generate-image` — generate image for post
- `POST /posts/:id/restore-image` — restore image from history
- `POST /posts/:id/regenerate` — regenerate post text
- `POST /posts/:id/generate-variant` — A/B variant of post
- `POST /posts/:id/generate-content` — long-form content from post hook

### System
- `GET /health` — health check
- `GET /public-settings` — public site settings
- `GET /jobs/:id` — poll background job status
- `GET /credit-costs` — current credit costs
- `GET /storage/images/objects/uploads/:id` — serve stored image

## Configured env (Replit)

- `DATABASE_URL` — Replit Postgres (auto-set)
- `AUTH_JWT_SECRET` — JWT signing secret (set in Replit Secrets)
- `AI_INTEGRATIONS_OPENAI_API_KEY` — auto-set by Replit AI Integrations (primary AI provider)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — auto-set by Replit AI Integrations
- `OPENAI_API_KEY` — optional direct OpenAI key (overrides Replit proxy if set)
- `GEMINI_API_KEY` — optional Google Gemini fallback
- `CREDITS_ENABLED` — set to `false` to disable credit checking

## Workflows (active)

- `Python API Server` — `cd artifacts/api-server-python && /home/runner/workspace/.pythonlibs/bin/uvicorn main:app --host 0.0.0.0 --port 8080 --reload` **(port 8080)**
- `Start application` — `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/brand-os run dev` **(port 5000, webview)**

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

- 2026-05-19 — **Deleted TypeScript/Express backend** (`artifacts/api-server`). Ported all missing features to Python: `generate-logo-variants`, `generate-story`, `brand-level generate-content`, `stats`, `campaign-brief-job`. Project is now single-backend (Python only).
- 2026-05-18 — **Python backend fully active.** AI provider resolves via Replit AI Integrations.
- 2026-04-27 — **Nodes editor — Brand Kit node**: added a sixth node type `brandKit` to `/nodes`.
- 2026-04-26 — Added Krea-style Nodes visual editor at `/nodes`.

## User preferences

- Error messages to users: English only
- Arabic/RTL support maintained in frontend
- Admin panel removed from MVP scope (see EXCLUDED_FEATURES.md)
- Credits system: first registered user = admin (exempt from credits)
