"""
Brands routes — CRUD + AI kit/campaign generation.

Note: DB column names used here:
  - company_description  (not 'description')
  - website_url          (not 'website')
  - campaigns.days       (JSONB — stores the AI days array)
"""
import threading
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.layers.credits import credits_layer, InsufficientCreditsError
from app.models import Brand, User
from app.schemas import (
    BrandDetailResponse,
    BrandSummaryResponse,
    CreateBrandRequest,
    GenerateCampaignRequest,
    GenerateKitRequest,
    UpdateBrandRequest,
)
from app.services.ai.brand_kit import generate_brand_kit, generate_brand_story
from app.services.ai.campaign import analyze_brief, generate_campaign
from app.services.ai.post import generate_long_form_content
from app.services.job_store import job_store
from app.services.logo_processor import data_url_to_image, generate_logo_variants, extract_logo_colors
from app.services.image_storage import storage_path_to_url, upload_image_bytes

router = APIRouter(prefix="/brands", tags=["brands"])


# ── CRUD ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[BrandSummaryResponse])
def list_brands(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    offset = (page - 1) * page_size
    brands = (
        db.query(Brand)
        .filter(Brand.user_id == str(current_user.id))
        .order_by(Brand.created_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )
    return [BrandSummaryResponse.from_orm(b) for b in brands]


@router.post("", response_model=BrandDetailResponse, status_code=201)
def create_brand(
    body: CreateBrandRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    brand = Brand(
        user_id=str(current_user.id),
        company_name=body.company_name,
        company_description=body.description,
        industry=body.industry,
        website_url=body.website,
        logo_url=body.logo_url,
        status="active",
    )
    db.add(brand)
    db.commit()
    db.refresh(brand)
    return BrandDetailResponse.from_orm(brand)


@router.get("/{brand_id}", response_model=BrandDetailResponse)
def get_brand(
    brand_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    brand = _get_owned_brand(brand_id, str(current_user.id), db)
    return BrandDetailResponse.from_orm(brand)


@router.patch("/{brand_id}", response_model=BrandDetailResponse)
def update_brand(
    brand_id: int,
    body: UpdateBrandRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    brand = _get_owned_brand(brand_id, str(current_user.id), db)
    patch = body.model_dump(exclude_unset=True)
    # Map API field names to DB column names
    field_map = {"description": "company_description", "website": "website_url"}
    for api_field, value in patch.items():
        db_field = field_map.get(api_field, api_field)
        setattr(brand, db_field, value)
    db.commit()
    db.refresh(brand)
    return BrandDetailResponse.from_orm(brand)


@router.delete("/{brand_id}", status_code=204)
def delete_brand(
    brand_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    brand = _get_owned_brand(brand_id, str(current_user.id), db)
    db.delete(brand)
    db.commit()


# ── AI: Generate Brand Kit ────────────────────────────────────────────────────

@router.post("/{brand_id}/generate-kit", response_model=BrandDetailResponse)
def generate_kit(
    brand_id: int,
    body: GenerateKitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate a comprehensive AI brand kit for this brand.
    Costs: brand.generate-kit credits.
    """
    brand = _get_owned_brand(brand_id, str(current_user.id), db)

    charged = 0
    try:
        charged_info = credits_layer.charge_credits(current_user, "brand.generate-kit", db)
        charged = charged_info["charged"]
    except InsufficientCreditsError as e:
        raise HTTPException(status_code=402, detail=str(e))

    try:
        kit = generate_brand_kit(
            company_name=brand.company_name,
            company_description=brand.company_description or "",
            industry=brand.industry,
            brand_colors=body.brand_colors,
        )
        brand.brand_kit = kit
        db.commit()
        db.refresh(brand)
        return BrandDetailResponse.from_orm(brand)
    except Exception as e:
        credits_layer.refund_credits(str(current_user.id), charged, db)
        _handle_ai_error(e)


# ── AI: Generate Campaign ─────────────────────────────────────────────────────

@router.post("/{brand_id}/generate-campaign")
def generate_brand_campaign(
    brand_id: int,
    body: GenerateCampaignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate a multi-day social media campaign. Returns a jobId to poll.
    Poll: GET /api/jobs/{jobId}
    """
    brand = _get_owned_brand(brand_id, str(current_user.id), db)
    if not brand.brand_kit:
        raise HTTPException(status_code=400, detail="Generate the brand kit first")

    try:
        credits_layer.charge_credits(current_user, "brand.generate-campaign", db)
    except InsufficientCreditsError as e:
        raise HTTPException(status_code=402, detail=str(e))

    job = job_store.create(total=body.days, user_id=str(current_user.id))

    brand_data = {
        "id": brand.id,
        "company_name": brand.company_name,
        "industry": brand.industry,
        "description": brand.company_description or "",
        "brand_kit": brand.brand_kit,
    }
    brief = body.brief
    days = body.days
    platforms = body.platforms
    reference_images = body.reference_images or []
    user_id = str(current_user.id)

    def run_generation():
        from app.database import SessionLocal
        thread_db = SessionLocal()
        try:
            job_store.update(job.id, status="running")

            analyzed = None
            if brief:
                analyzed = analyze_brief(
                    brief=brief,
                    company_name=brand_data["company_name"],
                    industry=brand_data["industry"],
                    reference_images=reference_images,
                )

            campaign_data = generate_campaign(
                company_name=brand_data["company_name"],
                company_description=brand_data["description"],
                industry=brand_data["industry"],
                brand_kit=brand_data["brand_kit"],
                brief=brief,
                post_count=days,
                platforms=platforms,
                analyzed_brief=analyzed,
            )

            from app.models import Campaign, Post

            # Store days array as JSONB (actual DB schema)
            campaign = Campaign(
                brand_id=brand_data["id"],
                title=campaign_data.get("title", "Campaign"),
                strategy=campaign_data.get("strategy", ""),
                days=campaign_data.get("days", []),  # JSONB array
            )
            thread_db.add(campaign)
            thread_db.flush()

            for post_data in campaign_data.get("posts", []):
                post = Post(
                    campaign_id=campaign.id,
                    day=post_data.get("day", 1),
                    caption=post_data.get("caption"),
                    hook=post_data.get("hook"),
                    cta=post_data.get("cta"),
                    hashtags=post_data.get("hashtags", []),
                    image_prompt=post_data.get("imagePrompt"),
                    platform=post_data.get("platform", "instagram"),
                    publish_status="draft",
                )
                thread_db.add(post)
                job_store.update(job.id, progress=post_data.get("day", 1))

            thread_db.commit()
            thread_db.refresh(campaign)

            job_store.update(job.id, status="done", progress=days, result={
                "campaignId": campaign.id,
                "title": campaign.title,
                "postCount": len(campaign_data.get("posts", [])),
            })
        except Exception as e:
            thread_db.rollback()
            job_store.update(job.id, status="failed", error=str(e))
        finally:
            thread_db.close()

    threading.Thread(target=run_generation, daemon=True).start()
    return {"jobId": job.id, "message": "Campaign generation started"}


# ── AI: Generate Logo Variants ────────────────────────────────────────────────

@router.post("/{brand_id}/generate-logo-variants")
def generate_brand_logo_variants(
    brand_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate black, white, and grayscale variants of the brand logo.
    Also extracts dominant colors from the logo.
    Costs: brand.generate-logo-variants credits.
    """
    brand = _get_owned_brand(brand_id, str(current_user.id), db)
    if not brand.logo_url:
        raise HTTPException(status_code=400, detail="Brand has no logo")

    try:
        credits_layer.charge_credits(current_user, "brand.generate-logo-variants", db)
    except InsufficientCreditsError as e:
        raise HTTPException(status_code=402, detail=str(e))

    try:
        img = data_url_to_image(brand.logo_url)
        variants_bytes = generate_logo_variants(img)
        extracted_colors = extract_logo_colors(img)

        black_path = upload_image_bytes(variants_bytes["black"], "image/png")
        white_path = upload_image_bytes(variants_bytes["white"], "image/png")
        gray_path = upload_image_bytes(variants_bytes["grayscale"], "image/png")

        logo_variants = {
            "original": brand.logo_url,
            "black": storage_path_to_url(black_path),
            "white": storage_path_to_url(white_path),
            "grayscale": storage_path_to_url(gray_path),
        }

        brand.logo_variants = logo_variants
        db.commit()
        db.refresh(brand)

        return {
            "logoVariants": logo_variants,
            "extractedColors": extracted_colors,
            "brand": BrandDetailResponse.from_orm(brand),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Logo processing failed: {e}")


# ── AI: Generate Brand Story ──────────────────────────────────────────────────

@router.post("/{brand_id}/generate-story")
def generate_brand_story_endpoint(
    brand_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate or regenerate a compelling brand story.
    Saves the story inside brand_kit.brandStory.
    Costs: brand.generate-story credits.
    """
    brand = _get_owned_brand(brand_id, str(current_user.id), db)
    if not brand.brand_kit:
        raise HTTPException(status_code=400, detail="Generate the brand kit first")

    charged = 0
    try:
        info = credits_layer.charge_credits(current_user, "brand.generate-story", db)
        charged = info["charged"]
    except InsufficientCreditsError as e:
        raise HTTPException(status_code=402, detail=str(e))

    try:
        story = generate_brand_story(
            company_name=brand.company_name,
            company_description=brand.company_description or "",
            industry=brand.industry,
            brand_kit=brand.brand_kit,
        )
        updated_kit = {**brand.brand_kit, "brandStory": story}
        brand.brand_kit = updated_kit
        db.commit()
        db.refresh(brand)
        return {"brandStory": story, "brand": BrandDetailResponse.from_orm(brand)}
    except Exception as e:
        credits_layer.refund_credits(str(current_user.id), charged, db)
        _handle_ai_error(e)


# ── AI: Generate Brand-level Long-form Content ────────────────────────────────

@router.post("/{brand_id}/generate-content")
def generate_brand_content(
    brand_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate long-form content (blog, email, newsletter) for this brand.
    Costs: brand.generate-content credits.
    """
    brand = _get_owned_brand(brand_id, str(current_user.id), db)
    if not brand.brand_kit:
        raise HTTPException(status_code=400, detail="Generate the brand kit first")

    content_type = body.get("contentType", "blog")
    if content_type not in ("blog", "email", "newsletter"):
        raise HTTPException(status_code=400, detail="contentType must be blog | email | newsletter")

    topic = body.get("topic") or None

    charged = 0
    try:
        info = credits_layer.charge_credits(current_user, "brand.generate-content", db)
        charged = info["charged"]
    except InsufficientCreditsError as e:
        raise HTTPException(status_code=402, detail=str(e))

    try:
        content = generate_long_form_content(
            company_name=brand.company_name,
            company_description=brand.company_description or "",
            industry=brand.industry,
            brand_kit=brand.brand_kit,
            content_type=content_type,
            topic=topic,
        )
        return content
    except Exception as e:
        credits_layer.refund_credits(str(current_user.id), charged, db)
        _handle_ai_error(e)


# ── Brand Stats ───────────────────────────────────────────────────────────────

@router.get("/{brand_id}/stats")
def get_brand_stats(
    brand_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return aggregated stats for this brand:
    total campaigns, total posts, posts with images, etc.
    """
    from sqlalchemy import func as sqlfunc
    from app.models import Campaign, Post

    brand = _get_owned_brand(brand_id, str(current_user.id), db)

    campaigns = (
        db.query(Campaign)
        .filter(Campaign.brand_id == brand_id)
        .order_by(Campaign.created_at.desc())
        .all()
    )

    campaign_ids = [c.id for c in campaigns]
    total_posts = 0
    posts_with_images = 0

    if campaign_ids:
        total_posts = (
            db.query(sqlfunc.count(Post.id))
            .filter(Post.campaign_id.in_(campaign_ids))
            .scalar() or 0
        )
        posts_with_images = (
            db.query(sqlfunc.count(Post.id))
            .filter(Post.campaign_id.in_(campaign_ids), Post.image_url.isnot(None))
            .scalar() or 0
        )

    kit = brand.brand_kit or {}
    return {
        "brandId": brand_id,
        "totalCampaigns": len(campaigns),
        "totalPosts": total_posts,
        "postsWithImages": posts_with_images,
        "brandKitGenerated": bool(brand.brand_kit),
        "hasExtendedKit": bool(kit.get("brandStory")),
        "lastCampaignDate": campaigns[0].created_at.isoformat() if campaigns else None,
    }


# ── AI: Campaign Brief Job (full pipeline with progress) ─────────────────────

@router.post("/{brand_id}/campaign-brief-job")
def campaign_brief_job(
    brand_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Full campaign generation pipeline with detailed step-by-step progress.
    Steps: analyze brief → ensure brand kit → generate campaign → save to DB.
    Returns a jobId immediately. Poll GET /api/jobs/{jobId}.
    Costs: brand.generate-campaign credits.
    """
    brand = _get_owned_brand(brand_id, str(current_user.id), db)

    brief = (body.get("brief") or "").strip() or None
    reference_images: list = (body.get("referenceImages") or [])[:5]
    post_count = max(1, min(int(body.get("postCount", 7)), 14))
    platforms: list = body.get("platforms") or ["instagram"]
    if not isinstance(platforms, list) or not platforms:
        platforms = ["instagram"]

    charged = 0
    try:
        info = credits_layer.charge_credits(current_user, "brand.generate-campaign", db)
        charged = info["charged"]
    except InsufficientCreditsError as e:
        raise HTTPException(status_code=402, detail=str(e))

    job = job_store.create(total=6, user_id=str(current_user.id))

    brand_data = {
        "id": brand.id,
        "company_name": brand.company_name,
        "industry": brand.industry,
        "description": brand.company_description or "",
        "brand_kit": brand.brand_kit,
    }
    user_id = str(current_user.id)

    def run_pipeline():
        from app.database import SessionLocal
        from app.models import Campaign, Post

        thread_db = SessionLocal()
        try:
            job_store.update(job.id, status="running", progress=0)

            # Step 1: Analyze brief + reference images
            analyzed = None
            if brief or reference_images:
                analyzed = analyze_brief(
                    brief=brief or "",
                    company_name=brand_data["company_name"],
                    industry=brand_data["industry"],
                    reference_images=reference_images,
                )
            job_store.update(job.id, progress=1)

            # Step 2: Ensure brand kit exists
            kit = brand_data["brand_kit"]
            if not kit:
                kit = generate_brand_kit(
                    company_name=brand_data["company_name"],
                    company_description=brand_data["description"],
                    industry=brand_data["industry"],
                )
                b = thread_db.query(Brand).filter(Brand.id == brand_data["id"]).first()
                if b:
                    b.brand_kit = kit
                    thread_db.commit()
            job_store.update(job.id, progress=2)

            # Step 3: Generate campaign content
            campaign_data = generate_campaign(
                company_name=brand_data["company_name"],
                company_description=brand_data["description"],
                industry=brand_data["industry"],
                brand_kit=kit,
                brief=brief,
                post_count=post_count,
                platforms=platforms,
                analyzed_brief=analyzed,
            )
            job_store.update(job.id, progress=3)

            # Step 4: Save campaign to DB
            campaign = Campaign(
                brand_id=brand_data["id"],
                title=campaign_data.get("title", "Campaign"),
                strategy=campaign_data.get("strategy", ""),
                days=campaign_data.get("days", []),
            )
            thread_db.add(campaign)
            thread_db.flush()

            for post_data in campaign_data.get("posts", []):
                post = Post(
                    campaign_id=campaign.id,
                    day=post_data.get("day", 1),
                    caption=post_data.get("caption"),
                    hook=post_data.get("hook"),
                    cta=post_data.get("cta"),
                    hashtags=post_data.get("hashtags", []),
                    image_prompt=post_data.get("imagePrompt"),
                    platform=post_data.get("platform", "instagram"),
                    publish_status="draft",
                )
                thread_db.add(post)

            thread_db.commit()
            thread_db.refresh(campaign)
            job_store.update(job.id, progress=5)

            # Mark brand active
            b = thread_db.query(Brand).filter(Brand.id == brand_data["id"]).first()
            if b:
                b.status = "active"
                thread_db.commit()

            job_store.update(job.id, status="done", progress=6, result={
                "id": campaign.id,
                "brandId": campaign.brand_id,
                "title": campaign.title,
                "strategy": campaign.strategy,
                "postCount": len(campaign_data.get("posts", [])),
                "campaignId": campaign.id,
            })
        except Exception as e:
            thread_db.rollback()
            job_store.update(job.id, status="failed", error=str(e))
            credits_layer.refund_credits(user_id, charged, thread_db)
        finally:
            thread_db.close()

    threading.Thread(target=run_pipeline, daemon=True).start()
    return {"jobId": job.id, "message": "Campaign pipeline started"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_owned_brand(brand_id: int, user_id: str, db: Session) -> Brand:
    brand = (
        db.query(Brand)
        .filter(Brand.id == brand_id, Brand.user_id == str(user_id))
        .first()
    )
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    return brand


def _handle_ai_error(e: Exception):
    msg = str(e)
    if "No AI provider" in msg or "api_key" in msg.lower():
        raise HTTPException(status_code=503, detail="AI provider not configured. Set OPENAI_API_KEY or GEMINI_API_KEY.")
    if "quota" in msg.lower() or "billing" in msg.lower():
        raise HTTPException(status_code=503, detail=msg)
    raise HTTPException(status_code=503, detail=f"AI service error: {msg}")
