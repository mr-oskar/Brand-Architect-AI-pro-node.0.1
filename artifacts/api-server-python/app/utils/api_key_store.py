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
        "description": "Official OpenAI API — GPT-4o, DALL-E 3, Whisper",
        "has_base_url": False,
        "default_base_url": "https://api.openai.com/v1",
    },
    "gemini": {
        "label": "Google Gemini",
        "description": "Google Generative AI — Gemini 2.5 Pro / Flash",
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
) -> None:
    """Persist a provider API key to the DB and invalidate the cache."""
    from app.models import AppSetting
    row = db.query(AppSetting).filter(AppSetting.key == "apiKeys").first()
    stored: dict = dict(row.value) if row and isinstance(row.value, dict) else {}
    entry: dict = {"apiKey": api_key, "enabled": enabled}
    if base_url:
        entry["baseUrl"] = base_url
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


# ── Credential resolution ─────────────────────────────────────────────────────

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


def get_provider_list(db) -> list[dict]:
    """Return all known providers with masked keys — for the admin panel."""
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
        })
    return result
