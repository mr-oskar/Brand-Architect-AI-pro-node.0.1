# Changelog

All notable changes to Brand Architect AI Pro are documented here.
Format: `[YYYY-MM-DD] — Category: Description`

---

## [2026-05-19] — Architecture: Backend/Frontend structure refactored for scalability

### Backend — New folders added
- **`app/middleware/`** — Middleware extracted from `main.py` into dedicated classes
  - `logging.py` → `RequestLoggerMiddleware`: logs every HTTP request with timing
  - `__init__.py` → re-exports all middleware for clean imports in `main.py`
- **`app/utils/`** — Shared stateless helpers, no longer scattered in route files
  - `pagination.py` → `PaginationParams`, `paginate()`: uniform pagination for all list endpoints
  - `ownership.py` → `get_owned_brand()`, `get_owned_campaign()`, `get_owned_post()`: DRY ownership checks
  - `ai_errors.py` → `handle_ai_error()`: maps AI provider exceptions to HTTP responses
  - `__init__.py` → re-exports all utils for clean imports

### Backend — Updated files
- **`main.py`** — Cleaner middleware registration with documented stack order (CORS → SlowAPI → Logger)
  - Removed `@app.middleware("http")` decorator pattern (replaced with `app/middleware/logging.py`)

### Frontend — New folders and files
- **`src/types/index.ts`** — Shared TypeScript types (AuthUser, BrandKit, PostSummary, JobProgress, etc.)
- **`src/lib/constants.ts`** — App-wide constants (token key, limits, platform list, poll intervals)
- **`src/hooks/useDebounce.ts`** — Debounce hook for search inputs
- **`src/hooks/useLocalStorage.ts`** — localStorage-backed state hook
- **`src/hooks/useJobPoller.ts`** — Background job polling hook for AI generation tasks

### Documentation
- **`CHANGELOG.md`** (this file) — Added to track all changes
- **`BACKEND_GUIDE.md`** — Full backend architecture guide: folder map, patterns, how to add features
- **`FRONTEND_GUIDE.md`** — Full frontend architecture guide: folder map, patterns, how to add pages

---

## [2026-05-19] — Security: Rate Limiting + CORS hardening

- **Rate Limiting** added via `slowapi`:
  - `POST /api/auth/login` → 10 req/min per IP
  - `POST /api/auth/register` → 5 req/min per IP
  - `GET /api/auth/me` → 60 req/min per IP
  - Returns `429 Too Many Requests` with `Retry-After` header
- **CORS** restricted from `"*"` to an explicit allowlist:
  - Sources: `REPLIT_DOMAINS` env var (auto-injected by Replit) + localhost variants
  - Override: set `ALLOWED_ORIGINS=https://yourdomain.com` for custom domains
  - Logic lives in `app/config.py → _build_allowed_origins()`
- New file: `app/layers/rate_limit.py` — `limiter` singleton + `rate_limit_exceeded_handler`

---

## [2026-05-19] — Setup: Project migrated to Replit environment

- Installed all Node.js and Python dependencies
- Connected Replit PostgreSQL — database tables created
- Wired Replit AI Integration (OpenAI proxy) — `AI_INTEGRATIONS_OPENAI_API_KEY` auto-provisioned
- `AUTH_JWT_SECRET` moved to Replit environment variables
- Both workflows running: `Python API Server` (port 8080) + `Start application` (port 5000)

---

## [2026-05-19] — Cleanup: LTR enforced globally, dead code removed

- `artifacts/brand-os/index.html` → `dir="ltr"` enforced
- `SiteSettingsContext.tsx` → `dir` hardcoded to `"ltr"`, RTL logic removed
- `CampaignList.tsx` → removed `dir="rtl"` attribute
- Deleted `artifacts/brand-os/src/lib/nodesExport.ts` (orphaned, no imports)
- Added comprehensive `DOCUMENTATION.md`

---

## [2026-05-19] — Architecture: TypeScript/Express backend deleted

- `artifacts/api-server` (Express backend) deleted entirely
- All features ported to Python FastAPI backend (`artifacts/api-server-python`)
- Project now has a single backend — Python only

---

## [2026-05-18] — Launch: Python backend fully activated

- FastAPI backend running on port 8080
- AI resolves via Replit AI Integrations (OpenAI-compatible proxy)
- Custom JWT auth (python-jose + bcrypt) — no external auth provider
- Credits system: first registered user = admin (exempt from credits)
