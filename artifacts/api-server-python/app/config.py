"""
Application configuration loaded from environment variables.

Extension points:
  - Add new settings here as the app grows (e.g. STRIPE_SECRET_KEY, CLERK_SECRET_KEY).
  - All settings are validated by Pydantic on startup.
"""
import os
import secrets
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str = os.getenv("DATABASE_URL", "")

    # ── Auth ──────────────────────────────────────────────────────────────────
    # JWT secret — set AUTH_JWT_SECRET or SESSION_SECRET in env for stable sessions.
    # Falls back to a random ephemeral secret (sessions reset on restart).
    auth_jwt_secret: str = (
        os.getenv("AUTH_JWT_SECRET")
        or os.getenv("SESSION_SECRET")
        or secrets.token_hex(32)
    )
    auth_cookie_name: str = "auth_token"
    auth_token_ttl_days: int = 30

    # ── Environment ───────────────────────────────────────────────────────────
    env: str = os.getenv("NODE_ENV", os.getenv("ENVIRONMENT", "development"))

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    # ── AI Providers (lazy — server starts without these) ─────────────────────
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_base_url: str = os.getenv("OPENAI_BASE_URL", "")
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    # Replit AI proxy
    ai_integrations_openai_api_key: str = os.getenv("AI_INTEGRATIONS_OPENAI_API_KEY", "")
    ai_integrations_openai_base_url: str = os.getenv("AI_INTEGRATIONS_OPENAI_BASE_URL", "")

    # AI model overrides
    ai_text_model: str = os.getenv("AI_TEXT_MODEL", "gpt-4o-mini")
    ai_temperature: float = float(os.getenv("AI_TEMPERATURE", "0.7"))
    ai_max_tokens: int = int(os.getenv("AI_MAX_TOKENS", "8192"))
    gemini_image_model: str = os.getenv("GEMINI_IMAGE_MODEL", "gemini-2.0-flash-exp-image-generation")

    # ── Feature flags (future layers) ─────────────────────────────────────────
    # Set to "false" to disable the credits system globally (e.g. during dev)
    credits_enabled: bool = os.getenv("CREDITS_ENABLED", "true").lower() != "false"

    # ── Storage ───────────────────────────────────────────────────────────────
    private_object_dir: str = os.getenv("PRIVATE_OBJECT_DIR", "")

    # ── CORS ──────────────────────────────────────────────────────────────────
    allowed_origins: list[str] = ["*"]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()

# Warn if using ephemeral secret
if not os.getenv("AUTH_JWT_SECRET") and not os.getenv("SESSION_SECRET"):
    import warnings
    warnings.warn(
        "[auth] AUTH_JWT_SECRET not set — using ephemeral secret. "
        "Sessions will reset on restart. Set AUTH_JWT_SECRET for stable sessions.",
        stacklevel=1,
    )
