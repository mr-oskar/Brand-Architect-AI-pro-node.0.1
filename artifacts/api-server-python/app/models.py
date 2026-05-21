"""
SQLAlchemy ORM models matching the ACTUAL PostgreSQL schema.

Column names verified against the live database.
Do NOT call Base.metadata.create_all() on existing tables — use ALTER TABLE or Alembic.
Call create_all() only for NEW models added here (safe to re-run).

Extension points:
  - Add new columns here + run SQL migration (ALTER TABLE) or use Alembic.
  - Add new models for new features (subscriptions, api_keys, teams, etc.).
"""
from sqlalchemy import (
    Column, Integer, Text, DateTime, ForeignKey,
    func, text
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
