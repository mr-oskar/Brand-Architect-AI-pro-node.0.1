---
name: Token Pricing & Cost Monitoring
description: How token counting, USD cost calculation, and AI usage logging work after the 2026-05-31 session.
---

## Token pricing (app/utils/token_pricing.py)
- `MODEL_PRICING` dict: model_id → (input_per_1k_USD, output_per_1k_USD)
- Prefix-based fallback for unknown variants (e.g. "gpt-4o-mini-2024-xx" → gpt-4o-mini price)
- Image models return (0, 0) — they are billed per image, not per token
- `calculate_cost(model_id, input_tokens, output_tokens)` → float USD rounded to 8 dp
- Update `MODEL_PRICING` when provider pricing changes

## Token optimizer (app/utils/token_optimizer.py)
- `get_max_tokens(task_type, prompt_length=0)` → int clamped [300, 16384]
- Task budgets: brand_kit=4096, campaign=8192, trend_research=3000, brief_analysis=600, post_regen/post_variant=1500, long_form_blog=4096
- Scales up by prompt_length when > 2000 chars (adds up to 512 extra tokens)
- Adding a new task type: add key to `_TASK_BUDGETS`

## ai_usage_logs schema (DB columns added 2026-05-31)
New columns: input_tokens (INTEGER), output_tokens (INTEGER), total_tokens (INTEGER), monetary_cost (DOUBLE PRECISION), task_type (TEXT)
Migration: `ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS ...` (already applied)

## Logging in call_ai()
- `call_ai()` accepts optional `db`, `user_id`, `task_type` params
- When `db` is provided, writes a row to ai_usage_logs after every call (success or failure)
- Token extraction: `response.usage.prompt_tokens` / `completion_tokens`
- Cost = calculate_cost(chosen_model, input_tokens, output_tokens)
- DB errors in logging are silently swallowed so AI calls are never broken by them

**Why opt-in:** routes that call `call_ai()` indirectly (via AI service functions) don't yet pass db/user_id — would require threading db session through the full call chain. Direct integration into route handlers is the clean path for future work.

## Retry on 429
- `call_ai()` retries up to `_RETRY_MAX=3` times on rate-limit errors
- Delay: `min(2 * 2^attempt, 30)` seconds between retries
- Pattern matching: checks for "429", "rate limit", "too many requests", "ratelimit" in error string

## Admin endpoints
- `GET /api/admin/models/cost-report?period=30d&group_by=model` → aggregated cost/tokens by model|task|day|user
- `GET /api/admin/models/health?period=24h` → success rate, latency percentiles, error distribution, model perf, call volume
- Frontend: `/admin/cost-dashboard` (AdminCostDashboard.tsx) — admin-only, in sidebar under Admin section
