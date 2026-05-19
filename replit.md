# Brand Architect AI Pro

> Full documentation: [`DOCUMENTATION.md`](./DOCUMENTATION.md)

---

## AI Agent Quick-Start

**Read this section first before touching any file.**

### What this project is

Full-stack AI brand & marketing platform. Users create brand workspaces, generate brand identities via AI, build social media campaigns, and produce on-brand images.

### Two servers, always both running

| Workflow name | Command | Port | Role |
|---|---|---|---|
| `Python API Server` | `cd artifacts/api-server-python && uvicorn main:app --host 0.0.0.0 --port 8080 --reload` | **8080** | REST API + AI |
| `Start application` | `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/brand-os run dev` | **5000** | React frontend (webview) |

The frontend (`/api/*` requests) proxies to the backend via Vite config. Never run just one.

### Where to make changes

| Task | Files to edit |
|---|---|
| Add/change API endpoint | `artifacts/api-server-python/app/routes/*.py` |
| Change AI behavior | `artifacts/api-server-python/app/services/ai/*.py` |
| Add DB table | `artifacts/api-server-python/app/models.py` |
| Add HTTP middleware | `artifacts/api-server-python/app/middleware/` → register in `main.py` |
| Add shared backend util | `artifacts/api-server-python/app/utils/` |
| Change UI/page | `artifacts/brand-os/src/pages/*.tsx` |
| Change app layout | `artifacts/brand-os/src/components/Layout.tsx` |
| Add shared TypeScript type | `artifacts/brand-os/src/types/index.ts` |
| Add app-wide constant | `artifacts/brand-os/src/lib/constants.ts` |
| Add custom React hook | `artifacts/brand-os/src/hooks/` |
| Change API types | `lib/api-spec/openapi.yaml` → then run codegen |
| Change auth logic | `artifacts/api-server-python/app/layers/auth.py` |
| Change credit costs | `artifacts/api-server-python/app/layers/credits.py` |
| Add env variable | Read environment-secrets skill first |
| Full backend architecture | See `BACKEND_GUIDE.md` |
| Full frontend architecture | See `FRONTEND_GUIDE.md` |
| Track what changed | See `CHANGELOG.md` |

### Critical constraints — never break these

- `artifacts/brand-os/index.html` must keep `dir="ltr"` and `class="dark"` — the entire UI is dark mode only, always LTR
- `artifacts/brand-os/src/contexts/SiteSettingsContext.tsx` must keep `dir: "ltr"` hardcoded — do not restore any RTL logic
- Auth is custom JWT (python-jose + bcrypt). Do NOT replace with Replit Auth or any external provider
- The Python backend is the only backend. The TypeScript/Express backend was deleted in May 2026
- `artifacts/api-server-python/app/layers/payments.py` is an intentional documented stub — do not delete it

### Startup commands (if setting up fresh)

```bash
# Install JS deps
pnpm install

# Install Python deps
pip install -r artifacts/api-server-python/requirements.txt

# Create DB tables (run once — safe to re-run)
cd artifacts/api-server-python && python3 -c "
from app.models import Base
from app.database import engine
Base.metadata.create_all(engine)
print('Tables OK')
" && cd ../..
```

### Debugging tips

- API not responding → check `Python API Server` workflow logs
- Frontend blank → check `Start application` workflow logs  
- 401 errors → `AUTH_JWT_SECRET` must be set in Replit Secrets
- AI calls failing → check `AI_INTEGRATIONS_OPENAI_API_KEY` is set (auto by Replit integration)
- Credits blocking requests → set `CREDITS_ENABLED=false` or use an admin account
- Swagger UI for manual API testing: `http://localhost:8080/api/docs`

### Regenerate API client after spec changes

```bash
pnpm --filter @workspace/api-spec run codegen
# Regenerates lib/api-client-react and lib/api-zod
```

---

## Stack

- pnpm workspace monorepo (Node 24, TypeScript 5.9)
- **Backend:** Python 3.11 + FastAPI + Uvicorn (`artifacts/api-server-python`) — port 8080
- **Frontend:** React 19 + Vite 7 SPA (`artifacts/brand-os`) — port 5000 (Replit webview)
- **DB:** PostgreSQL (Replit native) — schema via Drizzle ORM (TypeScript), read by SQLAlchemy (Python)
- **AI:** Replit AI Integrations (auto-set) + optional `OPENAI_API_KEY` / `GEMINI_API_KEY`
- **Auth:** JWT via HTTP-only cookie + localStorage (Python backend) — see `app/layers/auth.py`

---

## Python Backend — key files

> Full guide → **`BACKEND_GUIDE.md`**

```
artifacts/api-server-python/
  main.py                    ← App factory: middleware registration + route mounting
  app/
    config.py                ← All env vars via pydantic-settings
    models.py                ← SQLAlchemy ORM (User, Brand, Campaign, Post)
    schemas.py               ← Pydantic v2 request/response schemas (camelCase)
    database.py              ← SQLAlchemy engine + SessionLocal + get_db()
    deps.py                  ← FastAPI Depends(): get_current_user, get_current_admin
    middleware/              ← HTTP middleware (one class per file)
      logging.py             ← RequestLoggerMiddleware (method/path/status/timing)
    layers/                  ← Cross-cutting concerns
      auth.py                ← JWT + bcrypt auth (pluggable — swap provider in deps.py)
      credits.py             ← Credit deduction/refund (disable: CREDITS_ENABLED=false)
      payments.py            ← Stripe stub (documented, not implemented)
      rate_limit.py          ← slowapi Limiter + 429 error handler
    routes/                  ← One router per feature domain
      auth.py / brands.py / campaigns.py / posts.py / dashboard.py / system.py
    services/
      ai/client.py           ← OpenAI/Gemini client resolver
      ai/brand_kit.py        ← Brand kit + brand story generation
      ai/campaign.py         ← Campaign generation
      ai/post.py             ← Regenerate/variant/long-form content
      ai/image.py            ← Image generation (with logo/references)
      image_storage.py       ← Local file storage for generated images
      job_store.py           ← In-memory background job tracker
      logo_processor.py      ← Logo variants (B&W/grayscale) + color extraction
    utils/                   ← Shared stateless helpers (import freely in routes/services)
      pagination.py          ← PaginationParams (FastAPI Depends) + paginate()
      ownership.py           ← get_owned_brand/campaign/post() → 404 if not owned
      ai_errors.py           ← handle_ai_error(e) → maps AI exceptions to HTTP 503/422
  EXCLUDED_FEATURES.md       ← Full list of excluded features + how to add them
```

## React Frontend — key files

> Full guide → **`FRONTEND_GUIDE.md`**

```
artifacts/brand-os/src/
  App.tsx                    ← Root: providers, router, auth guard, lazy routes
  main.tsx                   ← DOM mount point
  types/
    index.ts                 ← Shared TypeScript types (AuthUser, BrandKit, JobProgress…)
  lib/
    constants.ts             ← App-wide constants (limits, keys, intervals, platforms)
    apiError.ts              ← extractApiError(), notifyError(), notifySuccess()
    colorExtractor.ts        ← Canvas-based color extraction from logos
    utils.ts                 ← cn() — Tailwind class merger
  hooks/
    useDebounce.ts           ← Debounce a value (search inputs)
    useLocalStorage.ts       ← localStorage-backed useState
    useJobPoller.ts          ← Poll GET /api/jobs/:id until done/failed
    use-toast.ts             ← Toast notification hook
  contexts/
    AuthContext.tsx           ← User session (signIn, signUp, signOut, refresh)
    SiteSettingsContext.tsx  ← Public settings + maintenance mode
  components/
    Layout.tsx               ← App shell: sidebar + nav
    ui/                      ← Atomic UI (shadcn/ui): Button, Input, Card, Dialog…
  pages/                     ← One file per route (lazy-loaded in App.tsx)
```

### Auto-generated API client (do not edit manually)

```
lib/
  api-spec/openapi.yaml      ← Source of truth for all API types
  api-client-react/          ← TanStack Query hooks (generated by Orval)
  api-zod/                   ← Zod schemas (generated by Orval)
```

---

## API Endpoints (all under /api/)

### Auth
- `POST /auth/register` — register new user (first user = admin)
- `POST /auth/login` — login → returns `{user, token}`
- `POST /auth/logout` — logout
- `GET  /auth/me` — get current user

### Brands
- `GET    /brands` — list brands (paginated)
- `POST   /brands` — create brand
- `GET    /brands/:id` — get brand
- `PATCH  /brands/:id` — update brand
- `DELETE /brands/:id` — delete brand
- `POST   /brands/:id/generate-kit` — AI brand kit (50 credits)
- `POST   /brands/:id/generate-logo-variants` — B&W/grayscale logo variants
- `POST   /brands/:id/generate-story` — brand story (10 credits)
- `POST   /brands/:id/generate-content` — long-form content (5 credits)
- `GET    /brands/:id/stats` — aggregated stats
- `POST   /brands/:id/generate-campaign` — async campaign generation → jobId (60 credits)
- `POST   /brands/:id/campaign-brief-job` — full pipeline with step progress → jobId (60 credits)
- `GET    /brands/:id/campaigns` — list campaigns for brand

### Campaigns & Posts
- `GET  /campaigns/:id` — get campaign + posts
- `POST /posts/campaigns/:campaign_id/generate-all-images` — bulk image gen → jobId (10× credits)
- `GET  /posts/:id` — get post
- `PATCH /posts/:id` — update post
- `DELETE /posts/:id` — delete post
- `POST /posts/:id/generate-image` — generate image (10 credits)
- `POST /posts/:id/restore-image` — restore image from history
- `POST /posts/:id/regenerate` — regenerate post text (8 credits)
- `POST /posts/:id/generate-variant` — A/B variant (5 credits)
- `POST /posts/:id/generate-content` — long-form content from post hook (5 credits)

### System
- `GET /health` — health check + DB status
- `GET /public-settings` — landing page config + feature flags
- `GET /jobs/:id` — poll background job `{status, progress, step, result, error}`
- `GET /credit-costs` — current credit cost table
- `GET /storage/images/objects/uploads/:id` — serve stored image

---

## Configured env (Replit)

- `DATABASE_URL` — Replit Postgres (auto-set)
- `AUTH_JWT_SECRET` — JWT signing secret **(must be set in Replit Secrets)**
- `AI_INTEGRATIONS_OPENAI_API_KEY` — auto-set by Replit AI Integrations (primary AI provider)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — auto-set by Replit AI Integrations
- `OPENAI_API_KEY` — optional direct OpenAI key (overrides Replit proxy if set)
- `GEMINI_API_KEY` — optional Google Gemini fallback
- `CREDITS_ENABLED` — set to `false` to disable credit checking globally

---

## Workflows (active)

- `Python API Server` — `cd artifacts/api-server-python && /home/runner/workspace/.pythonlibs/bin/uvicorn main:app --host 0.0.0.0 --port 8080 --reload` **(port 8080)**
- `Start application` — `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/brand-os run dev` **(port 5000, webview)**

---

## Common commands

```bash
pnpm install                                               # install workspace JS deps
pip install -r artifacts/api-server-python/requirements.txt  # install Python deps
pnpm --filter @workspace/db run push                      # sync Drizzle schema to DB
pnpm --filter @workspace/api-spec run codegen             # regenerate API client from spec
pnpm --filter @workspace/brand-os run typecheck           # TypeScript typecheck
```

---

## Swagger / API Docs

Interactive API docs: `http://localhost:8080/api/docs` (Swagger UI)

---

## GitHub remote

- Origin: `https://github.com/mr-oskar/Brand-Architect-AI-pro-node.0.1`
- Push works directly from Replit Git pane (token stored in `~/.git-credentials`).

---

## Recent significant changes

> Full history → **`CHANGELOG.md`**

- 2026-05-19 — **Architecture refactor:** Added `app/middleware/` (RequestLoggerMiddleware), `app/utils/` (pagination, ownership, ai_errors). Frontend: `src/types/`, `src/lib/constants.ts`, `src/hooks/useDebounce|useLocalStorage|useJobPoller`. Added `BACKEND_GUIDE.md`, `FRONTEND_GUIDE.md`, `CHANGELOG.md`.
- 2026-05-19 — **Security:** Rate limiting (slowapi) + CORS hardening (no more `"*"`).
- 2026-05-19 — **Cleaned dead code:** deleted orphaned `nodesExport.ts`. Added `DOCUMENTATION.md`.
- 2026-05-19 — **LTR enforced globally:** `index.html` + `SiteSettingsContext` hardcoded to LTR.
- 2026-05-19 — **Deleted TypeScript/Express backend** (`artifacts/api-server`). Python only now.
- 2026-05-18 — **Python backend fully active.** AI resolves via Replit AI Integrations.

---

## User preferences

- Error messages to users: **English only**
- Layout: **LTR always, dark mode always** — no RTL, no light mode
- Admin panel: removed from MVP scope (see EXCLUDED_FEATURES.md)
- Credits system: first registered user = admin (exempt from credits)
