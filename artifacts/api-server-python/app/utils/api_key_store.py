"""
API Key Store — reads AI provider API keys from DB with in-memory TTL cache.

Priority for each provider:
  1. DB-stored key (admin panel → Admin → API Keys)
  2. Environment variable fallback

Call `invalidate()` after any admin update so the next request picks up the change.
Automatic refresh happens every CACHE_TTL seconds.
"""
import logging
import time
from typing import Optional

logger = logging.getLogger("brand-os")

_cache: dict = {}
_last_refresh: float = 0
CACHE_TTL = 60  # seconds

KNOWN_PROVIDERS: dict[str, dict] = {
    "openai": {
        "label": "OpenAI",
        "description": "Official OpenAI API — GPT-4o, GPT-4.1, DALL-E 3, gpt-image-1",
        "has_base_url": False,
        "default_base_url": "https://api.openai.com/v1",
        "docs_url": "https://platform.openai.com/api-keys",
    },
    "gemini": {
        "label": "Google Gemini",
        "description": "Google Generative AI — Gemini 2.5 Pro/Flash + Imagen 3 image generation",
        "has_base_url": False,
        "default_base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "docs_url": "https://aistudio.google.com/apikey",
    },
    "custom": {
        "label": "Custom Compatible API",
        "description": "Any OpenAI-compatible endpoint — self-hosted models, proxies, alternative providers",
        "has_base_url": True,
        "default_base_url": "",
        "docs_url": "",
    },
}

# Backward-compat alias: DB entries stored under "nano_banana" are read as "custom"
_LEGACY_ALIAS = {"nano_banana": "custom"}

# Default fallback models (used before any live fetch)
PROVIDER_DEFAULTS = {
    "openai":  {"text": "gpt-4o-mini",            "image": "gpt-image-1"},
    "gemini":  {"text": "gemini-2.5-flash",        "image": "gemini-2.5-flash-preview-image-generation"},
    "custom":  {"text": "gpt-4o-mini",             "image": "gpt-image-1"},
    "nano_banana": {"text": "gpt-4o-mini",         "image": "gpt-image-1"},   # legacy
}


# ── Internal helpers ──────────────────────────────────────────────────────────

def _load_from_db() -> dict:
    """Load API keys from AppSetting table. Returns empty dict on error."""
    try:
        from app.database import SessionLocal
        from app.models import AppSetting
        db = SessionLocal()
        try:
            row = db.query(AppSetting).filter(AppSetting.key == "apiKeys").first()
            return dict(row.value) if row and isinstance(row.value, dict) else {}
        finally:
            db.close()
    except Exception as exc:
        logger.warning("api_key_store: DB load failed: %s", exc)
        return {}


def _ensure_fresh() -> None:
    global _last_refresh
    if time.time() - _last_refresh > CACHE_TTL:
        _cache.clear()
        _cache.update(_load_from_db())
        _last_refresh = time.time()


def _canonical(provider_id: str) -> str:
    """Resolve legacy provider IDs to their canonical form."""
    return _LEGACY_ALIAS.get(provider_id, provider_id)


# ── Public API ────────────────────────────────────────────────────────────────

def invalidate() -> None:
    """Force a cache refresh on the next access."""
    global _last_refresh
    _last_refresh = 0


def refresh(db) -> None:
    """Refresh from a caller-provided DB session (avoids opening a new connection)."""
    global _last_refresh
    try:
        from app.models import AppSetting
        row = db.query(AppSetting).filter(AppSetting.key == "apiKeys").first()
        _cache.clear()
        if row and isinstance(row.value, dict):
            _cache.update(row.value)
        _last_refresh = time.time()
    except Exception as exc:
        logger.warning("api_key_store: refresh failed: %s", exc)
        _last_refresh = time.time()


def save(
    db,
    provider: str,
    api_key: str,
    base_url: Optional[str] = None,
    enabled: bool = True,
    text_model: Optional[str] = None,
    image_model: Optional[str] = None,
) -> None:
    """Persist a provider API key (+ optional model prefs) to the DB and invalidate cache."""
    from app.models import AppSetting
    row = db.query(AppSetting).filter(AppSetting.key == "apiKeys").first()
    stored: dict = dict(row.value) if row and isinstance(row.value, dict) else {}
    existing = stored.get(provider, {})

    defaults = PROVIDER_DEFAULTS.get(_canonical(provider), {})
    entry: dict = {"apiKey": api_key, "enabled": enabled}
    if base_url:
        entry["baseUrl"] = base_url
    entry["textModel"]  = text_model  or existing.get("textModel")  or defaults.get("text",  "")
    entry["imageModel"] = image_model or existing.get("imageModel") or defaults.get("image", "")

    stored[provider] = entry
    if row:
        row.value = stored
    else:
        row = AppSetting(key="apiKeys", value=stored)
        db.add(row)
    db.commit()
    invalidate()


def delete_provider(db, provider: str) -> None:
    """Remove a provider from the DB and invalidate the cache."""
    from app.models import AppSetting
    row = db.query(AppSetting).filter(AppSetting.key == "apiKeys").first()
    if row and isinstance(row.value, dict):
        stored = dict(row.value)
        stored.pop(provider, None)
        stored.pop(_LEGACY_ALIAS.get(provider, ""), None)   # also remove legacy key
        row.value = stored
        db.commit()
    invalidate()


def toggle_provider(db, provider: str, enabled: bool) -> None:
    """Enable or disable a provider without changing the key."""
    from app.models import AppSetting
    row = db.query(AppSetting).filter(AppSetting.key == "apiKeys").first()
    if not row or not isinstance(row.value, dict):
        return
    stored = dict(row.value)
    if provider in stored:
        stored[provider] = {**stored[provider], "enabled": enabled}
        row.value = stored
        db.commit()
    invalidate()


# ── Credential & model resolution ─────────────────────────────────────────────

def _get_entry(provider_id: str) -> dict:
    """Return the cache entry for a provider, checking legacy aliases too."""
    entry = _cache.get(provider_id, {})
    if not entry:
        for legacy, canonical in _LEGACY_ALIAS.items():
            if canonical == provider_id:
                entry = _cache.get(legacy, {})
                if entry:
                    break
    return entry


def get_best_provider() -> tuple[Optional[str], Optional[str], str]:
    """
    Returns (api_key, base_url, provider_type) for the best available provider.
    provider_type: "openai" | "gemini"

    Priority:
      1. Custom (DB)        — OpenAI-compatible, custom base URL
      2. nano_banana (DB)   — legacy alias for custom
      3. OpenAI (DB)        — official OpenAI
      4. Gemini (DB)        — Google Generative AI
      5. OPENAI_API_KEY env
      6. GEMINI_API_KEY env
      7. Replit AI integration
    """
    _ensure_fresh()
    from app.config import settings

    # 1 + 2. Custom / legacy nano_banana (OpenAI-compatible)
    for key in ("custom", "nano_banana"):
        e = _cache.get(key, {})
        if e.get("enabled") and e.get("apiKey") and e.get("baseUrl"):
            return e["apiKey"], e["baseUrl"], "openai"

    # 3. OpenAI (DB)
    oa = _get_entry("openai")
    if oa.get("enabled") and oa.get("apiKey"):
        return oa["apiKey"], None, "openai"

    # 4. Gemini (DB)
    gm = _get_entry("gemini")
    if gm.get("enabled") and gm.get("apiKey"):
        return gm["apiKey"], KNOWN_PROVIDERS["gemini"]["default_base_url"], "gemini"

    # 5. OPENAI_API_KEY env var
    if settings.openai_api_key:
        return settings.openai_api_key, settings.openai_base_url or None, "openai"

    # 6. GEMINI_API_KEY env var
    if settings.gemini_api_key:
        return settings.gemini_api_key, KNOWN_PROVIDERS["gemini"]["default_base_url"], "gemini"

    # 7. Replit AI integration
    if settings.ai_integrations_openai_api_key and settings.ai_integrations_openai_base_url:
        return (
            settings.ai_integrations_openai_api_key,
            settings.ai_integrations_openai_base_url,
            "openai",
        )

    return None, None, "none"


def get_active_provider_id() -> Optional[str]:
    """Return the canonical ID of the currently active DB provider (or None for env-var)."""
    _ensure_fresh()
    from app.config import settings

    for key in ("custom", "nano_banana"):
        e = _cache.get(key, {})
        if e.get("enabled") and e.get("apiKey") and e.get("baseUrl"):
            return "custom"

    oa = _get_entry("openai")
    if oa.get("enabled") and oa.get("apiKey"):
        return "openai"

    gm = _get_entry("gemini")
    if gm.get("enabled") and gm.get("apiKey"):
        return "gemini"

    return None


def get_model_for_use_case(use_case: str) -> Optional[str]:
    """
    Return the DB-stored model preference for the active provider.
    use_case: "text" | "image"
    Returns None when no preference is stored (callers use built-in defaults).
    """
    _ensure_fresh()
    provider_id = get_active_provider_id()
    if not provider_id:
        return None
    entry = _get_entry(provider_id)
    key = "textModel" if use_case == "text" else "imageModel"
    return entry.get(key) or None


def get_gemini_api_key() -> Optional[str]:
    """Return the Gemini API key from DB (preferred) or env var."""
    _ensure_fresh()
    from app.config import settings
    gm = _get_entry("gemini")
    if gm.get("apiKey"):
        return gm["apiKey"]
    return settings.gemini_api_key or None


def get_provider_list(db) -> list[dict]:
    """Return all known providers with masked keys and model prefs — for the admin panel."""
    refresh(db)
    from app.config import settings

    result = []
    for provider_id, meta in KNOWN_PROVIDERS.items():
        entry = _get_entry(provider_id)
        api_key: str = entry.get("apiKey", "")

        env_configured = False
        if provider_id == "openai":
            env_configured = bool(settings.openai_api_key or settings.ai_integrations_openai_api_key)
        elif provider_id == "gemini":
            env_configured = bool(settings.gemini_api_key)

        defaults = PROVIDER_DEFAULTS.get(provider_id, {})

        result.append({
            "id":            provider_id,
            "label":         meta["label"],
            "description":   meta["description"],
            "hasBaseUrl":    meta["has_base_url"],
            "defaultBaseUrl": meta["default_base_url"],
            "docsUrl":       meta.get("docs_url", ""),
            "enabled":       entry.get("enabled", False) if api_key else False,
            "configured":    bool(api_key),
            "envConfigured": env_configured and not api_key,
            "maskedKey":     f"...{api_key[-4:]}" if len(api_key) >= 4 else ("****" if api_key else ""),
            "baseUrl":       entry.get("baseUrl", "") if meta["has_base_url"] else None,
            "textModel":     entry.get("textModel")  or defaults.get("text",  ""),
            "imageModel":    entry.get("imageModel") or defaults.get("image", ""),
        })
    return result
