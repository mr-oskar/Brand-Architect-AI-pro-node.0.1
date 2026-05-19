# Backend Guide — Brand Architect AI Pro

> **Stack:** Python 3.11 · FastAPI · Uvicorn · SQLAlchemy · PostgreSQL
> **Entry point:** `artifacts/api-server-python/main.py`
> **Port:** 8080

---

## Folder Map

```
artifacts/api-server-python/
├── main.py                    ← App factory: registers middleware, routes, exception handlers
├── requirements.txt           ← Python dependencies (pin versions)
└── app/
    ├── config.py              ← All env vars via pydantic-settings (single source of truth)
    ├── database.py            ← SQLAlchemy engine + SessionLocal + get_db() dependency
    ├── deps.py                ← FastAPI Depends(): get_current_user, get_current_admin, etc.
    ├── models.py              ← SQLAlchemy ORM models (User, Brand, Campaign, Post, AppSetting)
    ├── schemas.py             ← Pydantic v2 request/response schemas (camelCase for API)
    │
    ├── middleware/            ← HTTP middleware (one class per file)
    │   ├── __init__.py        ← Re-exports all middleware
    │   └── logging.py        ← RequestLoggerMiddleware: logs method/path/status/timing
    │
    ├── layers/                ← Cross-cutting concerns (auth, credits, payments, rate limiting)
    │   ├── auth.py            ← AuthLayer: JWT create/verify, cookie set/clear, bcrypt
    │   ├── credits.py         ← CreditsLayer: atomic credit deduction, refund, cache
    │   ├── payments.py        ← Stripe stub (documented placeholder — not implemented)
    │   └── rate_limit.py     ← slowapi Limiter singleton + 429 error handler
    │
    ├── routes/                ← FastAPI routers (one file per feature domain)
    │   ├── auth.py            ← /auth/register, /auth/login, /auth/logout, /auth/me
    │   ├── brands.py          ← /brands CRUD + AI kit/story/campaign generation
    │   ├── campaigns.py       ← /campaigns/:id — get campaign + posts
    │   ├── posts.py           ← /posts/:id — CRUD, image gen, regenerate, variants
    │   ├── dashboard.py       ← /dashboard/summary — aggregated stats
    │   └── system.py          ← /health, /public-settings, /jobs/:id, /credit-costs
    │
    ├── services/              ← Business logic (no FastAPI imports here)
    │   ├── job_store.py       ← In-memory background job tracker (polling via GET /jobs/:id)
    │   ├── image_storage.py   ← Save/retrieve generated images (local or GCS)
    │   ├── logo_processor.py  ← Logo variants (B&W/grayscale) + color extraction
    │   └── ai/
    │       ├── client.py      ← OpenAI client resolver (OpenAI → Gemini → Replit proxy)
    │       ├── brand_kit.py   ← generate_brand_kit(), generate_brand_story()
    │       ├── campaign.py    ← analyze_brief(), generate_campaign()
    │       ├── post.py        ← regenerate_post(), generate_post_variant(), long-form
    │       └── image.py       ← generate_image_bytes(), enhance_prompt()
    │
    └── utils/                 ← Stateless shared helpers (import freely from routes/services)
        ├── __init__.py        ← Re-exports: paginate, get_owned_brand, handle_ai_error, …
        ├── pagination.py      ← PaginationParams (FastAPI Depends) + paginate(query, params)
        ├── ownership.py       ← get_owned_brand/campaign/post() — 404 if not owned
        └── ai_errors.py      ← handle_ai_error(e) — maps exceptions to HTTP 503/422
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
    name = Column(Text, nullable=False)
    ...

# app/routes/templates.py
from fastapi import APIRouter, Depends
from app.deps import get_current_user
from app.utils import paginate, PaginationParams

router = APIRouter(prefix="/templates", tags=["templates"])

@router.get("")
def list_templates(pagination: PaginationParams = Depends(), ...):
    items, total = paginate(db.query(Template), pagination)
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

# app/middleware/__init__.py  — add to imports
from .my_middleware import MyMiddleware

# main.py  — register (add BEFORE CORSMiddleware to run after CORS)
app.add_middleware(MyMiddleware)
```

---

### 3. Adding a new AI service

```python
# app/services/ai/my_service.py
from app.services.ai.client import call_ai

def generate_something(prompt: str) -> str:
    return call_ai(
        system_prompt="You are a brand expert...",
        user_prompt=prompt,
    )

# app/routes/brands.py  — call it
from app.services.ai.my_service import generate_something
from app.utils import handle_ai_error

@router.post("/{brand_id}/generate-something")
def generate_endpoint(brand_id: int, ...):
    try:
        result = generate_something(...)
        ...
    except Exception as e:
        handle_ai_error(e)  # maps to 503/422
```

---

### 4. Adding a new auth layer (e.g. Clerk, OAuth)

```python
# app/layers/clerk_auth.py
class ClerkAuthLayer:
    def require_user(self, request, db) -> User: ...
    def get_user_or_none(self, request, db) -> User | None: ...
    def create_token(self, user_id, email) -> str: ...
    def set_cookie(self, response, token) -> None: ...
    def clear_cookie(self, response) -> None: ...

# app/deps.py  — swap the import
from app.layers.clerk_auth import ClerkAuthLayer
auth_layer = ClerkAuthLayer()   # zero changes to routes needed
```

---

### 5. Ownership checks (use utils, not inline code)

```python
# ✅ Correct — uses shared utility
from app.utils import get_owned_brand

brand = get_owned_brand(brand_id, current_user.id, db)

# ❌ Avoid — duplicated inline logic
brand = db.query(Brand).filter(Brand.id == brand_id, ...).first()
if not brand:
    raise HTTPException(404, ...)
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (auto-set by Replit) |
| `AUTH_JWT_SECRET` | ✅ | JWT signing secret (set in Replit Secrets) |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | ✅ | Auto-set by Replit AI Integration |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | ✅ | Auto-set by Replit AI Integration |
| `OPENAI_API_KEY` | ⬜ | Direct OpenAI key (overrides Replit proxy) |
| `GEMINI_API_KEY` | ⬜ | Google Gemini fallback |
| `CREDITS_ENABLED` | ⬜ | Set `false` to disable credit gating (dev only) |
| `ALLOWED_ORIGINS` | ⬜ | Comma-separated CORS allowlist (custom domains) |

---

## Credit Costs Reference

| Action | Cost |
|---|---|
| Generate brand kit | 50 credits |
| Generate brand story | 10 credits |
| Generate long-form content | 5 credits |
| Generate campaign | 60 credits |
| Generate post image | 10 credits |
| Regenerate post | 8 credits |
| Generate post variant | 5 credits |

Admins pay 0 credits. Disable globally: `CREDITS_ENABLED=false`.

---

## Common Debugging

| Symptom | Check |
|---|---|
| API returns 503 on AI routes | `AI_INTEGRATIONS_OPENAI_API_KEY` must be set |
| All routes return 401 | `AUTH_JWT_SECRET` must match what tokens were signed with |
| Credits blocking dev | Set `CREDITS_ENABLED=false` or login as admin account |
| 429 on dev | Rate limit per IP — wait 1 minute or use different IP |
| DB tables missing | Run `python3 -c "from app.models import Base; from app.database import engine; Base.metadata.create_all(engine)"` |

---

## Excluded Features

See `EXCLUDED_FEATURES.md` for the full list of features intentionally not built,
with step-by-step instructions for adding each one when ready.
