"""
Task Model Store — per-task primary + fallback AI model configuration.

Stored in AppSetting key "taskModelConfig":
{
  "brand_kit": {"primaryModel": "gpt-4o", "fallbackModel": "gpt-4o-mini"},
  "campaign":  {"primaryModel": "gpt-4o", "fallbackModel": "gpt-4o-mini"},
  ...
}

Call invalidate() after writing so the next request picks up the change.
Cache TTL: 60 seconds (matches api_key_store.CACHE_TTL).
"""
import logging
import time
from typing import Optional

logger = logging.getLogger("brand-os")

_cache: dict = {}
_last_refresh: float = 0
CACHE_TTL = 60  # seconds

# ── Task registry ──────────────────────────────────────────────────────────────

TASK_DEFINITIONS: dict[str, dict] = {
    "brand_kit":            {
        "label":       "Brand Kit Generation",
        "description": "Generate full brand identity — personality, colors, tone of voice, messaging",
    },
    "brand_story":          {
        "label":       "Brand Story",
        "description": "Write a compelling brand origin and purpose story (3 paragraphs)",
    },
    "campaign":             {
        "label":       "Campaign Generation",
        "description": "Generate a complete multi-day social media campaign with posts",
    },
    "trend_research":       {
        "label":       "Trend Research",
        "description": "Research market trends and opportunities for campaign briefs",
    },
    "brief_analysis":       {
        "label":       "Brief Analysis",
        "description": "Analyze campaign briefs and extract strategic insights",
    },
    "post_regen":           {
        "label":       "Post Regeneration",
        "description": "Regenerate caption, hook, and CTA for a social media post",
    },
    "post_variant":         {
        "label":       "Post Variant (A/B)",
        "description": "Generate an A/B content variant for a social media post",
    },
    "long_form_blog":       {
        "label":       "Long-form Blog",
        "description": "Expand a post hook into a full blog article",
    },
    "long_form_newsletter": {
        "label":       "Newsletter",
        "description": "Expand a post hook into a newsletter edition",
    },
    "long_form_linkedin":   {
        "label":       "LinkedIn Article",
        "description": "Expand a post hook into a LinkedIn long-form article",
    },
}


# ── Internal helpers ───────────────────────────────────────────────────────────

def _load_from_db() -> dict:
    """Load task model config from AppSetting table. Returns empty dict on error."""
    try:
        from app.database import SessionLocal
        from app.models import AppSetting
        db = SessionLocal()
        try:
            row = db.query(AppSetting).filter(AppSetting.key == "taskModelConfig").first()
            return dict(row.value) if row and isinstance(row.value, dict) else {}
        finally:
            db.close()
    except Exception as exc:
        logger.warning("task_model_store: DB load failed: %s", exc)
        return {}


def _ensure_fresh() -> None:
    global _last_refresh
    if time.time() - _last_refresh > CACHE_TTL:
        _cache.clear()
        _cache.update(_load_from_db())
        _last_refresh = time.time()


# ── Public API ─────────────────────────────────────────────────────────────────

def invalidate() -> None:
    """Force a cache refresh on the next access."""
    global _last_refresh
    _last_refresh = 0


def get_task_model_config(task_type: str) -> dict:
    """
    Return {"primaryModel": str|None, "fallbackModel": str|None} for a task type.
    Both values are None when no override has been saved by the admin.
    """
    _ensure_fresh()
    entry = _cache.get(task_type, {})
    return {
        "primaryModel":  (entry.get("primaryModel")  or None),
        "fallbackModel": (entry.get("fallbackModel") or None),
    }


def get_all_configs() -> dict:
    """Return the full config dict {task_type: {primaryModel, fallbackModel}}."""
    _ensure_fresh()
    return dict(_cache)


def save_task_model_config(
    db,
    task_type: str,
    primary_model: Optional[str],
    fallback_model: Optional[str],
) -> None:
    """Persist primary + fallback model for a task type and invalidate cache."""
    from app.models import AppSetting

    row = db.query(AppSetting).filter(AppSetting.key == "taskModelConfig").first()
    stored: dict = dict(row.value) if row and isinstance(row.value, dict) else {}

    stored[task_type] = {
        "primaryModel":  (primary_model  or "").strip() or None,
        "fallbackModel": (fallback_model or "").strip() or None,
    }

    if row:
        row.value = stored
    else:
        row = AppSetting(key="taskModelConfig", value=stored)
        db.add(row)

    db.commit()
    invalidate()
    logger.info(
        "task_model_store: saved %s → primary=%s fallback=%s",
        task_type, stored[task_type]["primaryModel"], stored[task_type]["fallbackModel"],
    )
