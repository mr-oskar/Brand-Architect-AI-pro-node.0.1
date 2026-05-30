"""
Admin routes — user management, credit management, platform settings, AI API keys.

All routes require the requesting user to have role="admin".
Uses get_current_admin dependency which raises HTTP 403 for non-admins.

Endpoints:
  GET    /admin/users                         — list all users (paginated)
  GET    /admin/users/:id                     — get single user details
  PATCH  /admin/users/:id                     — update role / status / name
  POST   /admin/users/:id/credits/add         — add credits to a user
  POST   /admin/users/:id/credits/set         — set exact credit balance
  GET    /admin/users/:id/credits/history     — paginated credit transaction log
  GET    /admin/settings                      — get all platform settings
  PATCH  /admin/settings                      — update platform settings
  GET    /admin/stats                         — platform-wide usage statistics

Extension points:
  - Add DELETE /admin/users/:id to delete user + cascade (with confirmation flow)
  - Add POST /admin/users/:id/suspend to toggle user status
  - Add GET /admin/credit-packages for managing purchasable credit packs
  - Add POST /admin/credits/bulk-add for granting credits to all users
"""
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.layers.credits import credits_layer, DEFAULT_CREDIT_COSTS
from app.models import AppSetting, Brand, Campaign, Post, User
from app.schemas import UserResponse
from app.utils import api_key_store

router = APIRouter(prefix="/admin", tags=["admin"])


# ── Schemas (admin-only) ──────────────────────────────────────────────────────

class UpdateUserRequest(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None     # "user" | "admin"
    status: Optional[str] = None  # "active" | "suspended"


class AddCreditsRequest(BaseModel):
    amount: int
    description: Optional[str] = "Admin credit grant"


class SetCreditsRequest(BaseModel):
    amount: int
    description: Optional[str] = "Credits set by admin"


class UpdateSettingsRequest(BaseModel):
    """
    Partial settings update. Only keys present in the payload are updated.

    Known setting keys:
      site           → { siteName, tagline, primaryColor, defaultLanguage }
      features       → { enableRegistration, ... }
      maintenance    → { enabled: bool, message: str }
      creditCosts    → { "brand.generate-kit": 50, ... }
      creditPackages → [ { id, name, credits, price, popular? }, ... ]
      defaultUserCredits → number
    """
    key: str
    value: Any


class SetApiKeyRequest(BaseModel):
    apiKey: str
    baseUrl: Optional[str] = None
    enabled: bool = True


class ToggleProviderRequest(BaseModel):
    enabled: bool


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users")
def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    role: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """
    List all platform users with optional filters.

    Query params:
      ?page=1         — page number
      ?pageSize=20    — items per page
      ?role=admin     — filter by role (admin | user)
      ?status=active  — filter by status (active | suspended)
      ?search=email   — filter by email or name (case-insensitive)
    """
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    if status:
        q = q.filter(User.status == status)
    if search:
        pattern = f"%{search.lower()}%"
        q = q.filter(
            (func.lower(User.email).like(pattern)) |
            (func.lower(User.name).like(pattern))
        )
    total = q.count()
    users = q.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    # Single aggregation query — avoids N+1 (one DB round-trip for all brand counts)
    user_ids = [str(u.id) for u in users]
    brand_counts: dict[str, int] = {}
    if user_ids:
        rows = (
            db.query(Brand.user_id, func.count(Brand.id))
            .filter(Brand.user_id.in_(user_ids))
            .group_by(Brand.user_id)
            .all()
        )
        brand_counts = {uid: cnt for uid, cnt in rows}

    return {
        "users": [
            {
                **UserResponse.from_orm(u).model_dump(),
                "brandCount": brand_counts.get(str(u.id), 0),
            }
            for u in users
        ],
        "total": total,
        "page": page,
        "pageSize": page_size,
    }


@router.get("/users/{user_id}")
def get_user(
    user_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Get a single user's details including brand count and recent transactions."""
    user = _get_user_or_404(user_id, db)
    brand_count = db.query(Brand).filter(Brand.user_id == str(user.id)).count()
    history = credits_layer.get_history(str(user.id), db, page=1, page_size=5)

    return {
        **UserResponse.from_orm(user).model_dump(),
        "brandCount": brand_count,
        "recentTransactions": history["transactions"],
    }


@router.patch("/users/{user_id}")
def update_user(
    user_id: str,
    body: UpdateUserRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Update a user's role, status, or name."""
    user = _get_user_or_404(user_id, db)

    if body.role is not None:
        if body.role not in ("user", "admin"):
            raise HTTPException(status_code=400, detail="role must be 'user' or 'admin'")
        user.role = body.role

    if body.status is not None:
        if body.status not in ("active", "suspended"):
            raise HTTPException(status_code=400, detail="status must be 'active' or 'suspended'")
        user.status = body.status

    if body.name is not None:
        user.name = body.name.strip() or None

    db.commit()
    db.refresh(user)
    return {"user": UserResponse.from_orm(user).model_dump()}


# ── Credit management ─────────────────────────────────────────────────────────

@router.post("/users/{user_id}/credits/add")
def admin_add_credits(
    user_id: str,
    body: AddCreditsRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """
    Add credits to a user's balance.
    Use a negative amount to subtract credits (but use set_credits for exact control).
    """
    user = _get_user_or_404(user_id, db)
    if body.amount == 0:
        raise HTTPException(status_code=400, detail="amount cannot be zero")

    new_balance = credits_layer.add_credits(
        user_id=str(user.id),
        delta=body.amount,
        db=db,
        action="admin.add",
        description=body.description or "Admin credit grant",
        meta={"admin_id": str(admin.id)},
    )
    return {"userId": user_id, "added": body.amount, "newBalance": new_balance}


@router.post("/users/{user_id}/credits/set")
def admin_set_credits(
    user_id: str,
    body: SetCreditsRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Set a user's credit balance to an exact value."""
    user = _get_user_or_404(user_id, db)
    if body.amount < 0:
        raise HTTPException(status_code=400, detail="amount cannot be negative")

    new_balance = credits_layer.set_credits(
        user_id=str(user.id),
        amount=body.amount,
        db=db,
        admin_id=str(admin.id),
        description=body.description or "Credits set by admin",
    )
    return {"userId": user_id, "newBalance": new_balance}


@router.get("/users/{user_id}/credits/history")
def admin_credit_history(
    user_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Return paginated credit transaction history for any user."""
    _get_user_or_404(user_id, db)
    return credits_layer.get_history(user_id, db, page=page, page_size=page_size)


# ── Platform settings ─────────────────────────────────────────────────────────

@router.get("/settings")
def get_all_settings(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Return all platform settings as a key-value map."""
    rows = db.query(AppSetting).all()
    return {r.key: r.value for r in rows}


ALLOWED_SETTING_KEYS = frozenset({
    "site",
    "features",
    "maintenance",
    "creditCosts",
    "creditPackages",
    "defaultUserCredits",
})


@router.patch("/settings")
def update_setting(
    body: UpdateSettingsRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """
    Create or update a single settings key.

    Only known keys (defined in ALLOWED_SETTING_KEYS) are accepted to prevent
    arbitrary data from being stored in app_settings.

    After updating creditCosts or defaultUserCredits, the credits cache is
    invalidated automatically so new costs take effect within 30 seconds.
    """
    if body.key not in ALLOWED_SETTING_KEYS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown settings key '{body.key}'. Allowed: {sorted(ALLOWED_SETTING_KEYS)}",
        )

    setting = db.query(AppSetting).filter(AppSetting.key == body.key).first()
    if setting:
        setting.value = body.value
    else:
        setting = AppSetting(key=body.key, value=body.value)
        db.add(setting)
    db.commit()

    # Invalidate credits cache if cost config changed
    if body.key in ("creditCosts", "defaultUserCredits", "creditPackages"):
        credits_layer.invalidate_cache()

    return {"key": body.key, "value": body.value}


@router.get("/settings/credit-costs")
def get_credit_costs_admin(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """
    Return current credit costs (defaults merged with DB overrides).
    Useful for the admin UI to show and edit costs.
    """
    return {
        "defaults": DEFAULT_CREDIT_COSTS,
        "effective": credits_layer.get_all_costs(db),
        "packages": credits_layer.get_packages(db),
        "defaultUserCredits": credits_layer.get_default_credits(db),
    }


# ── Platform stats ────────────────────────────────────────────────────────────

@router.get("/stats")
def get_platform_stats(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Platform-wide usage statistics for admin dashboard."""
    total_users = db.query(func.count(User.id)).scalar() or 0
    admin_users = db.query(func.count(User.id)).filter(User.role == "admin").scalar() or 0
    total_brands = db.query(func.count(Brand.id)).scalar() or 0
    total_campaigns = db.query(func.count(Campaign.id)).scalar() or 0
    total_posts = db.query(func.count(Post.id)).scalar() or 0
    posts_with_images = db.query(func.count(Post.id)).filter(Post.image_url.isnot(None)).scalar() or 0

    total_credits = db.execute(
        text("SELECT COALESCE(SUM(credits), 0) FROM users WHERE role != 'admin'")
    ).scalar() or 0

    return {
        "users": {
            "total": total_users,
            "admins": admin_users,
            "regular": total_users - admin_users,
        },
        "brands": total_brands,
        "campaigns": total_campaigns,
        "posts": {
            "total": total_posts,
            "withImages": posts_with_images,
            "withoutImages": total_posts - posts_with_images,
        },
        "credits": {
            "totalInCirculation": total_credits,
        },
    }


# ── AI API Key Management ─────────────────────────────────────────────────────

@router.get("/api-keys")
def list_api_keys(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """
    List all AI provider configurations (API keys masked — only last 4 chars shown).

    Providers: openai, gemini, nano_banana
    env_configured=true means the key is available via environment variable
    (no DB key stored). configured=true means a DB key exists.
    """
    return {"providers": api_key_store.get_provider_list(db)}


@router.post("/api-keys/{provider}")
def set_api_key(
    provider: str,
    body: SetApiKeyRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """
    Add or replace an AI provider API key.
    Existing key is overwritten. Invalidates the AI client cache immediately.
    """
    if provider not in api_key_store.KNOWN_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown provider '{provider}'. Valid: {list(api_key_store.KNOWN_PROVIDERS)}",
        )
    key = (body.apiKey or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="apiKey cannot be empty")

    base_url = (body.baseUrl or "").strip() or None
    if provider == "nano_banana" and not base_url:
        raise HTTPException(status_code=400, detail="Nano Banana requires a baseUrl")

    api_key_store.save(db, provider, key, base_url, body.enabled)

    # Invalidate AI client so next call picks up the new key
    from app.services.ai import client as ai_client
    ai_client.invalidate_client_cache()

    label = api_key_store.KNOWN_PROVIDERS[provider]["label"]
    return {"message": f"{label} API key saved successfully", "provider": provider}


@router.delete("/api-keys/{provider}")
def delete_api_key(
    provider: str,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Remove an AI provider API key from the database."""
    if provider not in api_key_store.KNOWN_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unknown provider '{provider}'")

    api_key_store.delete_provider(db, provider)

    from app.services.ai import client as ai_client
    ai_client.invalidate_client_cache()

    label = api_key_store.KNOWN_PROVIDERS[provider]["label"]
    return {"message": f"{label} API key removed", "provider": provider}


@router.post("/api-keys/{provider}/toggle")
def toggle_api_key(
    provider: str,
    body: ToggleProviderRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Enable or disable an AI provider without changing the key."""
    if provider not in api_key_store.KNOWN_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unknown provider '{provider}'")

    api_key_store.toggle_provider(db, provider, body.enabled)

    from app.services.ai import client as ai_client
    ai_client.invalidate_client_cache()

    label = api_key_store.KNOWN_PROVIDERS[provider]["label"]
    action = "enabled" if body.enabled else "disabled"
    return {"message": f"{label} {action}", "provider": provider, "enabled": body.enabled}


@router.post("/api-keys/{provider}/test")
def test_api_key(
    provider: str,
    body: SetApiKeyRequest,
    admin: User = Depends(get_current_admin),
):
    """
    Test an API key by making a minimal real request (does not save the key).
    Returns HTTP 200 with success=true on success, or HTTP 400 with detail on failure.
    """
    from openai import OpenAI, AuthenticationError, RateLimitError

    if provider not in api_key_store.KNOWN_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unknown provider '{provider}'")

    key = (body.apiKey or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="apiKey cannot be empty")

    meta = api_key_store.KNOWN_PROVIDERS[provider]

    if provider == "gemini":
        base_url = "https://generativelanguage.googleapis.com/v1beta/openai/"
        model = "gemini-2.5-flash"
    elif provider == "nano_banana":
        base_url = (body.baseUrl or "").strip()
        if not base_url:
            raise HTTPException(status_code=400, detail="Nano Banana requires a baseUrl")
        model = "gpt-4o-mini"
    else:
        base_url = "https://api.openai.com/v1"
        model = "gpt-4o-mini"

    try:
        client = OpenAI(api_key=key, base_url=base_url, timeout=15)
        resp = client.chat.completions.create(
            model=model,
            max_completion_tokens=5,
            messages=[{"role": "user", "content": "Reply OK"}],
        )
        reply = (resp.choices[0].message.content or "").strip()
        return {"success": True, "message": f"Connection successful — model replied: {reply or '(empty)'}"}

    except AuthenticationError:
        raise HTTPException(status_code=400, detail="Invalid API key — authentication failed")
    except RateLimitError:
        return {"success": True, "message": "Key is valid (rate limit reached — this is OK for testing)"}
    except Exception as exc:
        msg = str(exc)
        if "401" in msg:
            raise HTTPException(status_code=400, detail="Invalid API key — authentication failed")
        if "not found" in msg.lower() or "model" in msg.lower():
            return {"success": True, "message": f"Key accepted but model '{model}' not available — try a different model name for this provider"}
        raise HTTPException(status_code=400, detail=f"Connection failed: {msg[:300]}")


# ── Helper ────────────────────────────────────────────────────────────────────

def _get_user_or_404(user_id: str, db: Session) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
