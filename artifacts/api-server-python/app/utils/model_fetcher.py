"""
Model Fetcher — fetches live model lists directly from AI provider APIs.

Supports:
  - OpenAI       : GET /v1/models  (Bearer token)
  - Google Gemini: GET /v1beta/models  (API key param)
  - Custom       : GET {base_url}/models  (Bearer token, OpenAI-compatible)

Each fetcher returns a normalised dict:
  {
    "provider": str,
    "textModels": [{"id", "name", "description", "context_window"?}, ...],
    "imageModels": [{"id", "name", "description"}, ...],
    "otherModels": [{"id", "name"}, ...],
    "totalFetched": int,
  }
"""
import logging
from typing import Optional

import httpx

logger = logging.getLogger("brand-os")


# ── OpenAI / Custom (OpenAI-compatible) ───────────────────────────────────────

_TEXT_PREFIXES   = ("gpt-5", "gpt-4", "gpt-3", "o1", "o3", "o4", "chatgpt-", "gemma", "llama", "mistral",
                    "claude", "command", "qwen", "deepseek", "phi", "mixtral", "openchat")
_IMAGE_PREFIXES  = ("dall-e", "gpt-image", "flux", "stable-diffusion", "sdxl", "midjourney",
                    "imagen", "realistic-vision")
_SKIP_PATTERNS   = ("embedding", "embed", "-tts", "whisper", "moderation", "babbage-",
                    "davinci-00", "curie-", "ada-001", "realtime", "transcrib", "search-",
                    "code-search", "similarity", "-edit-")


def _classify_openai(model_id: str) -> str:
    """Returns 'text', 'image', or 'skip'."""
    mid = model_id.lower()
    if any(p in mid for p in _SKIP_PATTERNS):
        return "skip"
    if any(mid.startswith(p) or p in mid for p in _IMAGE_PREFIXES):
        return "image"
    if any(mid.startswith(p) for p in _TEXT_PREFIXES):
        return "text"
    if "image" in mid or "vision" in mid:
        return "image"
    return "text"          # assume text for unknown models at custom endpoints


def _fetch_openai_models(api_key: str, base_url: str) -> dict:
    url = base_url.rstrip("/") + "/models"
    headers = {"Authorization": f"Bearer {api_key}"}

    with httpx.Client(timeout=15.0) as client:
        resp = client.get(url, headers=headers)

    if resp.status_code == 401:
        raise PermissionError("Invalid API key — authentication failed")
    if resp.status_code == 403:
        raise PermissionError("API key rejected (quota / billing issue)")
    resp.raise_for_status()

    models = resp.json().get("data", [])

    text_models, image_models, other_models = [], [], []
    for m in sorted(models, key=lambda x: x.get("id", "")):
        mid  = m.get("id", "")
        cat  = _classify_openai(mid)
        entry = {"id": mid, "name": mid, "description": ""}
        if cat == "text":
            text_models.append(entry)
        elif cat == "image":
            image_models.append(entry)
        else:
            other_models.append({"id": mid, "name": mid})

    return {
        "textModels":  text_models,
        "imageModels": image_models,
        "otherModels": other_models,
        "totalFetched": len(models),
    }


# ── Google Gemini (native REST API) ───────────────────────────────────────────

_GEMINI_SKIP = ("aqa", "embedding", "embed", "count_token", "text-bison", "chat-bison", "code-bison")


def _fetch_gemini_models(api_key: str) -> dict:
    url = "https://generativelanguage.googleapis.com/v1beta/models"
    with httpx.Client(timeout=15.0) as client:
        resp = client.get(url, params={"key": api_key, "pageSize": 200})

    if resp.status_code in (400, 401, 403):
        body = resp.json() if resp.headers.get("content-type", "").startswith("application") else {}
        msg = body.get("error", {}).get("message", resp.text[:200])
        raise PermissionError(f"Gemini key rejected: {msg}")
    resp.raise_for_status()

    raw_models = resp.json().get("models", [])

    text_models, image_models, other_models = [], [], []

    for m in raw_models:
        name      = m.get("name", "").replace("models/", "")
        display   = m.get("displayName") or name
        desc      = (m.get("description") or "")[:140].strip()
        methods   = set(m.get("supportedGenerationMethods", []))

        if any(s in name.lower() for s in _GEMINI_SKIP):
            continue

        entry = {"id": name, "name": display, "description": desc}

        # Image models: Imagen uses 'predict'; some Gemini models support image output
        if "predict" in methods or "generateImages" in methods:
            image_models.append(entry)
        elif "image-generation" in name.lower():
            image_models.append(entry)
        elif "generateContent" in methods:
            text_models.append(entry)
        else:
            other_models.append({"id": name, "name": display})

    # Newest first (names have version info)
    text_models.sort( key=lambda x: x["id"], reverse=True)
    image_models.sort(key=lambda x: x["id"], reverse=True)

    return {
        "textModels":  text_models,
        "imageModels": image_models,
        "otherModels": other_models,
        "totalFetched": len(raw_models),
    }


# ── Public entry point ────────────────────────────────────────────────────────

def fetch_models(
    provider: str,
    api_key:  str,
    base_url: Optional[str] = None,
) -> dict:
    """
    Fetch and categorise available models for a provider.

    Args:
        provider : "openai" | "gemini" | "custom" | "nano_banana" (legacy)
        api_key  : raw API key string
        base_url : required for "custom", ignored for "openai" / "gemini"

    Returns:
        {provider, textModels, imageModels, otherModels, totalFetched}

    Raises:
        PermissionError : bad key / billing issue
        httpx.HTTPError : network / HTTP error
        ValueError      : unknown provider or missing base_url
    """
    if provider == "gemini":
        result = _fetch_gemini_models(api_key)
    elif provider == "openai":
        result = _fetch_openai_models(api_key, "https://api.openai.com/v1")
    elif provider in ("custom", "nano_banana"):
        if not base_url:
            raise ValueError("base_url is required for custom provider")
        result = _fetch_openai_models(api_key, base_url)
    else:
        raise ValueError(f"Unknown provider: {provider!r}")

    result["provider"] = provider
    logger.info(
        "model_fetcher: %s → %d text, %d image, %d other models",
        provider,
        len(result["textModels"]),
        len(result["imageModels"]),
        len(result["otherModels"]),
    )
    return result
