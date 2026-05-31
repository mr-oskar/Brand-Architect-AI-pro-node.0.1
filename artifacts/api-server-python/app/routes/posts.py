"""
Post routes — update, generate images, regenerate content, create variants, long-form content.
"""
import threading
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.layers.credits import credits_layer, InsufficientCreditsError
from app.models import Brand, Campaign, Post, User
from app.schemas import (
    GeneratePostImageRequest,
    GenerateAllImagesRequest,
    PostResponse,
    UpdatePostRequest,
)
from app.services.ai.image import (
    ImageSize,
    enhance_prompt,
    generate_image_bytes,
    generate_image_with_logo_reference,
    generate_image_with_references,
)
from app.services.ai.post import (
    generate_long_form_content,
    generate_post_variant,
    regenerate_post,
)
from app.services.image_storage import storage_path_to_url, upload_image_bytes
from app.services.job_store import job_store

router = APIRouter(prefix="/posts", tags=["posts"])

# camelCase → snake_case field map for UpdatePostRequest
_POST_FIELD_MAP = {
    "imagePrompt": "image_prompt",
}


# ── CRUD ─────────────────────────────────────────────────────────────────────

@router.get("/{post_id}", response_model=PostResponse)
def get_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post, _ = _get_owned_post(post_id, current_user.id, db)
    return PostResponse.from_orm(post)


@router.patch("/{post_id}", response_model=PostResponse)
def update_post(
    post_id: int,
    body: UpdatePostRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post, _ = _get_owned_post(post_id, current_user.id, db)
    patch = body.model_dump(exclude_unset=True)
    for camel_field, value in patch.items():
        db_field = _POST_FIELD_MAP.get(camel_field, camel_field)
        setattr(post, db_field, value)
    db.commit()
    db.refresh(post)
    return PostResponse.from_orm(post)


@router.delete("/{post_id}", status_code=204)
def delete_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post, _ = _get_owned_post(post_id, current_user.id, db)
    db.delete(post)
    db.commit()


# ── Generate Image ────────────────────────────────────────────────────────────

@router.post("/{post_id}/generate-image", response_model=PostResponse)
def generate_post_image(
    post_id: int,
    body: GeneratePostImageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post, brand = _get_owned_post(post_id, current_user.id, db)

    try:
        charged_info = credits_layer.charge_credits(current_user, "post.generate-image", db)
    except InsufficientCreditsError as e:
        raise HTTPException(status_code=402, detail=str(e))
    charged = charged_info["charged"]

    try:
        size = _resolve_size(body.size)
        base_prompt = (body.customPrompt or "").strip() or (post.image_prompt or "")

        ref_images = body.referenceImages or []
        valid_refs = [
            r for r in ref_images
            if isinstance(r, dict) and isinstance(r.get("dataUrl"), str)
            and r["dataUrl"].startswith("data:image/")
        ]

        if valid_refs:
            import re
            def replace_ref(m):
                idx = int(m.group(1)) - 1
                if 0 <= idx < len(valid_refs):
                    label = (valid_refs[idx].get("label") or "").strip()
                    return f"reference image #{idx + 1} ({label})" if label else f"reference image #{idx + 1}"
                return m.group(0)
            base_prompt = re.sub(r"@(\d+)", replace_ref, base_prompt)
            ref_summary = ", ".join(
                f"image #{i + 1}{' — ' + r.get('label', '') if r.get('label') else ''}"
                for i, r in enumerate(valid_refs)
            )
            base_prompt += (
                f". You are given {len(valid_refs)} reference image(s): {ref_summary}. "
                f"Study each reference carefully — replicate their exact visual style, "
                f"color grading, composition language, and aesthetic details in the output."
            )

        overlay_text = (body.overlayText or "").strip()
        if overlay_text:
            base_prompt += f'. Render this text clearly and prominently in the design: "{overlay_text}"'

        logo_url = (body.logoDataUrl or "").strip() or None
        brand_name = (body.brandName or "").strip() or None
        logo_placement = _logo_placement(size)
        if logo_url and brand_name:
            base_prompt += (
                f'. The brand logo for "{brand_name}" is provided as a reference image — '
                f"incorporate it naturally in the {logo_placement}. "
                f"Respect the logo's color scheme and ensure it reads cleanly against the background."
            )
        elif brand_name:
            base_prompt += (
                f'. Reserve a clean, uncluttered area in the {logo_placement} '
                f'for the "{brand_name}" logo to be composited on top later.'
            )

        # Extract brand DNA from the database for brand-consistent image generation
        brand_kit = brand.brand_kit or {}
        final_prompt = enhance_prompt(
            base_prompt,
            model=body.model or "pro",
            brand_name=brand.company_name or "",
            brand_colors=brand_kit.get("colorPalette") or {},
            brand_style=brand_kit.get("visualStyle") or "",
            brand_personality=brand_kit.get("personality") or "",
            overlay_text=overlay_text,
        )

        all_refs = []
        if logo_url:
            all_refs.append(logo_url)
        for r in valid_refs:
            all_refs.append(r["dataUrl"])

        _model_override = (body.imageModelId or "").strip() or None
        if len(all_refs) > 1:
            image_bytes = generate_image_with_references(all_refs, final_prompt, size, model_override=_model_override)
        elif len(all_refs) == 1:
            image_bytes = generate_image_with_logo_reference(all_refs[0], final_prompt, size, model_override=_model_override)
        else:
            image_bytes = generate_image_bytes(final_prompt, size, model_override=_model_override)

        object_path = upload_image_bytes(image_bytes, "image/png")
        image_url = storage_path_to_url(object_path)

        existing_history = post.image_history or []
        new_history = existing_history
        if post.image_url:
            new_history = [
                {"url": post.image_url, "prompt": post.image_prompt, "createdAt": _now_iso()},
                *existing_history,
            ][:12]

        post.image_url = image_url
        post.image_history = new_history
        db.commit()
        db.refresh(post)
        return PostResponse.from_orm(post)

    except Exception as e:
        credits_layer.refund_credits(current_user.id, charged, db)
        _handle_ai_error(e)


# ── Restore image from history ────────────────────────────────────────────────

@router.post("/{post_id}/restore-image", response_model=PostResponse)
def restore_post_image(
    post_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post, _ = _get_owned_post(post_id, current_user.id, db)
    url = body.get("url")
    if not url:
        raise HTTPException(status_code=400, detail="url required")

    history = post.image_history or []
    target = next((h for h in history if h.get("url") == url), None)
    if not target:
        raise HTTPException(status_code=404, detail="Image not found in history")

    new_history = [
        {"url": post.image_url, "prompt": post.image_prompt, "createdAt": _now_iso()},
        *[h for h in history if h.get("url") != url],
    ][:12] if post.image_url else [h for h in history if h.get("url") != url]

    post.image_url = url
    post.image_history = new_history
    db.commit()
    db.refresh(post)
    return PostResponse.from_orm(post)


# ── Regenerate content ────────────────────────────────────────────────────────

@router.post("/{post_id}/regenerate", response_model=PostResponse)
def regenerate_post_content(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post, brand = _get_owned_post(post_id, current_user.id, db)

    try:
        charged_info = credits_layer.charge_credits(current_user, "post.regenerate", db)
    except InsufficientCreditsError as e:
        raise HTTPException(status_code=402, detail=str(e))
    charged = charged_info["charged"]

    try:
        post_dict = {
            "day": post.day,
            "hook": post.hook,
            "caption": post.caption,
            "cta": post.cta,
            "platform": post.platform,
        }
        new_content = regenerate_post(
            post=post_dict,
            brand_company_name=brand.company_name,
            brand_industry=brand.industry,
            brand_kit=brand.brand_kit or {},
        )
        post.caption = new_content.get("caption", post.caption)
        post.hook = new_content.get("hook", post.hook)
        post.cta = new_content.get("cta", post.cta)
        post.hashtags = new_content.get("hashtags", post.hashtags)
        post.image_prompt = new_content.get("imagePrompt", post.image_prompt)
        db.commit()
        db.refresh(post)
        return PostResponse.from_orm(post)

    except Exception as e:
        credits_layer.refund_credits(current_user.id, charged, db)
        _handle_ai_error(e)


# ── Generate A/B variant ──────────────────────────────────────────────────────

@router.post("/{post_id}/generate-variant")
def generate_post_variant_endpoint(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post, brand = _get_owned_post(post_id, current_user.id, db)
    if not brand.brand_kit:
        raise HTTPException(status_code=400, detail="Brand kit not generated yet")

    try:
        charged_info = credits_layer.charge_credits(current_user, "post.generate-variant", db)
    except InsufficientCreditsError as e:
        raise HTTPException(status_code=402, detail=str(e))
    charged = charged_info["charged"]

    try:
        variant = generate_post_variant(
            post={
                "day": post.day,
                "hook": post.hook,
                "caption": post.caption,
                "cta": post.cta,
                "platform": post.platform,
            },
            brand_company_name=brand.company_name,
            brand_industry=brand.industry,
            brand_kit=brand.brand_kit,
        )
        return variant
    except Exception as e:
        credits_layer.refund_credits(current_user.id, charged, db)
        _handle_ai_error(e)


# ── Generate long-form content ────────────────────────────────────────────────

@router.post("/{post_id}/generate-content")
def generate_post_content(
    post_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post, brand = _get_owned_post(post_id, current_user.id, db)
    if not brand.brand_kit:
        raise HTTPException(status_code=400, detail="Brand kit not generated yet")

    content_type = body.get("contentType", "blog")
    if content_type not in ("blog", "email", "newsletter"):
        raise HTTPException(status_code=400, detail="contentType must be blog | email | newsletter")

    try:
        charged_info = credits_layer.charge_credits(current_user, "post.generate-content", db)
    except InsufficientCreditsError as e:
        raise HTTPException(status_code=402, detail=str(e))
    charged = charged_info["charged"]

    try:
        content = generate_long_form_content(
            company_name=brand.company_name,
            company_description=brand.company_description or "",
            industry=brand.industry,
            brand_kit=brand.brand_kit,
            content_type=content_type,
            topic=post.hook,
        )
        return content
    except Exception as e:
        credits_layer.refund_credits(current_user.id, charged, db)
        _handle_ai_error(e)


# ── Generate all campaign images (batch) ─────────────────────────────────────

@router.post("/campaigns/{campaign_id}/generate-all-images")
def generate_all_campaign_images(
    campaign_id: int,
    body: GenerateAllImagesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models import Campaign

    campaign = (
        db.query(Campaign)
        .join(Brand, Brand.id == Campaign.brand_id)
        .filter(Campaign.id == campaign_id, Brand.user_id == str(current_user.id))
        .first()
    )
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    posts_to_process = campaign.posts
    if body.skipExisting:
        posts_to_process = [p for p in campaign.posts if not p.image_url]

    if not posts_to_process:
        return {"jobId": None, "message": "No posts to process"}

    try:
        credits_layer.charge_credits(
            current_user,
            "campaign.generate-all-images",
            db,
            multiplier=len(posts_to_process),
        )
    except InsufficientCreditsError as e:
        raise HTTPException(status_code=402, detail=str(e))

    job = job_store.create(total=len(posts_to_process), user_id=current_user.id)
    post_ids = [p.id for p in posts_to_process]
    logo_url = (body.logoDataUrl or "").strip() or None
    size = _resolve_size(body.size)

    # Capture brand context for the batch thread (brand_kit from the campaign brand)
    _batch_brand = campaign.brand
    _batch_brand_name = (_batch_brand.company_name or "") if _batch_brand else ""
    _batch_brand_kit = (_batch_brand.brand_kit or {}) if _batch_brand else {}
    _batch_brand_colors = _batch_brand_kit.get("colorPalette") or {}
    _batch_brand_style = _batch_brand_kit.get("visualStyle") or ""
    _batch_brand_personality = _batch_brand_kit.get("personality") or ""

    def run_batch():
        from app.database import SessionLocal
        thread_db = SessionLocal()
        try:
            job_store.update(job.id, status="running")
            for idx, pid in enumerate(post_ids):
                p = thread_db.query(Post).filter(Post.id == pid).first()
                if not p:
                    continue
                try:
                    prompt = enhance_prompt(
                        p.image_prompt or "Abstract commercial design",
                        model="mini",
                        brand_name=_batch_brand_name,
                        brand_colors=_batch_brand_colors,
                        brand_style=_batch_brand_style,
                        brand_personality=_batch_brand_personality,
                    )
                    if logo_url:
                        img_bytes = generate_image_with_logo_reference(logo_url, prompt, size)
                    else:
                        img_bytes = generate_image_bytes(prompt, size)
                    obj_path = upload_image_bytes(img_bytes, "image/png")
                    p.image_url = storage_path_to_url(obj_path)
                    thread_db.commit()
                except Exception as img_err:
                    # Log individual image failures but continue the batch —
                    # other posts should still get their images generated.
                    import logging as _log
                    _log.getLogger("brand-os").warning(
                        "Batch image gen failed for post %s: %s", pid, img_err
                    )
                    thread_db.rollback()
                job_store.update(job.id, progress=idx + 1)
            job_store.update(job.id, status="done", progress=len(post_ids))
        except Exception as e:
            job_store.update(job.id, status="failed", error=str(e))
        finally:
            thread_db.close()

    threading.Thread(target=run_batch, daemon=True).start()
    return {"jobId": job.id, "message": "Image generation started"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_owned_post(post_id: int, user_id: str, db: Session) -> tuple[Post, Brand]:
    result = (
        db.query(Post, Brand)
        .join(Campaign, Campaign.id == Post.campaign_id)
        .join(Brand, Brand.id == Campaign.brand_id)
        .filter(Post.id == post_id, Brand.user_id == str(user_id))
        .first()
    )
    if not result:
        raise HTTPException(status_code=404, detail="Post not found")
    return result


def _resolve_size(size: Optional[str]) -> ImageSize:
    valid = {"1024x1024", "1024x1536", "1536x1024", "auto"}
    if size in valid:
        return size  # type: ignore
    return "1024x1024"


def _logo_placement(size: str) -> str:
    if size == "1024x1536":
        return "lower-center area, leaving the top two-thirds clear"
    if size == "1536x1024":
        return "top-left corner, with the main visual occupying the right side"
    return "top-right corner, keeping the subject in the left 70%"


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def _handle_ai_error(e: Exception):
    msg = str(e)
    if "No AI provider" in msg or "api_key" in msg.lower():
        raise HTTPException(status_code=503, detail="AI provider not configured")
    if "quota" in msg.lower() or "billing" in msg.lower():
        raise HTTPException(status_code=503, detail=msg)
    raise HTTPException(status_code=503, detail=f"AI service error: {msg}")
