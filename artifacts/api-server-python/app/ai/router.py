"""
ModelRouter — single entry point for ALL AI requests.

Text completion:  complete_text()
  - Tries models sorted by (priority, db_id) asc
  - Automatically falls back to next model on failure
  - Raises RuntimeError only when every model has failed
  - If no DB providers configured: delegates to legacy client.py

Image generation: generate_image() / generate_image_edit()
  - Uses EXACTLY the model_db_id requested — NO fallback
  - Raises ValueError for unknown/disabled models
  - Raises RuntimeError with clear message on API failure
  - If no DB providers configured: delegates to legacy image.py

Every request (success + failure) is appended to ai_usage_logs.

Usage:
    from app.ai.router import get_router
    router = get_router()
    text   = router.complete_text(messages)
    image  = router.generate_image(prompt, model_db_id="uuid", size="1024x1024")
"""
import io
import logging
import time
from typing import Optional

from app.ai.registry import get_registry, RegisteredModel

logger = logging.getLogger("brand-os.ai.router")


class ModelRouter:
    # ── Text ──────────────────────────────────────────────────────────────────

    def complete_text(
        self,
        messages: list[dict],
        user_id: Optional[str] = None,
        preferred_model_id: Optional[str] = None,
        max_tokens: Optional[int] = None,
        request_context: Optional[dict] = None,
    ) -> str:
        """
        Send a text chat completion, with automatic fallback across models.

        preferred_model_id: DB UUID of the preferred model (not the API model string).
                            If given, that model is tried FIRST before fallback.
        """
        registry = get_registry()

        if not registry.has_providers():
            return self._legacy_text(messages, max_tokens)

        models = registry.get_models("text")
        if not models:
            return self._legacy_text(messages, max_tokens)

        # Put the preferred model at the front of the list
        if preferred_model_id:
            pref = registry.get_model_by_id(preferred_model_id)
            if pref and pref.capability == "text":
                others = [m for m in models if m.db_id != preferred_model_id]
                models = [pref] + others

        errors: list[str] = []
        first_model = models[0].model_id if models else None

        for idx, model in enumerate(models):
            is_fallback = idx > 0
            started = time.monotonic()
            try:
                result = model.provider.instance.complete_text(
                    messages, model.model_id, max_tokens
                )
                latency_ms = int((time.monotonic() - started) * 1000)
                self._log(
                    user_id=user_id,
                    model=model,
                    capability="text",
                    success=True,
                    latency_ms=latency_ms,
                    is_fallback=is_fallback,
                    original_model_api_id=first_model if is_fallback else None,
                    request_context=request_context,
                )
                return result
            except Exception as e:
                latency_ms = int((time.monotonic() - started) * 1000)
                err = f"{model.name} ({model.model_id}): {e}"
                errors.append(err)
                logger.warning("Text model failed (will try next): %s", err)
                self._log(
                    user_id=user_id,
                    model=model,
                    capability="text",
                    success=False,
                    error_message=str(e)[:500],
                    latency_ms=latency_ms,
                    is_fallback=is_fallback,
                    original_model_api_id=first_model if is_fallback else None,
                    request_context=request_context,
                )

        raise RuntimeError(
            "All text AI models failed. Errors: " + "; ".join(errors)
        )

    # ── Image generation ──────────────────────────────────────────────────────

    def generate_image(
        self,
        prompt: str,
        size: str = "1024x1024",
        model_db_id: Optional[str] = None,
        user_id: Optional[str] = None,
        request_context: Optional[dict] = None,
        **kwargs,
    ) -> bytes:
        """
        Generate an image. Uses the specified model EXACTLY — no fallback.

        model_db_id: DB UUID of the model to use.
                     If None: uses the default image model from DB.
                     If no DB providers: delegates to legacy image.py.
        """
        registry = get_registry()

        if not registry.has_providers():
            return self._legacy_image(prompt, size, **kwargs)

        model = self._resolve_image_model(registry, model_db_id, "image")
        started = time.monotonic()
        try:
            result = model.provider.instance.generate_image(
                prompt, model.model_id, size, **kwargs
            )
            latency_ms = int((time.monotonic() - started) * 1000)
            self._log(
                user_id=user_id,
                model=model,
                capability="image",
                success=True,
                latency_ms=latency_ms,
                request_context=request_context,
            )
            return result
        except Exception as e:
            latency_ms = int((time.monotonic() - started) * 1000)
            self._log(
                user_id=user_id,
                model=model,
                capability="image",
                success=False,
                error_message=str(e)[:500],
                latency_ms=latency_ms,
                request_context=request_context,
            )
            raise RuntimeError(
                f"Image generation failed with model '{model.name}': {e}"
            ) from e

    def generate_image_edit(
        self,
        image_files: list,
        prompt: str,
        size: str = "1024x1024",
        model_db_id: Optional[str] = None,
        user_id: Optional[str] = None,
        request_context: Optional[dict] = None,
        **kwargs,
    ) -> bytes:
        """
        Image edit (with reference images). No fallback.
        """
        registry = get_registry()

        if not registry.has_providers():
            return self._legacy_image_edit(image_files, prompt, size, **kwargs)

        model = self._resolve_image_model(registry, model_db_id, "image")
        started = time.monotonic()
        try:
            result = model.provider.instance.generate_image_edit(
                image_files, prompt, model.model_id, size, **kwargs
            )
            latency_ms = int((time.monotonic() - started) * 1000)
            self._log(
                user_id=user_id,
                model=model,
                capability="image",
                success=True,
                latency_ms=latency_ms,
                request_context=request_context,
            )
            return result
        except Exception as e:
            latency_ms = int((time.monotonic() - started) * 1000)
            self._log(
                user_id=user_id,
                model=model,
                capability="image",
                success=False,
                error_message=str(e)[:500],
                latency_ms=latency_ms,
                request_context=request_context,
            )
            raise RuntimeError(
                f"Image edit failed with model '{model.name}': {e}"
            ) from e

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _resolve_image_model(
        self,
        registry,
        model_db_id: Optional[str],
        capability: str,
    ) -> RegisteredModel:
        if model_db_id:
            model = registry.get_model_by_id(model_db_id)
            if not model:
                raise ValueError(
                    f"Image model '{model_db_id}' not found in DB. "
                    "It may have been deleted or belongs to a disabled provider."
                )
            if not model.enabled:
                raise ValueError(f"Image model '{model.name}' is currently disabled.")
            if model.capability != capability:
                raise ValueError(
                    f"Model '{model.name}' has capability '{model.capability}', not '{capability}'."
                )
            if not model.provider.enabled:
                raise ValueError(
                    f"Provider '{model.provider.name}' for model '{model.name}' is disabled."
                )
            return model

        # No specific model requested — use the default
        default = registry.get_default_model(capability)
        if not default:
            raise ValueError(
                "No enabled image model found in DB. "
                "Go to Admin → AI Models, add a provider, and enable at least one image model."
            )
        return default

    def _log(
        self,
        user_id: Optional[str],
        model: RegisteredModel,
        capability: str,
        success: bool,
        error_message: Optional[str] = None,
        latency_ms: Optional[int] = None,
        is_fallback: bool = False,
        original_model_api_id: Optional[str] = None,
        request_context: Optional[dict] = None,
    ) -> None:
        try:
            from app.database import SessionLocal
            from app.models import AIUsageLog
            db = SessionLocal()
            try:
                log = AIUsageLog(
                    user_id=user_id,
                    provider_db_id=model.provider.db_id,
                    model_db_id=model.db_id,
                    provider_name=model.provider.name,
                    model_name=model.name,
                    model_api_id=model.model_id,
                    capability=capability,
                    success=success,
                    error_message=error_message,
                    credits_charged=0,  # Credit deduction handled separately by credits.py
                    latency_ms=latency_ms,
                    is_fallback=is_fallback,
                    original_model_api_id=original_model_api_id,
                    request_context=request_context,
                )
                db.add(log)
                db.commit()
            except Exception as log_err:
                logger.warning("Failed to write usage log: %s", log_err)
                db.rollback()
            finally:
                db.close()
        except Exception as e:
            logger.warning("Usage logging setup error: %s", e)

    # ── Legacy fallbacks ──────────────────────────────────────────────────────

    @staticmethod
    def _legacy_text(messages: list[dict], max_tokens: Optional[int]) -> str:
        """Delegate to old api_key_store-based client when no DB providers exist."""
        from app.services.ai.client import get_client, resolve_model
        from app.config import settings
        client = get_client()
        model = resolve_model(settings.ai_text_model, use_case="text")
        resp = client.chat.completions.create(
            model=model,
            messages=messages,
            max_completion_tokens=max_tokens or settings.ai_max_tokens,
        )
        return resp.choices[0].message.content or ""

    @staticmethod
    def _legacy_image(prompt: str, size: str, **kwargs) -> bytes:
        """Delegate to old image.py when no DB providers exist."""
        from app.services.ai.image import generate_image_bytes_legacy
        return generate_image_bytes_legacy(prompt, size)

    @staticmethod
    def _legacy_image_edit(image_files, prompt: str, size: str, **kwargs) -> bytes:
        """Delegate to old image.py when no DB providers exist."""
        from app.services.ai.image import generate_image_edit_legacy
        return generate_image_edit_legacy(image_files, prompt, size, **kwargs)


# ── Module-level singleton ─────────────────────────────────────────────────────

_router: Optional[ModelRouter] = None


def get_router() -> ModelRouter:
    global _router
    if _router is None:
        _router = ModelRouter()
    return _router
