---
name: Image Gen Model Dispatch
description: How image.py routes generation calls based on the active image model — gpt-image-1 vs dall-e-2 vs dall-e-3.
---

## Rule
`images.edit` with file uploads works ONLY for `dall-e-2`. Use `images.generate` for everything else.

| Model | Method | Notes |
|---|---|---|
| `gpt-image-1` | `images.generate` + `image=[]` param | Native multi-image reference input |
| `dall-e-2` | `images.edit` | Classic file-upload edit API |
| `dall-e-3` | `images.generate` prompt-only | No edit or image[] support |
| Unknown | `images.generate` prompt-only | Safe fallback |

**Why:** OpenAI changed the API surface between models. Calling `images.edit` on gpt-image-1/dall-e-3 raises an error. The original code used `images.edit` for all models, breaking every logo-reference image generation call.

**How to apply:** Check `_is_edit_capable(model_id)` before any edit call. All branches fall back to `generate_image_bytes(prompt, size)` on any exception so the user always gets an image.
