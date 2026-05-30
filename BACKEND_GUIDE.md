# Backend Guide — Brand Architect AI Pro

> **Stack:** Python 3.11 · FastAPI · Uvicorn · SQLAlchemy · PostgreSQL
> **Entry point:** `artifacts/api-server-python/main.py`
> **Port:** 8080
>
> **Related:** [DOCUMENTATION.md](./DOCUMENTATION.md) · [FRONTEND_GUIDE.md](./FRONTEND_GUIDE.md)

---

## Folder Map

```
artifacts/api-server-python/
├── main.py                      ← App factory: registers middleware, routes, startup hooks
├── requirements.txt             ← Pinned Python dependencies (do not change versions lightly)
├── EXCLUDED_FEATURES.md         ← Features not built yet + how to add them
└── app/
    ├── config.py                ← All env vars via pydantic-settings (single source of truth)
    ├── database.py              ← SQLAlchemy engine + SessionLocal + get_db() dependency
    ├── deps.py                  ← FastAPI Depends(): get_current_user, get_current_admin
    ├── models.py                ← SQLAlchemy ORM: User, Brand, Campaign, Post, AppSetting
    ├── schemas.py               ← Pydantic v2 request/response schemas (camelCase for JSON)
    │
    ├── middleware/
    │   ├── __init__.py          ← Re-exports all middleware
    │   └── logging.py           ← RequestLoggerMiddleware: method/path/status/timing
    │
    ├── layers/                  ← Cross-cutting concerns (no business logic here)
    │   ├── auth.py              ← AuthLayer: JWT create/verify, cookie, bcrypt
    │   ├── credits.py           ← CreditsLayer: atomic deduction, refund, CREDITS_ENABLED
    │   ├── payments.py          ← Stripe stub (documented placeholder — not implemented)
    │   └── rate_limit.py        ← slowapi Limiter singleton + 429 error handler
    │
    ├── routes/                  ← FastAPI routers — one file per feature domain
    │   ├── auth.py              ← /auth/register, /auth/login, /auth/logout, /auth/me
    │   ├── brands.py            ← /brands CRUD + all AI generation endpoints
    │   ├── campaigns.py         ← /campaigns/:id — get campaign + posts
    │   ├── posts.py             ← /posts CRUD, image gen, regenerate, variants
    │   ├── dashboard.py         ← /dashboard/summary — aggregated stats
    │   ├── admin.py             ← /admin/* — users, settings, AI provider keys (admin-only)
    │   └── system.py            ← /health, /public-settings, /jobs/:id, /credit-costs
    │
    ├── services/                ← Business logic (no FastAPI imports here)
    │   ├── ai/
    │   │   ├── client.py        ← AI client resolver (reads from api_key_store, 60s cache)
    │   │   ├── brand_kit.py     ← generate_brand_kit(), generate_brand_story()
    │   │   ├── campaign.py      ← analyze_brief(), generate_campaign()
    │   │   ├── post.py          ← regenerate_post(), generate_variant(), long_form()
    │   │   └── image.py         ← generate_image_bytes(), enhance_prompt()
    │   ├── job_store.py         ← In-memory background job tracker (GET /jobs/:id)
    │   ├── image_storage.py     ← Save/retrieve generated images locally
    │   └── logo_processor.py    ← Logo variants (B&W/grayscale) + color extraction
    │
    └── utils/                   ← Stateless shared helpers (import freely)
        ├── __init__.py          ← Re-exports: paginate, PaginationParams, get_owned_*, handle_ai_error
        ├── api_key_store.py     ← AI provider keys: DB cache (60s TTL) + env var fallback
        ├── pagination.py        ← PaginationParams (FastAPI Depends) + paginate(query, params)
        ├── ownership.py         ← get_owned_brand/campaign/post() — 404 if not owned by user
        └── ai_errors.py         ← handle_ai_error(e) — maps AI exceptions → HTTP 503/422
```

---

## Key Patterns

### 1. Adding a new API endpoint

```
Step 1: app/models.py        → Add SQLAlchemy model (if new table needed)
Step 2: app/schemas.py       → Add Pydantic request/response schemas
Step 3: app/services/        → Add business logic as plain functions
Step 4: app/routes/          → Add FastAPI router using the service
Step 5: main.py              → app.include_router(my_router, prefix="/api")
```

**Example — adding a "Templates" feature:**

```python
# app/models.py
class Template(Base):
    __tablename__ = "templates"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(Text, nullable=False)
    content = Column(Text)

# app/schemas.py
class TemplateResponse(BaseModel):
    id: int
    name: str
    content: str | None
    model_config = ConfigDict(from_attributes=True)

# app/routes/templates.py
from fastapi import APIRouter, Depends
from app.deps import get_current_user
from app.utils import paginate, PaginationParams

router = APIRouter(prefix="/templates", tags=["templates"])

@router.get("")
def list_templates(
    pagination: PaginationParams = Depends(),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Template).filter(Template.user_id == user.id)
    items, total = paginate(q, pagination)
    return {"items": items, "total": total}

# main.py
from app.routes import templates
app.include_router(templates.router, prefix="/api")
```

---

### 2. Adding a new middleware

```python
# app/middleware/my_middleware.py
from starlette.middleware.base import BaseHTTPMiddleware

class MyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        # before handler
        response = await call_next(request)
        # after handler
        return response

# app/middleware/__init__.py  — add to re-exports
from .my_middleware import MyMiddleware

# main.py  — register BEFORE CORSMiddleware (runs after CORS in middleware stack)
app.add_middleware(MyMiddleware)
```

---

### 3. Adding a new AI service

```python
# app/services/ai/my_service.py
from app.services.ai.client import call_ai

def generate_something(prompt: str) -> str:
    """
    Generate content using the configured AI provider.
    Raises RuntimeError if no AI provider is configured.
    """
    return call_ai(
        system_prompt="You are a brand expert...",
        user_prompt=prompt,
        max_tokens=2048,
    )

# app/routes/brands.py  — use it in a route
from app.services.ai.my_service import generate_something
from app.utils import handle_ai_error

@router.post("/{brand_id}/generate-something")
def generate_endpoint(
    brand_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    brand = get_owned_brand(brand_id, user.id, db)
    try:
        result = generate_something(brand.company_name)
        return {"result": result}
    except Exception as e:
        handle_ai_error(e)  # maps RuntimeError → 503, json errors → 422
```

---

### 4. Adding an AI provider key (new provider)

To support a new AI provider beyond OpenAI / Gemini / Nano Banana:

```python
# app/utils/api_key_store.py — add to KNOWN_PROVIDERS
KNOWN_PROVIDERS: dict[str, dict] = {
    # ... existing entries ...
    "my_provider": {
        "label": "My Provider",
        "description": "Description shown in admin panel",
        "has_base_url": True,      # True if user must supply a base URL
        "default_base_url": "https://api.myprovider.com/v1",
    },
}

# Then update get_best_provider() to handle the new provider's credentials
```

---

### 5. How AI client resolution works

```
get_client() in services/ai/client.py
    ↓
api_key_store.get_best_provider()  ← 60s in-memory TTL cache
    ├─ DB: nano_banana (if enabled + has baseUrl)
    ├─ DB: openai      (if enabled + has apiKey)
    ├─ DB: gemini      (if enabled + has apiKey)
    ├─ Env: OPENAI_API_KEY
    ├─ Env: GEMINI_API_KEY
    └─ Env: AI_INTEGRATIONS_OPENAI_API_KEY + BASE_URL (Replit proxy)

→ Returns (api_key, base_url, provider_type)
→ OpenAI client created and cached for 60s
→ RuntimeError if nothing is configured (→ HTTP 503)
```

After an admin saves a key via the UI:
```python
api_key_store.invalidate()        # force DB reload on next access
ai_client.invalidate_client_cache()  # force new OpenAI client on next call
```
Effect is immediate (next AI call picks up the new key within seconds).

---

### 6. Swapping the auth layer (e.g. Clerk, OAuth)

```python
# app/layers/clerk_auth.py
class ClerkAuthLayer:
    def require_user(self, request, db) -> User: ...
    def get_user_or_none(self, request, db) -> User | None: ...
    def create_token(self, user_id: int, email: str) -> str: ...
    def set_cookie(self, response, token: str) -> None: ...
    def clear_cookie(self, response) -> None: ...

# app/deps.py  — swap the import (no changes to routes needed)
from app.layers.clerk_auth import ClerkAuthLayer
auth_layer = ClerkAuthLayer()
```

---

### 7. Ownership checks (always use utils)

```python
# ✅ Correct — uses shared utility (raises 404 automatically)
from app.utils import get_owned_brand
brand = get_owned_brand(brand_id, current_user.id, db)

# ❌ Avoid — duplicated inline logic
brand = db.query(Brand).filter(Brand.id == brand_id).first()
if not brand:
    raise HTTPException(404, "Not found")
if brand.user_id != current_user.id:
    raise HTTPException(404, "Not found")   # 404, not 403 — never reveal existence
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `AUTH_JWT_SECRET` | ✅ | JWT signing secret — stable across restarts |
| `OPENAI_API_KEY` | ⬜ | Direct OpenAI (overrides DB keys and Replit proxy) |
| `GEMINI_API_KEY` | ⬜ | Google Gemini fallback |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Auto | Replit AI proxy (auto-set) |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Auto | Replit AI proxy base URL (auto-set) |
| `CREDITS_ENABLED` | ⬜ | Set `false` to disable credit gating |
| `AI_TEXT_MODEL` | ⬜ | Default: `gpt-4o-mini` |
| `AI_MAX_TOKENS` | ⬜ | Default: `8192` |
| `AI_TEMPERATURE` | ⬜ | Default: `0.7` |

All config lives in `app/config.py` (pydantic-settings). Add new settings there — never read `os.environ` directly in routes or services.

---

## Testing Endpoints Manually

Swagger UI is available at `http://localhost:8080/api/docs`.

Quick curl examples:
```bash
# Health check
curl http://localhost:8080/api/health

# Register
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"test1234","name":"Admin"}'

# Login (save token)
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"test1234"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# List brands
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/brands

# Test AI provider key without saving
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"sk-..."}' \
  http://localhost:8080/api/admin/api-keys/openai/test
```
