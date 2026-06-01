"""
AI Client — dynamic provider resolution from DB (admin panel) or env vars.

Priority order (first configured wins):
  1. Nano Banana DB key    — custom OpenAI-compatible endpoint
  2. OpenAI DB key         — official OpenAI API
  3. Gemini DB key         — Google Generative AI
  4. OPENAI_API_KEY env    — direct OpenAI env var
  5. GEMINI_API_KEY env    — direct Gemini env var
  6. Replit AI proxy vars  — AI_INTEGRATIONS_OPENAI_API_KEY + BASE_URL

Keys are resolved on every call with a 60s in-memory cache (see api_key_store.py).
The server starts even with no AI key — endpoints return HTTP 503 when called.

Add a new provider: extend KNOWN_PROVIDERS in api_key_store.py and map its
model names in GEMINI_MODEL_MAP below if needed.

Token accounting & cost logging:
  - _execute_call() extracts token usage from every response.
  - Pass `db` + `user_id` to write a row to ai_usage_logs automatically.
  - Monetary cost is calculated via app.utils.token_pricing.

Rate-limit retry:
  - _execute_call() retries up to _RETRY_MAX times on HTTP 429 errors.
  - Delay is exponential: 2s → 4s → 8s … capped at _RETRY_MAX_DELAY.

Fallback model:
  - call_ai_with_fallback() reads per-task primary/fallback from task_model_store.
  - On any unrecoverable error the fallback model is tried automatically.
  - Fallback calls are logged with is_fallback=True + original_model_api_id.
"""
import logging
import time
from typing import Literal

from openai import OpenAI

from app.config import settings

logger = logging.getLogger("brand-os.ai.client")

ProviderType = Literal["openai", "gemini"]

# Models that do NOT accept the `temperature` parameter.
# GPT-5+ and all O-series (o1, o3, o4) have temperature fixed at 1.
_NO_TEMPERATURE_PREFIXES = ("gpt-5", "o1-", "o3-", "o4-", "o1", "o3", "o4")


def _is_no_temperature_model(model_id: str) -> bool:
    m = model_id.lower()
    return any(m.startswith(p) or m == p.rstrip("-") for p in _NO_TEMPERATURE_PREFIXES)

_cached_client: OpenAI | None = None
_cached_provider: ProviderType = "openai"
_cache_time: float = 0
_CLIENT_TTL = 60  # seconds — match api_key_store.CACHE_TTL

# ── Retry config for 429 rate-limit errors ────────────────────────────────────
_RETRY_MAX        = 3
_RETRY_BASE_DELAY = 2.0    # seconds (doubles each attempt)
_RETRY_MAX_DELAY  = 30.0   # seconds cap


def invalidate_client_cache() -> None:
    """Force a new client on the next AI call (called after admin updates a key)."""
    global _cache_time
    _cache_time = 0


def _build_client() -> tuple[OpenAI, ProviderType]:
    """Resolve the best available AI provider and create a client."""
    from app.utils.api_key_store import get_best_provider
    api_key, base_url, provider_type = get_best_provider()

    if not api_key:
        raise RuntimeError(
            "No AI provider configured. "
            "Go to Admin → API Keys and add an OpenAI, Gemini, or Nano Banana key, "
            "or set the OPENAI_API_KEY / GEMINI_API_KEY environment variable."
        )

    provider: ProviderType = "gemini" if provider_type == "gemini" else "openai"
    default_url = (
        "https://generativelanguage.googleapis.com/v1beta/openai/"
        if provider == "gemini"
        else "https://api.openai.com/v1"
    )

    client = OpenAI(
        api_key=api_key,
        base_url=base_url or default_url,
    )
    return client, provider


def get_client() -> OpenAI:
    """Return a cached AI client, refreshing every 60 seconds."""
    global _cached_client, _cached_provider, _cache_time
    if _cached_client is None or time.time() - _cache_time > _CLIENT_TTL:
        _cached_client, _cached_provider = _build_client()
        _cache_time = time.time()
    return _cached_client


def get_provider() -> ProviderType:
    get_client()
    return _cached_provider


def is_using_replit_proxy() -> bool:
    if settings.openai_api_key or settings.gemini_api_key:
        return False
    return bool(
        settings.ai_integrations_openai_api_key
        and settings.ai_integrations_openai_base_url
    )


def image_generation_available() -> bool:
    return True


# ── Model name mapping ────────────────────────────────────────────────────────

GEMINI_MODEL_MAP = {
    "gpt-4o-mini": "gemini-2.5-flash",
    "gpt-4o": "gemini-2.5-pro",
    "gpt-5-nano": "gemini-2.5-flash",
    "gpt-5-mini": "gemini-2.5-flash",
    "gpt-5.2": "gemini-2.5-pro",
    "gpt-image-1": "gemini-2.5-flash-preview-image-generation",
}

# Reverse map: Gemini model → Gemini model (passthrough for already-mapped names)
_GEMINI_NATIVE_PREFIXES = ("gemini-", "imagen-")


def resolve_model(model: str, use_case: str = "text") -> str:
    """
    Resolve a model name for the active provider.
    If a DB model preference exists for this use_case it takes priority.
    Otherwise maps OpenAI model names → Gemini equivalents when using Gemini.
    """
    from app.utils.api_key_store import get_model_for_use_case
    preferred = get_model_for_use_case(use_case)
    if preferred:
        return preferred

    provider = get_provider()
    if provider == "gemini":
        # Already a native Gemini name — pass through
        if any(model.startswith(p) for p in _GEMINI_NATIVE_PREFIXES):
            return model
        return GEMINI_MODEL_MAP.get(model, "gemini-2.5-flash")

    return model


def get_image_model() -> str:
    """
    Return the image generation model for the currently active provider.
    Checks DB preference first, then falls back to hardcoded defaults.
    """
    from app.utils.api_key_store import get_model_for_use_case
    preferred = get_model_for_use_case("image")
    if preferred:
        return preferred
    provider = get_provider()
    if provider == "gemini":
        return settings.gemini_image_model or "gemini-2.5-flash-preview-image-generation"
    return "gpt-image-1"


# ── Internal usage logger ─────────────────────────────────────────────────────

def _log_usage(
    db,
    model_api_id: str,
    capability: str,
    success: bool,
    latency_ms: int,
    input_tokens: int = 0,
    output_tokens: int = 0,
    error_message: str | None = None,
    user_id: str | None = None,
    task_type: str | None = None,
    credits_charged: int = 0,
    is_fallback: bool = False,
    original_model_api_id: str | None = None,
) -> None:
    """
    Write one row to ai_usage_logs.
    Silently swallows any DB errors so AI calls are never broken by logging.
    """
    try:
        from app.models import AIUsageLog
        from app.utils.token_pricing import calculate_cost
        monetary_cost = calculate_cost(model_api_id, input_tokens, output_tokens)
        total_tokens  = input_tokens + output_tokens

        log_row = AIUsageLog(
            user_id=user_id,
            provider_name=get_provider(),
            model_api_id=model_api_id,
            model_name=model_api_id,
            capability=capability,
            success=success,
            error_message=error_message,
            credits_charged=credits_charged,
            latency_ms=latency_ms,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            monetary_cost=monetary_cost,
            task_type=task_type,
            is_fallback=is_fallback,
            original_model_api_id=original_model_api_id,
        )
        db.add(log_row)
        db.commit()
    except Exception as exc:
        logger.debug("ai_usage_log write failed (non-critical): %s", exc)
        try:
            db.rollback()
        except Exception:
            pass


# ── Core execution helper (with retry) ────────────────────────────────────────

def _execute_call(
    system_prompt: str,
    user_prompt: str,
    model_id: str,
    max_tok: int,
    db=None,
    user_id: str | None = None,
    task_type: str | None = None,
    is_fallback: bool = False,
    original_model: str | None = None,
) -> str:
    """
    Execute one AI chat completion with the given model_id.
    Retries up to _RETRY_MAX times on HTTP 429 rate-limit errors.
    All other errors are raised immediately (caller handles fallback).
    """
    client = get_client()
    last_error: Exception | None = None

    for attempt in range(_RETRY_MAX):
        t0 = time.monotonic()
        try:
            completion_params: dict = {
                "model": model_id,
                "max_completion_tokens": max_tok,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user",   "content": user_prompt},
                ],
            }
            # GPT-5+ and O-series models do not accept `temperature` (fixed at 1)
            if not _is_no_temperature_model(model_id):
                completion_params["temperature"] = settings.ai_temperature

            response = client.chat.completions.create(**completion_params)
            latency_ms = int((time.monotonic() - t0) * 1000)

            usage         = getattr(response, "usage", None)
            input_tokens  = getattr(usage, "prompt_tokens",     0) or 0
            output_tokens = getattr(usage, "completion_tokens", 0) or 0

            if db is not None:
                _log_usage(
                    db=db,
                    model_api_id=model_id,
                    capability="text",
                    success=True,
                    latency_ms=latency_ms,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    user_id=user_id,
                    task_type=task_type,
                    is_fallback=is_fallback,
                    original_model_api_id=original_model,
                )

            return response.choices[0].message.content or ""

        except Exception as exc:
            latency_ms = int((time.monotonic() - t0) * 1000)
            last_error = exc
            err_str    = str(exc)

            if db is not None:
                _log_usage(
                    db=db,
                    model_api_id=model_id,
                    capability="text",
                    success=False,
                    latency_ms=latency_ms,
                    error_message=err_str[:500],
                    user_id=user_id,
                    task_type=task_type,
                    is_fallback=is_fallback,
                    original_model_api_id=original_model,
                )

            is_rate_limit = (
                "rate limit"       in err_str.lower()
                or "429"           in err_str
                or "too many requests" in err_str.lower()
                or "ratelimit"     in err_str.lower()
            )
            if is_rate_limit and attempt < _RETRY_MAX - 1:
                delay = min(_RETRY_BASE_DELAY * (2 ** attempt), _RETRY_MAX_DELAY)
                logger.warning(
                    "Rate limit on %s (attempt %d/%d) — retrying in %.1fs",
                    model_id, attempt + 1, _RETRY_MAX, delay,
                )
                time.sleep(delay)
                continue

            raise

    raise last_error  # type: ignore[misc]


# ── Public text-completion helpers ────────────────────────────────────────────

def call_ai(
    system_prompt: str,
    user_prompt: str,
    max_tokens: int | None = None,
    model: str | None = None,
    db=None,
    user_id: str | None = None,
    task_type: str | None = None,
) -> str:
    """
    Send a chat completion request using the global model preference.
    Returns the text response.  Raises RuntimeError if no provider configured.

    Model resolution order:
      1. DB model preference for "text" use-case (Admin → API Keys → Text model)
      2. `model` argument (explicit override)
      3. settings.ai_text_model (env / default)
    Then mapped through resolve_model() for provider compatibility.

    Pass `db` + `user_id` to log token usage to ai_usage_logs.
    """
    chosen_model = resolve_model(model or settings.ai_text_model, use_case="text")
    max_tok      = max_tokens or settings.ai_max_tokens
    return _execute_call(
        system_prompt, user_prompt, chosen_model, max_tok,
        db=db, user_id=user_id, task_type=task_type,
    )


def call_ai_with_fallback(
    system_prompt: str,
    user_prompt: str,
    task_type: str | None = None,
    max_tokens: int | None = None,
    model: str | None = None,
    db=None,
    user_id: str | None = None,
) -> str:
    """
    Like call_ai() but reads per-task primary/fallback model from task_model_store.

    Fallback behaviour:
      - If the primary model call raises any unrecoverable exception AND a fallback
        model is configured, the call is retried automatically with the fallback.
      - The fallback attempt is logged with is_fallback=True and
        original_model_api_id set to the primary model that failed.
      - If both models fail, the fallback exception is raised.
      - If no fallback is configured, the primary exception is raised as normal.

    Model resolution order:
      1. task_model_store primary model for this task_type (Admin → Task Models)
      2. `model` argument override
      3. DB model preference (Admin → API Keys → Text model)
      4. settings.ai_text_model default
    """
    from app.utils.task_model_store import get_task_model_config

    config           = get_task_model_config(task_type) if task_type else {}
    primary_override = config.get("primaryModel")
    fallback_override = config.get("fallbackModel")

    # Resolve primary model
    raw_primary  = primary_override or model or settings.ai_text_model
    primary_model = resolve_model(raw_primary, use_case="text")
    max_tok       = max_tokens or settings.ai_max_tokens

    try:
        return _execute_call(
            system_prompt, user_prompt, primary_model, max_tok,
            db=db, user_id=user_id, task_type=task_type,
            is_fallback=False, original_model=None,
        )
    except Exception as primary_exc:
        if not fallback_override:
            raise

        fallback_model = resolve_model(fallback_override, use_case="text")
        if fallback_model == primary_model:
            raise  # same model — no point retrying

        logger.warning(
            "call_ai_with_fallback: primary %s failed for task=%s → fallback %s | err: %s",
            primary_model, task_type, fallback_model, primary_exc,
        )

        return _execute_call(
            system_prompt, user_prompt, fallback_model, max_tok,
            db=db, user_id=user_id, task_type=task_type,
            is_fallback=True, original_model=primary_model,
        )
