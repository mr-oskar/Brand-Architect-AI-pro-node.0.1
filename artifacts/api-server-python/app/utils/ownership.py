"""
Ownership verification utilities — DRY helpers for "does this user own this resource?"

Every route that accesses a brand, campaign, or post must verify that the
current user owns it. These helpers centralise that check and raise a consistent
HTTP 404 (not 403, to avoid leaking resource existence to unauthorised callers).

Usage in a route:
    from app.utils import get_owned_brand

    brand = get_owned_brand(brand_id, current_user.id, db)

Extension points:
  - Multi-tenant: add team_id param and check team membership instead of user_id
  - Shared resources: add an `allow_shared=True` flag to also return public resources
  - Caching: wrap with Redis cache for high-traffic read paths
"""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Brand, Campaign, Post


def get_owned_brand(brand_id: int, user_id: str, db: Session) -> Brand:
    """
    Return the Brand if it belongs to user_id, else raise HTTP 404.

    Raises:
        HTTPException(404) — brand not found or belongs to another user
    """
    brand = (
        db.query(Brand)
        .filter(Brand.id == brand_id, Brand.user_id == str(user_id))
        .first()
    )
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    return brand


def get_owned_campaign(campaign_id: int, user_id: str, db: Session) -> Campaign:
    """
    Return the Campaign if its parent brand belongs to user_id, else raise HTTP 404.

    Raises:
        HTTPException(404) — campaign not found or belongs to another user
    """
    campaign = (
        db.query(Campaign)
        .join(Brand, Brand.id == Campaign.brand_id)
        .filter(Campaign.id == campaign_id, Brand.user_id == str(user_id))
        .first()
    )
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign


def get_owned_post(post_id: int, user_id: str, db: Session) -> tuple[Post, Campaign]:
    """
    Return (Post, Campaign) if the post's campaign's brand belongs to user_id.

    Returns both Post and Campaign so callers can access campaign/brand data
    without a second query.

    Raises:
        HTTPException(404) — post not found or belongs to another user
    """
    result = (
        db.query(Post, Campaign)
        .join(Campaign, Campaign.id == Post.campaign_id)
        .join(Brand, Brand.id == Campaign.brand_id)
        .filter(Post.id == post_id, Brand.user_id == str(user_id))
        .first()
    )
    if not result:
        raise HTTPException(status_code=404, detail="Post not found")
    post, campaign = result
    return post, campaign
