"""
Pydantic v2 schemas for request validation and response serialization.

Field names match the ACTUAL database schema (verified 2026-05-18).
Note: 'company_description' and 'website_url' are the real DB column names.
"""
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, EmailStr, field_validator


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


# ── Auth ──────────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None

    @field_validator("password")
    @classmethod
    def password_length(cls, v: str) -> str:
        if len(v) < 8 or len(v) > 200:
            raise ValueError("Password must be 8–200 characters")
        return v

    @field_validator("name")
    @classmethod
    def name_length(cls, v: str | None) -> str | None:
        if v and len(v) > 100:
            raise ValueError("Name too long")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    name: Optional[str]
    role: str
    credits: int
    created_at: Optional[str] = None

    @classmethod
    def from_orm(cls, user: Any) -> "UserResponse":
        return cls(
            id=str(user.id),
            email=str(user.email),
            name=user.name,
            role=str(user.role or "user"),
            credits=int(user.credits or 0),
            created_at=_iso(user.created_at),
        )


# ── Brands ────────────────────────────────────────────────────────────────────

class CreateBrandRequest(BaseModel):
    company_name: str
    industry: str
    description: Optional[str] = None   # maps to company_description
    website: Optional[str] = None        # maps to website_url
    logo_url: Optional[str] = None

    @field_validator("company_name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("company_name is required")
        return v.strip()


class UpdateBrandRequest(BaseModel):
    company_name: Optional[str] = None
    industry: Optional[str] = None
    description: Optional[str] = None
    website: Optional[str] = None
    logo_url: Optional[str] = None
    status: Optional[str] = None
    brand_kit: Optional[dict] = None


class BrandSummaryResponse(BaseModel):
    id: int
    company_name: str
    industry: str
    description: Optional[str] = None
    logo_url: Optional[str]
    status: str
    created_at: str
    updated_at: str

    @classmethod
    def from_orm(cls, b: Any) -> "BrandSummaryResponse":
        return cls(
            id=int(b.id),
            company_name=str(b.company_name),
            industry=str(b.industry),
            description=b.company_description,
            logo_url=b.logo_url,
            status=str(b.status or "active"),
            created_at=_iso(b.created_at) or "",
            updated_at=_iso(b.updated_at) or "",
        )


class BrandDetailResponse(BrandSummaryResponse):
    user_id: str
    website: Optional[str] = None
    brand_kit: Optional[dict] = None

    @classmethod
    def from_orm(cls, b: Any) -> "BrandDetailResponse":
        return cls(
            id=int(b.id),
            user_id=str(b.user_id),
            company_name=str(b.company_name),
            industry=str(b.industry),
            description=b.company_description,
            website=b.website_url,
            logo_url=b.logo_url,
            status=str(b.status or "active"),
            brand_kit=b.brand_kit,
            created_at=_iso(b.created_at) or "",
            updated_at=_iso(b.updated_at) or "",
        )


class GenerateKitRequest(BaseModel):
    brand_colors: Optional[list[str]] = None


class GenerateCampaignRequest(BaseModel):
    days: int = 7
    platforms: list[str] = ["instagram"]
    brief: Optional[str] = None
    target_audience: Optional[str] = None
    campaign_goal: Optional[str] = None
    reference_images: Optional[list[str]] = None

    @field_validator("days")
    @classmethod
    def days_range(cls, v: int) -> int:
        return max(1, min(14, v))


# ── Posts ─────────────────────────────────────────────────────────────────────

class PostResponse(BaseModel):
    id: int
    campaign_id: int
    day: int
    caption: Optional[str]
    hook: Optional[str]
    cta: Optional[str]
    hashtags: Optional[list[str]]
    image_prompt: Optional[str]
    image_url: Optional[str]
    image_history: Optional[list[dict]]
    platform: str
    scheduled_at: Optional[str]
    published_at: Optional[str]
    publish_status: str
    created_at: str
    updated_at: str

    @classmethod
    def from_orm(cls, p: Any) -> "PostResponse":
        return cls(
            id=int(p.id),
            campaign_id=int(p.campaign_id),
            day=int(p.day or 1),
            caption=p.caption,
            hook=p.hook,
            cta=p.cta,
            hashtags=list(p.hashtags or []),
            image_prompt=p.image_prompt,
            image_url=p.image_url,
            image_history=list(p.image_history or []),
            platform=str(p.platform or "instagram"),
            scheduled_at=_iso(p.scheduled_at),
            published_at=_iso(p.published_at),
            publish_status=str(p.publish_status or "draft"),
            created_at=_iso(p.created_at) or "",
            updated_at=_iso(p.updated_at) or "",
        )


class UpdatePostRequest(BaseModel):
    caption: Optional[str] = None
    hook: Optional[str] = None
    cta: Optional[str] = None
    hashtags: Optional[list[str]] = None
    image_prompt: Optional[str] = None
    platform: Optional[str] = None


class GeneratePostImageRequest(BaseModel):
    custom_prompt: Optional[str] = None
    size: Optional[str] = "1024x1024"
    logo_data_url: Optional[str] = None
    overlay_text: Optional[str] = None
    brand_name: Optional[str] = None
    model: Optional[str] = "pro"
    reference_images: Optional[list[dict]] = None


class GenerateAllImagesRequest(BaseModel):
    size: Optional[str] = "1024x1024"
    logo_data_url: Optional[str] = None
    skip_existing: bool = True


# ── Dashboard ─────────────────────────────────────────────────────────────────

class JobResponse(BaseModel):
    id: str
    status: str
    progress: int
    total: int
    result: Optional[Any] = None
    error: Optional[str] = None
