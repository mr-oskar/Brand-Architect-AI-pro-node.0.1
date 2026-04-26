# Brand Architect AI Pro

Cloned from https://github.com/mr-oskar/Brand-Architect-AI-pro-12-main-pro.1.1.3.2 and configured to run in Replit.

> 📘 **Full project documentation:** see [`DOCUMENTATION.md`](./DOCUMENTATION.md)  
> 🤖 **AI agent instructions (must-read for any agent editing this repo):** see [`AGENTS.md`](./AGENTS.md)  
> 🚀 **Deployment guide:** see [`DEPLOYMENT.md`](./DEPLOYMENT.md)

## Stack (quick reference)

- pnpm workspace monorepo (Node 24, TypeScript 5.9)
- Backend: Express 5 (`artifacts/api-server`) on port 8080
- Frontend: React 19 + Vite 7 SPA (`artifacts/brand-os`) on port 5173
- DB: PostgreSQL + Drizzle ORM (`lib/db`)
- AI: OpenAI + Gemini (via `lib/integrations/`)
- Auth: Clerk (frontend) + JWT/session (backend)

## Configured env (Replit)

- `DATABASE_URL` (Replit Postgres)
- `SESSION_SECRET`, `AUTH_JWT_SECRET`
- `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY` (auto)
- `GEMINI_API_KEY` (user secret)
- `GITHUB_PERSONAL_ACCESS_TOKEN` (user secret — stored in `~/.git-credentials`)
- `VITE_CLERK_PUBLISHABLE_KEY` (test key)

## Workflows

- `API Server` — `PORT=8080 pnpm --filter @workspace/api-server run dev`
- `Start application` — `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/brand-os run dev`

> Do not run both `API Server` and `artifacts/api-server: API Server` simultaneously (port collision).

## Common commands

- `pnpm install` — install workspace deps
- `pnpm --filter @workspace/db run push` — push DB schema
- `pnpm run typecheck` / `pnpm run build`

## GitHub remote

- Origin: `https://github.com/mr-oskar/Brand-Architect-AI-pro-12-main-pro.1.1.3.2.git`
- Push works directly from Replit Git pane (token stored in `~/.git-credentials`).

## Recent significant changes

- 2026-04-26 — Added Krea-style **Nodes** visual editor at `/nodes` (image references → prompt → AI image generation). Backend route `POST /api/nodes/generate-image` charges credits via `design.generate-image` and uses `generateImageWithReferences`. Frontend uses `@xyflow/react` with custom nodes (`ImageInputNode`, `PromptNode`, `GenerateImageNode`). Sidebar link added to Tools section.
- 2026-04-26 — Added comprehensive `DOCUMENTATION.md` (Arabic, full feature/architecture docs) and `AGENTS.md` (instructions for AI agents).
- 2026-04-26 — Fixed GitHub remote URL (was pointing to non-existent `oskar-77/...`); configured persistent credential storage.
- 2026-04-26 — Unified error notification system in `artifacts/brand-os/src/lib/apiError.ts` (`extractApiError` / `notifyError` / `notifySuccess`); wired into BrandDesignStudio, CampaignWorkspace, BrandKit.
- 2026-04-25 — Design Studio improvements: logo auto-injection (`ensureLogo`), `new-page` endpoint, mockup prompts, `safeParseJson`, Gemini provider priority.
