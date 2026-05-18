"""
Campaign routes — list, get, delete campaigns and manage their posts.

DB note: campaigns.days is JSONB (stores the AI days array), not an integer.
The number of days is derived from len(campaign.posts) or len(campaign.days or []).
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user
from app.models import Brand, Campaign, Post, User
from app.schemas import PostResponse

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


@router.get("")
def list_campaigns(
    brand_id: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List campaigns for the current user, optionally filtered by brand_id."""
    query = (
        db.query(Campaign)
        .join(Brand, Brand.id == Campaign.brand_id)
        .filter(Brand.user_id == str(current_user.id))
        .order_by(Campaign.created_at.desc())
    )
    if brand_id:
        query = query.filter(Campaign.brand_id == brand_id)

    total = query.count()
    campaigns = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "total": total,
        "page": page,
        "pageSize": page_size,
        "campaigns": [
            {
                "id": c.id,
                "brandId": c.brand_id,
                "title": c.title,
                "strategy": c.strategy,
                "dayCount": len(c.days) if isinstance(c.days, list) else 0,
                "createdAt": c.created_at.isoformat() if c.created_at else None,
                "updatedAt": c.updated_at.isoformat() if c.updated_at else None,
            }
            for c in campaigns
        ],
    }


@router.get("/{campaign_id}")
def get_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get full campaign details including all posts and brand info."""
    campaign = _get_owned_campaign(campaign_id, str(current_user.id), db)
    brand = campaign.brand

    return {
        "id": campaign.id,
        "brandId": campaign.brand_id,
        "title": campaign.title,
        "strategy": campaign.strategy,
        "days": campaign.days,                # JSONB array of day objects
        "dayCount": len(campaign.days) if isinstance(campaign.days, list) else 0,
        "createdAt": campaign.created_at.isoformat() if campaign.created_at else None,
        "updatedAt": campaign.updated_at.isoformat() if campaign.updated_at else None,
        "brand": {
            "id": brand.id,
            "companyName": brand.company_name,
            "industry": brand.industry,
            "logoUrl": brand.logo_url,
            "brandKit": brand.brand_kit,
        },
        "posts": [PostResponse.from_orm(p).model_dump() for p in campaign.posts],
    }


@router.delete("/{campaign_id}", status_code=204)
def delete_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a campaign and all its posts."""
    campaign = _get_owned_campaign(campaign_id, str(current_user.id), db)
    db.delete(campaign)
    db.commit()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_owned_campaign(campaign_id: int, user_id: str, db: Session) -> Campaign:
    campaign = (
        db.query(Campaign)
        .options(joinedload(Campaign.brand), joinedload(Campaign.posts))
        .join(Brand, Brand.id == Campaign.brand_id)
        .filter(Campaign.id == campaign_id, Brand.user_id == str(user_id))
        .first()
    )
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign
