# AI Architecture — Brand Architect AI Pro

> **Single source of truth for how AI calls are made, how models are resolved, and how to extend the system.**

---

## Overview

The platform uses two AI orchestration systems. Both are live and cooperate:

| | System A — api_key_store | System B — Provider Registry |
|---|---|---|
| Storage | `AppSetting "apiKeys"` JSON blob in DB | `ai_providers` + `ai_models` DB tables |
| Access layer | `app/utils/api_key_store.py` + `app/services/ai/client.py` | `app/ai/registry.py` + `app/ai/router.py` + `app/ai/providers.py` |
| Used by | All AI services (brand_kit, campaign, post, image) | Admin model management UI only |
| Frontend | Admin → API Keys (`AdminApiKeys.tsx`) | Admin → AI Providers (`admin_models.py`) |
| Status | **Active — powers all generation** | Active for management; services use System A |

### Why two systems?

System A was the original implementation. System B was added as the correct long-term architecture (Registry/Router/Provider pattern used by LiteLLM, OpenRouter, Vertex AI). The migration path: services should gradually adopt `ModelRouter` from System B. Both systems coexist without conflict — System B syncs keys back to System A via `_sync_legacy_key_store()`.

---

## Data Flow: Image Generation

```
User clicks "Generate" in ImageGenDialog
    │
    ├─► GET /api/ai/models?capability=image
    │       └─ Returns model list (System B registry if configured, else api_key_store fallback)
    │       └─ User sees: GPT Image 1 (default), DALL-E 3, DALL-E 2
    │
    └─► POST /api/posts/:id/generate-image
            body: { model, imageModelId, customPrompt, size, logoDataUrl, referenceImages, ... }
                │
                ├─ model      → prompt enhancement tier (nano/mini/pro) → enhance_prompt()
                │                  nano: raw prompt as-is
                │                  mini: add lighting + composition via gpt-4o-mini
                │                  pro:  full art direction via gpt-4o
                │
                └─ imageModelId → actual AI model for image generation
                       │  e.g. "gpt-image-1", "dall-e-3", "gemini-2.5-flash-..."
                       │
                       ├─ generate_image_bytes(prompt, size, model_override)
                       ├─ generate_image_with_logo_reference(logo, prompt, size, model_override)
                       └─ generate_image_with_references(refs, prompt, size, ..., model_override)
                               │
                               └─ _effective_provider(model_override)
                                       if "gemini" in model_override → gemini path
                                       else                          → configured provider
```

---

## Model Selection: Two Distinct Concepts

| Concept | Field | Values | Who controls it |
|---|---|---|---|
| **Prompt enhancement tier** | `model` | `nano` / `mini` / `pro` | User per generation |
| **Actual AI model** | `imageModelId` | `gpt-image-1`, `dall-e-3`, etc. | User per generation (admin default if omitted) |

**Do not conflate these.** The tier controls how much the prompt is enriched before sending to the AI. The model ID controls which AI model processes the final prompt.

---

## Key Files

### System A — Legacy Key Store (active)

```
app/utils/api_key_store.py      ← CRUD for "apiKeys" AppSetting JSON
                                   get_api_key(), get_image_model(), get_provider()
                                   invalidate() → busts 60s cache

app/services/ai/client.py       ← Client resolver
                                   get_client()      → OpenAI/Gemini client
                                   get_provider()    → "openai" | "gemini" | "custom"
                                   get_image_model() → model ID string (e.g. "gpt-image-1")
                                   resolve_model()   → model ID with use_case fallback
                                   call_ai()         → single model call with logging
                                   call_ai_with_fallback() → primary + fallback retry

app/services/ai/image.py        ← Image generation
                                   generate_image_bytes(prompt, size, model_override)
                                   generate_image_with_logo_reference(..., model_override)
                                   generate_image_with_references(..., model_override)
                                   enhance_prompt(prompt, model, brand_*)
                                   _effective_provider(model_override) → routing helper

app/services/ai/brand_kit.py    ← Brand kit + story generation
app/services/ai/campaign.py     ← Campaign generation
app/services/ai/post.py         ← Post regen, variant, long-form
```

### System B — Provider Registry (management layer)

```
app/ai/providers.py             ← BaseProvider abstraction
                                   OpenAIProvider, GeminiProvider, CustomProvider

app/ai/registry.py              ← _ModelRegistry (DB-backed, 60s cache)
                                   get_registry() → singleton registry
                                   registry.get_models(capability) → list
                                   registry.invalidate() → bust cache

app/ai/router.py                ← ModelRouter — single entry point for AI calls
                                   (not yet wired to production AI services)

app/routes/admin_models.py      ← Admin CRUD for providers/models + public listing
                                   admin_router  → /api/admin/models/* (admin-only)
                                   public_router → /api/ai/*           (authenticated)
```

### API Endpoints

```
GET  /api/ai/models              ← Public (authenticated) model listing
                                    ?capability=image|text
                                    Returns System B registry if configured,
                                    else api_key_store-derived curated list
                                    Shape: { models: [...], source: "registry"|"keystore" }

POST /api/posts/:id/generate-image ← Image generation
                                    Body includes imageModelId (optional override)
```

---

## GET /api/ai/models — Response Shape

```typescript
{
  models: Array<{
    id: string;           // Model API ID — pass as imageModelId to generate-image
    name: string;         // Human-readable ("GPT Image 1")
    description: string;  // Capability note
    capability: "image" | "text";
    isDefault: boolean;   // true = currently configured admin default
    providerType: "openai" | "gemini" | "custom";
    source: "registry" | "keystore";
    allowed?: boolean;    // plan-gated (only present for registry source)
  }>;
  source: "registry" | "keystore";
}
```

---

## Token / Cost Analysis

### Where tokens are consumed

| Operation | Model used | Est. tokens | When |
|---|---|---|---|
| Brand kit generation | Text model (gpt-4o) | ~1,500–3,000 | On admin request |
| Campaign generation | Text model (gpt-4o) | ~2,000–4,000 | On admin request |
| Post regeneration | Text model | ~500–800 | Per post |
| Post variant | Text model | ~400–600 | Per post |
| Prompt enhance (mini) | gpt-4o-mini | ~200–400 | Per image gen |
| Prompt enhance (pro) | gpt-4o | ~400–700 | Per image gen |
| Image generation | Image model | ~1 image unit | Per image gen |
| Admin "Test" key | Text model | ~5–10 | Per test click |

### Zero-waste paths

- `model = "nano"` skips `enhance_prompt()` entirely — no text tokens consumed before image gen
- The 60s cache on `api_key_store` means repeated model lookups don't hit the DB
- Model fetching (`fetch_models()`) calls provider API only on admin click — never on user requests
- Background jobs (`job_store`) are PostgreSQL-persisted — no repeated AI calls on cache miss

### Recommendations

| Situation | Action |
|---|---|
| High text token spend | Use "nano" prompt quality tier in ImageGenDialog |
| Reduce test costs | Use model listing endpoint (`/models`) for key validation instead of completions |
| Switch image model globally | Admin → API Keys → Image Model |
| Switch image model per-generation | Use the AI Image Model picker in ImageGenDialog |
| Move to System B | Add providers via Admin → AI Providers; services will be migrated in future |

---

## Provider Routing Logic

```python
# image.py — _effective_provider()
def _effective_provider(model_override=None) -> str:
    if model_override and "gemini" in model_override.lower():
        return "gemini"    # model name contains "gemini" → always use Gemini API
    return get_provider()  # else use globally configured provider
```

### OpenAI image model capabilities

| Model | `images.generate` | `image[]` input | `images.edit` |
|---|---|---|---|
| `gpt-image-1` | ✓ | ✓ (multi-image) | ✗ |
| `dall-e-3` | ✓ | ✗ | ✗ |
| `dall-e-2` | ✓ | ✗ | ✓ (edit API) |

The backend dispatches automatically based on model name — no manual routing needed.

---

## Extending the System

### Add a new image model to the curated list

Edit `admin_models.py`:
```python
_KEYSTORE_IMAGE_MODELS["openai"].append("gpt-image-2")
_KEYSTORE_IMAGE_DESCRIPTIONS["gpt-image-2"] = "Next-gen OpenAI image model"
```

### Add a new provider capability

1. Add an `if "new-provider" in model_override.lower(): return "new-provider"` branch to `_effective_provider()` in `image.py`
2. Add the generation path in each `generate_image_*` function
3. Add the curated model list to `_KEYSTORE_IMAGE_MODELS` in `admin_models.py`

### Wire services to System B (ModelRouter)

Replace `call_ai()` / `get_client()` calls in service files with:
```python
from app.ai.router import get_router
router = get_router()
response = router.complete(messages=[...], use_case="text")
```

The router handles provider selection, retries, and logging automatically.

### Add per-task model configuration

Use `task_model_store.py` — stores `taskModelConfig` in `AppSetting`. The `call_ai_with_fallback()` in `client.py` reads this to select the right model per task type.

---

## Credit Cost Reference

| Action | Default cost |
|---|---|
| Brand kit (generate-kit) | 50 credits |
| Brand story (generate-story) | 10 credits |
| Long-form content | 5 credits |
| Campaign generation | 60 credits |
| Image generation (single) | 10 credits |
| Image generation (bulk) | 10 × number of posts |
| Post regeneration | 8 credits |
| Post variant | 5 credits |

Admin accounts are exempt from credit checks. Set `CREDITS_ENABLED=false` to disable globally.

---

## Architecture Decision Log

| Date | Decision | Reason |
|---|---|---|
| 2026-05 | Python-only backend (deleted Express) | Single language, simpler deployment |
| 2026-05 | System A as primary (api_key_store) | Already working, low risk |
| 2026-05 | System B added for management UI | Proper multi-provider support |
| 2026-05 | `public_router` added for model listing | Frontend model selection |
| 2026-05 | `model_override` in image.py | User-selectable model per generation |
| 2026-05 | PostgreSQL job persistence (job_store) | Survives cache eviction and restarts |
| 2026-05 | `_effective_provider()` routing helper | Correct provider dispatch per model name |
