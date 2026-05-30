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
    },
    "gemini": {
        "label": "Google Gemini",
        "description": "Google Generative AI — Gemini 2.5 Pro / Flash + Imagen 3",
        "has_base_url": False,
        "default_base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
    },
    "nano_banana": {
        "label": "Nano Banana",
        "description": "Custom OpenAI-compatible endpoint (e.g. local LLM, proxy, alternative provider)",
        "has_base_url": True,
        "default_base_url": "",
    },
}

# ── Available models per provider per use-case ────────────────────────────────

PROVIDER_MODELS: dict[str, dict] = {
    "openai": {
        "text": [
            {"id": "gpt-4o-mini",   "name": "GPT-4o Mini",   "description": "Fast & cost-effective — recommended"},
            {"id": "gpt-4o",        "name": "GPT-4o",         "description": "Most capable, best quality"},
            {"id": "gpt-4.1-nano",  "name": "GPT-4.1 Nano",  "description": "Fastest, lowest cost"},
            {"id": "gpt-4.1-mini",  "name": "GPT-4.1 Mini",  "description": "Balanced speed & quality"},
            {"id": "gpt-4.1",       "name": "GPT-4.1",        "description": "High capability"},
            {"id": "o4-mini",       "name": "o4-mini",        "description": "Reasoning model for complex tasks"},
        ],
        "image": [
            {"id": "gpt-image-1",   "name": "GPT Image 1",   "description": "Best quality — recommended"},
            {"id": "dall-e-3",      "name": "DALL-E 3",      "description": "High quality, creative"},
            {"id": "dall-e-2",      "name": "DALL-E 2",      "description": "Faster, lower cost"},
        ],
        "default_text": "gpt-4o-mini",
        "default_image": "gpt-image-1",
    },
    "gemini": {
        "text": [
            {"id": "gemini-2.5-flash",        "name": "Gemini 2.5 Flash",       "description": "Fast & smart — recommended"},
            {"id": "gemini-2.5-pro",          "name": "Gemini 2.5 Pro",         "description": "Most capable"},
            {"id": "gemini-2.0-flash",        "name": "Gemini 2.0 Flash",       "description": "Previous gen, fast"},
            {"id": "gemini-1.5-pro",          "name": "Gemini 1.5 Pro",         "description": "Previous generation pro"},
            {"id": "gemini-1.5-flash",        "name": "Gemini 1.5 Flash",       "description": "Previous generation flash"},
        ],
        "image": [
            {"id": "gemini-2.5-flash-preview-image-generation",  "name": "Gemini 2.5 Flash Image",  "description": "Latest — recommended"},
            {"id": "gemini-2.0-flash-exp-image-generation",      "name": "Gemini 2.0 Flash Image",  "description": "Previous gen"},
            {"id": "imagen-3.0-generate-002",                    "name": "Imagen 3",                "description": "Google Imagen 3"},
        ],
        "default_text": "gemini-2.5-flash",
        "default_image": "gemini-2.5-flash-preview-image-generation",
    },
    "nano_banana": {
        "text": [],   # fetched dynamically from the provider's /models endpoint
        "image": [],  # fetched dynamically from the provider's /models endpoint
        "default_text": "gpt-4o-mini",
        "default_image": "gpt-image-1",
    },
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

    entry: dict = {"apiKey": api_key, "enabled": enabled}
    if base_url:
        entry["baseUrl"] = base_url

    # Persist model prefs — keep existing if new value not provided
    entry["textModel"] = text_model or existing.get("textModel") or PROVIDER_MODELS.get(provider, {}).get("default_text", "")
    entry["imageModel"] = image_model or existing.get("imageModel") or PROVIDER_MODELS.get(provider, {}).get("default_image", "")

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

def get_best_provider() -> tuple[Optional[str], Optional[str], str]:
    """
    Returns (api_key, base_url, provider_type) for the best available provider.
    provider_type: "openai" | "gemini"

    Priority:
      1. Nano Banana (DB)       — OpenAI-compatible, custom base URL
      2. OpenAI (DB)            — official OpenAI
      3. Gemini (DB)            — Google Generative AI
      4. OPENAI_API_KEY env var
      5. GEMINI_API_KEY env var
      6. Replit AI integration env vars
    """
    _ensure_fresh()
    from app.config import settings

    # 1. Nano Banana (DB, OpenAI-compatible)
    nb = _cache.get("nano_banana", {})
    if nb.get("enabled") and nb.get("apiKey") and nb.get("baseUrl"):
        return nb["apiKey"], nb["baseUrl"], "openai"

    # 2. OpenAI (DB)
    oa = _cache.get("openai", {})
    if oa.get("enabled") and oa.get("apiKey"):
        return oa["apiKey"], None, "openai"

    # 3. Gemini (DB)
    gm = _cache.get("gemini", {})
    if gm.get("enabled") and gm.get("apiKey"):
        return gm["apiKey"], KNOWN_PROVIDERS["gemini"]["default_base_url"], "gemini"

    # 4. OPENAI_API_KEY env var
    if settings.openai_api_key:
        return settings.openai_api_key, settings.openai_base_url or None, "openai"

    # 5. GEMINI_API_KEY env var
    if settings.gemini_api_key:
        return settings.gemini_api_key, KNOWN_PROVIDERS["gemini"]["default_base_url"], "gemini"

    # 6. Replit AI integration env vars
    if settings.ai_integrations_openai_api_key and settings.ai_integrations_openai_base_url:
        return (
            settings.ai_integrations_openai_api_key,
            settings.ai_integrations_openai_base_url,
            "openai",
        )

    return None, None, "none"


def get_active_provider_id() -> Optional[str]:
    """Return the ID of the currently active DB provider (or None for env-var providers)."""
    _ensure_fresh()
    from app.config import settings

    nb = _cache.get("nano_banana", {})
    if nb.get("enabled") and nb.get("apiKey") and nb.get("baseUrl"):
        return "nano_banana"

    oa = _cache.get("openai", {})
    if oa.get("enabled") and oa.get("apiKey"):
        return "openai"

    gm = _cache.get("gemini", {})
    if gm.get("enabled") and gm.get("apiKey"):
        return "gemini"

    return None


def get_model_for_use_case(use_case: str) -> Optional[str]:
    """
    Return the preferred model for a use-case from the active provider's DB config.
    use_case: "text" | "image"
    Returns None if no DB preference is set (caller should use built-in defaults).
    """
    _ensure_fresh()
    provider_id = get_active_provider_id()
    if not provider_id:
        return None
    entry = _cache.get(provider_id, {})
    key = "textModel" if use_case == "text" else "imageModel"
    return entry.get(key) or None


def get_gemini_api_key() -> Optional[str]:
    """
    Return the Gemini API key from DB (preferred) or env var.
    Used by image.py for the direct Gemini image generation call.
    """
    _ensure_fresh()
    from app.config import settings
    gm = _cache.get("gemini", {})
    if gm.get("apiKey"):
        return gm["apiKey"]
    return settings.gemini_api_key or None


def get_provider_list(db) -> list[dict]:
    """Return all known providers with masked keys and model prefs — for the admin panel."""
    refresh(db)
    from app.config import settings

    result = []
    for provider_id, meta in KNOWN_PROVIDERS.items():
        entry = _cache.get(provider_id, {})
        api_key: str = entry.get("apiKey", "")

        env_configured = False
        if provider_id == "openai":
            env_configured = bool(settings.openai_api_key or settings.ai_integrations_openai_api_key)
        elif provider_id == "gemini":
            env_configured = bool(settings.gemini_api_key)

        pmodels = PROVIDER_MODELS.get(provider_id, {})
        default_text = pmodels.get("default_text", "")
        default_image = pmodels.get("default_image", "")

        result.append({
            "id": provider_id,
            "label": meta["label"],
            "description": meta["description"],
            "hasBaseUrl": meta["has_base_url"],
            "defaultBaseUrl": meta["default_base_url"],
            "enabled": entry.get("enabled", False) if api_key else False,
            "configured": bool(api_key),
            "envConfigured": env_configured and not api_key,
            "maskedKey": f"...{api_key[-4:]}" if len(api_key) >= 4 else ("****" if api_key else ""),
            "baseUrl": entry.get("baseUrl", "") if meta["has_base_url"] else None,
            # Model preferences
            "textModel": entry.get("textModel") or default_text,
            "imageModel": entry.get("imageModel") or default_image,
            # Available model lists
            "availableTextModels": pmodels.get("text", []),
            "availableImageModels": pmodels.get("image", []),
        })
    return result
