"""
Credits Layer — pluggable usage-based credit system.

Credits gate AI operations so users can't abuse the platform.
Admins are always exempt.

This is a PLUGGABLE layer:
  - Disable entirely: set CREDITS_ENABLED=false in env.
  - Replace with subscription gating: implement a SubscriptionCreditsLayer
    that checks the user's Stripe subscription tier instead of a credit balance.
  - Connect to payments: see app/layers/payments.py for the Stripe stub.

Excluded / Future:
  - Stripe integration for purchasing credits: see EXCLUDED_FEATURES.md.
  - RevenueCat for mobile subscriptions: see EXCLUDED_FEATURES.md.
  - Usage analytics per action: see EXCLUDED_FEATURES.md.
"""
import time
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.config import settings
from app.models import User, AppSetting


# ── Default credit costs per action ──────────────────────────────────────────

DEFAULT_CREDIT_COSTS: dict[str, int] = {
    "brand.generate-kit": 50,
    "brand.generate-story": 10,
    "brand.generate-content": 5,
    "brand.generate-campaign": 60,
    "post.generate-image": 10,
    "post.regenerate": 8,
    "post.generate-variant": 5,
    "post.generate-content": 5,
    "campaign.generate-all-images": 10,
}

DEFAULT_USER_CREDITS = 100

# ── Cache (in-memory, 30s TTL) ────────────────────────────────────────────────

_cached_costs: dict[str, int] | None = None
_cached_default: int | None = None
_cache_loaded_at: float = 0
_CACHE_TTL = 30.0


class InsufficientCreditsError(Exception):
    """Raised when a user does not have enough credits for an action."""
    def __init__(self, required: int, available: int, action: str):
        self.required = required
        self.available = available
        self.action = action
        super().__init__(
            f"ليس لديك نقاط كافية لاستخدام هذه الميزة. "
            f"المطلوب: {required}، المتاح: {available}"
        )


class CreditsLayer:
    """
    Manages user credit balances.

    To disable: set CREDITS_ENABLED=false — all charge_credits calls become no-ops.
    To extend: subclass and override charge_credits for custom billing logic.
    """

    def _load_config(self, db: Session) -> None:
        global _cached_costs, _cached_default, _cache_loaded_at
        if time.time() - _cache_loaded_at < _CACHE_TTL and _cached_costs is not None:
            return
        rows = db.query(AppSetting).all()
        settings_map = {r.key: r.value for r in rows}
        custom_costs = settings_map.get("creditCosts") or {}
        _cached_costs = {**DEFAULT_CREDIT_COSTS, **custom_costs}
        default_credits = settings_map.get("defaultUserCredits")
        _cached_default = int(default_credits) if isinstance(default_credits, (int, float)) else DEFAULT_USER_CREDITS
        _cache_loaded_at = time.time()

    def invalidate_cache(self) -> None:
        global _cached_costs, _cached_default, _cache_loaded_at
        _cached_costs = None
        _cached_default = None
        _cache_loaded_at = 0

    def get_cost_for(self, action: str, db: Session) -> int:
        self._load_config(db)
        return (_cached_costs or {}).get(action, DEFAULT_CREDIT_COSTS.get(action, 1))

    def get_default_credits(self, db: Session) -> int:
        self._load_config(db)
        return _cached_default or DEFAULT_USER_CREDITS

    def charge_credits(
        self,
        user: User,
        action: str,
        db: Session,
        multiplier: int = 1,
    ) -> dict:
        """
        Atomically deduct credits for an action.

        Returns: {"charged": int, "remaining": int}
        Raises: InsufficientCreditsError if balance is insufficient.
        Admins are always exempt (charged=0).

        To disable credits globally: set CREDITS_ENABLED=false in env.
        """
        if not settings.credits_enabled:
            return {"charged": 0, "remaining": user.credits}

        if user.role == "admin":
            return {"charged": 0, "remaining": user.credits}

        base_cost = self.get_cost_for(action, db)
        cost = max(0, int(base_cost * max(1, multiplier)))
        if cost == 0:
            return {"charged": 0, "remaining": user.credits}

        # Atomic conditional update
        result = db.execute(
            text(
                "UPDATE users SET credits = credits - :cost "
                "WHERE id = :uid AND credits >= :cost "
                "RETURNING credits"
            ),
            {"cost": cost, "uid": user.id},
        ).fetchone()
        db.commit()

        if not result:
            # Re-fetch current balance to report accurate available credits
            db.refresh(user)
            raise InsufficientCreditsError(
                required=cost,
                available=user.credits,
                action=action,
            )

        remaining = result[0]
        user.credits = remaining  # update in-memory
        return {"charged": cost, "remaining": remaining}

    def refund_credits(self, user_id: str, amount: int, db: Session) -> None:
        """Refund credits, e.g. when an AI operation fails after charging."""
        if amount <= 0:
            return
        db.execute(
            text("UPDATE users SET credits = credits + :amount WHERE id = :uid"),
            {"amount": amount, "uid": user_id},
        )
        db.commit()

    def add_credits(self, user_id: str, delta: int, db: Session) -> int:
        """Add credits to a user (e.g. purchased, gifted, promotional)."""
        row = db.execute(
            text(
                "UPDATE users SET credits = GREATEST(0, credits + :delta) "
                "WHERE id = :uid RETURNING credits"
            ),
            {"delta": int(delta), "uid": user_id},
        ).fetchone()
        db.commit()
        return row[0] if row else 0

    def set_credits(self, user_id: str, amount: int, db: Session) -> int:
        """Set credits to an exact value (admin action)."""
        safe = max(0, int(amount))
        row = db.execute(
            text("UPDATE users SET credits = :amount WHERE id = :uid RETURNING credits"),
            {"amount": safe, "uid": user_id},
        ).fetchone()
        db.commit()
        return row[0] if row else 0


# ── Module-level singleton ────────────────────────────────────────────────────

credits_layer = CreditsLayer()
