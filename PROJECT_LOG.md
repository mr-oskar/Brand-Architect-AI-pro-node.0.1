# Brand Architect AI Pro — Project Log

This file is the **single source of truth** for all work done on this project.

**Every agent session MUST:**
1. Read this file at the start of the session
2. Add a new `## Session [date]` entry at the **top** (newest first)
3. Mark items `[x]` when completed and `[ ]` for pending/planned
4. Never delete old entries — append only

## Session 2026-05-31 — Critical bug fixes (image gen, job store persistence)

### Completed
- [x] **Fix 1 — DALL-E 3 / gpt-image-1 images.edit bug** (`app/services/ai/image.py`)
  - Root cause: `images.edit` with file uploads only works for `dall-e-2`. gpt-image-1 and dall-e-3 do NOT support it.
  - Fix: `generate_image_with_logo_reference()` and `generate_image_with_references()` now dispatch by model:
    - `gpt-image-1` → `images.generate` with `image[]` param (native multi-image input)
    - `dall-e-2` → `images.edit` (classic file-upload edit API)
    - `dall-e-3` / unknown → `images.generate` prompt-only fallback
  - Added `_is_edit_capable()` guard; all paths fall back to prompt-only on any exception.

- [x] **Fix 2 — AI Keys "duplication" clarified** (no code change needed)
  - `admin.py` → `/api/admin/api-keys/*` — primary system used by frontend `AdminApiKeys.tsx`
  - `admin_models.py` → `/api/admin/models/*` — advanced model management layer (no route conflict)
  - Confirmed: zero route collision, both systems coexist correctly.

- [x] **Fix 3 — JobStore DB persistence** (`app/services/job_store.py`)
  - Root cause: jobs were purely in-memory; lost on every server restart, breaking async campaign generation.
  - Fix: rewrote JobStore to use raw psycopg2 connections against a new `background_jobs` table.
  - Key detail: had to use raw psycopg2 (`engine.raw_connection()`) with `%(param)s` style — SQLAlchemy `text()` with `::jsonb` cast conflicts with psycopg2 parameter parsing.
  - Also fixed: psycopg2 auto-parses JSON TEXT columns to Python dicts; `_db_read()` now handles both `dict` and `str` result types.
  - Table is auto-created on first `JobStore()` init (safe to call on every startup).
  - In-memory cache (10s TTL) retained for fast polling; DB is authoritative on cache miss.
  - Verified: jobs survive full cache eviction and are readable from DB.

### Pending (next session)
- [ ] Stripe payments integration
- [ ] Email system
- [ ] Fill in 5 "Coming Soon" pages

---

## Session 2026-05-31 — Per-task primary + fallback AI model configuration

### Completed
- [x] `artifacts/api-server-python/app/utils/task_model_store.py` — new module with 10 `TASK_DEFINITIONS`, `get_task_model_config()`, `save_task_model_config()`, `get_all_configs()`, `invalidate()`. Stores config in `AppSetting` key `"taskModelConfig"` with 60s TTL cache.
- [x] `artifacts/api-server-python/app/services/ai/client.py` — refactored: extracted `_execute_call()` retry helper; added `call_ai_with_fallback()` which reads task-specific primary/fallback from task_model_store, tries primary, on any exception retries with fallback (logged with `is_fallback=True` + `original_model_api_id`); `call_ai()` unchanged (backward compat); `_log_usage()` gains `is_fallback` + `original_model_api_id` params.
- [x] `app/services/ai/brand_kit.py` — `generate_brand_kit` + `generate_brand_story` → `call_ai_with_fallback` with `task_type="brand_kit"` / `"brand_story"`.
- [x] `app/services/ai/campaign.py` — `research_trends_and_opportunities`, `analyze_brief`, `generate_campaign` → `call_ai_with_fallback` with respective task_types.
- [x] `app/services/ai/post.py` — `regenerate_post`, `generate_post_variant`, `generate_long_form_content` → `call_ai_with_fallback` with respective task_types.
- [x] `artifacts/api-server-python/app/routes/admin_models.py` — added `GET /admin/models/task-config` and `PUT /admin/models/task-config/{task_type}`.
- [x] `artifacts/brand-os/src/pages/AdminTaskModels.tsx` — new admin page: table of all 10 tasks, per-row primary/fallback model inputs with suggestions dropdown, per-row Save/Revert, dirty-state tracking.
- [x] `artifacts/brand-os/src/components/Layout.tsx` — added `Cpu` icon + "Task Models" nav item in Admin section.
- [x] `artifacts/brand-os/src/App.tsx` — added lazy route `/admin/task-models → AdminTaskModels`.

### Verified
- API test: `GET /admin/models/task-config` → 10 tasks, all fields present
- API test: `PUT /admin/models/task-config/brand_kit` → saves primary=gpt-4o, fallback=gpt-4o-mini
- Both servers running cleanly, no errors in logs
- TypeScript: only pre-existing TS6305 errors (api-client-react not built), zero new errors

---

## Session 2026-05-31 — Token Optimization & Cost Monitoring

### Completed [x]

- [x] **DB migration** — `ai_usage_logs` extended with 5 new columns via `ALTER TABLE IF NOT EXISTS`: `input_tokens` (INTEGER), `output_tokens` (INTEGER), `total_tokens` (INTEGER), `monetary_cost` (DOUBLE PRECISION), `task_type` (TEXT). Migration applied and verified against live DB.
- [x] **`app/utils/token_pricing.py`** — New module. `MODEL_PRICING` dict mapping 30+ model IDs to `(input_per_1k, output_per_1k)` USD pricing. Prefix-based fallback matching for unknown model variants. `calculate_cost(model_id, input_tokens, output_tokens)` → USD float. `get_model_pricing()` + `format_cost_usd()` helpers. Covers OpenAI (gpt-4o-mini through gpt-5), Gemini (1.5/2.0/2.5 flash/pro), and image models (cost = 0 for image-only billing).
- [x] **`app/utils/token_optimizer.py`** — New module. `_TASK_BUDGETS` dict with optimized ceilings per task type (`brand_kit`=4096, `campaign`=8192, `trend_research`=3000, `brief_analysis`=600, `post_regen`/`post_variant`=1500, `long_form_blog`=4096, etc.). `get_max_tokens(task_type, prompt_length)` scales token budget proportionally for long prompts, clamped to [300, 16384].
- [x] **`app/services/ai/client.py`** — Major update: (1) `_log_usage()` helper writes token counts + monetary_cost + task_type to `ai_usage_logs` — silently swallows DB errors so AI calls are never broken by logging; (2) `call_ai()` now accepts optional `db`, `user_id`, `task_type` params — extracts `usage.prompt_tokens`/`completion_tokens` from each response; (3) Exponential backoff retry on 429 rate-limit errors (`_RETRY_MAX=3`, base 2s → max 30s).
- [x] **`app/services/ai/campaign.py`** — All three AI calls now use `get_max_tokens()`: `research_trends_and_opportunities` → `"trend_research"`, `analyze_brief` → `"brief_analysis"`, `generate_campaign` → `"campaign"` (scales with prompt length up to 8192).
- [x] **`app/services/ai/brand_kit.py`** — `generate_brand_kit` uses `get_max_tokens("brand_kit", prompt_len)` instead of hardcoded 8192; `generate_brand_story` uses `"brand_story"` (1500 tokens).
- [x] **`app/services/ai/post.py`** — `regenerate_post` uses `get_max_tokens("post_regen")`, `generate_post_variant` uses `"post_variant"`, `generate_long_form_content` uses dynamic `"long_form_{content_type}"`.
- [x] **`app/routes/admin_models.py`** — Three new/updated endpoints:
  - `GET /admin/models/logs` — extended response with `inputTokens`, `outputTokens`, `totalTokens`, `monetaryCost`, `taskType`; added `task_type` filter param.
  - `GET /admin/models/stats` — now includes `totalTokens`, `inputTokens`, `outputTokens`, `totalCostUsd` aggregates.
  - `GET /admin/models/cost-report?period=30d&group_by=model` — new. Aggregated cost by model/task/day/user. Returns summary totals + breakdown table with cost share %.
  - `GET /admin/models/health?period=24h` — new. Success rate, latency percentiles (p50/p90/p95/p99), top error distribution, per-model performance table, hourly call volume data.
- [x] **`artifacts/brand-os/src/pages/AdminCostDashboard.tsx`** — New admin page. Two sections: (1) Cost report with period/groupBy selectors, 4 summary stat cards, sortable breakdown table with cost % bars; (2) API health with success rate, latency cards, model performance table, error list, call volume sparkline, full latency percentile table.
- [x] **`artifacts/brand-os/src/components/Layout.tsx`** — Added "Cost Monitor" nav item under Admin section (icon: TrendingUp, href: `/admin/cost-dashboard`).
- [x] **`artifacts/brand-os/src/App.tsx`** — Added lazy route `/admin/cost-dashboard` → `AdminCostDashboard`.

### Notes
- Token logging is **opt-in at call site** — `call_ai()` only logs when `db` + `user_id` are passed. Routes that want per-request logging should pass the DB session. Direct `client.chat.completions.create()` calls in post.py/campaign.py currently do NOT log tokens (would require passing db session down the call chain — future enhancement).
- `monetary_cost` will be `NULL` in ai_usage_logs for calls made before this session (no backfill needed).
- All existing features unbroken: no public API signatures changed, no routes removed.

---

## Session 2026-05-31 — Multi-select Model Picker

### Completed [x]

- [x] **`AdminApiKeys.tsx`** — `ModelPicker` converted from radio (single) to checkbox (multi-select). `FormState.textModels`/`imageModels` are now `string[]`. Auto-select on fetch fills first model. Summary row pills show all selected models. "N selected · primary: X" hint below each picker. Custom model IDs add to the list instead of replacing.
- [x] **`admin.py`** — `SetApiKeyRequest` extended with `textModels: list[str]` and `imageModels: list[str]` (alongside legacy `textModel`/`imageModel` for backward compat). `set_api_key` route passes new fields to `api_key_store.save()`.
- [x] **`api_key_store.py`** — Added `_coerce_to_list()` helper. `save()` now accepts `text_models`/`image_models` lists and stores both `textModels` (list) and `textModel` (first item, backward compat). `get_model_for_use_case()` reads list first, falls back to single string. New `get_models_for_use_case()` returns full list. `get_provider_list()` returns `textModels`/`imageModels` arrays alongside legacy single-model keys.

---

## Session 2026-05-30 — Enhanced Admin API Keys Panel

### Completed [x]

- [x] **`api_key_store.py`** — Added `PROVIDER_MODELS` dict with all models per provider (text + image categories + defaults). Updated `save()` to store `textModel` and `imageModel` preferences per provider. Added `get_model_for_use_case(use_case)`, `get_active_provider_id()`, `get_gemini_api_key()`. Updated `get_provider_list()` to return `textModel`, `imageModel`, `availableTextModels`, `availableImageModels` per provider.
- [x] **`client.py`** — Updated `resolve_model()` to check DB model preference first (via `get_model_for_use_case("text")`). Added `get_image_model()` which returns DB preference or falls back to hardcoded defaults. Updated `call_ai()` docstring to document model resolution order.
- [x] **`image.py`** — Fixed Gemini image key resolution: now uses `get_gemini_api_key()` (DB first, then env var) instead of only reading env var. All image generation functions use `get_image_model()` for dynamic model selection instead of hardcoded `"gpt-image-1"`.
- [x] **`admin.py`** — Added `textModel` and `imageModel` to `SetApiKeyRequest`. Added `GET /admin/api-keys/models` (predefined model lists). Added `POST /admin/api-keys/{provider}/fetch-models` (live model fetch from provider API). Updated `/test` endpoint to accept and use `textModel`. Updated `/api-keys/{provider}` POST to pass model prefs to `api_key_store.save()`.
- [x] **`AdminApiKeys.tsx`** — Full rewrite with 3-tab UI per provider (API Key / Text Model / Image Model). `ModelSelector` component with radio-button model list + custom model input. Model pills showing active text/image model on provider card. "Fetch available models" button for Nano Banana. Improved test result display (warning state). Enabled/disabled toggle in form.
- [x] **Windows scripts** — `scripts/setup.bat`, `scripts/dev.bat`, `scripts/stop.bat` for one-click Windows dev. Updated `.env.example` to document `EXTERNAL_DATABASE_URL`.

---

## Session 2026-05-30 — Local Dev Setup, Docs Overhaul, Cleanup (continued)

### Completed [x]

- [x] **Local development setup:**
  - `scripts/setup.sh` — First-time setup: checks Node.js 20+/pnpm/Python 3.11+, copies `.env.example`, installs JS + Python deps, creates DB tables. Safe to re-run.
  - `scripts/dev.sh` — Daily startup: loads `.env` from root, starts Python backend (port 8080, background) + React frontend (port 5000, foreground). Ctrl+C stops both cleanly.
  - `.env.example` — Full template with all required and optional env vars, commented.
- [x] **Docs complete rewrite:**
  - `DOCUMENTATION.md` — Full rewrite: local dev guide (step-by-step + Docker option + Windows note), Admin Panel → API Keys section, updated architecture/structure/API reference, cross-references to all guide files.
  - `BACKEND_GUIDE.md` — Full rewrite: `api_key_store.py` in folder map, new "How AI client resolution works" flowchart, new "Adding an AI provider key" pattern, updated admin routes, curl examples.
  - `FRONTEND_GUIDE.md` — Full rewrite: `AdminApiKeys.tsx` in folder map + routing table, fixed Option C to use `apiFetch` (was raw `fetch`), added admin-only page pattern, added State Management table.
  - `replit.md` — Updated "Where to make changes" table, backend/frontend key files sections, debugging tips, "Local development" quick-start, "Recent significant changes".
  - `CHANGELOG.md` — Added comprehensive 2026-05-30 entry covering all work.
- [x] **Cleanup:**
  - Removed root `main.py` (Replit placeholder — `print("Hello from repl-nix-workspace!")`)
  - Removed `lib/integrations/integrations-openai-ai-server/` (no imports found anywhere)
  - Added `.env`, `.env.local`, `.env.*.local` to `.gitignore` (were missing — security risk)
- [x] **Memory:** Created `.agents/memory/MEMORY.md` + `api-key-store.md` topic file.

### Session 2026-05-30 — Admin API Key Management + Bug Fixes (earlier)

### Completed [x]

- [x] **Bug fix — `brands.py`:** `generate_brand_campaign` NameError (`charged` variable).
- [x] **Bug fix — `brand_kit.py`:** Silent AI fallback → now raises proper errors.
- [x] **Bug fix — `BrandKit.tsx`:** Raw `fetch()` → `apiFetch` (authenticated).
- [x] **New feature — Admin API Key Management:**
  - `app/utils/api_key_store.py` — 60s TTL DB cache + env var fallback
  - `app/services/ai/client.py` — reads from `api_key_store`, 60s client cache
  - `app/routes/admin.py` — 5 new routes (list/add/delete/toggle/test per provider)
  - `src/pages/AdminApiKeys.tsx` — full admin UI (add/edit/delete/test/toggle)
  - `App.tsx` + `Layout.tsx` — route + nav link registered

### Pending [ ]
- [ ] TypeScript typecheck may report pre-existing errors on `lib/api-client-react/dist/index.d.ts` — package exports from `src/` directly without a build step. Low priority.

---

## Session 2026-05-21 — Campaign Generation Overhaul

### Completed [x]
- [x] **Root cause analysis:** Identified 4 core problems with campaign generation:
  1. No trend research — comment "Add trend data injection" existed but was never implemented
  2. Only 5 of 15+ brand kit fields were passed to the AI (missing: dos/don'ts, audience segments, taglines, brand story, mission, vision, competitive position)
  3. `analyze_brief()` was only called when user wrote a brief — no analysis without brief
  4. No multi-phase pipeline — generation was a single prompt with no strategic research phase
- [x] **Rewrote `campaign.py`** with 3-phase multi-step pipeline:
  - **Phase 1 — `research_trends_and_opportunities()`** (always runs): AI researches current industry trends, audience pain points, campaign angles, proven hook techniques, trending hashtags, seasonal context, and recommends a campaign framework
  - **Phase 2 — `analyze_brief()`** (optional, when brief/images provided): analyzes client brief + vision-analyses reference images
  - **Phase 3 — `generate_campaign()`**: now receives full brand DNA block (all 15 brand kit fields including dos/don'ts, audience segments, taglines, brand story, mission, vision, competitive position) + trend research block + analyzed brief. Enforces 10 non-negotiable generation rules.
- [x] **Updated `brands.py`**: both `generate-campaign` and `campaign-brief-job` endpoints now call `research_trends_and_opportunities()` before generation. `campaign-brief-job` adds progress step labels for each phase.
- [x] **Added `step` field to `Job` dataclass** in `job_store.py` — pipeline now reports current step label ("Researching industry trends", "Analyzing campaign brief", etc.)
- [x] **Updated `/api/jobs/:id` route** in `system.py` to return `step` field so frontend can display current progress label
- [x] Updated `campaign-brief-job` total steps from 6 → 7 to match new pipeline

### Pending [ ]
- [ ] Frontend: use `step` field in job progress UI for better UX feedback

---

## Session 2026-05-21 — Refactoring & Agent Rules

### Completed [x]
- [x] Migrated project from Replit Agent to Replit environment
- [x] Installed Python deps via `uv sync`, Node deps via `pnpm install`
- [x] Fixed DB model type mismatch: `brands.user_id` changed from `Text` → `PG_UUID`
- [x] Created all DB tables via `Base.metadata.create_all()`
- [x] Configured AI integration (Replit OpenAI proxy) for Python backend
- [x] Added strong "NEVER BREAK EXISTING FEATURES" rules to `replit.md`
- [x] Created `PROJECT_LOG.md` (this file) for session tracking
- [x] Created `src/lib/imageUtils.ts` — extracted `removeLogoBackground`, `resizeImageFile`, `fileToDataUrl` from `CampaignWorkspace.tsx` and `BrandWizard.tsx`
- [x] Created `src/lib/apiFetch.ts` — centralized authenticated fetch wrapper (replaces scattered `authHeaders()` + raw `fetch` calls)
- [x] Added new shared types to `src/types/index.ts`: `ImageSize`, `ImageGenOptions`, `PostImageHistoryEntry`, `ReferenceImageItem`, `PostVariant`, `LongFormContent`
- [x] Added new shared constants to `src/lib/constants.ts`: `PLATFORM_CONFIG`, `IMAGE_SIZE_OPTIONS`, `IMAGE_MODEL_OPTIONS`, `IMAGE_ASPECT_PRESETS`, `POST_STATUS_BADGE`
- [x] Extracted `ImageGenDialog` from `CampaignWorkspace.tsx` → `src/components/ImageGenDialog.tsx`
- [x] Extracted `PostPreviewDialog` from `CampaignWorkspace.tsx` → `src/components/PostPreviewDialog.tsx`
- [x] Extracted `PostCard` + field sub-components from `CampaignWorkspace.tsx` → `src/components/PostCard.tsx`
- [x] Updated `CampaignWorkspace.tsx`: reduced from 1885 → ~400 lines (page orchestration only)
- [x] Updated `BrandWizard.tsx`: replaced inline image processing with `resizeImageFile` from `imageUtils`
- [x] Fixed security issue: moved scattered `authHeaders()` to centralized `apiFetch.ts`

### Known Issues / Pending [ ]
- [ ] `job_store.py` uses in-memory storage — jobs are lost on server restart. Migrate to DB or Redis.
- [ ] `threading.Thread` in `posts.py` for bulk image gen doesn't scale across instances. Migrate to task queue (Celery/RQ) when needed.
- [ ] `CampaignBriefPage.tsx` has hardcoded platform data — should use `PLATFORM_CONFIG` from constants
- [ ] Auth token sent in both cookie and Authorization header — consolidate to one approach
- [ ] `BrandKit.tsx` PDF generation mixes inline styles with Tailwind — needs cleanup
- [ ] No `meta` tags or Open Graph — add in `index.html` for social sharing previews
- [ ] `PostCard` inside `PostCard.tsx` is still ~450 lines — consider extracting individual panel components (VariantPanel, LongFormPanel) in a future session

---

## Session 2026-05-19 — Architecture Refactor (original)

### Completed [x]
- [x] Added `app/middleware/` folder — `RequestLoggerMiddleware` extracted from `main.py`
- [x] Added `app/utils/` folder — `pagination.py`, `ownership.py`, `ai_errors.py`
- [x] Added `src/types/index.ts` — shared TypeScript types
- [x] Added `src/lib/constants.ts` — app-wide constants
- [x] Added `src/hooks/useDebounce.ts`, `useLocalStorage.ts`, `useJobPoller.ts`
- [x] Credits system rewritten with full transaction logging
- [x] Admin management API added (`/api/admin/*`)
- [x] Rate limiting (slowapi) + CORS hardening
- [x] Deleted TypeScript/Express backend — Python only
- [x] LTR enforced globally in `index.html` and `SiteSettingsContext`
- [x] Removed dead code (`nodesExport.ts`)
- [x] Added `BACKEND_GUIDE.md`, `FRONTEND_GUIDE.md`, `CHANGELOG.md`, `DOCUMENTATION.md`

---

## Feature Roadmap (unscheduled)

These features are planned but not yet started:

- [ ] **Post preview before publishing** — mock Instagram/LinkedIn/Twitter layout ✅ Done (PostPreviewDialog exists)
- [ ] **Campaign CSV export** — download all posts as spreadsheet ✅ Done (exportCampaignCSV in CampaignWorkspace)
- [ ] **Multi-user / team collaboration** — multiple users per brand workspace
- [ ] **Social media publishing** — direct publish to Instagram/LinkedIn APIs
- [ ] **Scheduled publishing calendar** — visual calendar with time slots
- [ ] **Design Studio** — currently "Coming Soon" placeholder
- [ ] **Brand Book** — currently "Coming Soon" placeholder
- [ ] **Asset Library** — currently "Coming Soon" placeholder
- [ ] **Content Calendar** — currently "Coming Soon" placeholder
- [ ] **Stripe payments / credit packages** — `payments.py` stub exists, needs implementation
- [ ] **Credit packages purchase flow** — UI to buy credits
- [ ] **Image background removal (server-side)** — upgrade from canvas heuristic to AI-based removal
- [ ] **Onboarding tour** for new users
- [ ] **SEO / Open Graph meta tags** in index.html
