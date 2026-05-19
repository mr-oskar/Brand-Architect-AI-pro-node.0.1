"""
Dashboard routes — summary stats and user profile management.

Extension points:
  - Add analytics: post performance, campaign reach, credit burn rate.
  - Add activity feed: recent actions across all brands.
  - Add subscription status endpoint.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.layers.credits import credits_layer
from app.models import Brand, Campaign, Post, User
from app.schemas import BrandSummaryResponse

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
def get_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return aggregate stats and recent brands for the user's dashboard.
    """
    uid = str(current_user.id)
    brand_count = db.query(Brand).filter(Brand.user_id == uid).count()
    recent_brands = (
        db.query(Brand)
        .filter(Brand.user_id == uid)
        .order_by(Brand.created_at.desc())
        .limit(5)
        .all()
    )

    campaign_count = (
        db.query(Campaign)
        .join(Brand, Brand.id == Campaign.brand_id)
        .filter(Brand.user_id == uid)
        .count()
    )
    post_count = (
        db.query(Post)
        .join(Campaign, Campaign.id == Post.campaign_id)
        .join(Brand, Brand.id == Campaign.brand_id)
        .filter(Brand.user_id == uid)
        .count()
    )

    return {
        "totalBrands": brand_count,
        "totalCampaigns": campaign_count,
        "totalPosts": post_count,
        "credits": current_user.credits,
        "recentBrands": [BrandSummaryResponse.from_orm(b).model_dump() for b in recent_brands],
    }


@router.get("/credits")
def get_credits(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the current user's credit balance."""
    db.refresh(current_user)
    return {"credits": current_user.credits}


@router.patch("/profile")
def update_profile(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update user profile (name).
    Password change is handled separately to enforce current-password verification.

    Extension: Add avatar_url, timezone, language, notification preferences.
    """
    allowed = {"name"}
    for field in allowed:
        if field in body:
            setattr(current_user, field, str(body[field]).strip()[:100])
    db.commit()
    db.refresh(current_user)
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "credits": current_user.credits,
        "role": current_user.role,
    }


@router.post("/change-password")
def change_password(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change user password — requires current password verification."""
    from app.deps import auth_layer
    current_password = body.get("currentPassword", "")
    new_password = body.get("newPassword", "")

    if not current_password or not new_password:
        raise HTTPException(status_code=400, detail="currentPassword and newPassword are required")
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    if not auth_layer.verify_password(current_password, current_user.password_hash):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    current_user.password_hash = auth_layer.hash_password(new_password)
    db.commit()
    return {"ok": True, "message": "Password updated successfully"}
