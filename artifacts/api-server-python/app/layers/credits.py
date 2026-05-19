"""
Credits Layer — pluggable usage-based credit system.

Credits gate AI operations so users cannot abuse the platform.
Admins are always exempt (charged=0).

Architecture:
  - CreditsLayer is the single entry point for all credit operations.
  - All charges and refunds are logged to credit_transactions (audit trail).
  - Credit costs are configurable at runtime via DB (app_settings key="creditCosts").
  - Default credits for new users is configurable (app_settings key="defaultUserCredits").

Disable entirely:
  Set CREDITS_ENABLED=false in env — all charge_credits calls become no-ops.

Replace with subscription gating:
  Subclass CreditsLayer and override charge_credits to check a subscription tier
  instead of a credit balance. Zero changes to routes needed.

Credit Packages (configurable in DB — app_settings key="creditPackages"):
  [
    { "id": "starter", "name": "Starter Pack", "credits": 200, "price": 9.99 },
    { "id": "pro",     "name": "Pro Pack",     "credits": 500, "price": 19.99, "popular": true },
    { "id": "agency",  "name": "Agency Pack",  "credits": 2000,"price": 59.99 }
  ]

Adding a new credit action:
  1. Add the key to DEFAULT_CREDIT_COSTS below.
  2. Call credits_layer.charge_credits(user, "my.action", db) in the route.
  3. Override the cost in DB via PATCH /api/admin/settings if needed at runtime.
"""
import time
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.config import settings
from app.models import User, AppSetting, CreditTransaction


# ── Default credit costs per action ──────────────────────────────────────────
#
# Keys follow "resource.action" pattern.
# Override any cost at runtime via DB (app_settings key="creditCosts").
# To add a new action: add it here, then call charge_credits() in the route.
#
DEFAULT_CREDIT_COSTS: dict[str, int] = {
    "brand.generate-kit":            50,
    "brand.generate-story":          10,
    "brand.generate-content":         5,
    "brand.generate-campaign":       60,
    "brand.generate-logo-variants":   5,
    "post.generate-image":           10,
    "post.regenerate":                8,
    "post.generate-variant":          5,
    "post.generate-content":          5,
    "campaign.generate-all-images":  10,
}

DEFAULT_USER_CREDITS = 100

# ── In-memory config cache (30s TTL) ─────────────────────────────────────────

_cached_costs: dict[str, int] | None = None
_cached_default: int | None = None
_cached_packages: list | None = None
_cache_loaded_at: float = 0
_CACHE_TTL = 30.0


class InsufficientCreditsError(Exception):
    """Raised when a user does not have enough credits for an action."""

    def __init__(self, required: int, available: int, action: str):
        self.required = required
        self.available = available
        self.action = action
        super().__init__(
            f"Insufficient credits for '{action}'. "
            f"Required: {required}, available: {available}."
        )


class CreditsLayer:
    """
    Central manager for all credit operations.

    Methods:
      charge_credits   — deduct credits atomically, raises InsufficientCreditsError
      refund_credits   — return credits after AI failure
      add_credits      — gift/top-up credits (admin, promotion, purchase)
      set_credits      — set exact balance (admin override)
      get_history      — paginated credit transaction log
      get_cost_for     — look up cost for an action (DB-overridable)
      get_packages     — return available credit packages for purchase UI
      get_all_costs    — return full merged cost table
      invalidate_cache — force reload of cost config from DB

    All charged/refunded operations write to credit_transactions for auditing.
    """

    def _load_config(self, db: Session) -> None:
        global _cached_costs, _cached_default, _cached_packages, _cache_loaded_at
        if time.time() - _cache_loaded_at < _CACHE_TTL and _cached_costs is not None:
            return
        rows = db.query(AppSetting).filter(
            AppSetting.key.in_(["creditCosts", "defaultUserCredits", "creditPackages"])
        ).all()
        m = {r.key: r.value for r in rows}
        _cached_costs = {**DEFAULT_CREDIT_COSTS, **(m.get("creditCosts") or {})}
        raw = m.get("defaultUserCredits")
        _cached_default = int(raw) if isinstance(raw, (int, float)) else DEFAULT_USER_CREDITS
        _cached_packages = m.get("creditPackages") or []
        _cache_loaded_at = time.time()

    def invalidate_cache(self) -> None:
        global _cached_costs, _cached_default, _cached_packages, _cache_loaded_at
        _cached_costs = None
        _cached_default = None
        _cached_packages = None
        _cache_loaded_at = 0

    def get_cost_for(self, action: str, db: Session) -> int:
        self._load_config(db)
        return (_cached_costs or {}).get(action, DEFAULT_CREDIT_COSTS.get(action, 1))

    def get_default_credits(self, db: Session) -> int:
        self._load_config(db)
        return _cached_default or DEFAULT_USER_CREDITS

    def get_packages(self, db: Session) -> list:
        self._load_config(db)
        return _cached_packages or []

    def get_all_costs(self, db: Session) -> dict[str, int]:
        self._load_config(db)
        return dict(_cached_costs or DEFAULT_CREDIT_COSTS)

    # ── Core operations ───────────────────────────────────────────────────────

    def charge_credits(
        self,
        user: User,
        action: str,
        db: Session,
        multiplier: int = 1,
        meta: Optional[dict] = None,
    ) -> dict:
        """
        Atomically deduct credits for an action.

        Returns: {"charged": int, "remaining": int}
        Raises:  InsufficientCreditsError if balance is insufficient.
        Admins are always exempt. CREDITS_ENABLED=false disables globally.
        """
        if not settings.credits_enabled:
            return {"charged": 0, "remaining": user.credits}
        if user.role == "admin":
            return {"charged": 0, "remaining": user.credits}

        base_cost = self.get_cost_for(action, db)
        cost = max(0, int(base_cost * max(1, multiplier)))
        if cost == 0:
            return {"charged": 0, "remaining": user.credits}

        result = db.execute(
            text(
                "UPDATE users SET credits = credits - :cost "
                "WHERE id = :uid AND credits >= :cost "
                "RETURNING credits"
            ),
            {"cost": cost, "uid": str(user.id)},
        ).fetchone()
        db.commit()

        if not result:
            db.refresh(user)
            raise InsufficientCreditsError(required=cost, available=user.credits, action=action)

        remaining = result[0]
        user.credits = remaining
        self._log(str(user.id), action, -cost, remaining, f"AI usage: {action}", meta, db)
        return {"charged": cost, "remaining": remaining}

    def refund_credits(
        self,
        user_id: str,
        amount: int,
        db: Session,
        action: str = "refund",
        description: str = "Refund (operation failed)",
        meta: Optional[dict] = None,
    ) -> int:
        """Refund credits after a failed AI operation. Returns new balance."""
        if amount <= 0:
            return 0
        row = db.execute(
            text("UPDATE users SET credits = credits + :amount WHERE id = :uid RETURNING credits"),
            {"amount": amount, "uid": user_id},
        ).fetchone()
        db.commit()
        new_balance = row[0] if row else 0
        self._log(user_id, f"{action}.refund", amount, new_balance, description, meta, db)
        return new_balance

    def add_credits(
        self,
        user_id: str,
        delta: int,
        db: Session,
        action: str = "admin.add",
        description: str = "Credits added",
        meta: Optional[dict] = None,
    ) -> int:
        """Add credits to a user (gift, purchase, promotion). Returns new balance."""
        row = db.execute(
            text(
                "UPDATE users SET credits = GREATEST(0, credits + :delta) "
                "WHERE id = :uid RETURNING credits"
            ),
            {"delta": int(delta), "uid": user_id},
        ).fetchone()
        db.commit()
        new_balance = row[0] if row else 0
        self._log(user_id, action, int(delta), new_balance, description, meta, db)
        return new_balance

    def set_credits(
        self,
        user_id: str,
        amount: int,
        db: Session,
        admin_id: Optional[str] = None,
        description: str = "Credits set by admin",
    ) -> int:
        """Set credits to an exact value (admin override). Returns new balance."""
        safe = max(0, int(amount))
        current_row = db.execute(
            text("SELECT credits FROM users WHERE id = :uid"), {"uid": user_id}
        ).fetchone()
        current_balance = current_row[0] if current_row else 0
        delta = safe - current_balance

        row = db.execute(
            text("UPDATE users SET credits = :amount WHERE id = :uid RETURNING credits"),
            {"amount": safe, "uid": user_id},
        ).fetchone()
        db.commit()
        new_balance = row[0] if row else safe
        self._log(user_id, "admin.set", delta, new_balance, description,
                  {"admin_id": admin_id} if admin_id else None, db)
        return new_balance

    def get_history(
        self,
        user_id: str,
        db: Session,
        page: int = 1,
        page_size: int = 20,
    ) -> dict:
        """Return paginated credit transaction history for a user."""
        q = db.query(CreditTransaction).filter(
            CreditTransaction.user_id == user_id
        ).order_by(CreditTransaction.created_at.desc())

        total = q.count()
        rows = q.offset((page - 1) * page_size).limit(page_size).all()
        return {
            "transactions": [
                {
                    "id": r.id,
                    "action": r.action,
                    "delta": r.delta,
                    "balanceAfter": r.balance_after,
                    "description": r.description,
                    "meta": r.meta,
                    "createdAt": r.created_at.isoformat() if r.created_at else None,
                }
                for r in rows
            ],
            "total": total,
            "page": page,
            "pageSize": page_size,
        }

    def _log(
        self,
        user_id: str,
        action: str,
        delta: int,
        balance_after: int,
        description: Optional[str],
        meta: Optional[dict],
        db: Session,
    ) -> None:
        """Write immutable audit log entry. Never raises — logging must not fail main op."""
        try:
            tx = CreditTransaction(
                user_id=user_id,
                action=action,
                delta=delta,
                balance_after=balance_after,
                description=description,
                meta=meta,
            )
            db.add(tx)
            db.commit()
        except Exception:
            db.rollback()


# ── Module-level singleton ────────────────────────────────────────────────────

credits_layer = CreditsLayer()
