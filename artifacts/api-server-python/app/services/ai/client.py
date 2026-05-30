"""
AI Client — dynamic provider resolution from DB (admin panel) or env vars.

Priority order (first configured wins):
  1. Nano Banana DB key    — custom OpenAI-compatible endpoint
  2. OpenAI DB key         — official OpenAI API
  3. Gemini DB key         — Google Generative AI
  4. OPENAI_API_KEY env    — direct OpenAI env var
  5. GEMINI_API_KEY env    — direct Gemini env var
  6. Replit AI proxy vars  — AI_INTEGRATIONS_OPENAI_API_KEY + BASE_URL

Keys are resolved on every call with a 60s in-memory cache (see api_key_store.py).
The server starts even with no AI key — endpoints return HTTP 503 when called.

Add a new provider: extend KNOWN_PROVIDERS in api_key_store.py and map its
model names in GEMINI_MODEL_MAP below if needed.
"""
import time
from typing import Literal

from openai import OpenAI

from app.config import settings


ProviderType = Literal["openai", "gemini"]

_cached_client: OpenAI | None = None
_cached_provider: ProviderType = "openai"
_cache_time: float = 0
_CLIENT_TTL = 60  # seconds — match api_key_store.CACHE_TTL


def invalidate_client_cache() -> None:
    """Force a new client on the next AI call (called after admin updates a key)."""
    global _cache_time
    _cache_time = 0


def _build_client() -> tuple[OpenAI, ProviderType]:
    """Resolve the best available AI provider and create a client."""
    from app.utils.api_key_store import get_best_provider
    api_key, base_url, provider_type = get_best_provider()

    if not api_key:
        raise RuntimeError(
            "No AI provider configured. "
            "Go to Admin → API Keys and add an OpenAI, Gemini, or Nano Banana key, "
            "or set the OPENAI_API_KEY / GEMINI_API_KEY environment variable."
        )

    provider: ProviderType = "gemini" if provider_type == "gemini" else "openai"
    default_url = (
        "https://generativelanguage.googleapis.com/v1beta/openai/"
        if provider == "gemini"
        else "https://api.openai.com/v1"
    )

    client = OpenAI(
        api_key=api_key,
        base_url=base_url or default_url,
    )
    return client, provider


def get_client() -> OpenAI:
    """Return a cached AI client, refreshing every 60 seconds."""
    global _cached_client, _cached_provider, _cache_time
    if _cached_client is None or time.time() - _cache_time > _CLIENT_TTL:
        _cached_client, _cached_provider = _build_client()
        _cache_time = time.time()
    return _cached_client


def get_provider() -> ProviderType:
    get_client()
    return _cached_provider


def is_using_replit_proxy() -> bool:
    if settings.openai_api_key or settings.gemini_api_key:
        return False
    return bool(
        settings.ai_integrations_openai_api_key
        and settings.ai_integrations_openai_base_url
    )


def image_generation_available() -> bool:
    return True


# ── Model name mapping ────────────────────────────────────────────────────────

GEMINI_MODEL_MAP = {
    "gpt-4o-mini": "gemini-2.5-flash",
    "gpt-4o": "gemini-2.5-pro",
    "gpt-5-nano": "gemini-2.5-flash",
    "gpt-5-mini": "gemini-2.5-flash",
    "gpt-5.2": "gemini-2.5-pro",
    "gpt-image-1": "gemini-2.5-flash-preview-image-generation",
}


def resolve_model(model: str) -> str:
    if get_provider() == "gemini":
        return GEMINI_MODEL_MAP.get(model, "gemini-2.5-flash")
    return model


# ── Text completion helper ────────────────────────────────────────────────────

def call_ai(
    system_prompt: str,
    user_prompt: str,
    max_tokens: int | None = None,
    model: str | None = None,
) -> str:
    """
    Send a chat completion request. Returns the text response.
    Raises RuntimeError if no AI provider is configured.
    """
    client = get_client()
    chosen_model = resolve_model(model or settings.ai_text_model)
    max_tok = max_tokens or settings.ai_max_tokens

    response = client.chat.completions.create(
        model=chosen_model,
        max_completion_tokens=max_tok,
        temperature=settings.ai_temperature,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    return response.choices[0].message.content or ""
