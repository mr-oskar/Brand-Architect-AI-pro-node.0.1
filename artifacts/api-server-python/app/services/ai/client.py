"""
AI Client — lazy initialization supporting OpenAI, Gemini, and Replit AI proxy.

Priority order:
  1. OPENAI_API_KEY (user's own key)
  2. GEMINI_API_KEY (Google Gemini via OpenAI-compatible endpoint)
  3. AI_INTEGRATIONS_OPENAI_API_KEY + AI_INTEGRATIONS_OPENAI_BASE_URL (Replit proxy)

The client is initialized on first use — the server starts even without AI keys.
If no provider is configured, AI endpoints return HTTP 503.

Extension points:
  - Add Anthropic: implement AnthropicClient with the same interface.
  - Add Azure OpenAI: set OPENAI_BASE_URL to your Azure endpoint.
  - Add model routing: override get_client() per model name.
"""
import os
from typing import Literal

from openai import OpenAI

from app.config import settings


ProviderType = Literal["openai", "gemini"]

_client: OpenAI | None = None
_provider: ProviderType = "openai"


def _resolve_client() -> tuple[OpenAI, ProviderType]:
    """Resolve the best available AI provider."""
    if settings.openai_api_key:
        return (
            OpenAI(
                api_key=settings.openai_api_key,
                base_url=settings.openai_base_url or None,
            ),
            "openai",
        )
    if settings.gemini_api_key:
        return (
            OpenAI(
                api_key=settings.gemini_api_key,
                base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            ),
            "gemini",
        )
    if settings.ai_integrations_openai_api_key and settings.ai_integrations_openai_base_url:
        return (
            OpenAI(
                api_key=settings.ai_integrations_openai_api_key,
                base_url=settings.ai_integrations_openai_base_url,
            ),
            "openai",
        )
    raise RuntimeError(
        "No AI provider configured. "
        "Set OPENAI_API_KEY, GEMINI_API_KEY, or Replit AI integration vars."
    )


def get_client() -> OpenAI:
    """Get the OpenAI client (lazy init on first call)."""
    global _client, _provider
    if _client is None:
        _client, _provider = _resolve_client()
    return _client


def get_provider() -> ProviderType:
    """Get the current provider type (triggers lazy init)."""
    get_client()
    return _provider


def is_using_replit_proxy() -> bool:
    """
    Returns True when the only AI provider available is the Replit AI proxy.
    The Replit proxy supports chat completions but NOT image generation.
    """
    if settings.openai_api_key or settings.gemini_api_key:
        return False
    return bool(
        settings.ai_integrations_openai_api_key
        and settings.ai_integrations_openai_base_url
    )


def image_generation_available() -> bool:
    """
    Returns True if the configured provider supports image generation.
    The Replit AI proxy routes images/* through the modelfarm and returns HTTP 200,
    so we treat it as available. Callers handle errors from the response.
    """
    return True


# ── Model name mapping ────────────────────────────────────────────────────────

GEMINI_MODEL_MAP = {
    "gpt-4o-mini": "gemini-2.5-flash",
    "gpt-4o": "gemini-2.5-pro",
    "gpt-5-nano": "gemini-2.5-flash",
    "gpt-5-mini": "gemini-2.5-flash",
    "gpt-5.2": "gemini-2.5-pro",
    "gpt-image-1": "gemini-2.5-flash-image-preview",
}


def resolve_model(model: str) -> str:
    """Map model names to provider equivalents."""
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
