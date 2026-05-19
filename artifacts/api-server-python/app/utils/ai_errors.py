"""
AI error handling utility — uniform HTTP error responses for AI provider failures.

All AI-related routes should catch exceptions and call handle_ai_error() to
produce consistent, user-friendly HTTP responses regardless of the underlying
provider (OpenAI, Gemini, Replit proxy).

Usage in a route:
    from app.utils import handle_ai_error

    try:
        result = generate_brand_kit(...)
    except Exception as e:
        handle_ai_error(e)   # raises HTTPException

Error mapping:
  - No provider configured → 503 with setup instructions
  - Quota / billing error  → 503 with quota message
  - Content policy block   → 422 with content policy message
  - Any other error        → 503 with sanitised message

Extension points:
  - Add Sentry/Datadog reporting: capture the exception before raising HTTPException
  - Add retry logic: inspect error type and return a Retry-After header
  - Add provider-specific handling: check exception class (openai.APIError, etc.)
"""
from fastapi import HTTPException


def handle_ai_error(e: Exception) -> None:
    """
    Inspect an AI provider exception and raise the appropriate HTTPException.

    This function always raises — it never returns normally.

    Args:
        e: The exception caught from an AI service call.

    Raises:
        HTTPException(503) — AI unavailable or quota exceeded
        HTTPException(422) — Content policy violation
    """
    msg = str(e)
    msg_lower = msg.lower()

    # Provider not configured at all
    if "no ai provider" in msg_lower or (
        "api_key" in msg_lower and "invalid" not in msg_lower
    ):
        raise HTTPException(
            status_code=503,
            detail=(
                "AI provider not configured. "
                "Set OPENAI_API_KEY or GEMINI_API_KEY in environment secrets."
            ),
        )

    # Quota / billing issues
    if "quota" in msg_lower or "billing" in msg_lower or "rate limit" in msg_lower:
        raise HTTPException(
            status_code=503,
            detail=f"AI quota or billing issue: {msg}",
        )

    # Content policy violations (DALL-E, GPT safety filters)
    if "content_policy" in msg_lower or "content policy" in msg_lower or "safety" in msg_lower:
        raise HTTPException(
            status_code=422,
            detail="The request was blocked by the AI content policy. Please revise your input.",
        )

    # Generic AI error
    raise HTTPException(
        status_code=503,
        detail=f"AI service error: {msg}",
    )
