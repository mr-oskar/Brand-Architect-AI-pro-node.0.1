# Brand Architect AI Pro — Project Log

This file is the **single source of truth** for all work done on this project.

**Every agent session MUST:**
1. Read this file at the start of the session
2. Add a new `## Session [date]` entry at the **top** (newest first)
3. Mark items `[x]` when completed and `[ ]` for pending/planned
4. Never delete old entries — append only

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
