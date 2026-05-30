"""
ModelRegistry — in-memory catalogue of AI providers and models loaded from the DB.

Cache TTL: 60 seconds (matches api_key_store.CACHE_TTL).
Call invalidate() after any admin write to providers/models so changes are
picked up immediately without a server restart.

Usage:
    from app.ai.registry import get_registry
    reg = get_registry()
    text_models  = reg.get_models("text")    # sorted by priority asc
    image_models = reg.get_models("image")   # sorted by priority asc
    model        = reg.get_model_by_id("uuid-of-model")
    provider_obj = reg.get_provider_instance("uuid-of-provider")
"""
import time
import logging
from dataclasses import dataclass, field
from typing import Optional

from app.ai.providers import BaseProvider, build_provider

logger = logging.getLogger("brand-os.ai.registry")

CACHE_TTL = 60  # seconds


# ── Data containers ────────────────────────────────────────────────────────────

@dataclass
class RegisteredProvider:
    """A DB AIProvider record paired with a live provider instance."""
    db_id:         str
    name:          str
    provider_type: str
    priority:      int
    enabled:       bool
    instance:      BaseProvider


@dataclass
class RegisteredModel:
    """A DB AIModel record with its parent provider wired in."""
    db_id:       str
    model_id:    str           # the actual model string, e.g. "gpt-4o-mini"
    name:        str
    description: str
    capability:  str           # "text" | "image"
    enabled:     bool
    is_default:  bool
    priority:    int
    credit_cost: int
    provider:    RegisteredProvider


# ── Registry ──────────────────────────────────────────────────────────────────

class _ModelRegistry:
    def __init__(self):
        self._providers:    list[RegisteredProvider] = []
        self._models:       list[RegisteredModel]    = []
        self._providers_by_id: dict[str, RegisteredProvider] = {}
        self._models_by_id:    dict[str, RegisteredModel]    = {}
        self._loaded_at: float = 0

    # ── Public API ─────────────────────────────────────────────────────────────

    def get_models(self, capability: Optional[str] = None) -> list[RegisteredModel]:
        """Return enabled models sorted by priority ascending (lower = higher priority)."""
        self._ensure_fresh()
        models = [m for m in self._models if m.enabled and m.provider.enabled]
        if capability:
            models = [m for m in models if m.capability == capability]
        return sorted(models, key=lambda m: (m.priority, m.db_id))

    def get_default_model(self, capability: str) -> Optional[RegisteredModel]:
        """Return the default model for a capability, or the first available one."""
        models = self.get_models(capability)
        defaults = [m for m in models if m.is_default]
        return defaults[0] if defaults else (models[0] if models else None)

    def get_model_by_id(self, db_id: str) -> Optional[RegisteredModel]:
        self._ensure_fresh()
        return self._models_by_id.get(db_id)

    def get_provider_instance(self, provider_db_id: str) -> Optional[BaseProvider]:
        self._ensure_fresh()
        p = self._providers_by_id.get(provider_db_id)
        return p.instance if p else None

    def has_providers(self) -> bool:
        """True when at least one enabled provider is configured in DB."""
        self._ensure_fresh()
        return any(p.enabled for p in self._providers)

    def invalidate(self) -> None:
        """Force a reload on the next access."""
        self._loaded_at = 0
        logger.info("ModelRegistry cache invalidated")

    # ── Cache management ───────────────────────────────────────────────────────

    def _ensure_fresh(self) -> None:
        if time.time() - self._loaded_at < CACHE_TTL:
            return
        self._reload()

    def _reload(self) -> None:
        from app.database import SessionLocal
        from app.models import AIProvider, AIModel

        db = SessionLocal()
        try:
            provider_rows = db.query(AIProvider).filter(AIProvider.enabled == True).order_by(AIProvider.priority).all()
            model_rows    = db.query(AIModel).filter(AIModel.enabled == True).all()

            new_providers:     list[RegisteredProvider] = []
            new_by_provider_id: dict[str, RegisteredProvider] = {}

            for row in provider_rows:
                try:
                    instance = build_provider(row)
                    rp = RegisteredProvider(
                        db_id=row.id,
                        name=row.name,
                        provider_type=row.provider_type,
                        priority=row.priority,
                        enabled=row.enabled,
                        instance=instance,
                    )
                    new_providers.append(rp)
                    new_by_provider_id[row.id] = rp
                except Exception as e:
                    logger.warning("Skipping provider '%s' (%s): %s", row.name, row.id, e)

            new_models:     list[RegisteredModel] = []
            new_by_model_id: dict[str, RegisteredModel] = {}

            for row in model_rows:
                rp = new_by_provider_id.get(row.provider_id)
                if not rp:
                    continue  # provider disabled or errored
                rm = RegisteredModel(
                    db_id=row.id,
                    model_id=row.model_id,
                    name=row.name or row.model_id,
                    description=row.description or "",
                    capability=row.capability,
                    enabled=row.enabled,
                    is_default=row.is_default,
                    priority=row.priority,
                    credit_cost=row.credit_cost,
                    provider=rp,
                )
                new_models.append(rm)
                new_by_model_id[row.id] = rm

            self._providers = new_providers
            self._models    = new_models
            self._providers_by_id = new_by_provider_id
            self._models_by_id    = new_by_model_id
            self._loaded_at = time.time()

            logger.info(
                "ModelRegistry loaded: %d providers, %d models",
                len(new_providers), len(new_models),
            )
        except Exception as e:
            logger.error("ModelRegistry reload failed: %s", e)
            # Keep stale cache rather than crashing
        finally:
            db.close()


# ── Module-level singleton ─────────────────────────────────────────────────────

_registry: Optional[_ModelRegistry] = None


def get_registry() -> _ModelRegistry:
    global _registry
    if _registry is None:
        _registry = _ModelRegistry()
    return _registry
