# Brand Architect AI Pro — Full Documentation

> **Quick navigation:** [Architecture](#architecture) · [Running](#running-the-project) · [Backend API](#backend-api-reference) · [Frontend](#frontend-pages) · [Database](#database-schema) · [Environment](#environment-variables) · [Extending](#extending-the-project)

---

## Project Overview

**Brand Architect AI Pro** is a full-stack AI-powered brand and marketing platform. Users register, create brand workspaces, generate complete brand kits via AI, build multi-day social media campaigns, and produce on-brand images — all isolated per account.

**Key capabilities:**
- AI-generated brand identity (colors, typography, tone of voice, brand story)
- Multi-day social media campaign generation (posts, hooks, CTAs per platform)
- On-brand image generation via `gpt-image-1`
- Logo variant generation (black / white / grayscale)
- Long-form content generation (blog, newsletter, email)
- Credit-based usage system (admins exempt)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (port 5000)                   │
│           React 19 + Vite 7 SPA (brand-os)              │
│   Tailwind CSS 4 · TanStack Query · Wouter · Framer     │
└────────────────────────┬────────────────────────────────┘
                         │ /api/* proxy
                         ▼
┌─────────────────────────────────────────────────────────┐
│              Python FastAPI (port 8080)                  │
│         api-server-python · Uvicorn · SQLAlchemy         │
│   Routes → Services → AI Client → OpenAI/Gemini API     │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│           PostgreSQL (Replit native DB)                  │
│   users · brands · campaigns · posts · app_settings     │
└─────────────────────────────────────────────────────────┘
```

**Request flow:**
1. Browser hits `http://localhost:5000/api/*`
2. Vite dev server proxies to `http://localhost:8080/api/*`
3. FastAPI validates JWT (from `Authorization: Bearer <token>` header or cookie)
4. Route calls service → service calls AI client
5. AI client resolves provider: Replit AI Integration → OpenAI direct → Gemini (priority order)
6. Response returns JSON

---

## Directory Structure

```
/
├── artifacts/
│   ├── api-server-python/          ← Python FastAPI backend (port 8080)
│   │   ├── main.py                 ← Entry point (uvicorn main:app)
│   │   ├── requirements.txt        ← Pinned Python dependencies
│   │   └── app/
│   │       ├── config.py           ← All env var config (pydantic-settings)
│   │       ├── database.py         ← SQLAlchemy engine + SessionLocal
│   │       ├── deps.py             ← FastAPI dependency injection
│   │       ├── models.py           ← SQLAlchemy ORM models
│   │       ├── schemas.py          ← Pydantic request/response schemas
│   │       ├── layers/
│   │       │   ├── auth.py         ← JWT + bcrypt auth
│   │       │   ├── credits.py      ← Credit deduction/refund system
│   │       │   └── payments.py     ← Stripe stub (documented, not implemented)
│   │       ├── routes/
│   │       │   ├── auth.py         ← /api/auth/*
│   │       │   ├── brands.py       ← /api/brands/*
│   │       │   ├── campaigns.py    ← /api/campaigns/*
│   │       │   ├── posts.py        ← /api/posts/*
│   │       │   ├── dashboard.py    ← /api/dashboard/*
│   │       │   └── system.py       ← /api/health, /api/public-settings
│   │       └── services/
│   │           ├── ai/
│   │           │   ├── client.py   ← AI provider resolver
│   │           │   ├── brand_kit.py← Brand kit + story generation
│   │           │   ├── campaign.py ← Campaign generation
│   │           │   ├── post.py     ← Post regeneration / variants
│   │           │   └── image.py    ← Image generation
│   │           ├── image_storage.py← Local image file storage
│   │           ├── job_store.py    ← In-memory background job tracker
│   │           └── logo_processor.py← Logo variants + color extraction
│   │
│   └── brand-os/                   ← React frontend (port 5000)
│       ├── index.html              ← HTML entry (dir="ltr", class="dark" — never change)
│       ├── vite.config.ts          ← Vite config + /api proxy to :8080
│       └── src/
│           ├── App.tsx             ← Router + providers
│           ├── main.tsx            ← React root mount
│           ├── index.css           ← Tailwind + CSS variables (dark mode only)
│           ├── pages/
│           │   ├── LandingPage.tsx ← Public landing (data from /api/public-settings)
│           │   ├── SignIn.tsx      ← Login page
│           │   ├── SignUp.tsx      ← Registration page
│           │   ├── Dashboard.tsx   ← Authenticated home
│           │   ├── BrandWizard.tsx ← 5-step brand creation wizard
│           │   ├── BrandKit.tsx    ← Brand identity view + all actions
│           │   ├── BrandEdit.tsx   ← Edit brand name/description/logo
│           │   ├── CampaignList.tsx← Campaigns for a brand
│           │   ├── CampaignBriefPage.tsx ← Campaign brief form + generation
│           │   └── CampaignWorkspace.tsx ← Campaign editor + image gen
│           ├── components/
│           │   ├── Layout.tsx      ← App shell (sidebar + header)
│           │   ├── ImageLightbox.tsx← Full-screen image viewer
│           │   ├── ScheduleCampaignDialog.tsx
│           │   └── ui/             ← Shadcn-style UI primitives
│           ├── contexts/
│           │   ├── AuthContext.tsx  ← Auth state + JWT token management
│           │   └── SiteSettingsContext.tsx ← Site-wide settings from API
│           ├── hooks/
│           │   └── use-toast.ts    ← Toast notification hook
│           └── lib/
│               ├── utils.ts        ← cn() class merging utility
│               ├── apiError.ts     ← Error parsing + toast helpers
│               └── colorExtractor.ts← Canvas-based color extraction from images
│
├── lib/
│   ├── api-client-react/           ← Auto-generated React Query hooks (Orval)
│   │   └── src/generated/api.ts   ← useGetBrand(), useCreateBrand(), etc.
│   ├── api-spec/
│   │   └── openapi.yaml           ← OpenAPI 3.0 spec (source of truth for codegen)
│   ├── api-zod/                    ← Auto-generated Zod validation schemas
│   └── db/
│       └── src/schema/             ← Drizzle ORM schema (TypeScript — for migrations)
│           ├── users.ts
│           ├── brands.ts
│           ├── campaigns.ts
│           ├── posts.ts
│           ├── admin.ts            ← app_settings + audit_logs
│           ├── designs.ts          ← Future: Design Studio
│           ├── social-accounts.ts  ← Future: Social publishing
│           └── platform.ts         ← Future: Plans/subscriptions/webhooks
│
├── scripts/
│   └── post-merge.sh               ← Runs after task agent merges
│
├── .replit                         ← Replit workflow config
├── pyproject.toml                  ← Python workspace config
├── pnpm-workspace.yaml             ← pnpm monorepo config
├── replit.md                       ← AI agent quick reference (read this first)
└── DOCUMENTATION.md                ← This file
```

---

## Running the Project

### In Replit (automatic)

Both workflows start when Replit runs:

| Workflow | Command | Port |
|---|---|---|
| `Start application` | `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/brand-os run dev` | **5000** (webview) |
| `Python API Server` | `cd artifacts/api-server-python && uvicorn main:app --host 0.0.0.0 --port 8080 --reload` | **8080** (API) |

### Manual first-time setup

```bash
# 1. Install Node.js dependencies (pnpm workspace)
pnpm install

# 2. Install Python dependencies
pip install -r artifacts/api-server-python/requirements.txt

# 3. Create DB tables (run once — idempotent)
cd artifacts/api-server-python
python3 -c "
from app.models import Base
from app.database import engine
Base.metadata.create_all(engine)
print('Tables created OK')
"
cd ../..

# 4. (Optional) Push TypeScript schema for Drizzle migrations
pnpm --filter @workspace/db run push
```

### Required secrets (Replit Secrets tab)

```
AUTH_JWT_SECRET   = <any long random string — required>
DATABASE_URL      = <auto-set by Replit DB — do not touch>
```

### Useful commands

```bash
# Interactive API docs
open http://localhost:8080/api/docs

# Frontend typecheck
pnpm --filter @workspace/brand-os run typecheck

# Regenerate API client from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen

# Build frontend for production
pnpm --filter @workspace/brand-os run build
```

---

## Environment Variables

| Variable | Required | Source | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | Replit auto | PostgreSQL connection string |
| `AUTH_JWT_SECRET` | ✅ | Replit Secret | JWT signing key — must be stable |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Auto | Replit integration | Primary AI key (auto-set) |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Auto | Replit integration | AI proxy URL (auto-set) |
| `OPENAI_API_KEY` | Optional | Secret | Direct OpenAI — overrides Replit proxy |
| `GEMINI_API_KEY` | Optional | Secret | Google Gemini fallback |
| `CREDITS_ENABLED` | Optional | Env | Set `false` to disable credits globally |
| `AI_TEXT_MODEL` | Optional | Env | Override text model (default: `gpt-4o-mini`) |
| `AI_IMAGE_MODEL` | Optional | Env | Override image model (default: `gpt-image-1`) |

**AI provider resolution order:**
1. `OPENAI_API_KEY` (direct OpenAI)
2. `GEMINI_API_KEY` (Google Gemini)
3. `AI_INTEGRATIONS_OPENAI_API_KEY` (Replit proxy — always available)

---

## Backend API Reference

**Base URL:** `/api/`
**Auth header:** `Authorization: Bearer <token>`

### Auth (`/api/auth/`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | ❌ | Register. First user → admin. Returns `{user, token}` |
| `POST` | `/auth/login` | ❌ | Login with email+password. Returns `{user, token}` |
| `POST` | `/auth/logout` | ❌ | Clears auth cookie |
| `GET` | `/auth/me` | ✅ | Returns current user |

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
| `POST` | `/brands/:id/generate-content` | 5 | Long-form content (blog/email/newsletter) |
| `GET` | `/brands/:id/stats` | 0 | Campaign + post counts |
| `GET` | `/brands/:id/campaigns` | 0 | List campaigns for brand |
| `POST` | `/brands/:id/generate-campaign` | 60 | Async campaign generation → returns `jobId` |
| `POST` | `/brands/:id/campaign-brief-job` | 60 | Full pipeline with step progress → returns `jobId` |

### Campaigns (`/api/campaigns/`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/campaigns/:id` | Get campaign + all posts |

### Posts (`/api/posts/`)

| Method | Endpoint | Credits | Description |
|---|---|---|---|
| `GET` | `/posts/:id` | 0 | Get single post |
| `PATCH` | `/posts/:id` | 0 | Update post fields |
| `DELETE` | `/posts/:id` | 0 | Delete post |
| `POST` | `/posts/:id/generate-image` | 10 | Generate AI image for post |
| `POST` | `/posts/:id/restore-image` | 0 | Restore image from history |
| `POST` | `/posts/:id/regenerate` | 8 | Regenerate post text |
| `POST` | `/posts/:id/generate-variant` | 5 | Create A/B variant |
| `POST` | `/posts/:id/generate-content` | 5 | Long-form content from post hook |
| `POST` | `/posts/campaigns/:campaign_id/generate-all-images` | 10×n | Bulk image gen → returns `jobId` |

### System (`/api/`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | ❌ | Health check + DB status |
| `GET` | `/public-settings` | ❌ | Landing page config + feature flags |
| `GET` | `/jobs/:id` | ✅ | Poll background job status |
| `GET` | `/credit-costs` | ✅ | Current credit cost table |
| `GET` | `/dashboard/summary` | ✅ | Aggregated stats |
| `GET` | `/storage/images/objects/uploads/:id` | ❌ | Serve generated image |

### Background Job polling

Long operations return `{ jobId: "..." }`. Poll until `status` is `completed` or `failed`:

```bash
GET /api/jobs/:id
# Response:
{
  "id": "abc-123",
  "status": "running",          # running | completed | failed
  "progress": 0.65,             # 0.0 – 1.0
  "step": "Generating posts…",  # human-readable current step
  "result": null,               # populated when completed
  "error": null                 # populated when failed
}
```

---

## Frontend Pages

| Route | Page | Auth | Description |
|---|---|---|---|
| `/` | `LandingPage` or `Dashboard` | Optional | Landing if logged out, Dashboard if in |
| `/sign-in` | `SignIn` | ❌ | Email + password login |
| `/sign-up` | `SignUp` | ❌ | Registration |
| `/brands/new` | `BrandWizard` | ✅ | 5-step new brand wizard |
| `/brands/:id` | `BrandKit` | ✅ | Brand identity + all AI actions |
| `/brands/:id/edit` | `BrandEdit` | ✅ | Edit brand name/description/logo |
| `/brands/:id/campaigns` | `CampaignList` | ✅ | Campaign list for brand |
| `/brands/:id/campaigns/new` | `CampaignBriefPage` | ✅ | Brief form + campaign generation |
| `/campaigns/:id` | `CampaignWorkspace` | ✅ | Full campaign editor + image generation |

---

## Database Schema

The Python backend uses **SQLAlchemy models** (`app/models.py`) as the source of truth. TypeScript Drizzle schemas in `lib/db/src/schema/` mirror these and are used only for `pnpm --filter @workspace/db run push` migrations.

### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Auto-generated |
| `email` | text UNIQUE | Indexed |
| `password_hash` | text | bcrypt |
| `name` | text | |
| `role` | text | `user` or `admin` (first registered = admin) |
| `credits` | integer | Default 100 |

### `brands`
| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `user_id` | UUID FK | |
| `company_name` | text | |
| `company_description` | text | |
| `industry` | text | |
| `website_url` | text | |
| `logo_url` | text | Stored file URL |
| `logo_variants` | JSONB | `{original, black, white, grayscale}` |
| `brand_kit` | JSONB | Full AI brand identity object |
| `status` | text | `draft` → `kit_ready` → `active` |

### `campaigns`
| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `brand_id` | FK | |
| `title` | text | |
| `strategy` | text | Campaign strategy |
| `days` | JSONB | Array of campaign day objects |
| `schedule_start` | timestamptz | |
| `schedule_end` | timestamptz | |

### `posts`
| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `campaign_id` | FK | |
| `day` | integer | Day number |
| `caption` | text | |
| `hook` | text | |
| `cta` | text | |
| `hashtags` | text[] | |
| `image_prompt` | text | AI image prompt |
| `image_url` | text | Generated image URL |
| `image_history` | JSONB | Previous image versions |
| `platform` | text | `instagram` / `twitter` / `linkedin` / `facebook` |
| `publish_status` | text | `draft` / `scheduled` / `published` / `failed` |

### `app_settings`
Key-value store for admin-configurable settings (JSONB values).

| Key | Description |
|---|---|
| `site` | `{siteName, tagline, primaryColor, defaultLanguage}` |
| `features` | Feature flags `{imageGeneration, socialPublishing, analytics}` |
| `landing` | Landing page content (stats, projects, features, pricing) |
| `maintenance` | `{enabled, message}` |
| `creditCosts` | Override default credit costs per action |
| `defaultUserCredits` | Override default credits for new users |

---

## Credits System

Each AI action deducts credits. Admins always bypass the check. First registered user is automatically admin.

| Action | Default Cost |
|---|---|
| Generate brand kit | 50 |
| Generate brand story | 10 |
| Generate brand long-form content | 5 |
| Generate campaign | 60 |
| Generate post image | 10 |
| Regenerate post | 8 |
| Generate post variant | 5 |
| Generate post long-form content | 5 |

Default new user balance: **100 credits**

Disable credits: `CREDITS_ENABLED=false` in environment.

---

## Extending the Project

### Add a new backend endpoint

```
1. app/models.py            → Add SQLAlchemy model (if new table needed)
2. app/schemas.py           → Add Pydantic request/response schemas
3. app/services/my_feat.py  → Business logic (no FastAPI imports here)
4. app/routes/my_feat.py    → Create APIRouter with routes
5. main.py                  → app.include_router(my_feat.router, prefix="/api")
```

### Add a new frontend page

```
1. src/pages/MyPage.tsx     → Create page component
2. src/App.tsx              → Add <Route path="/my-page" component={MyPage} />
3. src/components/Layout.tsx→ Add nav link if needed
```

### Regenerate frontend API client

After changing `lib/api-spec/openapi.yaml`:

```bash
pnpm --filter @workspace/api-spec run codegen
# Regenerates lib/api-client-react and lib/api-zod
```

### Swap auth provider (e.g. Clerk)

```
1. Create app/layers/clerk_auth.py implementing same interface as AuthLayer
2. In app/deps.py: auth_layer = ClerkAuthLayer()
   → No routes need to change
```

### Add AI provider

Edit `artifacts/api-server-python/app/services/ai/client.py`:
- Add to `_resolve_client()` priority chain
- Add model name mapping

---

## Excluded Features (Future Implementation)

Full guides in `artifacts/api-server-python/EXCLUDED_FEATURES.md`:

| Feature | Status | Guide |
|---|---|---|
| Stripe payments | Stub in `payments.py` | Section 2.1 |
| OAuth login (Google/GitHub) | Not started | Section 1.1 |
| Admin panel | Schema ready (`admin.ts`) | Section 3 |
| Social media publishing | Schema ready (`social-accounts.ts`) | Section 4.1 |
| Post scheduling | Column exists (`scheduled_at`) | Section 4.2 |
| Subscription tiers | Schema ready (`platform.ts`) | Section 2.3 |
| PDF brand book export | Not started | Section 8 |
| Asset library | Not started | Section 6 |
| Multi-tenant teams | Not started | Section 13 |
| Outbound webhooks | Schema ready (`platform.ts`) | Section 12 |
