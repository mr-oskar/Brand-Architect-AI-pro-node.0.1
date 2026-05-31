"""
Token pricing table — USD cost per 1,000 tokens.

Used to calculate monetary_cost in AIUsageLog after each AI call.
Prices sourced from official provider pricing pages (May 2026).
Update the MODEL_PRICING dict when provider prices change.

Format: model_id (lowercase) → (input_per_1k_tokens, output_per_1k_tokens) in USD
"""
from __future__ import annotations

MODEL_PRICING: dict[str, tuple[float, float]] = {
    # ── OpenAI ──────────────────────────────────────────────────────────────
    "gpt-4o-mini":              (0.00015, 0.00060),
    "gpt-4o-mini-2024-07-18":   (0.00015, 0.00060),
    "gpt-4o":                   (0.00500, 0.01500),
    "gpt-4o-2024-11-20":        (0.00250, 0.01000),
    "gpt-4o-2024-08-06":        (0.00250, 0.01000),
    "gpt-4.1":                  (0.00200, 0.00800),
    "gpt-4.1-mini":             (0.00040, 0.00160),
    "gpt-4.1-nano":             (0.00010, 0.00040),
    "gpt-4-turbo":              (0.01000, 0.03000),
    "gpt-4-turbo-preview":      (0.01000, 0.03000),
    "gpt-4":                    (0.03000, 0.06000),
    "gpt-3.5-turbo":            (0.00050, 0.00150),
    "gpt-3.5-turbo-0125":       (0.00050, 0.00150),
    "gpt-5-nano":               (0.00015, 0.00060),
    "gpt-5-mini":               (0.00040, 0.00160),
    "gpt-5.2":                  (0.00500, 0.01500),
    "gpt-5":                    (0.01000, 0.03000),
    "o1-mini":                  (0.00300, 0.01200),
    "o1":                       (0.01500, 0.06000),
    "o3-mini":                  (0.00110, 0.00440),
    "o3":                       (0.01000, 0.04000),
    # ── Gemini ──────────────────────────────────────────────────────────────
    "gemini-2.5-flash":         (0.000075, 0.000300),
    "gemini-2.5-pro":           (0.001250, 0.010000),
    "gemini-2.0-flash":         (0.000100, 0.000400),
    "gemini-2.0-flash-exp":     (0.000100, 0.000400),
    "gemini-1.5-flash":         (0.000075, 0.000300),
    "gemini-1.5-flash-8b":      (0.000037, 0.000150),
    "gemini-1.5-pro":           (0.001250, 0.005000),
    # ── Image models — billed per image, not per token ──────────────────────
    "gpt-image-1":                                  (0.0, 0.0),
    "dall-e-3":                                     (0.0, 0.0),
    "dall-e-2":                                     (0.0, 0.0),
    "gemini-2.5-flash-preview-image-generation":    (0.0, 0.0),
    "imagen-3.0-generate-002":                      (0.0, 0.0),
    "imagen-3.0-fast-generate-001":                 (0.0, 0.0),
}

# Prefix-based fallback for unknown model variants (ordered, longest-prefix wins)
_PREFIX_PRICING: list[tuple[str, tuple[float, float]]] = [
    ("gpt-4o-mini",      (0.00015, 0.00060)),
    ("gpt-4o",           (0.00500, 0.01500)),
    ("gpt-4.1-mini",     (0.00040, 0.00160)),
    ("gpt-4.1-nano",     (0.00010, 0.00040)),
    ("gpt-4.1",          (0.00200, 0.00800)),
    ("gpt-4-turbo",      (0.01000, 0.03000)),
    ("gpt-4",            (0.03000, 0.06000)),
    ("gpt-3.5",          (0.00050, 0.00150)),
    ("gpt-5",            (0.00500, 0.01500)),
    ("o1-mini",          (0.00300, 0.01200)),
    ("o1",               (0.01500, 0.06000)),
    ("o3-mini",          (0.00110, 0.00440)),
    ("o3",               (0.01000, 0.04000)),
    ("gemini-2.5-flash", (0.000075, 0.000300)),
    ("gemini-2.5-pro",   (0.001250, 0.010000)),
    ("gemini-2.5",       (0.000500, 0.002000)),
    ("gemini-2.0",       (0.000100, 0.000400)),
    ("gemini-1.5-flash", (0.000075, 0.000300)),
    ("gemini-1.5-pro",   (0.001250, 0.005000)),
    ("gemini-1.5",       (0.000300, 0.001200)),
    ("gemini",           (0.000100, 0.000400)),
    ("imagen",           (0.0, 0.0)),
]

# Default when no match found (conservative ~gpt-4o-mini estimate)
_DEFAULT_PRICING: tuple[float, float] = (0.00020, 0.00080)


def get_model_pricing(model_id: str) -> tuple[float, float]:
    """
    Return (input_per_1k, output_per_1k) in USD for the given model ID.
    Matching order: exact → prefix → default.
    Always returns (0, 0) for known image-generation models.
    """
    ml = model_id.lower().strip()

    if ml in MODEL_PRICING:
        return MODEL_PRICING[ml]

    for prefix, pricing in _PREFIX_PRICING:
        if ml.startswith(prefix):
            return pricing

    return _DEFAULT_PRICING


def calculate_cost(model_id: str, input_tokens: int, output_tokens: int) -> float:
    """
    Return the USD cost for a single API call, rounded to 8 decimal places.
    Returns 0.0 for image models or when token counts are zero.
    """
    if not model_id or (input_tokens <= 0 and output_tokens <= 0):
        return 0.0
    inp_rate, out_rate = get_model_pricing(model_id)
    cost = (input_tokens / 1_000.0 * inp_rate) + (output_tokens / 1_000.0 * out_rate)
    return round(cost, 8)


def format_cost_usd(cost: float) -> str:
    """Human-readable cost string, e.g. '$0.000123' or '$1.23'."""
    if cost < 0.01:
        return f"${cost:.6f}"
    return f"${cost:.4f}"
