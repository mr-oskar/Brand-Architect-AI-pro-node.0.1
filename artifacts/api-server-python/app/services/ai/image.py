"""
AI Image Generation.

Supports OpenAI (gpt-image-1 / dall-e-3) and Gemini image generation.
The active image model is resolved from:
  1. DB model preference (Admin → API Keys → Image model)
  2. settings.gemini_image_model env var (Gemini only)
  3. Hardcoded defaults (gpt-image-1 / gemini-2.5-flash-preview-image-generation)

FIX (2026-05-31): DALL-E 3 and gpt-image-1 do NOT support images.edit with file uploads.
  - generate_image_with_logo_reference: now uses images.generate with logo embedded in prompt
  - generate_image_with_references: uses images.edit only for dall-e-2; for all other models
    it encodes references as base64 in the request (gpt-image-1 supports image[] input)
    or falls back to prompt-only generation.
"""
import base64
import re
import io
from typing import Optional, Literal

import httpx

from app.services.ai.client import get_client, get_provider, resolve_model, get_image_model, call_ai
from app.config import settings


def _extract_image_bytes(response) -> bytes:
    """
    Extract raw image bytes from an OpenAI images response.
    Handles both b64_json (preferred) and url (fallback) response formats.
    """
    items = response.data or []
    if not items:
        raise RuntimeError("AI returned no image data")
    item = items[0]
    b64 = getattr(item, "b64_json", None)
    if b64:
        return base64.b64decode(b64)
    url = getattr(item, "url", None)
    if url:
        r = httpx.get(url, timeout=120.0, follow_redirects=True)
        r.raise_for_status()
        return r.content
    raise RuntimeError("AI returned no image data (neither b64_json nor url)")


ImageSize = Literal["1024x1024", "1024x1536", "1536x1024", "auto"]


def _has_arabic(text: str) -> bool:
    return bool(re.search(r"[\u0600-\u06FF]", text))


def _get_gemini_image_key() -> str:
    """Return the Gemini API key from DB or env var."""
    from app.utils.api_key_store import get_gemini_api_key
    key = get_gemini_api_key()
    if not key:
        raise RuntimeError(
            "No Gemini API key found. "
            "Add a Gemini key via Admin → API Keys or set GEMINI_API_KEY in environment."
        )
    return key


def _with_aspect_hint(prompt: str, size: Optional[ImageSize]) -> str:
    """Append aspect ratio instruction for Gemini (which doesn't accept size param)."""
    if not size or size == "auto":
        return prompt
    hints = {
        "1024x1024": "square (1:1)",
        "1024x1536": "portrait (2:3, taller than wide)",
        "1536x1024": "landscape (3:2, wider than tall)",
    }
    hint = hints.get(size)
    return f"{prompt}\n\nAspect ratio: {hint}." if hint else prompt


# Fallback chain tried when the configured Gemini image model returns 404.
# gemini-2.0-flash-exp-image-generation → generateContent + responseModalities
# imagen-3.0-generate-001               → predict endpoint (text-to-image)
_GEMINI_IMAGE_FALLBACKS = [
    "gemini-2.0-flash-exp-image-generation",
    "imagen-3.0-generate-001",
]


def _is_imagen_model(m: str) -> bool:
    """Return True for Imagen models that use the :predict endpoint."""
    return m.lower().startswith("imagen")


def _gemini_generate_image(parts: list[dict], model: Optional[str] = None) -> bytes:
    """
    Call Gemini image generation API directly.

    Routing:
    - imagen-*  models → POST /:predict  (Imagen REST API)
    - gemini-*  models → POST /:generateContent with responseModalities=["IMAGE","TEXT"]

    If the configured model returns 404 (model not found), automatically retries
    with known-valid fallback models before raising an error.
    """
    import logging as _log
    _logger = _log.getLogger("brand-os")

    gemini_key = _get_gemini_image_key()
    img_model = model or get_image_model()

    def _extract_text_from_parts(p: list[dict]) -> str:
        """Pull the text prompt out of a parts list (for Imagen which is text-only)."""
        for item in p:
            t = item.get("text", "")
            if t:
                return t
        return ""

    def _try_gemini_model(m: str) -> bytes:
        """Try a gemini-* model via generateContent + responseModalities."""
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent"
        with httpx.Client(timeout=120.0) as client:
            resp = client.post(
                url,
                params={"key": gemini_key},
                json={
                    "contents": [{"parts": parts}],
                    "generationConfig": {"responseModalities": ["IMAGE", "TEXT"]},
                },
            )
        if not resp.is_success:
            txt = resp.text
            if resp.status_code == 429 or any(kw in txt.lower() for kw in ("quota", "free_tier", "billing")):
                raise RuntimeError(
                    "Gemini image generation requires a paid plan. "
                    "Enable billing on your Google AI Studio account or use an OpenAI key instead."
                )
            if resp.status_code == 404:
                raise _ModelNotFoundError(m, txt)
            raise RuntimeError(f"Gemini image generation failed ({resp.status_code}): {txt}")

        data = resp.json()
        for candidate in data.get("candidates", []):
            for part in candidate.get("content", {}).get("parts", []):
                inline = part.get("inlineData") or part.get("inline_data")
                if inline:
                    img_data = inline.get("data")
                    if img_data:
                        return base64.b64decode(img_data)
        raise RuntimeError("Gemini returned no image data in response")

    def _try_imagen_model(m: str) -> bytes:
        """Try an imagen-* model via the :predict endpoint."""
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:predict"
        prompt_text = _extract_text_from_parts(parts)
        if not prompt_text:
            raise RuntimeError("Imagen requires a text prompt but none was found in parts")
        with httpx.Client(timeout=120.0) as client:
            resp = client.post(
                url,
                params={"key": gemini_key},
                json={
                    "instances": [{"prompt": prompt_text}],
                    "parameters": {"sampleCount": 1},
                },
            )
        if not resp.is_success:
            txt = resp.text
            if resp.status_code == 429 or any(kw in txt.lower() for kw in ("quota", "free_tier", "billing")):
                raise RuntimeError(
                    "Imagen image generation requires a paid plan. "
                    "Enable billing on your Google AI Studio account or use an OpenAI key instead."
                )
            if resp.status_code == 404:
                raise _ModelNotFoundError(m, txt)
            raise RuntimeError(f"Imagen image generation failed ({resp.status_code}): {txt}")

        data = resp.json()
        for pred in data.get("predictions", []):
            b64 = pred.get("bytesBase64Encoded")
            if b64:
                return base64.b64decode(b64)
        raise RuntimeError("Imagen returned no image data in response")

    def _try_model(m: str) -> bytes:
        if _is_imagen_model(m):
            return _try_imagen_model(m)
        return _try_gemini_model(m)

    try:
        return _try_model(img_model)
    except _ModelNotFoundError:
        _logger.warning(
            "Gemini image model '%s' not found (404). Trying fallbacks: %s",
            img_model, _GEMINI_IMAGE_FALLBACKS,
        )
        for fallback in _GEMINI_IMAGE_FALLBACKS:
            if fallback == img_model:
                continue
            try:
                return _try_model(fallback)
            except _ModelNotFoundError:
                _logger.warning("Fallback model '%s' also returned 404, trying next.", fallback)
                continue
        raise RuntimeError(
            f"Gemini image generation failed: model '{img_model}' was not found "
            f"and all fallback models also failed. "
            f"Go to Admin → API Keys and select a valid image model such as "
            f"'gemini-2.0-flash-exp-image-generation' or 'imagen-3.0-generate-001'."
        )


class _ModelNotFoundError(Exception):
    def __init__(self, model: str, detail: str = ""):
        self.model = model
        super().__init__(f"Model not found: {model} — {detail}")


def _supports_response_format(img_model: str) -> bool:
    """
    Only dall-e-2 and dall-e-3 support the response_format parameter.
    gpt-image-1 always returns base64 and rejects the parameter outright.
    """
    m = img_model.lower()
    return "dall-e-2" in m or "dall-e-3" in m


def _is_edit_capable(img_model: str) -> bool:
    """
    Return True only for models that support images.edit with file uploads.
    Only dall-e-2 supports the classic edit endpoint with local file uploads.
    gpt-image-1 supports image[] input via images.generate (not images.edit).
    dall-e-3 does NOT support images.edit at all.
    """
    return "dall-e-2" in img_model.lower()


def _effective_provider(model_override: Optional[str] = None) -> str:
    """
    Determine the AI provider to route the request through.

    When the user selects a specific model (model_override), we infer the provider
    from the model name so the correct API path is used regardless of what's configured
    as the global default in api_key_store.

    Priority:
      1. model_override contains "gemini" or "imagen" → gemini
      2. Otherwise → configured provider from api_key_store
    """
    if model_override:
        m = model_override.lower()
        if "gemini" in m or "imagen" in m:
            return "gemini"
    return get_provider()


# ── Public generation functions ───────────────────────────────────────────────

def generate_image_bytes(
    prompt: str,
    size: ImageSize = "1024x1024",
    model_override: Optional[str] = None,
) -> bytes:
    """
    Generate an image from a text prompt. Returns raw PNG bytes.

    model_override: if provided, use this model ID instead of the configured default.
                    Passed from the user's model selection in the frontend.
    """
    provider = _effective_provider(model_override)

    if provider == "gemini":
        return _gemini_generate_image(
            [{"text": _with_aspect_hint(prompt, size)}],
            model=model_override,
        )

    client = get_client()
    img_model = model_override or get_image_model()
    gen_params: dict = {
        "model": img_model,
        "prompt": prompt,
        "size": size if size != "auto" else "1024x1024",
    }
    if _supports_response_format(img_model):
        gen_params["response_format"] = "b64_json"
    response = client.images.generate(**gen_params)
    return _extract_image_bytes(response)


def generate_image_with_logo_reference(
    logo_data_url: str,
    prompt: str,
    size: ImageSize = "1024x1024",
    model_override: Optional[str] = None,
) -> bytes:
    """
    Generate an image using a logo as a reference image.

    FIX: DALL-E 3 / gpt-image-1 do not support images.edit with file uploads.
    For those models we embed the logo as base64 in the request (gpt-image-1
    supports image[] input natively). For dall-e-2 we use the classic edit API.
    For any failure we fall back to prompt-only generation.

    model_override: if provided, use this model ID instead of the configured default.
    """
    base64_data = logo_data_url.split(",", 1)[-1] if "," in logo_data_url else logo_data_url
    mime_type = "image/png" if logo_data_url.startswith("data:image/png") else "image/jpeg"
    provider = _effective_provider(model_override)

    if provider == "gemini":
        return _gemini_generate_image([
            {"inlineData": {"mimeType": mime_type, "data": base64_data}},
            {"text": _with_aspect_hint(prompt, size)},
        ], model=model_override)

    client = get_client()
    img_model = model_override or get_image_model()

    # gpt-image-1 supports image[] parameter in images.generate
    if "gpt-image-1" in img_model.lower():
        try:
            image_bytes = base64.b64decode(base64_data)
            image_file = io.BytesIO(image_bytes)
            image_file.name = "logo-reference.png"
            logo_params: dict = {
                "model": img_model,
                "image": [image_file],
                "prompt": prompt,
                "size": size if size != "auto" else "1024x1024",
            }
            if _supports_response_format(img_model):
                logo_params["response_format"] = "b64_json"
            response = client.images.generate(**logo_params)
            return _extract_image_bytes(response)
        except Exception:
            return generate_image_bytes(prompt, size, model_override=model_override)

    # dall-e-2: use classic images.edit
    if _is_edit_capable(img_model):
        try:
            image_bytes = base64.b64decode(base64_data)
            image_file = ("logo-reference.png", io.BytesIO(image_bytes), mime_type)
            response = client.images.edit(
                model=img_model,
                image=image_file,
                prompt=prompt,
                size=size if size != "auto" else "1024x1024",
            )
            return _extract_image_bytes(response)
        except Exception:
            return generate_image_bytes(prompt, size, model_override=model_override)

    # dall-e-3 or unknown model: prompt-only generation (no edit support)
    return generate_image_bytes(prompt, size, model_override=model_override)


def generate_image_with_references(
    reference_data_urls: list[str],
    prompt: str,
    size: ImageSize = "1024x1024",
    quality: Optional[str] = None,
    background: Optional[str] = None,
    model_override: Optional[str] = None,
) -> bytes:
    """
    Generate an image using multiple reference images (logo + others).
    Falls back to text-only generation if no references provided or on error.

    FIX: Only dall-e-2 supports images.edit with file uploads.
    For gpt-image-1 we use image[] in images.generate.
    For dall-e-3 and others we fall back to prompt-only.

    model_override: if provided, use this model ID instead of the configured default.
    """
    if not reference_data_urls:
        return generate_image_bytes(prompt, size, model_override=model_override)

    provider = _effective_provider(model_override)

    if provider == "gemini":
        parts = []
        for url in reference_data_urls:
            b64 = url.split(",", 1)[-1] if "," in url else url
            mime = "image/png" if url.startswith("data:image/png") else "image/jpeg"
            parts.append({"inlineData": {"mimeType": mime, "data": b64}})
        parts.append({"text": _with_aspect_hint(prompt, size)})
        return _gemini_generate_image(parts, model=model_override)

    client = get_client()
    img_model = model_override or get_image_model()

    # gpt-image-1: supports image[] in images.generate
    if "gpt-image-1" in img_model.lower():
        try:
            image_files = []
            for url in reference_data_urls:
                b64 = url.split(",", 1)[-1] if "," in url else url
                img_bytes = base64.b64decode(b64)
                buf = io.BytesIO(img_bytes)
                buf.name = "reference.png"
                image_files.append(buf)

            gen_params: dict = {
                "model": img_model,
                "image": image_files,
                "prompt": prompt,
                "size": size if size != "auto" else "1024x1024",
            }
            if _supports_response_format(img_model):
                gen_params["response_format"] = "b64_json"
            if quality and quality != "auto":
                gen_params["quality"] = quality
            if background and background != "auto":
                gen_params["background"] = background

            response = client.images.generate(**gen_params)
            return _extract_image_bytes(response)
        except Exception:
            return generate_image_bytes(prompt, size, model_override=model_override)

    # dall-e-2: classic images.edit supports file uploads
    if _is_edit_capable(img_model):
        try:
            image_files = []
            for url in reference_data_urls:
                b64 = url.split(",", 1)[-1] if "," in url else url
                mime = "image/png" if url.startswith("data:image/png") else "image/jpeg"
                ext = "png" if mime == "image/png" else "jpg"
                img_bytes = base64.b64decode(b64)
                image_files.append((f"reference.{ext}", io.BytesIO(img_bytes), mime))

            edit_params: dict = {
                "model": img_model,
                "image": image_files,
                "prompt": prompt,
                "size": size if size != "auto" else "1024x1024",
            }
            if quality and quality != "auto":
                edit_params["quality"] = quality
            if background and background != "auto":
                edit_params["background"] = background

            response = client.images.edit(**edit_params)
            return _extract_image_bytes(response)
        except Exception:
            return generate_image_bytes(prompt, size, model_override=model_override)

    # dall-e-3 or unknown: prompt-only fallback
    return generate_image_bytes(prompt, size, model_override=model_override)


def enhance_prompt(
    prompt: str,
    model: str = "pro",
    brand_name: str = "",
    brand_colors: Optional[dict] = None,
    brand_style: str = "",
    brand_personality: str = "",
    overlay_text: str = "",
) -> str:
    """
    Enhance an image generation prompt using AI text models.

    model:
      'nano' — no enhancement, use prompt as-is
      'mini' — light enhancement + brand color/style injection
      'pro'  — full art direction with brand DNA, lighting, composition, typography
    """
    if model == "nano":
        return prompt

    arabic_in_overlay = _has_arabic(overlay_text)
    arabic_in_prompt = _has_arabic(prompt)
    arabic_text_note = ""
    if arabic_in_overlay or arabic_in_prompt:
        arabic_source = overlay_text if arabic_in_overlay else ""
        arabic_text_note = (
            "\n\nARABIC TYPOGRAPHY INSTRUCTIONS: "
            "Any Arabic text in this design must be rendered with perfect calligraphic accuracy — "
            "use bold, clean Naskh or Kufi letterforms, correct right-to-left character connections, "
            "and high contrast against the background for full legibility. "
            "Each Arabic letter must be fully formed and connected correctly. "
        )
        if arabic_source:
            arabic_text_note += f'Exact Arabic text to render: "{arabic_source}". '
        arabic_text_note += (
            "Do NOT transliterate Arabic to Latin. Do NOT mirror or reverse the text. "
            "Treat it as high-priority typographic element."
        )

    brand_lines: list[str] = []
    if brand_name:
        brand_lines.append(f"Brand name: {brand_name}")
    if brand_style:
        brand_lines.append(f"Visual style: {brand_style}")
    if brand_personality:
        brand_lines.append(f"Brand personality: {brand_personality}")
    if brand_colors:
        primary = (brand_colors.get("primary") or "").strip()
        secondary = (brand_colors.get("secondary") or "").strip()
        accent = (brand_colors.get("accent") or "").strip()
        background = (brand_colors.get("background") or "").strip()
        if primary:
            brand_lines.append(f"Primary brand color: {primary} (use as dominant/hero color)")
        if secondary:
            brand_lines.append(f"Secondary color: {secondary} (accents, gradients)")
        if accent:
            brand_lines.append(f"Accent color: {accent} (highlights)")
        if background:
            brand_lines.append(f"Background tone: {background}")
    brand_block = "\n".join(brand_lines)

    if model == "mini":
        parts = [
            "Enhance this social media image prompt to be more vivid and visually specific for AI image generation.",
            "Rules: Keep ALL @reference tokens, logo placement, and text overlay instructions exactly as written.",
            "Add: specific lighting mood, dominant color emphasis, and composition detail.",
        ]
        if brand_block:
            parts.append(f"\nBrand context to embed:\n{brand_block}")
        parts.append(f"\nReturn ONLY the enhanced prompt:\n\n{prompt}{arabic_text_note}")

        try:
            return call_ai(
                system_prompt="You are a professional AI image prompt enhancer.",
                user_prompt="\n".join(parts),
                max_tokens=500,
                task_type="post_image_prompt",
            ).strip() or prompt
        except Exception:
            return prompt

    system = (
        "You are a world-class creative director, art director, and brand photographer with 20 years "
        "of experience crafting campaign imagery for global brands. "
        "Your job is to transform a design brief into a precise, hyper-detailed image generation prompt "
        "that produces stunning commercial-quality social media content perfectly aligned with the brand."
    )

    user_parts = [
        "Transform this design brief into a professional image generation prompt.",
        "",
        "REQUIREMENTS:",
        "1. BRAND DNA FIRST — embed the brand's colors as hero visual elements, "
        "   visual style as the aesthetic foundation, and personality as the mood/energy",
        "2. CINEMATIC PRECISION — specify exact lighting (name the lighting technique), "
        "   camera angle, depth of field, and post-processing style",
        "3. COMPOSITION — describe layout with specifics: rule of thirds, leading lines, "
        "   negative space placement, focal point",
        "4. MATERIAL & TEXTURE — specify surface materials, textures, finish (matte/glossy/metallic)",
        "5. REFERENCE FIDELITY — keep ALL @1, @2... reference tokens EXACTLY as written — "
        "   these tell the model which uploaded images to use",
        "6. LOGO SPACE — if the brief mentions logo placement, preserve that instruction precisely",
        "7. TEXT OVERLAY — if text appears in the brief, keep those instructions exactly",
        "8. HYPER-SPECIFIC — no vague adjectives like 'beautiful' or 'stunning'; "
        "   every word must specify something visual",
    ]

    if brand_block:
        user_parts += [
            "",
            "BRAND CONTEXT (weave this into the visual language — do not just append it):",
            brand_block,
        ]

    user_parts += [
        "",
        "DESIGN BRIEF:",
        prompt,
        arabic_text_note if arabic_text_note else "",
        "",
        "Return ONLY the final enhanced prompt. No explanations. No headers. Just the prompt.",
    ]

    try:
        return call_ai(
            system_prompt=system,
            user_prompt="\n".join(user_parts),
            max_tokens=700,
            task_type="post_image_prompt",
        ).strip() or prompt
    except Exception:
        return prompt
