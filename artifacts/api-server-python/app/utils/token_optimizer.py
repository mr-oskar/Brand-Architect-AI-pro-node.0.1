"""
Dynamic max_tokens calculator.

Returns an appropriate token budget for each AI task type, balancing
response completeness against unnecessary cost and latency.

Usage:
    from app.utils.token_optimizer import get_max_tokens
    max_tok = get_max_tokens("brand_kit")           # → 4096
    max_tok = get_max_tokens("post_regen", 1200)    # → 1500 (scales w/ prompt)
    max_tok = get_max_tokens("campaign", 4000)      # → up to 8192
"""
from __future__ import annotations

# Base token budget per task type.
# Keys match the task_type field written to ai_usage_logs.
_TASK_BUDGETS: dict[str, int] = {
    # Brand operations
    "brand_kit":             4096,   # large JSON schema output
    "brand_story":           1500,
    "brand_content":         2048,
    # Campaign pipeline
    "campaign":              8192,   # very large JSON — up to 14 posts
    "trend_research":        3000,
    "brief_analysis":         600,
    # Post operations
    "post_regen":            1500,
    "post_variant":          1500,
    "post_image_prompt":      400,
    # Long-form content
    "long_form_blog":        4096,
    "long_form_email":       1200,
    "long_form_newsletter":  2500,
    # Fallback
    "default":               2048,
}

_MIN_TOKENS  =   300
_MAX_TOKENS  = 16384
_SCALE_ABOVE =  2000   # prompt chars above this trigger scaling
_SCALE_RATE  =     4   # extra token per N prompt chars (4 = 1 token per 4 chars)
_SCALE_CAP   =   512   # max extra tokens added by scaling


def get_max_tokens(task_type: str, prompt_length: int = 0) -> int:
    """
    Return a max_tokens ceiling for the given task type and prompt length.

    Longer prompts may need proportionally more output tokens to respond
    fully, so a small buffer is added when prompt_length > 2000 chars.
    The result is always clamped to [_MIN_TOKENS, _MAX_TOKENS].
    """
    base = _TASK_BUDGETS.get(task_type, _TASK_BUDGETS["default"])

    if prompt_length > _SCALE_ABOVE:
        extra = min(_SCALE_CAP, (prompt_length - _SCALE_ABOVE) // _SCALE_RATE)
        base  = min(base + extra, base * 2)

    return max(_MIN_TOKENS, min(base, _MAX_TOKENS))
