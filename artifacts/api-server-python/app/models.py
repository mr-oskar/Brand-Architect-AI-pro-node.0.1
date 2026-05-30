"""
SQLAlchemy ORM models matching the ACTUAL PostgreSQL schema.

Column names verified against the live database.
Do NOT call Base.metadata.create_all() on existing tables — use ALTER TABLE or Alembic.
Call create_all() only for NEW models added here (safe to re-run).

Extension points:
  - Add new columns here + run SQL migration (ALTER TABLE) or use Alembic.
  - Add new models for new features (subscriptions, api_keys, teams, etc.).

NEW TABLES (2026-05-30 — AI Model Architecture):
  ai_providers     — registered AI provider credentials + priority
  ai_models        — individual models fetched from providers + capabilities
  ai_plans         — subscription plans (free / pro / enterprise)
  ai_plan_models   — per-plan model permissions + credit overrides
  ai_usage_logs    — full audit trail of every AI request
"""
from sqlalchemy import (
    Boolean, Column, Integer, Text, DateTime, ForeignKey,
    UniqueConstraint, func, text
)
from sqlalchemy.dialects.postgresql import JSONB, ARRAY, UUID as PG_UUID
from sqlalchemy.orm import DeclarativeBase, relationship
from sqlalchemy.types import TypeDecorator


class StrUUID(TypeDecorator):
    """
    Always return UUID as a plain str regardless of DB type.
    This avoids uuid.UUID objects appearing in response serialization.
    """
    impl = PG_UUID
    cache_ok = True

    def process_result_value(self, value, dialect):
        return str(value) if value else None

    def process_bind_param(self, value, dialect):
        return str(value) if value else None


class Base(DeclarativeBase):
    pass


class User(Base):
    """
    Platform user. Role is 'user' or 'admin'.
    Admins bypass the credits system entirely (charged=0 always).

    Extension points:
      - Add 'subscription_id', 'stripe_customer_id' for payments layer.
      - Add 'clerk_id' or 'oauth_provider_id' for SSO.
      - Add 'team_id' for multi-tenant support.
      - Add 'plan' field for subscription tiers (free|pro|enterprise).
    """
    __tablename__ = "users"

    id = Column(StrUUID, primary_key=True, server_default=text("gen_random_uuid()"))
    email = Column(Text, unique=True, nullable=False, index=True)
    password_hash = Column(Text, nullable=False)
    name = Column(Text, nullable=True)
    role = Column(Text, nullable=False, server_default="user")    # "user" | "admin"
    status = Column(Text, nullable=True, server_default="active") # "active" | "suspended"
    credits = Column(Integer, nullable=False, server_default="100")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    brands = relationship("Brand", back_populates="user", cascade="all, delete-orphan")
    credit_transactions = relationship(
        "CreditTransaction", back_populates="user",
        cascade="all, delete-orphan", order_by="CreditTransaction.created_at.desc()"
    )


class CreditTransaction(Base):
    """
    Immutable append-only log of every credit change for a user.

    Written on every charge, refund, top-up, or manual admin adjustment.
    Never delete rows — this is an audit trail.

    Fields:
      - delta         : positive = credits added, negative = credits charged
      - balance_after : user's balance after this transaction
      - action        : machine key, e.g. "brand.generate-kit", "admin.add", "purchase"
      - description   : human-readable text shown to the user
      - meta          : JSONB for extra context (brand_id, campaign_id, invoice_id, etc.)

    Extension points:
      - Add 'invoice_id' column for Stripe billing integration.
      - Add 'package_id' column for credit package purchases.
      - Add 'expires_at' column for time-limited promotional credits.
      - Add 'reversed_at' column for reversible credit transactions.
    """
    __tablename__ = "credit_transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(PG_UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(Text, nullable=False)
    delta = Column(Integer, nullable=False)         # negative = charge, positive = add/refund
    balance_after = Column(Integer, nullable=False)
    description = Column(Text, nullable=True)
    meta = Column(JSONB, nullable=True)             # extra context (brand_id, etc.)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    user = relationship("User", back_populates="credit_transactions")


class Brand(Base):
    """
    A brand identity owned by a user.
    brand_kit stores the full AI-generated brand identity as JSONB.

    Actual DB columns:
      - company_description (not 'description')
      - website_url (not 'website')
      - logo_variants (JSONB — for multiple logo versions)

    Note: user_id is TEXT in the DB (not UUID), matching the Drizzle schema definition.

    Extension: Add 'subscription_tier', 'team_id' for multi-tenant support.
    """
    __tablename__ = "brands"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(PG_UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    company_name = Column(Text, nullable=False)
    company_description = Column(Text, nullable=True)
    industry = Column(Text, nullable=False)
    website_url = Column(Text, nullable=True)
    logo_url = Column(Text, nullable=True)
    logo_variants = Column(JSONB, nullable=True)
    status = Column(Text, nullable=False, server_default="active")
    brand_kit = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="brands")
    campaigns = relationship("Campaign", back_populates="brand", cascade="all, delete-orphan")


class Campaign(Base):
    """
    A multi-day social media campaign belonging to a brand.

    days is JSONB — stores the campaign days array from AI output.
    schedule_start / schedule_end for campaign scheduling.
    """
    __tablename__ = "campaigns"

    id = Column(Integer, primary_key=True, autoincrement=True)
    brand_id = Column(Integer, ForeignKey("brands.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(Text, nullable=False)
    strategy = Column(Text, nullable=True)
    days = Column(JSONB, nullable=True)
    schedule_start = Column(DateTime(timezone=True), nullable=True)
    schedule_end = Column(DateTime(timezone=True), nullable=True)
    publish_time_hour = Column(Integer, nullable=True)
    publish_time_minute = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    brand = relationship("Brand", back_populates="campaigns")
    posts = relationship("Post", back_populates="campaign", cascade="all, delete-orphan", order_by="Post.day")


class Post(Base):
    """
    A single social media post within a campaign.
    image_history stores previous image versions as a JSONB array.
    """
    __tablename__ = "posts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True)
    day = Column(Integer, nullable=False)
    caption = Column(Text, nullable=True)
    hook = Column(Text, nullable=True)
    cta = Column(Text, nullable=True)
    hashtags = Column(ARRAY(Text), nullable=True)
    image_prompt = Column(Text, nullable=True)
    image_url = Column(Text, nullable=True)
    image_history = Column(JSONB, nullable=True)
    platform = Column(Text, nullable=False, server_default="instagram")
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    published_at = Column(DateTime(timezone=True), nullable=True)
    publish_status = Column(Text, nullable=False, server_default="draft")
    publish_error = Column(Text, nullable=True)
    external_post_id = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    campaign = relationship("Campaign", back_populates="posts")


class AppSetting(Base):
    """
    Key-value store for admin-configurable settings (JSONB values).

    Known keys:
      - "site"             → { siteName, tagline, primaryColor, defaultLanguage }
      - "features"         → { enableRegistration, ... }
      - "maintenance"      → { enabled, message }
      - "creditCosts"      → { "brand.generate-kit": 50, ... }  (overrides defaults)
      - "creditPackages"   → [ { id, name, credits, price, popular }, ... ]
      - "defaultUserCredits" → number (credits given to new users on registration)

    To add new settings:
      1. Insert a row here: INSERT INTO app_settings (key, value) VALUES ('myKey', '{}')
      2. Read it in the relevant route via db.query(AppSetting).filter_by(key='myKey')
      3. Expose it via GET /api/admin/settings if it should be admin-editable
    """
    __tablename__ = "app_settings"

    key = Column(Text, primary_key=True)
    value = Column(JSONB, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ═══════════════════════════════════════════════════════════════════════════════
# AI MODEL ARCHITECTURE — new tables (2026-05-30)
# Run  python3 -c "from app.models import Base; from app.database import engine; Base.metadata.create_all(engine)"
# to create these tables (safe to re-run — existing tables are unchanged).
# ═══════════════════════════════════════════════════════════════════════════════

class AIProvider(Base):
    """
    Registered AI provider credential.

    provider_type: "openai" | "gemini" | "custom"
    priority: lower number = higher priority (1 = first choice)
    api_key: stored plain-text in DB (admin-only access)
    base_url: only required for "custom" type
    """
    __tablename__ = "ai_providers"

    id = Column(Text, primary_key=True, server_default=text("gen_random_uuid()::text"))
    name = Column(Text, nullable=False)
    provider_type = Column(Text, nullable=False, server_default="openai")
    api_key = Column(Text, nullable=True)
    base_url = Column(Text, nullable=True)
    enabled = Column(Boolean, nullable=False, server_default=text("true"))
    priority = Column(Integer, nullable=False, server_default=text("100"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    models = relationship("AIModel", back_populates="provider", cascade="all, delete-orphan")


class AIModel(Base):
    """
    Individual AI model belonging to a provider.

    model_id    : the actual model string sent to the API  ("gpt-4o-mini", "imagen-3.0-generate-002")
    capability  : "text" | "image"
    is_default  : one default model per capability per provider (soft rule, enforced by admin logic)
    priority    : lower = higher priority for fallback ordering
    credit_cost : credits deducted per successful call (0 = free)
    """
    __tablename__ = "ai_models"

    id = Column(Text, primary_key=True, server_default=text("gen_random_uuid()::text"))
    provider_id = Column(Text, ForeignKey("ai_providers.id", ondelete="CASCADE"), nullable=False, index=True)
    model_id = Column(Text, nullable=False)
    name = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    capability = Column(Text, nullable=False, server_default="text")
    enabled = Column(Boolean, nullable=False, server_default=text("true"))
    is_default = Column(Boolean, nullable=False, server_default=text("false"))
    priority = Column(Integer, nullable=False, server_default=text("100"))
    credit_cost = Column(Integer, nullable=False, server_default=text("1"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    provider = relationship("AIProvider", back_populates="models")
    plan_links = relationship("AIPlanModel", back_populates="model", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("provider_id", "model_id", "capability", name="uq_ai_model_provider_model_cap"),
    )


class AIPlan(Base):
    """
    Subscription / permission plan.  Users are assigned a plan; plan controls which
    models they can use and at what credit cost.

    is_default: one default plan — applied to all users without an explicit plan_id.
    """
    __tablename__ = "ai_plans"

    id = Column(Text, primary_key=True, server_default=text("gen_random_uuid()::text"))
    name = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    is_default = Column(Boolean, nullable=False, server_default=text("false"))
    monthly_credits = Column(Integer, nullable=False, server_default=text("0"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    model_links = relationship("AIPlanModel", back_populates="plan", cascade="all, delete-orphan")


class AIPlanModel(Base):
    """
    Per-plan model permission.  Controls which models each plan can access.

    allowed              : False = model visible but locked (upgrade prompt shown in UI)
    credit_cost_override : NULL means use model's default credit_cost
    daily_limit          : NULL = unlimited per-day calls
    monthly_limit        : NULL = unlimited per-month calls
    """
    __tablename__ = "ai_plan_models"

    plan_id = Column(Text, ForeignKey("ai_plans.id", ondelete="CASCADE"), primary_key=True)
    model_id = Column(Text, ForeignKey("ai_models.id", ondelete="CASCADE"), primary_key=True)
    allowed = Column(Boolean, nullable=False, server_default=text("true"))
    credit_cost_override = Column(Integer, nullable=True)
    daily_limit = Column(Integer, nullable=True)
    monthly_limit = Column(Integer, nullable=True)

    plan = relationship("AIPlan", back_populates="model_links")
    model = relationship("AIModel", back_populates="plan_links")


class AIUsageLog(Base):
    """
    Immutable audit log — one row per AI request attempt.

    Includes both successful and failed requests, and records fallback chains.
    Never delete rows; archive old ones if the table grows large.
    """
    __tablename__ = "ai_usage_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Text, nullable=True, index=True)
    provider_db_id = Column(Text, ForeignKey("ai_providers.id", ondelete="SET NULL"), nullable=True)
    model_db_id = Column(Text, ForeignKey("ai_models.id",    ondelete="SET NULL"), nullable=True)
    provider_name = Column(Text, nullable=True)   # denormalized — survives provider deletion
    model_name = Column(Text, nullable=True)       # denormalized
    model_api_id = Column(Text, nullable=True)     # e.g. "gpt-4o-mini"
    capability = Column(Text, nullable=False, server_default="text")
    success = Column(Boolean, nullable=False, server_default=text("true"))
    error_message = Column(Text, nullable=True)
    credits_charged = Column(Integer, nullable=False, server_default=text("0"))
    latency_ms = Column(Integer, nullable=True)
    is_fallback = Column(Boolean, nullable=False, server_default=text("false"))
    original_model_api_id = Column(Text, nullable=True)  # model that was originally requested
    request_context = Column(JSONB, nullable=True)        # extra context (brand_id, post_id, …)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
