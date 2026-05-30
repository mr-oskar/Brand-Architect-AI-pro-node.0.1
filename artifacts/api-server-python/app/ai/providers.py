"""
Provider Abstraction Layer — insulates all AI business logic from SDK specifics.

Every provider exposes the same interface (BaseProvider):
  complete_text(messages, model_id, max_tokens) → str
  generate_image(prompt, model_id, size, **kwargs) → bytes
  generate_image_edit(image_files, prompt, model_id, size, **kwargs) → bytes
  test(model_id) → {success, message, model}

Factory:
  build_provider(db_record: AIProvider) → BaseProvider

Supported types:
  "openai"  → OpenAIProvider   (api.openai.com)
  "gemini"  → GeminiProvider   (generativelanguage.googleapis.com)
  "custom"  → CustomProvider   (any OpenAI-compatible endpoint)
"""
import base64
import logging
from abc import ABC, abstractmethod
from typing import Optional

import httpx

logger = logging.getLogger("brand-os.ai.providers")


# ── Abstract base ──────────────────────────────────────────────────────────────

class BaseProvider(ABC):
    def __init__(self, api_key: str, base_url: Optional[str], name: str):
        self.api_key = api_key
        self.base_url = base_url
        self.name = name

    @abstractmethod
    def complete_text(
        self,
        messages: list[dict],
        model_id: str,
        max_tokens: Optional[int] = None,
    ) -> str: ...

    @abstractmethod
    def generate_image(
        self,
        prompt: str,
        model_id: str,
        size: str = "1024x1024",
        **kwargs,
    ) -> bytes: ...

    def generate_image_edit(
        self,
        image_files: list,
        prompt: str,
        model_id: str,
        size: str = "1024x1024",
        **kwargs,
    ) -> bytes:
        """Default: providers that don't support image edit fall back to generate."""
        return self.generate_image(prompt, model_id, size, **kwargs)

    @abstractmethod
    def test(self, model_id: Optional[str] = None) -> dict: ...


# ── OpenAI ────────────────────────────────────────────────────────────────────

class OpenAIProvider(BaseProvider):
    DEFAULT_TEXT_MODEL  = "gpt-4o-mini"
    DEFAULT_IMAGE_MODEL = "gpt-image-1"

    def __init__(self, api_key: str, base_url: Optional[str] = None, name: str = "OpenAI"):
        super().__init__(api_key, base_url or "https://api.openai.com/v1", name)
        from openai import OpenAI
        self._client = OpenAI(api_key=api_key, base_url=self.base_url, timeout=60.0)

    def complete_text(self, messages, model_id, max_tokens=None):
        resp = self._client.chat.completions.create(
            model=model_id,
            messages=messages,
            max_completion_tokens=max_tokens or 2000,
        )
        return resp.choices[0].message.content or ""

    def generate_image(self, prompt, model_id, size="1024x1024", **kwargs):
        safe_size = size if size != "auto" else "1024x1024"
        params: dict = {
            "model": model_id,
            "prompt": prompt,
            "size": safe_size,
            "response_format": "b64_json",
        }
        if kwargs.get("quality") not in (None, "auto"):
            params["quality"] = kwargs["quality"]
        resp = self._client.images.generate(**params)
        return self._extract_image(resp)

    def generate_image_edit(self, image_files, prompt, model_id, size="1024x1024", **kwargs):
        safe_size = size if size != "auto" else "1024x1024"
        params: dict = {
            "model": model_id,
            "image": image_files,
            "prompt": prompt,
            "size": safe_size,
            "response_format": "b64_json",
        }
        if kwargs.get("quality") not in (None, "auto"):
            params["quality"] = kwargs["quality"]
        if kwargs.get("background") not in (None, "auto"):
            params["background"] = kwargs["background"]
        resp = self._client.images.edit(**params)
        return self._extract_image(resp)

    def test(self, model_id=None):
        from openai import AuthenticationError, RateLimitError
        model = model_id or self.DEFAULT_TEXT_MODEL
        try:
            resp = self._client.chat.completions.create(
                model=model, max_completion_tokens=3,
                messages=[{"role": "user", "content": "Reply: OK"}],
            )
            reply = (resp.choices[0].message.content or "").strip()
            return {"success": True, "message": f"Connected — model replied: {reply or '(ok)'}", "model": model}
        except AuthenticationError:
            raise PermissionError("Invalid API key — authentication failed")
        except RateLimitError:
            return {"success": True, "message": "Key valid (rate-limited — normal during testing)", "model": model, "warning": True}

    @staticmethod
    def _extract_image(resp) -> bytes:
        items = resp.data or []
        if not items:
            raise RuntimeError("Provider returned no image data")
        item = items[0]
        b64 = getattr(item, "b64_json", None)
        if b64:
            return base64.b64decode(b64)
        url = getattr(item, "url", None)
        if url:
            r = httpx.get(url, timeout=120.0, follow_redirects=True)
            r.raise_for_status()
            return r.content
        raise RuntimeError("Provider returned no image data (neither b64_json nor url)")


# ── Google Gemini ─────────────────────────────────────────────────────────────

class GeminiProvider(BaseProvider):
    OPENAI_COMPAT_BASE  = "https://generativelanguage.googleapis.com/v1beta/openai/"
    NATIVE_IMAGE_BASE   = "https://generativelanguage.googleapis.com/v1beta/models"
    DEFAULT_TEXT_MODEL  = "gemini-2.5-flash"
    DEFAULT_IMAGE_MODEL = "gemini-2.5-flash-preview-image-generation"

    _ASPECT_HINTS = {
        "1024x1024": "square (1:1)",
        "1024x1536": "portrait (2:3, taller than wide)",
        "1536x1024": "landscape (3:2, wider than tall)",
    }

    def __init__(self, api_key: str, base_url: Optional[str] = None, name: str = "Google Gemini"):
        super().__init__(api_key, None, name)
        from openai import OpenAI
        self._text_client = OpenAI(api_key=api_key, base_url=self.OPENAI_COMPAT_BASE, timeout=60.0)

    def complete_text(self, messages, model_id, max_tokens=None):
        resp = self._text_client.chat.completions.create(
            model=model_id,
            messages=messages,
            max_completion_tokens=max_tokens or 2000,
        )
        return resp.choices[0].message.content or ""

    def generate_image(self, prompt, model_id, size="1024x1024", **kwargs):
        parts = kwargs.get("parts")
        if parts is None:
            hint = self._ASPECT_HINTS.get(size)
            enhanced = f"{prompt}\n\nAspect ratio: {hint}." if hint else prompt
            parts = [{"text": enhanced}]
        return self._call_imagen(model_id, parts)

    def generate_image_edit(self, image_files, prompt, model_id, size="1024x1024", **kwargs):
        """Gemini image edit = multimodal content with image + text."""
        parts = kwargs.get("parts")
        if parts is None:
            hint = self._ASPECT_HINTS.get(size)
            text_prompt = f"{prompt}\n\nAspect ratio: {hint}." if hint else prompt
            parts = []
            for img_tuple in image_files:
                name, file_obj, mime = img_tuple if isinstance(img_tuple, tuple) else (None, img_tuple, "image/png")
                raw = file_obj.read() if hasattr(file_obj, "read") else img_tuple
                parts.append({"inlineData": {"mimeType": mime, "data": base64.b64encode(raw).decode()}})
            parts.append({"text": text_prompt})
        return self._call_imagen(model_id, parts)

    def _call_imagen(self, model_id: str, parts: list) -> bytes:
        url = f"{self.NATIVE_IMAGE_BASE}/{model_id}:generateContent"
        with httpx.Client(timeout=120.0) as client:
            resp = client.post(url, params={"key": self.api_key}, json={"contents": [{"parts": parts}]})
        if not resp.is_success:
            txt = resp.text
            if resp.status_code == 429 or any(k in txt.lower() for k in ("quota", "billing", "free_tier")):
                raise RuntimeError("Gemini image generation requires a paid plan. Enable billing on your Google AI Studio account.")
            raise RuntimeError(f"Gemini image generation failed ({resp.status_code}): {txt[:400]}")
        data = resp.json()
        for candidate in data.get("candidates", []):
            for part in candidate.get("content", {}).get("parts", []):
                inline = part.get("inlineData") or part.get("inline_data")
                if inline and inline.get("data"):
                    return base64.b64decode(inline["data"])
        raise RuntimeError("Gemini returned no image data in response")

    def test(self, model_id=None):
        from openai import AuthenticationError, RateLimitError
        model = model_id or self.DEFAULT_TEXT_MODEL
        try:
            resp = self._text_client.chat.completions.create(
                model=model, max_completion_tokens=3,
                messages=[{"role": "user", "content": "Reply: OK"}],
            )
            reply = (resp.choices[0].message.content or "").strip()
            return {"success": True, "message": f"Connected — model replied: {reply or '(ok)'}", "model": model}
        except AuthenticationError:
            raise PermissionError("Invalid Gemini API key — authentication failed")
        except RateLimitError:
            return {"success": True, "message": "Key valid (rate-limited — normal during testing)", "model": model, "warning": True}


# ── Custom (OpenAI-compatible) ────────────────────────────────────────────────

class CustomProvider(OpenAIProvider):
    """Any OpenAI-compatible endpoint — local LLMs, proxies, alternative providers."""

    DEFAULT_TEXT_MODEL  = "gpt-4o-mini"
    DEFAULT_IMAGE_MODEL = "gpt-image-1"

    def __init__(self, api_key: str, base_url: str, name: str = "Custom"):
        super().__init__(api_key, base_url, name)


# ── Factory ───────────────────────────────────────────────────────────────────

def build_provider(db_record) -> BaseProvider:
    """
    Build the appropriate provider instance from an AIProvider DB record.
    Raises ValueError for unknown types or missing base_url on custom.
    """
    key   = db_record.api_key or ""
    url   = db_record.base_url or None
    name  = db_record.name or db_record.provider_type
    ptype = db_record.provider_type or "openai"

    if ptype == "gemini":
        return GeminiProvider(key, name=name)
    if ptype == "custom":
        if not url:
            raise ValueError(f"Provider '{name}' (custom) requires a base_url")
        return CustomProvider(key, url, name=name)
    # default: openai
    return OpenAIProvider(key, url, name=name)
