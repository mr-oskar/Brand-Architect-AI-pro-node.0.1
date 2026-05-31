---
name: Task Model Store
description: Per-task primary + fallback AI model configuration — how it works and where to extend.
---

## Rule
Every AI generation task (brand_kit, campaign, post_regen, etc.) can have a dedicated primary model and an automatic fallback model configured by the admin at runtime, without code changes or restarts.

**Why:** Allows the admin to use a powerful expensive model (gpt-4o) for brand kit generation but fall back to a cheaper model (gpt-4o-mini) if it fails, and use a fast cheap model for trend research by default — all configurable per task from the UI.

**How to apply:** Use `call_ai_with_fallback(system_prompt, user_prompt, task_type="<task>", max_tokens=...)` instead of `call_ai()` for any generation that should respect per-task model overrides.

## Storage
- `AppSetting` key `"taskModelConfig"` (JSONB) → `{"brand_kit": {"primaryModel": "gpt-4o", "fallbackModel": "gpt-4o-mini"}, ...}`
- 60s TTL in-memory cache; call `task_model_store.invalidate()` after writing.

## TASK_DEFINITIONS (10 tasks)
Defined in `app/utils/task_model_store.py`:
- brand_kit, brand_story, campaign, trend_research, brief_analysis
- post_regen, post_variant, long_form_blog, long_form_newsletter, long_form_linkedin

## call_ai_with_fallback() logic
1. Reads `task_model_store.get_task_model_config(task_type)` → primary + fallback model names
2. Resolves primary model (task override → `model` arg → DB preference → settings default)
3. Calls `_execute_call()` with primary model (has its own 429 retry loop)
4. On ANY unrecoverable exception AND fallback configured → calls `_execute_call()` again with fallback
5. Fallback call is logged with `is_fallback=True` and `original_model_api_id=<primary>`
6. If both fail → raises the fallback exception

## Admin UI
`/admin/task-models` → `AdminTaskModels.tsx` page with per-task primary/fallback inputs + suggestion dropdown.

## API endpoints
- `GET  /api/admin/models/task-config` — list all 10 tasks with current config
- `PUT  /api/admin/models/task-config/{task_type}` — save primary + fallback for one task

## Adding a new task type
1. Add entry to `TASK_DEFINITIONS` in `task_model_store.py`
2. Call `call_ai_with_fallback(..., task_type="new_task_type")` in the relevant service function
3. No migration needed — AppSetting JSONB extends automatically
