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
from app.services.ai.brand_kit import generate_brand_kit
from app.services.ai.campaign import analyze_brief, generate_campaign
from app.services.job_store import job_store

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
