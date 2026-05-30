"""
AI Image Generation.

Supports OpenAI (gpt-image-1 / dall-e-3) and Gemini image generation.
The active image model is resolved from:
  1. DB model preference (Admin → API Keys → Image model)
  2. settings.gemini_image_model env var (Gemini only)
  3. Hardcoded defaults (gpt-image-1 / gemini-2.5-flash-preview-image-generation)

Images are returned as bytes and stored via image_storage.py.
"""
import base64
import re
import io
from typing import Optional, Literal

import httpx

from app.services.ai.client import get_client, get_provider, resolve_model, get_image_model
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


def _gemini_generate_image(parts: list[dict], model: Optional[str] = None) -> bytes:
    """Call Gemini image generation API directly."""
    gemini_key = _get_gemini_image_key()

    # Use provided model, or resolve from DB/default
    img_model = model or get_image_model()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{img_model}:generateContent"

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

    # OpenAI — use DB-preferred image model
    client = get_client()
    img_model = get_image_model()
    response = client.images.generate(
        model=img_model,
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

    # OpenAI images.edit — use DB-preferred image model
    client = get_client()
    img_model = get_image_model()
    image_bytes = base64.b64decode(base64_data)
    image_file = ("logo-reference.png", _io.BytesIO(image_bytes), mime_type)
    response = client.images.edit(
        model=img_model,
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

    # OpenAI multi-image edit — use DB-preferred image model
    import io as _io
    client = get_client()
    img_model = get_image_model()
    image_files = []
    for url in reference_data_urls:
        b64 = url.split(",", 1)[-1] if "," in url else url
        mime = "image/png" if url.startswith("data:image/png") else "image/jpeg"
        ext = "png" if mime == "image/png" else "jpg"
        img_bytes = base64.b64decode(b64)
        image_files.append((f"reference.{ext}", _io.BytesIO(img_bytes), mime))

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

    # ── Detect Arabic ──────────────────────────────────────────────────────────
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

    # ── Build brand context block ──────────────────────────────────────────────
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

    client = get_client()

    # ── Mini: light enhancement ────────────────────────────────────────────────
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
            response = client.chat.completions.create(
                model=resolve_model("gpt-4o-mini", use_case="text"),
                max_completion_tokens=500,
                messages=[{"role": "user", "content": "\n".join(parts)}],
            )
            return (response.choices[0].message.content or "").strip() or prompt
        except Exception:
            return prompt

    # ── Pro: full art-direction with brand DNA ─────────────────────────────────
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
        response = client.chat.completions.create(
            model=resolve_model("gpt-4o", use_case="text"),
            max_completion_tokens=700,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": "\n".join(user_parts)},
            ],
        )
        return (response.choices[0].message.content or "").strip() or prompt
    except Exception:
        return prompt
