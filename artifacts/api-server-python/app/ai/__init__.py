"""
app.ai — Model-Based AI Architecture

Layers (outermost → innermost):
  router.py    ModelRouter          — single entry point; fallback for text, strict for image
  registry.py  ModelRegistry        — in-memory DB-backed model catalogue (60 s TTL cache)
  providers.py BaseProvider + impls — SDK-agnostic API calls

Usage:
    from app.ai.router import get_router
    router = get_router()
    text   = router.complete_text(messages, user_id="abc")
    image  = router.generate_image(prompt, model_db_id="uuid", size="1024x1024")
"""
