"""
Admin routes — user management, credit management, platform settings, AI API keys.

All routes require the requesting user to have role="admin".

AI API Key endpoints:
  GET    /admin/api-keys                          — list all provider configs
  POST   /admin/api-keys/{provider}/fetch-models  — fetch live models from provider API
  POST   /admin/api-keys/{provider}/test          — test key (real request, no save)
  POST   /admin/api-keys/{provider}               — save key + model prefs
  DELETE /admin/api-keys/{provider}               — remove key
  POST   /admin/api-keys/{provider}/toggle        — enable / disable without changing key
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
from app.utils.model_fetcher import fetch_models

router = APIRouter(prefix="/admin", tags=["admin"])

# All valid provider IDs (including legacy "nano_banana" for backward-compat)
_VALID_PROVIDERS = set(api_key_store.KNOWN_PROVIDERS.keys()) | {"nano_banana"}


# ── Schemas ───────────────────────────────────────────────────────────────────

class UpdateUserRequest(BaseModel):
    name:   Optional[str] = None
    role:   Optional[str] = None   # "user" | "admin"
    status: Optional[str] = None  # "active" | "suspended"


class AddCreditsRequest(BaseModel):
    amount:      int
    description: Optional[str] = "Admin credit grant"


class SetCreditsRequest(BaseModel):
    amount:      int
    description: Optional[str] = "Credits set by admin"


class UpdateSettingsRequest(BaseModel):
    key:   str
    value: Any


class SetApiKeyRequest(BaseModel):
    apiKey:      str
    baseUrl:     Optional[str] = None
    enabled:     bool = True
    textModel:   Optional[str] = None
    imageModel:  Optional[str] = None
    textModels:  Optional[list[str]] = None
    imageModels: Optional[list[str]] = None


class ToggleProviderRequest(BaseModel):
    enabled: bool


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users")
def list_users(
    page:      int           = Query(1,  ge=1),
    page_size: int           = Query(20, ge=1, le=100),
    role:      Optional[str] = Query(None),
    status:    Optional[str] = Query(None),
    search:    Optional[str] = Query(None),
    db:    Session = Depends(get_db),
    admin: User    = Depends(get_current_admin),
):
    q = db.query(User)
    if role:   q = q.filter(User.role == role)
    if status: q = q.filter(User.status == status)
    if search:
        p = f"%{search.lower()}%"
        q = q.filter(func.lower(User.email).like(p) | func.lower(User.name).like(p))

    total = q.count()
    users = q.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

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
            {**UserResponse.from_orm(u).model_dump(), "brandCount": brand_counts.get(str(u.id), 0)}
            for u in users
        ],
        "total": total, "page": page, "pageSize": page_size,
    }


@router.get("/users/{user_id}")
def get_user(user_id: str, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    user = _get_user_or_404(user_id, db)
    brand_count = db.query(Brand).filter(Brand.user_id == str(user.id)).count()
    history = credits_layer.get_history(str(user.id), db, page=1, page_size=5)
    return {**UserResponse.from_orm(user).model_dump(), "brandCount": brand_count, "recentTransactions": history["transactions"]}


@router.patch("/users/{user_id}")
def update_user(user_id: str, body: UpdateUserRequest, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
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
    db.commit(); db.refresh(user)
    return {"user": UserResponse.from_orm(user).model_dump()}


# ── Credits ───────────────────────────────────────────────────────────────────

@router.post("/users/{user_id}/credits/add")
def admin_add_credits(user_id: str, body: AddCreditsRequest, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    user = _get_user_or_404(user_id, db)
    if body.amount == 0:
        raise HTTPException(status_code=400, detail="amount cannot be zero")
    new_balance = credits_layer.add_credits(str(user.id), body.amount, db, "admin.add", body.description or "Admin credit grant", {"admin_id": str(admin.id)})
    return {"userId": user_id, "added": body.amount, "newBalance": new_balance}


@router.post("/users/{user_id}/credits/set")
def admin_set_credits(user_id: str, body: SetCreditsRequest, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    user = _get_user_or_404(user_id, db)
    if body.amount < 0:
        raise HTTPException(status_code=400, detail="amount cannot be negative")
    new_balance = credits_layer.set_credits(str(user.id), body.amount, db, str(admin.id), body.description or "Credits set by admin")
    return {"userId": user_id, "newBalance": new_balance}


@router.get("/users/{user_id}/credits/history")
def admin_credit_history(user_id: str, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    _get_user_or_404(user_id, db)
    return credits_layer.get_history(user_id, db, page=page, page_size=page_size)


# ── Platform settings ─────────────────────────────────────────────────────────

@router.get("/settings")
def get_all_settings(db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    rows = db.query(AppSetting).all()
    return {r.key: r.value for r in rows}


ALLOWED_SETTING_KEYS = frozenset({"site", "features", "maintenance", "creditCosts", "creditPackages", "defaultUserCredits"})


@router.patch("/settings")
def update_setting(body: UpdateSettingsRequest, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    if body.key not in ALLOWED_SETTING_KEYS:
        raise HTTPException(status_code=400, detail=f"Unknown settings key '{body.key}'. Allowed: {sorted(ALLOWED_SETTING_KEYS)}")
    setting = db.query(AppSetting).filter(AppSetting.key == body.key).first()
    if setting:
        setting.value = body.value
    else:
        db.add(AppSetting(key=body.key, value=body.value))
    db.commit()
    if body.key in ("creditCosts", "defaultUserCredits", "creditPackages"):
        credits_layer.invalidate_cache()
    return {"key": body.key, "value": body.value}


@router.get("/settings/credit-costs")
def get_credit_costs_admin(db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    return {"defaults": DEFAULT_CREDIT_COSTS, "effective": credits_layer.get_all_costs(db), "packages": credits_layer.get_packages(db), "defaultUserCredits": credits_layer.get_default_credits(db)}


# ── Platform stats ─────────────────────────────────────────────────────────────

@router.get("/stats")
def get_platform_stats(db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    total_users  = db.query(func.count(User.id)).scalar() or 0
    admin_users  = db.query(func.count(User.id)).filter(User.role == "admin").scalar() or 0
    total_brands = db.query(func.count(Brand.id)).scalar() or 0
    total_campaigns = db.query(func.count(Campaign.id)).scalar() or 0
    total_posts  = db.query(func.count(Post.id)).scalar() or 0
    posts_with_images = db.query(func.count(Post.id)).filter(Post.image_url.isnot(None)).scalar() or 0
    total_credits = db.execute(text("SELECT COALESCE(SUM(credits), 0) FROM users WHERE role != 'admin'")).scalar() or 0

    return {
        "users":    {"total": total_users, "admins": admin_users, "regular": total_users - admin_users},
        "brands":   total_brands,
        "campaigns": total_campaigns,
        "posts":    {"total": total_posts, "withImages": posts_with_images, "withoutImages": total_posts - posts_with_images},
        "credits":  {"totalInCirculation": total_credits},
    }


# ── AI API Key Management ─────────────────────────────────────────────────────

@router.get("/api-keys")
def list_api_keys(db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    """List all AI provider configurations (API keys masked — only last 4 chars shown)."""
    return {"providers": api_key_store.get_provider_list(db)}


@router.post("/api-keys/{provider}/fetch-models")
def fetch_provider_models(
    provider: str,
    body:  SetApiKeyRequest,
    admin: User = Depends(get_current_admin),
):
    """
    Fetch the live model list directly from a provider's API.
    Uses the supplied key (not saved) to make a real models-list request.
    Returns categorised text / image / other model lists.
    """
    _require_valid_provider(provider)
    key = (body.apiKey or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="apiKey is required")

    base_url = (body.baseUrl or "").strip() or None
    if provider in ("custom", "nano_banana") and not base_url:
        raise HTTPException(status_code=400, detail="baseUrl is required for custom endpoints")

    try:
        result = fetch_models(provider, key, base_url)
        return result
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        msg = str(exc)
        if "401" in msg or "403" in msg:
            raise HTTPException(status_code=401, detail="Invalid API key — authentication failed")
        raise HTTPException(status_code=502, detail=f"Provider unreachable: {msg[:250]}")


@router.post("/api-keys/{provider}/test")
def test_api_key(
    provider: str,
    body:  SetApiKeyRequest,
    admin: User = Depends(get_current_admin),
):
    """
    Test an API key by sending a minimal real chat completion (does NOT save the key).
    Returns 200 + {success, message, model} on success, 401 on bad key.
    """
    from openai import OpenAI, AuthenticationError, RateLimitError

    _require_valid_provider(provider)
    key = (body.apiKey or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="apiKey is required")

    if provider == "gemini":
        base_url     = api_key_store.KNOWN_PROVIDERS["gemini"]["default_base_url"]
        default_model = body.textModel or "gemini-2.5-flash"
    elif provider in ("custom", "nano_banana"):
        base_url = (body.baseUrl or "").strip()
        if not base_url:
            raise HTTPException(status_code=400, detail="baseUrl is required")
        default_model = body.textModel or "gpt-4o-mini"
    else:
        base_url      = "https://api.openai.com/v1"
        default_model = body.textModel or "gpt-4o-mini"

    try:
        client = OpenAI(api_key=key, base_url=base_url, timeout=20)
        resp   = client.chat.completions.create(
            model=default_model,
            max_completion_tokens=5,
            messages=[{"role": "user", "content": "Reply OK"}],
        )
        reply = (resp.choices[0].message.content or "").strip()
        return {
            "success": True,
            "message": f"Connected — model replied: {reply or '(ok)'}",
            "model":   default_model,
        }

    except AuthenticationError:
        raise HTTPException(status_code=401, detail="Invalid API key — authentication failed")
    except RateLimitError:
        return {"success": True, "message": "Key valid (rate-limited — that's OK for testing)", "model": default_model}
    except Exception as exc:
        msg = str(exc)
        if "401" in msg:
            raise HTTPException(status_code=401, detail="Invalid API key — authentication failed")
        if "model" in msg.lower() or "not found" in msg.lower():
            return {"success": True, "message": f"Key accepted — model '{default_model}' may not be available on your plan.", "model": default_model, "warning": True}
        raise HTTPException(status_code=502, detail=f"Connection failed: {msg[:300]}")


@router.post("/api-keys/{provider}")
def set_api_key(
    provider: str,
    body: SetApiKeyRequest,
    db:   Session = Depends(get_db),
    admin: User   = Depends(get_current_admin),
):
    """Save an API key + model preferences. Invalidates the AI client cache immediately."""
    _require_valid_provider(provider)
    key = (body.apiKey or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="apiKey cannot be empty")

    base_url = (body.baseUrl or "").strip() or None
    if provider in ("custom", "nano_banana") and not base_url:
        raise HTTPException(status_code=400, detail="Custom provider requires a baseUrl")

    api_key_store.save(db, provider, key, base_url, body.enabled,
                       text_model=body.textModel or None,
                       image_model=body.imageModel or None,
                       text_models=body.textModels or None,
                       image_models=body.imageModels or None)

    from app.services.ai import client as ai_client
    ai_client.invalidate_client_cache()

    label = api_key_store.KNOWN_PROVIDERS.get(provider, {}).get("label", provider)
    return {"message": f"{label} API key saved successfully", "provider": provider}


@router.delete("/api-keys/{provider}")
def delete_api_key(provider: str, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    """Remove an AI provider API key from the database."""
    _require_valid_provider(provider)
    api_key_store.delete_provider(db, provider)
    from app.services.ai import client as ai_client
    ai_client.invalidate_client_cache()
    label = api_key_store.KNOWN_PROVIDERS.get(provider, {}).get("label", provider)
    return {"message": f"{label} API key removed", "provider": provider}


@router.post("/api-keys/{provider}/toggle")
def toggle_api_key(provider: str, body: ToggleProviderRequest, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    """Enable or disable an AI provider without changing the key."""
    _require_valid_provider(provider)
    api_key_store.toggle_provider(db, provider, body.enabled)
    from app.services.ai import client as ai_client
    ai_client.invalidate_client_cache()
    label  = api_key_store.KNOWN_PROVIDERS.get(provider, {}).get("label", provider)
    action = "enabled" if body.enabled else "disabled"
    return {"message": f"{label} {action}", "provider": provider, "enabled": body.enabled}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _require_valid_provider(provider: str) -> None:
    if provider not in _VALID_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unknown provider '{provider}'. Valid: {sorted(_VALID_PROVIDERS)}")


def _get_user_or_404(user_id: str, db: Session) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
