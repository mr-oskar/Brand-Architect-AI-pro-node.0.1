"""
AI Image Generation.

Supports OpenAI (gpt-image-1) and Gemini image generation.
Images are returned as bytes and stored via image_storage.py.

Extension points:
  - Add DALL-E 3 support.
  - Add Stable Diffusion via Replicate API.
  - Add image post-processing (watermark, resize, format conversion).
  - Add content moderation before serving generated images.
"""
import base64
import io
from typing import Optional, Literal

import httpx

from app.services.ai.client import get_client, get_provider, resolve_model
from app.config import settings


def _extract_image_bytes(response) -> bytes:
    """
    Extract raw image bytes from an OpenAI images response.
    Handles both b64_json (preferred) and url (fallback) response formats.
    The OpenAI SDK returns Image objects — use attribute access, NOT .get().
    """
    items = response.data or []
    if not items:
        raise RuntimeError("AI returned no image data")
    item = items[0]
    # Prefer inline base64
    b64 = getattr(item, "b64_json", None)
    if b64:
        return base64.b64decode(b64)
    # Fallback: download from URL
    url = getattr(item, "url", None)
    if url:
        import httpx
        r = httpx.get(url, timeout=120.0, follow_redirects=True)
        r.raise_for_status()
        return r.content
    raise RuntimeError("AI returned no image data (neither b64_json nor url)")


ImageSize = Literal["1024x1024", "1024x1536", "1536x1024", "auto"]


def _get_gemini_image_model() -> str:
    return settings.gemini_image_model or "gemini-2.0-flash-exp-image-generation"


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


def _gemini_generate_image(parts: list[dict]) -> bytes:
    """Call Gemini image generation API directly."""
    gemini_key = settings.gemini_api_key
    if not gemini_key:
        raise RuntimeError("GEMINI_API_KEY is not set.")

    model = _get_gemini_image_model()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    with httpx.Client(timeout=120.0) as client:
        resp = client.post(
            url,
            params={"key": gemini_key},
            json={"contents": [{"parts": parts}]},
        )

    if not resp.is_success:
        txt = resp.text
        if resp.status_code == 429 or any(kw in txt.lower() for kw in ("quota", "free_tier", "billing")):
            raise RuntimeError(
                "Gemini image generation requires a paid plan. "
                "Set OPENAI_API_KEY for image generation, or enable billing on your Google AI Studio account."
            )
        raise RuntimeError(f"Gemini image generation failed ({resp.status_code}): {txt}")

    data = resp.json()
    candidates = data.get("candidates", [])
    for candidate in candidates:
        for part in candidate.get("content", {}).get("parts", []):
            inline = part.get("inlineData") or part.get("inline_data")
            if inline:
                img_data = inline.get("data") or inline.get("data")
                if img_data:
                    return base64.b64decode(img_data)

    raise RuntimeError("Gemini returned no image data")


def generate_image_bytes(
    prompt: str,
    size: ImageSize = "1024x1024",
) -> bytes:
    """Generate an image from a text prompt. Returns raw PNG bytes."""
    provider = get_provider()

    if provider == "gemini":
        return _gemini_generate_image([{"text": _with_aspect_hint(prompt, size)}])

    # OpenAI — request b64_json but fall back to URL via _extract_image_bytes
    client = get_client()
    response = client.images.generate(
        model="gpt-image-1",
        prompt=prompt,
        size=size if size != "auto" else "1024x1024",
        response_format="b64_json",
    )
    return _extract_image_bytes(response)


def generate_image_with_logo_reference(
    logo_data_url: str,
    prompt: str,
    size: ImageSize = "1024x1024",
) -> bytes:
    """
    Generate an image using a logo as a reference image.
    The logo is fed as a reference to guide the visual style.
    """
    import io as _io

    base64_data = logo_data_url.split(",", 1)[-1] if "," in logo_data_url else logo_data_url
    mime_type = "image/png" if logo_data_url.startswith("data:image/png") else "image/jpeg"
    provider = get_provider()

    if provider == "gemini":
        return _gemini_generate_image([
            {"inlineData": {"mimeType": mime_type, "data": base64_data}},
            {"text": _with_aspect_hint(prompt, size)},
        ])

    # OpenAI images.edit
    client = get_client()
    image_bytes = base64.b64decode(base64_data)
    image_file = ("logo-reference.png", _io.BytesIO(image_bytes), mime_type)
    response = client.images.edit(
        model="gpt-image-1",
        image=image_file,
        prompt=prompt,
        size=size if size != "auto" else "1024x1024",
    )
    return _extract_image_bytes(response)


def generate_image_with_references(
    reference_data_urls: list[str],
    prompt: str,
    size: ImageSize = "1024x1024",
    quality: Optional[str] = None,
    background: Optional[str] = None,
) -> bytes:
    """
    Generate an image using multiple reference images (logo + others).
    Falls back to text-only generation if no references provided.
    """
    if not reference_data_urls:
        return generate_image_bytes(prompt, size)

    provider = get_provider()

    if provider == "gemini":
        parts = []
        for url in reference_data_urls:
            b64 = url.split(",", 1)[-1] if "," in url else url
            mime = "image/png" if url.startswith("data:image/png") else "image/jpeg"
            parts.append({"inlineData": {"mimeType": mime, "data": b64}})
        parts.append({"text": _with_aspect_hint(prompt, size)})
        return _gemini_generate_image(parts)

    # OpenAI multi-image edit
    import io as _io
    client = get_client()
    image_files = []
    for url in reference_data_urls:
        b64 = url.split(",", 1)[-1] if "," in url else url
        mime = "image/png" if url.startswith("data:image/png") else "image/jpeg"
        ext = "png" if mime == "image/png" else "jpg"
        img_bytes = base64.b64decode(b64)
        image_files.append((f"reference.{ext}", _io.BytesIO(img_bytes), mime))

    edit_params: dict = {
        "model": "gpt-image-1",
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


def enhance_prompt(prompt: str, model: str = "pro") -> str:
    """
    Enhance an image generation prompt using AI text models.
    model: 'nano' (no enhancement), 'mini' (light), 'pro' (full enhancement)
    """
    if model == "nano":
        return prompt

    client = get_client()

    if model == "mini":
        instruction = (
            "Enhance this social media design prompt to be more vivid and detailed for AI image generation. "
            "Keep all logo placement, text instructions, and reference image mentions exactly as written. "
            "Return only the enhanced prompt:\n\n" + prompt
        )
        model_name = "gpt-4o-mini"
        max_tokens = 300
    else:  # pro
        instruction = (
            "You are a professional art director and social media designer. "
            "Enhance this design prompt with rich visual details, typography guidance, lighting, mood, "
            "and cinematic composition to produce a stunning commercial-quality social media image. "
            "Keep all logo placement, text overlay, brand instructions, and reference image mentions exactly as written. "
            "Return only the enhanced prompt:\n\n" + prompt
        )
        model_name = "gpt-4o"
        max_tokens = 400

    try:
        response = client.chat.completions.create(
            model=resolve_model(model_name),
            max_completion_tokens=max_tokens,
            messages=[{"role": "user", "content": instruction}],
        )
        return (response.choices[0].message.content or "").strip() or prompt
    except Exception:
        return prompt
