"""
Pydantic v2 schemas for request validation and response serialization.

All response fields use camelCase to match the TypeScript/generated API client.
All request fields use camelCase to match what the frontend sends.
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
    name: Optional[str] = None
    role: str
    status: Optional[str] = "active"
    credits: int
    createdAt: Optional[str] = None

    @classmethod
    def from_orm(cls, user: Any) -> "UserResponse":
        return cls(
            id=str(user.id),
            email=str(user.email),
            name=user.name,
            role=str(user.role or "user"),
            status=str(user.status or "active"),
            credits=int(user.credits or 0),
            createdAt=_iso(user.created_at),
        )


class AuthResponse(BaseModel):
    user: UserResponse
    token: str


# ── Brands ────────────────────────────────────────────────────────────────────

class CreateBrandRequest(BaseModel):
    companyName: str
    industry: str
    companyDescription: Optional[str] = None
    websiteUrl: Optional[str] = None
    logoUrl: Optional[str] = None

    @field_validator("companyName")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("companyName is required")
        return v.strip()


class UpdateBrandRequest(BaseModel):
    companyName: Optional[str] = None
    industry: Optional[str] = None
    companyDescription: Optional[str] = None
    websiteUrl: Optional[str] = None
    logoUrl: Optional[str] = None
    status: Optional[str] = None
    brandKit: Optional[dict] = None


class BrandSummaryResponse(BaseModel):
    id: int
    companyName: str
    industry: str
    description: Optional[str] = None
    logoUrl: Optional[str] = None
    status: str
    createdAt: str
    updatedAt: str

    @classmethod
    def from_orm(cls, b: Any) -> "BrandSummaryResponse":
        return cls(
            id=int(b.id),
            companyName=str(b.company_name),
            industry=str(b.industry),
            description=b.company_description,
            logoUrl=b.logo_url,
            status=str(b.status or "active"),
            createdAt=_iso(b.created_at) or "",
            updatedAt=_iso(b.updated_at) or "",
        )


class BrandDetailResponse(BrandSummaryResponse):
    userId: str
    websiteUrl: Optional[str] = None
    brandKit: Optional[dict] = None

    @classmethod
    def from_orm(cls, b: Any) -> "BrandDetailResponse":
        return cls(
            id=int(b.id),
            userId=str(b.user_id),
            companyName=str(b.company_name),
            industry=str(b.industry),
            description=b.company_description,
            websiteUrl=b.website_url,
            logoUrl=b.logo_url,
            status=str(b.status or "active"),
            brandKit=b.brand_kit,
            createdAt=_iso(b.created_at) or "",
            updatedAt=_iso(b.updated_at) or "",
        )


class GenerateKitRequest(BaseModel):
    brandColors: Optional[list[str]] = None


class GenerateCampaignRequest(BaseModel):
    days: int = 7
    platforms: list[str] = ["instagram"]
    brief: Optional[str] = None
    targetAudience: Optional[str] = None
    campaignGoal: Optional[str] = None
    referenceImages: Optional[list[str]] = None

    @field_validator("days")
    @classmethod
    def days_range(cls, v: int) -> int:
        return max(1, min(14, v))


# ── Posts ─────────────────────────────────────────────────────────────────────

class PostResponse(BaseModel):
    id: int
    campaignId: int
    day: int
    caption: Optional[str] = None
    hook: Optional[str] = None
    cta: Optional[str] = None
    hashtags: Optional[list[str]] = None
    imagePrompt: Optional[str] = None
    imageUrl: Optional[str] = None
    imageHistory: Optional[list[dict]] = None
    platform: str
    scheduledAt: Optional[str] = None
    publishedAt: Optional[str] = None
    publishStatus: str
    createdAt: str
    updatedAt: str

    @classmethod
    def from_orm(cls, p: Any) -> "PostResponse":
        return cls(
            id=int(p.id),
            campaignId=int(p.campaign_id),
            day=int(p.day or 1),
            caption=p.caption,
            hook=p.hook,
            cta=p.cta,
            hashtags=list(p.hashtags or []),
            imagePrompt=p.image_prompt,
            imageUrl=p.image_url,
            imageHistory=list(p.image_history or []),
            platform=str(p.platform or "instagram"),
            scheduledAt=_iso(p.scheduled_at),
            publishedAt=_iso(p.published_at),
            publishStatus=str(p.publish_status or "draft"),
            createdAt=_iso(p.created_at) or "",
            updatedAt=_iso(p.updated_at) or "",
        )


class UpdatePostRequest(BaseModel):
    caption: Optional[str] = None
    hook: Optional[str] = None
    cta: Optional[str] = None
    hashtags: Optional[list[str]] = None
    imagePrompt: Optional[str] = None
    platform: Optional[str] = None


class GeneratePostImageRequest(BaseModel):
    customPrompt: Optional[str] = None
    size: Optional[str] = "1024x1024"
    logoDataUrl: Optional[str] = None
    overlayText: Optional[str] = None
    brandName: Optional[str] = None
    model: Optional[str] = "pro"
    referenceImages: Optional[list[dict]] = None


class GenerateAllImagesRequest(BaseModel):
    size: Optional[str] = "1024x1024"
    logoDataUrl: Optional[str] = None
    skipExisting: bool = True


# ── Dashboard ─────────────────────────────────────────────────────────────────

class JobResponse(BaseModel):
    id: str
    status: str
    progress: int
    total: int
    result: Optional[Any] = None
    error: Optional[str] = None
