---
name: Admin API Key Store
description: How AI provider API keys are managed and resolved at runtime (DB vs env vars)
---

## Rule
AI provider keys are stored in `AppSetting` key `"apiKeys"` (JSONB) and read via `app/utils/api_key_store.py`. Do NOT add new provider logic directly to `client.py` — extend `KNOWN_PROVIDERS` in `api_key_store.py` instead.

## Provider priority (first wins)
1. Nano Banana (DB, OpenAI-compatible, custom base URL)
2. OpenAI (DB)
3. Google Gemini (DB)
4. `OPENAI_API_KEY` env var
5. `GEMINI_API_KEY` env var
6. Replit AI integration vars (`AI_INTEGRATIONS_OPENAI_API_KEY` + `AI_INTEGRATIONS_OPENAI_BASE_URL`)

## Cache behavior
- `api_key_store` refreshes from DB every 60s (TTL).
- `client.py` caches the `OpenAI` client for 60s.
- Call `api_key_store.invalidate()` + `ai_client.invalidate_client_cache()` after any admin update (already done in admin routes).

**Why:** Admins add keys via the UI without restarting the server; the TTL cache means changes take effect within 60s with no restart required.

## Admin frontend
- Page: `src/pages/AdminApiKeys.tsx` at route `/admin/api-keys`
- Nav link: Layout.tsx Admin section → "API Keys" (Key icon)
- Only visible/accessible to `role === "admin"` users

## Backend routes (all under `/api/admin/api-keys`)
- `GET /` → list with masked keys
- `POST /{provider}` → save/replace key
- `DELETE /{provider}` → remove key
- `POST /{provider}/toggle` → enable/disable
- `POST /{provider}/test` → live test (doesn't save)
