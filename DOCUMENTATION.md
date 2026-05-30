# Brand Architect AI Pro — Full Documentation

> **Quick navigation:**
> [Architecture](#architecture) · [Structure](#directory-structure) · [Local Dev](#local-development) · [Replit](#running-on-replit) · [Admin Panel](#admin-panel--ai-provider-keys) · [API Reference](#backend-api-reference) · [Frontend](#frontend-pages) · [Database](#database-schema) · [Env Vars](#environment-variables) · [Debugging](#common-debugging)

---

## Project Overview

**Brand Architect AI Pro** is a full-stack AI-powered brand and marketing platform. Users register, create brand workspaces, generate complete brand kits via AI, build multi-day social media campaigns, and produce on-brand images — all isolated per account.

**Key capabilities:**
- AI-generated brand identity (colors, typography, tone of voice, brand story)
- Multi-day social media campaign generation (posts, hooks, CTAs per platform)
- On-brand image generation via `gpt-image-1`
- Logo variant generation (black / white / grayscale)
- Long-form content (blog, newsletter, email)
- Credit-based usage system (admins exempt)
- Admin panel: manage AI provider API keys from the UI without touching env vars

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                 Browser (http://localhost:5000)           │
│           React 19 + Vite 7 SPA  (brand-os)             │
│   Tailwind CSS 4 · TanStack Query · Wouter · Framer      │
└────────────────────────┬────────────────────────────────┘
                          │  /api/* proxy (Vite → :8080)
                          ▼
┌─────────────────────────────────────────────────────────┐
│        Python FastAPI (http://localhost:8080)             │
│       api-server-python · Uvicorn · SQLAlchemy           │
│  Routes → Services → AI Client → OpenAI / Gemini API    │
└────────────────────────┬────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│          PostgreSQL (local or Replit native DB)           │
│  users · brands · campaigns · posts · app_settings       │
└─────────────────────────────────────────────────────────┘
```

**Request flow:**
1. Browser hits `http://localhost:5000/api/*`
2. Vite dev server proxies to `http://localhost:8080/api/*`
3. FastAPI validates JWT (`Authorization: Bearer <token>` header)
4. Route calls service → service calls AI client
5. AI client resolves provider from DB (admin panel) or env vars
6. Response returns JSON

**AI provider resolution order** _(first configured wins)_:
1. Nano Banana DB key (custom OpenAI-compatible endpoint)
2. OpenAI DB key (official OpenAI API)
3. Gemini DB key (Google Generative AI)
4. `OPENAI_API_KEY` env var
5. `GEMINI_API_KEY` env var
6. Replit AI Integration proxy (`AI_INTEGRATIONS_*` env vars)

---

## Directory Structure

```
/
├── .env.example                    ← Copy to .env for local development
├── DOCUMENTATION.md                ← This file (full reference)
├── BACKEND_GUIDE.md                ← Backend developer guide
├── FRONTEND_GUIDE.md               ← Frontend developer guide
├── CHANGELOG.md                    ← Version history
├── PROJECT_LOG.md                  ← Session-by-session work log
├── pnpm-workspace.yaml             ← pnpm monorepo configuration
├── pyproject.toml                  ← Python workspace configuration
├── tsconfig.base.json              ← Shared TypeScript config
│
├── scripts/
│   ├── dev.sh                      ← Start both servers locally (use this daily)
│   ├── setup.sh                    ← First-time local setup
│   └── post-merge.sh               ← Runs after task agent merges on Replit
│
├── artifacts/
│   │
│   ├── api-server-python/          ← Python FastAPI backend (port 8080)
│   │   ├── main.py                 ← App factory: middleware + routes + startup
│   │   ├── requirements.txt        ← Pinned Python dependencies
│   │   ├── EXCLUDED_FEATURES.md    ← Features intentionally not built + how to add
│   │   └── app/
│   │       ├── config.py           ← All env vars via pydantic-settings
│   │       ├── database.py         ← SQLAlchemy engine + SessionLocal + get_db()
│   │       ├── deps.py             ← FastAPI Depends(): get_current_user, get_current_admin
│   │       ├── models.py           ← SQLAlchemy ORM (User, Brand, Campaign, Post, AppSetting)
│   │       ├── schemas.py          ← Pydantic v2 request/response schemas (camelCase)
│   │       │
│   │       ├── middleware/
│   │       │   └── logging.py      ← RequestLoggerMiddleware (method/path/status/timing)
│   │       │
│   │       ├── layers/             ← Cross-cutting concerns
│   │       │   ├── auth.py         ← JWT + bcrypt auth (pluggable — see AuthLayer)
│   │       │   ├── credits.py      ← Credit deduction/refund (CREDITS_ENABLED env)
│   │       │   ├── payments.py     ← Stripe stub (documented, not implemented)
│   │       │   └── rate_limit.py   ← slowapi rate limiter + 429 handler
│   │       │
│   │       ├── routes/             ← One router per feature domain
│   │       │   ├── auth.py         ← /api/auth/*
│   │       │   ├── brands.py       ← /api/brands/* + AI generation
│   │       │   ├── campaigns.py    ← /api/campaigns/*
│   │       │   ├── posts.py        ← /api/posts/*
│   │       │   ├── dashboard.py    ← /api/dashboard/*
│   │       │   ├── admin.py        ← /api/admin/* (admin-only: users, settings, API keys)
│   │       │   └── system.py       ← /api/health, /api/public-settings, /api/jobs/*
│   │       │
│   │       ├── services/
│   │       │   ├── ai/
│   │       │   │   ├── client.py   ← AI client resolver (reads from api_key_store)
│   │       │   │   ├── brand_kit.py← generate_brand_kit(), generate_brand_story()
│   │       │   │   ├── campaign.py ← analyze_brief(), generate_campaign()
│   │       │   │   ├── post.py     ← regenerate_post(), variant, long-form
│   │       │   │   └── image.py    ← generate_image_bytes(), enhance_prompt()
│   │       │   ├── job_store.py    ← In-memory background job tracker
│   │       │   ├── image_storage.py← Save/retrieve generated images locally
│   │       │   └── logo_processor.py← Logo variants (B&W/grayscale) + color extraction
│   │       │
│   │       └── utils/
│   │           ├── api_key_store.py← AI provider keys: DB cache + env fallback
│   │           ├── pagination.py   ← PaginationParams + paginate(query, params)
│   │           ├── ownership.py    ← get_owned_brand/campaign/post() — 404 if not owned
│   │           └── ai_errors.py    ← handle_ai_error(e) → HTTP 503/422
│   │
│   └── brand-os/                   ← React frontend (port 5000)
│       ├── index.html              ← HTML entry (dir="ltr" class="dark" — never change)
│       ├── vite.config.ts          ← Vite config + /api proxy → :8080
│       └── src/
│           ├── App.tsx             ← Root: providers, router, auth guard, lazy routes
│           ├── main.tsx            ← React DOM mount
│           ├── index.css           ← Tailwind base + dark-mode CSS variables
│           │
│           ├── types/index.ts      ← Shared TypeScript types (AuthUser, BrandKit, …)
│           │
│           ├── lib/
│           │   ├── constants.ts    ← App-wide constants (platform list, limits, …)
│           │   ├── apiFetch.ts     ← Authenticated fetch wrapper (adds Bearer token)
│           │   ├── apiError.ts     ← extractApiError(), notifyError(), notifySuccess()
│           │   ├── colorExtractor.ts← Canvas-based color extraction from logos
│           │   └── utils.ts        ← cn() Tailwind class merger
│           │
│           ├── hooks/
│           │   ├── use-toast.ts    ← Toast notification hook
│           │   ├── useDebounce.ts  ← Debounce a value for search inputs
│           │   ├── useLocalStorage.ts← localStorage-backed useState
│           │   └── useJobPoller.ts ← Poll GET /api/jobs/:id until done/failed
│           │
│           ├── contexts/
│           │   ├── AuthContext.tsx  ← User session (signIn, signUp, signOut, refresh)
│           │   └── SiteSettingsContext.tsx← Public settings + maintenance mode
│           │
│           ├── components/
│           │   ├── Layout.tsx      ← App shell: sidebar, nav, user menu
│           │   ├── PostCard.tsx    ← Post card in campaign workspace
│           │   ├── ImageGenDialog.tsx← Image generation dialog
│           │   ├── ImageLightbox.tsx← Full-screen image viewer
│           │   └── ui/             ← shadcn/ui atomic components
│           │
│           └── pages/
│               ├── LandingPage.tsx → /           (logged-out home)
│               ├── SignIn.tsx      → /sign-in
│               ├── SignUp.tsx      → /sign-up
│               ├── Dashboard.tsx  → /dashboard
│               ├── AppHome.tsx    → /            (logged-in home)
│               ├── BrandWizard.tsx→ /brands/new
│               ├── BrandEdit.tsx  → /brands/:id/edit
│               ├── BrandKit.tsx   → /brands/:id
│               ├── CampaignList.tsx→ /brands/:id/campaigns
│               ├── CampaignBriefPage.tsx→ /brands/:id/campaigns/new
│               ├── CampaignWorkspace.tsx→ /campaigns/:id
│               └── AdminApiKeys.tsx→ /admin/api-keys  (admin only)
│
└── lib/
    ├── api-spec/openapi.yaml       ← OpenAPI 3.0 spec (source of truth for codegen)
    ├── api-client-react/           ← Auto-generated TanStack Query hooks (Orval)
    ├── api-zod/                    ← Auto-generated Zod validation schemas
    └── db/src/schema/              ← Drizzle ORM schema (TypeScript, for migrations)
```

---

## Local Development

### Prerequisites

| Tool | Minimum version | Install |
|---|---|---|
| Node.js | 20.x | https://nodejs.org |
| pnpm | 9.x | `npm install -g pnpm` |
| Python | 3.11 | https://python.org |
| PostgreSQL | 14+ | https://postgresql.org or Docker |

> **Using Docker for PostgreSQL:**
> ```bash
> docker run -d --name brandarchitect-db \
>   -e POSTGRES_PASSWORD=postgres \
>   -e POSTGRES_DB=brandarchitect \
>   -p 5432:5432 postgres:16-alpine
> # DATABASE_URL = postgresql://postgres:postgres@localhost:5432/brandarchitect
> ```

---

### Step 1 — Clone and configure

```bash
git clone <your-repo-url>
cd brand-architect-ai-pro

# Copy the environment template
cp .env.example .env
```

Edit `.env` and fill in:
```bash
DATABASE_URL=postgresql://postgres:password@localhost:5432/brandarchitect
AUTH_JWT_SECRET=<generate with: python3 -c "import secrets; print(secrets.token_hex(32))">
OPENAI_API_KEY=sk-...   # or leave blank and add via Admin → API Keys after login
```

---

### Step 2 — Run the setup script

```bash
bash scripts/setup.sh
```

This script:
1. Checks Node.js, pnpm, Python are installed
2. Installs all JS dependencies (`pnpm install`)
3. Installs Python dependencies (`pip install -r requirements.txt`)
4. Creates all PostgreSQL tables (`Base.metadata.create_all(engine)`)

---

### Step 3 — Start the development servers

```bash
bash scripts/dev.sh
```

This starts:
- **Python API backend** on `http://localhost:8080` (hot-reload via uvicorn `--reload`)
- **React frontend** on `http://localhost:5000` (hot-reload via Vite HMR)

| URL | What |
|---|---|
| `http://localhost:5000` | React app (use this) |
| `http://localhost:8080/api/docs` | Swagger UI (API explorer) |
| `http://localhost:8080/api/health` | Backend health check |

> **Windows users:** Run the two commands in separate terminals:
> ```batch
> # Terminal 1 — Python backend
> cd artifacts\api-server-python
> python -m uvicorn main:app --host 0.0.0.0 --port 8080 --reload
>
> # Terminal 2 — React frontend
> set PORT=5000
> set BASE_PATH=/
> pnpm --filter @workspace/brand-os run dev
> ```

---

### Step 4 — First login

1. Open `http://localhost:5000`
2. Click **"Create one"** to register
3. **The first registered user automatically becomes admin**
4. Go to **Admin → API Keys** in the sidebar to add your OpenAI / Gemini key
5. Start creating brands and generating campaigns

---

### Development commands

```bash
# Start both servers (daily use)
bash scripts/dev.sh

# TypeScript typecheck
pnpm --filter @workspace/brand-os run typecheck

# Regenerate API client after changing openapi.yaml
pnpm --filter @workspace/api-spec run codegen

# Build frontend for production
pnpm --filter @workspace/brand-os run build

# Push Drizzle schema to DB (when DB schema changes)
pnpm --filter @workspace/db run push

# Interactive API docs
open http://localhost:8080/api/docs    # macOS
xdg-open http://localhost:8080/api/docs  # Linux
```

---

## Running on Replit

Both workflows start automatically:

| Workflow | Command | Port |
|---|---|---|
| `Start application` | `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/brand-os run dev` | **5000** (webview) |
| `Python API Server` | `cd artifacts/api-server-python && uvicorn main:app --host 0.0.0.0 --port 8080 --reload` | **8080** |

**Required Replit Secrets** (set in the Secrets tab):

| Secret | Value |
|---|---|
| `AUTH_JWT_SECRET` | Any long random string — **required** |
| `DATABASE_URL` | Auto-set by Replit DB — do not override |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Auto-set by Replit AI Integration |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Auto-set by Replit AI Integration |

> On Replit, AI works automatically via the Replit AI Integration. You do **not** need to set `OPENAI_API_KEY` unless you want to use your own key (which takes priority over the proxy).

---

## Admin Panel — AI Provider Keys

Admin users can manage AI provider API keys directly from the app without touching environment variables or restarting the server.

**URL:** `/admin/api-keys` → visible as **Admin → API Keys** in the sidebar (admin only)

### Supported providers

| Priority | Provider | Description |
|---|---|---|
| 1 | 🍌 Nano Banana | Custom OpenAI-compatible endpoint — specify key + base URL |
| 2 | 🤖 OpenAI | Official OpenAI API (GPT-4o, DALL-E 3, Whisper) |
| 3 | ✨ Google Gemini | Google Generative AI via OpenAI-compatible interface |
| — | Env vars | Fallback if no DB keys are configured |

Keys are stored in the `app_settings` table (key: `"apiKeys"`) and take effect within **60 seconds** (TTL cache) without a restart.

### How keys flow from UI to AI calls

```
Admin Panel
  └─ POST /api/admin/api-keys/{provider}
       └─ app_settings table (DB, key="apiKeys")
            └─ api_key_store.py (60s in-memory cache)
                 └─ services/ai/client.py (60s cached OpenAI client)
                      └─ AI calls (brand kit, campaign, images, …)
```

### Admin API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/api-keys` | List all providers (keys masked) |
| `POST` | `/api/admin/api-keys/{provider}` | Add or replace a key |
| `DELETE` | `/api/admin/api-keys/{provider}` | Remove a key |
| `POST` | `/api/admin/api-keys/{provider}/toggle` | Enable / disable a provider |
| `POST` | `/api/admin/api-keys/{provider}/test` | Test a key without saving |

Provider IDs: `openai`, `gemini`, `nano_banana`

---

## Backend API Reference

**Base URL:** `/api/`
**Auth header:** `Authorization: Bearer <token>`

### Auth (`/api/auth/`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | ❌ | Register. First user → admin. Returns `{user, token}` |
| `POST` | `/auth/login` | ❌ | Login. Returns `{user, token}` |
| `POST` | `/auth/logout` | ❌ | Clears auth cookie |
| `GET` | `/auth/me` | ✅ | Current user |

### Brands (`/api/brands/`)

| Method | Endpoint | Credits | Description |
|---|---|---|---|
| `GET` | `/brands` | 0 | List brands (`?page=1&page_size=20`) |
| `POST` | `/brands` | 0 | Create brand |
| `GET` | `/brands/:id` | 0 | Get brand with full kit |
| `PATCH` | `/brands/:id` | 0 | Update brand fields |
| `DELETE` | `/brands/:id` | 0 | Delete brand + all campaigns |
| `POST` | `/brands/:id/generate-kit` | 50 | Generate full AI brand kit |
| `POST` | `/brands/:id/generate-story` | 10 | Generate/regenerate brand story |
| `POST` | `/brands/:id/generate-logo-variants` | 0 | B&W/grayscale logo variants |
| `POST` | `/brands/:id/generate-content` | 5 | Long-form content |
| `GET` | `/brands/:id/stats` | 0 | Campaign + post counts |
| `GET` | `/brands/:id/campaigns` | 0 | List campaigns |
| `POST` | `/brands/:id/generate-campaign` | 60 | Async campaign → returns `jobId` |
| `POST` | `/brands/:id/campaign-brief-job` | 60 | Full pipeline with step progress |

### Campaigns & Posts

| Method | Endpoint | Credits | Description |
|---|---|---|---|
| `GET` | `/campaigns/:id` | 0 | Get campaign + all posts |
| `GET` | `/posts/:id` | 0 | Get single post |
| `PATCH` | `/posts/:id` | 0 | Update post fields |
| `DELETE` | `/posts/:id` | 0 | Delete post |
| `POST` | `/posts/:id/generate-image` | 10 | Generate AI image |
| `POST` | `/posts/:id/restore-image` | 0 | Restore from image history |
| `POST` | `/posts/:id/regenerate` | 8 | Regenerate post text |
| `POST` | `/posts/:id/generate-variant` | 5 | A/B variant |
| `POST` | `/posts/:id/generate-content` | 5 | Long-form from post hook |
| `POST` | `/campaigns/:id/generate-all-images` | 10× | Bulk image gen → `jobId` |

### Admin (`/api/admin/`) — requires admin role

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/admin/users` | List all users |
| `GET` | `/admin/stats` | Platform-wide stats |
| `POST` | `/admin/users/:id/credits` | Set user credits |
| `GET` | `/admin/settings` | Get all settings |
| `PUT` | `/admin/settings` | Update a setting |
| `GET` | `/admin/api-keys` | List AI provider keys (masked) |
| `POST` | `/admin/api-keys/:provider` | Add/replace AI provider key |
| `DELETE` | `/admin/api-keys/:provider` | Remove AI provider key |
| `POST` | `/admin/api-keys/:provider/toggle` | Enable/disable provider |
| `POST` | `/admin/api-keys/:provider/test` | Test key without saving |

### System

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check + DB status |
| `GET` | `/public-settings` | Site config + feature flags |
| `GET` | `/jobs/:id` | Poll background job status |
| `GET` | `/credit-costs` | Current credit cost table |
| `GET` | `/storage/images/objects/uploads/:id` | Serve stored image |

---

## Frontend Pages

| Route | Page | Auth | Description |
|---|---|---|---|
| `/` | `LandingPage` / `AppHome` | Auto | Landing (logged out) or home (logged in) |
| `/sign-in` | `SignIn` | ❌ | Login form |
| `/sign-up` | `SignUp` | ❌ | Registration form |
| `/dashboard` | `Dashboard` | ✅ | Brand list + stats overview |
| `/brands/new` | `BrandWizard` | ✅ | 5-step brand creation wizard |
| `/brands/:id/edit` | `BrandEdit` | ✅ | Edit brand name/description/logo |
| `/brands/:id` | `BrandKit` | ✅ | Brand identity + all AI actions |
| `/brands/:id/campaigns` | `CampaignList` | ✅ | All campaigns for a brand |
| `/brands/:id/campaigns/new` | `CampaignBriefPage` | ✅ | Brief form + async generation |
| `/campaigns/:id` | `CampaignWorkspace` | ✅ | Campaign editor + image gen |
| `/admin/api-keys` | `AdminApiKeys` | ✅ Admin | Manage AI provider keys |

---

## Database Schema

**Tables** (managed by SQLAlchemy ORM in `app/models.py`, migrations via Drizzle in `lib/db/`):

| Table | Key columns | Notes |
|---|---|---|
| `users` | `id, email, name, role, credits` | `role`: `"user"` \| `"admin"` |
| `brands` | `id, user_id, company_name, brand_kit (jsonb)` | `brand_kit` stores full AI output |
| `campaigns` | `id, brand_id, title, platform, days, posts_per_day` | |
| `posts` | `id, campaign_id, day, platform, content, image_url` | |
| `app_settings` | `key (varchar), value (jsonb)` | `"apiKeys"`, `"site"`, `"features"`, … |

**Key `app_settings` entries:**

| Key | Value shape | Used by |
|---|---|---|
| `"apiKeys"` | `{openai: {apiKey, enabled}, gemini: {…}, nano_banana: {…, baseUrl}}` | `api_key_store.py` |
| `"site"` | `{siteName, tagline, primaryColor}` | `SiteSettingsContext` |
| `"features"` | `{enableRegistration: bool}` | Auth routes |
| `"creditCosts"` | `{"brand.generate-kit": 50, …}` | `credits.py` |

---

## Environment Variables

| Variable | Required | Source | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | DB / `.env` | PostgreSQL connection string |
| `AUTH_JWT_SECRET` | ✅ | Secret / `.env` | JWT signing key — must be stable across restarts |
| `OPENAI_API_KEY` | ⬜ | Optional | Direct OpenAI key (overrides Replit proxy and DB keys) |
| `GEMINI_API_KEY` | ⬜ | Optional | Google Gemini fallback |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Auto | Replit | Auto-set by Replit AI Integration |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Auto | Replit | Auto-set by Replit AI Integration |
| `CREDITS_ENABLED` | ⬜ | Optional | Set `false` to disable credit gating (dev only) |
| `AI_TEXT_MODEL` | ⬜ | Optional | Override text model (default: `gpt-4o-mini`) |
| `AI_MAX_TOKENS` | ⬜ | Optional | Override max tokens (default: `8192`) |
| `AI_TEMPERATURE` | ⬜ | Optional | Override temperature `0.0–1.0` (default: `0.7`) |
| `ALLOWED_ORIGINS` | ⬜ | Optional | Comma-separated CORS origins for custom domains |

> **Note:** `OPENAI_API_KEY` and `GEMINI_API_KEY` can also be set from the Admin Panel (Admin → API Keys) without touching env vars. DB keys are checked first.

---

## Credit Costs Reference

| Action | Cost |
|---|---|
| Generate brand kit | 50 credits |
| Generate brand story | 10 credits |
| Long-form content (brand or post) | 5 credits |
| Generate campaign | 60 credits |
| Generate post image | 10 credits |
| Regenerate post text | 8 credits |
| Generate post variant | 5 credits |

Admins pay 0 credits. Disable globally: `CREDITS_ENABLED=false`.

---

## Common Debugging

| Symptom | Check |
|---|---|
| AI routes return 503 | Add an API key via **Admin → API Keys**, or set `OPENAI_API_KEY` in env |
| All routes return 401 | `AUTH_JWT_SECRET` must match what tokens were signed with |
| Credits blocking dev | Set `CREDITS_ENABLED=false` or login as admin |
| 429 Too Many Requests | Rate limit per IP — wait 1 minute or use a different IP |
| DB tables missing | Run `bash scripts/setup.sh` or manually: `cd artifacts/api-server-python && python3 -c "from app.models import Base; from app.database import engine; Base.metadata.create_all(engine)"` |
| Frontend blank | Check `Start application` workflow logs; ensure `PORT=5000 BASE_PATH=/` are set |
| API proxy not working | Ensure Python API Server is running on port 8080; check logs |
| Vite throws `PORT not set` | Must run with `PORT=5000 BASE_PATH=/ pnpm run dev` — use `scripts/dev.sh` |
| Sessions reset on restart | `AUTH_JWT_SECRET` not set — it generates a random ephemeral key each time |

---

## Extending the Project

See **`BACKEND_GUIDE.md`** for:
- Adding a new API endpoint (step-by-step)
- Adding a new middleware
- Adding a new AI service
- Swapping the auth layer
- Adding an AI provider

See **`FRONTEND_GUIDE.md`** for:
- Adding a new page/route
- Calling API endpoints (generated hooks vs. raw fetch)
- Polling background jobs
- Adding a reusable component

See **`EXCLUDED_FEATURES.md`** for intentionally unbuilt features and how to add them.

---

## Related Documentation

| File | Purpose |
|---|---|
| `DOCUMENTATION.md` | ← You are here — full reference |
| `BACKEND_GUIDE.md` | Backend patterns + how-to guide |
| `FRONTEND_GUIDE.md` | Frontend patterns + how-to guide |
| `CHANGELOG.md` | Version-by-version change history |
| `PROJECT_LOG.md` | Session-by-session work log (newest first) |
| `EXCLUDED_FEATURES.md` | Features not built yet + instructions |
| `replit.md` | Agent quick-start + Replit-specific config |
