# Brand Architect AI Pro

Cloned from https://github.com/mr-oskar/Brand-Architect-AI-pro-12-main-pro.1.1.3.2 and configured to run in Replit.

> 📘 **Full project documentation:** see [`DOCUMENTATION.md`](./DOCUMENTATION.md)  
> 🤖 **AI agent instructions (must-read for any agent editing this repo):** see [`AGENTS.md`](./AGENTS.md)  
> 🚀 **Deployment guide:** see [`DEPLOYMENT.md`](./DEPLOYMENT.md)

## Stack (quick reference)

- pnpm workspace monorepo (Node 24, TypeScript 5.9)
- Backend: Express 5 (`artifacts/api-server`) on port 8080
- Frontend: React 19 + Vite 7 SPA (`artifacts/brand-os`) on port 5000 (Replit webview)
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

- `API Server` — `PORT=8080 pnpm --filter @workspace/api-server run dev` (console)
- `Start application` — `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/brand-os run dev` (webview, port 5000 required by Replit preview)

> Do not run both `API Server` and `artifacts/api-server: API Server` simultaneously (port collision).

## Common commands

- `pnpm install` — install workspace deps
- `pnpm --filter @workspace/db run push` — push DB schema
- `pnpm run typecheck` / `pnpm run build`

## GitHub remote

- Origin: `https://github.com/mr-oskar/Brand-Architect-AI-pro-node.0.1`
- Push works directly from Replit Git pane (token stored in `~/.git-credentials`).

## Recent significant changes

- 2026-04-27 — **Nodes editor overhaul (`/nodes`)**: redesigned with a left collapsible sidebar (3 tabs: **Projects** = per-project workspaces with create/rename/duplicate/delete, **Add** = node palette + reset, **Inspector** = settings for the selected node, position editor, connection list with disconnect). Custom zoom control top-right (in/out/% input/fit/reset). All copy now in English; node frames shrunk; all action buttons icon-only with shadcn tooltips. Generate-image node outputs can be used as references for downstream generate nodes (frontend fetches the URL and converts to a base64 data URL before calling the backend). Reference uploads expose an `uploading` flag — the **Run** button is disabled until every connected reference is fully ready. Image-input nodes now expose `onUploadingChange` and image-input/generate-image nodes both feed into the reference list (`kind` flag). Workspaces persisted in `localStorage` under `nodes-editor-store-v2` (legacy `nodes-editor-graph-v1` migrated automatically). New files: `Sidebar.tsx`, `CanvasControls.tsx`, `storage.ts`. Default `deleteKeyCode` disabled on ReactFlow; custom `Delete`/`Backspace` shortcut deletes the selected node only when the focus isn't in an input/textarea.
- 2026-04-26 — Pushed full project state (Nodes editor + toolbar refinements) to the new empty `Brand-Architect-AI-pro-node.0.1` repo. Because the local clone was shallow with a dangling parent reference and the remote was empty, the 4 local commits were rewritten so the oldest (`a5a4094` → `2f85a5e`) became a root commit; commit content/messages preserved, SHAs new. Origin tip after the docs note: `422e838` (later auto-commits added by the platform are pushed automatically by a `.git/hooks/post-commit` hook).
- 2026-04-26 — Added Krea-style **Nodes** visual editor at `/nodes` (image references → prompt → AI image generation). Backend route `POST /api/nodes/generate-image` charges credits via `design.generate-image` and uses `generateImageWithReferences`. Frontend uses `@xyflow/react` with custom nodes (`ImageInputNode`, `PromptNode`, `GenerateImageNode`). Sidebar link added to Tools section.
- 2026-04-26 — Added comprehensive `DOCUMENTATION.md` (Arabic, full feature/architecture docs) and `AGENTS.md` (instructions for AI agents).
- 2026-04-26 — Fixed GitHub remote URL (was pointing to non-existent `oskar-77/...`); configured persistent credential storage.
- 2026-04-26 — Unified error notification system in `artifacts/brand-os/src/lib/apiError.ts` (`extractApiError` / `notifyError` / `notifySuccess`); wired into BrandDesignStudio, CampaignWorkspace, BrandKit.
- 2026-04-25 — Design Studio improvements: logo auto-injection (`ensureLogo`), `new-page` endpoint, mockup prompts, `safeParseJson`, Gemini provider priority.
