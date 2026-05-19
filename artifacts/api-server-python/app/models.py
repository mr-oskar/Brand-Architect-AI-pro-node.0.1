"""
SQLAlchemy ORM models matching the ACTUAL PostgreSQL schema.

Column names verified against the live database on 2026-05-18.
Do NOT call Base.metadata.create_all() — the tables already exist.

Extension points:
  - Add new columns here + run a migration (Alembic) to add them to the DB.
  - Add new models for new features (subscriptions, api_keys, etc.).
"""
from sqlalchemy import (
    Column, String, Integer, Text, Boolean, DateTime, ForeignKey,
    func, text
)
from sqlalchemy.dialects.postgresql import JSONB, ARRAY, UUID as PG_UUID
from sqlalchemy.orm import DeclarativeBase, relationship
from sqlalchemy.types import TypeDecorator
import uuid


class StrUUID(TypeDecorator):
    """
    Always return UUID as a plain str regardless of DB type.
    This avoids uuid.UUID objects appearing in response serialization.
    """
    impl = PG_UUID
    cache_ok = True

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return str(value)

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return str(value)


class Base(DeclarativeBase):
    pass


class User(Base):
    """
    Platform user. Role is 'user' or 'admin'.
    Admins bypass the credits system.

    Extension: Add 'subscription_id', 'stripe_customer_id', 'clerk_id' for
    payments/SSO layers.
    """
    __tablename__ = "users"

    id = Column(StrUUID, primary_key=True, server_default=text("gen_random_uuid()"))
    email = Column(Text, unique=True, nullable=False, index=True)
    password_hash = Column(Text, nullable=False)
    name = Column(Text, nullable=True)
    role = Column(Text, nullable=False, server_default="user")
    status = Column(Text, nullable=True, server_default="active")
    credits = Column(Integer, nullable=False, server_default="100")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    brands = relationship("Brand", back_populates="user", cascade="all, delete-orphan")


class Brand(Base):
    """
    A brand identity owned by a user.
    brand_kit stores the full AI-generated brand identity as JSONB.

    Actual DB columns:
      - company_description (not 'description')
      - website_url (not 'website')
      - logo_variants (JSONB — for multiple logo versions)
      - user_id is TEXT (stored as string UUID)

    Extension: Add 'subscription_tier', 'team_id' for multi-tenant support.
    """
    __tablename__ = "brands"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(StrUUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    company_name = Column(Text, nullable=False)
    company_description = Column(Text, nullable=True)   # actual DB column name
    industry = Column(Text, nullable=False)
    website_url = Column(Text, nullable=True)            # actual DB column name
    logo_url = Column(Text, nullable=True)
    logo_variants = Column(JSONB, nullable=True)         # extra DB column
    status = Column(Text, nullable=False, server_default="active")
    brand_kit = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="brands")
    campaigns = relationship("Campaign", back_populates="brand", cascade="all, delete-orphan")


class Campaign(Base):
    """
    A multi-day social media campaign belonging to a brand.

    Actual DB columns:
      - days is JSONB (stores the campaign days array from AI output)
      - schedule_start / schedule_end for campaign scheduling
      - publish_time_hour / publish_time_minute for preferred publish time

    Extension: Add 'status', 'platform_settings' for campaign management.
    """
    __tablename__ = "campaigns"

    id = Column(Integer, primary_key=True, autoincrement=True)
    brand_id = Column(Integer, ForeignKey("brands.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(Text, nullable=False)
    strategy = Column(Text, nullable=True)
    days = Column(JSONB, nullable=True)                          # JSONB — stores days array from AI
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
    """
    __tablename__ = "app_settings"

    key = Column(Text, primary_key=True)
    value = Column(JSONB, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
