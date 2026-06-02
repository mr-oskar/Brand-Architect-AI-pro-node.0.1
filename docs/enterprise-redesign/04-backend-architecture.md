# المرحلة الرابعة: معمارية الـ Backend (FastAPI)

## 1. هيكل المشروع الكامل

```
backend/
├── app/
│   ├── api/
│   │   ├── v1/
│   │   │   ├── __init__.py
│   │   │   ├── router.py              # تجميع كل routes الـ v1
│   │   │   ├── auth.py                # /auth/*
│   │   │   ├── brands.py              # /brands/*
│   │   │   ├── campaigns.py           # /campaigns/*
│   │   │   ├── posts.py               # /posts/*
│   │   │   ├── organizations.py       # /organizations/*
│   │   │   ├── teams.py               # /teams/*
│   │   │   ├── billing.py             # /billing/*
│   │   │   ├── webhooks.py            # /webhooks/*
│   │   │   ├── jobs.py                # /jobs/*
│   │   │   └── system.py              # /health, /settings
│   │   └── v2/
│   │       └── router.py              # future v2
│   │
│   ├── core/
│   │   ├── config.py                  # Settings (pydantic-settings)
│   │   ├── security.py                # JWT, bcrypt, token management
│   │   ├── exceptions.py              # Custom exceptions hierarchy
│   │   ├── events.py                  # App startup/shutdown events
│   │   ├── logging.py                 # Structured logging setup
│   │   └── constants.py               # App-wide constants
│   │
│   ├── services/
│   │   ├── ai/
│   │   │   ├── orchestrator.py        # AI task orchestration
│   │   │   ├── providers/
│   │   │   │   ├── base.py            # Abstract AI Provider
│   │   │   │   ├── openai_provider.py
│   │   │   │   ├── gemini_provider.py
│   │   │   │   └── anthropic_provider.py
│   │   │   ├── agents/
│   │   │   │   ├── brand_agent.py     # Brand Kit generation
│   │   │   │   ├── campaign_agent.py  # Campaign planning
│   │   │   │   ├── content_agent.py   # Text generation
│   │   │   │   └── image_agent.py     # Image generation
│   │   │   └── prompts/
│   │   │       ├── brand_prompts.py
│   │   │       ├── campaign_prompts.py
│   │   │       ├── image_prompts.py
│   │   │       └── base.py
│   │   ├── storage_service.py         # S3/R2 abstraction
│   │   ├── email_service.py           # Email (SendGrid/SES)
│   │   ├── billing_service.py         # Stripe integration
│   │   ├── analytics_service.py       # Usage analytics
│   │   ├── logo_service.py            # Logo processing
│   │   └── notification_service.py    # In-app + email notifications
│   │
│   ├── repositories/
│   │   ├── base.py                    # Generic CRUD repository
│   │   ├── user_repository.py
│   │   ├── brand_repository.py
│   │   ├── campaign_repository.py
│   │   ├── post_repository.py
│   │   ├── organization_repository.py
│   │   ├── billing_repository.py
│   │   └── analytics_repository.py
│   │
│   ├── models/
│   │   ├── user.py                    # User ORM model
│   │   ├── brand.py                   # Brand ORM model
│   │   ├── campaign.py                # Campaign ORM model
│   │   ├── post.py                    # Post ORM model
│   │   ├── organization.py            # Org ORM model
│   │   ├── billing.py                 # Billing ORM models
│   │   ├── ai_registry.py             # AI provider/model models
│   │   └── audit.py                   # Audit log model
│   │
│   ├── schemas/
│   │   ├── auth.py                    # Auth request/response schemas
│   │   ├── brand.py                   # Brand schemas
│   │   ├── campaign.py                # Campaign schemas
│   │   ├── post.py                    # Post schemas
│   │   ├── organization.py            # Org schemas
│   │   ├── billing.py                 # Billing schemas
│   │   └── common.py                  # Shared schemas (pagination, etc.)
│   │
│   ├── middlewares/
│   │   ├── auth_middleware.py         # JWT validation
│   │   ├── tenant_middleware.py       # Tenant context injection
│   │   ├── rate_limit_middleware.py   # Per-user/org rate limiting
│   │   ├── logging_middleware.py      # Request/response logging
│   │   ├── cors_middleware.py         # CORS configuration
│   │   └── security_middleware.py     # Security headers
│   │
│   ├── workers/
│   │   ├── celery_app.py              # Celery application factory
│   │   ├── ai_tasks.py                # AI generation tasks
│   │   ├── email_tasks.py             # Email sending tasks
│   │   ├── analytics_tasks.py         # Analytics aggregation
│   │   └── cleanup_tasks.py           # Maintenance tasks
│   │
│   ├── agents/                        # Future: autonomous AI agents
│   │   ├── base_agent.py
│   │   └── brand_optimizer_agent.py
│   │
│   ├── workflows/
│   │   ├── brand_creation_workflow.py
│   │   ├── campaign_generation_workflow.py
│   │   └── image_generation_workflow.py
│   │
│   ├── integrations/
│   │   ├── stripe/
│   │   │   ├── client.py
│   │   │   └── webhooks.py
│   │   ├── sendgrid/
│   │   │   └── client.py
│   │   └── s3/
│   │       └── client.py
│   │
│   ├── database/
│   │   ├── engine.py                  # Async SQLAlchemy engine
│   │   ├── session.py                 # Session factory
│   │   ├── base.py                    # Declarative base
│   │   └── migrations/                # Alembic migrations
│   │
│   ├── auth/
│   │   ├── jwt.py                     # JWT create/verify
│   │   ├── oauth.py                   # OAuth2 providers
│   │   └── permissions.py             # RBAC permission checker
│   │
│   ├── billing/
│   │   ├── stripe_client.py
│   │   ├── credit_manager.py
│   │   └── subscription_manager.py
│   │
│   ├── notifications/
│   │   ├── email_templates/
│   │   └── notification_manager.py
│   │
│   ├── files/
│   │   ├── upload_handler.py
│   │   └── image_processor.py
│   │
│   ├── analytics/
│   │   ├── usage_tracker.py
│   │   └── report_generator.py
│   │
│   ├── monitoring/
│   │   ├── metrics.py                 # Prometheus metrics
│   │   └── health.py                  # Health check endpoints
│   │
│   └── deps.py                        # FastAPI dependencies (DI)
│
├── tests/
│   ├── unit/
│   │   ├── services/
│   │   ├── repositories/
│   │   └── utils/
│   ├── integration/
│   │   ├── api/
│   │   └── workers/
│   ├── e2e/
│   │   └── flows/
│   └── conftest.py                    # Test fixtures
│
├── alembic/                           # Database migrations
│   ├── versions/
│   ├── env.py
│   └── alembic.ini
│
├── scripts/
│   ├── seed.py                        # Database seeding
│   ├── create_admin.py
│   └── migrate.py
│
├── docker/
│   ├── Dockerfile.api
│   ├── Dockerfile.worker
│   └── docker-compose.yml
│
├── .env.example
├── pyproject.toml
├── requirements.txt
└── main.py                            # App entry point
```

---

## 2. API Endpoints الكاملة

### Authentication API `/api/v1/auth`

```
POST   /auth/register          → Register new user
POST   /auth/login             → Login → { access_token, user }
POST   /auth/logout            → Revoke session
POST   /auth/refresh           → Refresh access token
POST   /auth/forgot-password   → Send reset email
POST   /auth/reset-password    → Reset with token
POST   /auth/verify-email      → Verify email address
GET    /auth/me                → Current user profile
PATCH  /auth/me                → Update profile
DELETE /auth/me                → Delete account (GDPR)
POST   /auth/oauth/{provider}  → OAuth2 (Google/GitHub)
POST   /auth/mfa/enable        → Enable MFA
POST   /auth/mfa/verify        → Verify MFA code
DELETE /auth/mfa/disable       → Disable MFA
```

### Organizations API `/api/v1/organizations`

```
GET    /organizations              → List user's organizations
POST   /organizations              → Create organization
GET    /organizations/{id}         → Get organization details
PATCH  /organizations/{id}         → Update organization
DELETE /organizations/{id}         → Delete organization

GET    /organizations/{id}/members → List members
POST   /organizations/{id}/invite  → Invite member by email
PATCH  /organizations/{id}/members/{uid} → Update member role
DELETE /organizations/{id}/members/{uid} → Remove member

GET    /organizations/{id}/activity → Activity log
GET    /organizations/{id}/stats    → Usage statistics
```

### Brands API `/api/v1/brands`

```
GET    /brands                          → List brands (paginated + filtered)
POST   /brands                          → Create brand
GET    /brands/{id}                     → Get brand + kit
PATCH  /brands/{id}                     → Update brand settings
DELETE /brands/{id}                     → Delete brand
GET    /brands/{id}/stats               → Brand statistics

# AI Generation
POST   /brands/{id}/generate-kit        → Generate Brand Kit (async → jobId)
POST   /brands/{id}/generate-story      → Generate brand story
POST   /brands/{id}/generate-content    → Generate long-form content
POST   /brands/{id}/generate-logo-variants → B&W/grayscale logo variants
POST   /brands/{id}/generate-campaign   → Start campaign generation (async → jobId)

# Campaigns
GET    /brands/{id}/campaigns           → List campaigns for brand
POST   /brands/{id}/campaigns           → Create campaign manually

# Export
GET    /brands/{id}/export              → Export brand kit (PDF/JSON)
```

### Campaigns API `/api/v1/campaigns`

```
GET    /campaigns/{id}                  → Get campaign + posts
PATCH  /campaigns/{id}                  → Update campaign metadata
DELETE /campaigns/{id}                  → Delete campaign
POST   /campaigns/{id}/archive          → Archive campaign
POST   /campaigns/{id}/duplicate        → Duplicate campaign

# Bulk operations
POST   /campaigns/{id}/generate-images  → Bulk image gen (async → jobId)
GET    /campaigns/{id}/export           → Export campaign (CSV/JSON/PDF)
```

### Posts API `/api/v1/posts`

```
GET    /posts/{id}                      → Get post
PATCH  /posts/{id}                      → Update post text/metadata
DELETE /posts/{id}                      → Delete post
POST   /posts/{id}/duplicate            → Duplicate post

# AI operations
POST   /posts/{id}/generate-image       → Generate image (async → jobId)
POST   /posts/{id}/restore-image        → Restore image from history
POST   /posts/{id}/regenerate           → Regenerate post text
POST   /posts/{id}/generate-variant     → Generate A/B variant
POST   /posts/{id}/generate-content     → Long-form content from post

# Campaign posts
GET    /campaigns/{id}/posts            → List posts in campaign
POST   /campaigns/{id}/posts            → Add post to campaign
```

### Billing API `/api/v1/billing`

```
GET    /billing/plans                   → List subscription plans
GET    /billing/subscription            → Current subscription
POST   /billing/subscription            → Create/upgrade subscription
PATCH  /billing/subscription            → Change plan
DELETE /billing/subscription            → Cancel subscription

GET    /billing/credits                 → Current credit balance
GET    /billing/transactions            → Credit transaction history
POST   /billing/credits/purchase        → Buy credit pack

GET    /billing/invoices                → List invoices
GET    /billing/invoices/{id}           → Get invoice
GET    /billing/invoices/{id}/pdf       → Download invoice PDF

GET    /billing/payment-methods         → List payment methods
POST   /billing/payment-methods         → Add payment method
DELETE /billing/payment-methods/{id}    → Remove payment method

POST   /webhooks/stripe                 → Stripe webhook handler
```

### Admin API `/api/v1/admin`

```
# Users
GET    /admin/users                     → List all users
GET    /admin/users/{id}                → Get user details
PATCH  /admin/users/{id}                → Update user (role, credits)
DELETE /admin/users/{id}                → Delete user
POST   /admin/users/{id}/impersonate    → Impersonate user

# Organizations
GET    /admin/organizations             → List all organizations
GET    /admin/organizations/{id}        → Get organization
PATCH  /admin/organizations/{id}        → Update limits/settings

# AI Management
GET    /admin/ai-providers              → List providers
POST   /admin/ai-providers              → Add provider key
PATCH  /admin/ai-providers/{id}         → Update provider
DELETE /admin/ai-providers/{id}         → Remove provider
POST   /admin/ai-providers/{id}/test    → Test provider connection
POST   /admin/ai-providers/{id}/sync    → Sync available models

GET    /admin/ai-models                 → List all models
PATCH  /admin/ai-models/{id}            → Update model config
GET    /admin/ai-usage                  → Usage logs (paginated)
GET    /admin/ai-stats                  → Aggregated stats

# Plans
GET    /admin/plans                     → List plans
POST   /admin/plans                     → Create plan
PATCH  /admin/plans/{id}                → Update plan
DELETE /admin/plans/{id}                → Delete plan

# System
GET    /admin/settings                  → All system settings
PATCH  /admin/settings                  → Update settings
GET    /admin/stats                     → Platform statistics
GET    /admin/audit-logs                → Audit log viewer
GET    /admin/feature-flags             → Feature flags
PATCH  /admin/feature-flags/{key}       → Toggle feature flag

# Jobs
GET    /admin/jobs                      → List background jobs
GET    /admin/jobs/{id}                 → Job details
DELETE /admin/jobs/{id}                 → Cancel/delete job
```

### System API

```
GET    /health                          → Health check
GET    /health/deep                     → Deep health (DB, Redis, AI)
GET    /api-docs                        → Swagger UI
GET    /openapi.json                    → OpenAPI spec
GET    /public-settings                 → Public site config
GET    /credit-costs                    → Credit cost table
GET    /jobs/{id}                       → Poll job status
```

---

## 3. Request/Response Schemas

### Shared Schemas

```python
# common.py

class PaginationParams(BaseModel):
    page: int = 1
    per_page: int = 20
    sort_by: str = "created_at"
    sort_order: Literal["asc", "desc"] = "desc"

class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    per_page: int
    total_pages: int
    has_next: bool
    has_prev: bool

class JobResponse(BaseModel):
    job_id: str
    status: Literal["queued", "processing", "completed", "failed"]
    progress: int  # 0-100
    step: Optional[str]
    result: Optional[Any]
    error: Optional[str]
    created_at: datetime
    updated_at: datetime

class ErrorResponse(BaseModel):
    code: str
    message: str
    details: Optional[dict]
    request_id: str
```

### Brand Schemas

```python
# brand.py

class BrandCreateRequest(BaseModel):
    company_name: str = Field(..., min_length=1, max_length=100)
    industry: str = Field(..., max_length=100)
    description: str = Field(..., max_length=1000)
    target_audience: Optional[str]
    logo_url: Optional[HttpUrl]
    website: Optional[HttpUrl]
    org_id: Optional[UUID]

class BrandUpdateRequest(BaseModel):
    company_name: Optional[str]
    industry: Optional[str]
    description: Optional[str]
    target_audience: Optional[str]
    brand_kit: Optional[BrandKitSchema]

class BrandKitSchema(BaseModel):
    personality: Optional[str]
    positioning: Optional[str]
    tone_of_voice: Optional[str]
    target_audience: Optional[list[str]]
    visual_style: Optional[str]
    color_palette: Optional[ColorPaletteSchema]
    unique_value_proposition: Optional[str]
    brand_story: Optional[str]
    content_pillars: Optional[list[str]]

class ColorPaletteSchema(BaseModel):
    primary: Optional[str]
    secondary: Optional[str]
    accent: Optional[str]
    background: Optional[str]
    text: Optional[str]

class BrandResponse(BaseModel):
    id: int
    org_id: Optional[UUID]
    company_name: str
    industry: str
    description: str
    logo_url: Optional[str]
    brand_kit: Optional[BrandKitSchema]
    created_at: datetime
    updated_at: datetime
    stats: Optional[BrandStatsSchema]
```

### Campaign Schemas

```python
# campaign.py

class CampaignCreateRequest(BaseModel):
    brand_id: int
    name: str
    brief: str = Field(..., min_length=10, max_length=5000)
    platforms: list[PlatformEnum]
    duration_days: int = Field(..., ge=1, le=30)
    tone: Optional[str]
    objectives: Optional[list[str]]

class PlatformEnum(str, Enum):
    INSTAGRAM = "instagram"
    FACEBOOK = "facebook"
    TWITTER = "twitter"
    LINKEDIN = "linkedin"
    TIKTOK = "tiktok"
    YOUTUBE = "youtube"

class PostSchema(BaseModel):
    id: int
    campaign_id: int
    day: int
    platform: PlatformEnum
    content: str
    hashtags: Optional[list[str]]
    image_url: Optional[str]
    image_history: Optional[list[str]]
    image_prompt: Optional[str]
    scheduled_at: Optional[datetime]
    status: PostStatusEnum
```

---

## 4. Service Layer Design

### AI Orchestrator

```python
# services/ai/orchestrator.py

class AIOrchestrator:
    """
    المنسق المركزي لجميع عمليات AI.
    يختار المزود المناسب، يدير الـ fallback، ويتتبع التكاليف.
    """
    
    def __init__(self, provider_registry: ProviderRegistry, 
                 cost_tracker: CostTracker,
                 circuit_breaker: CircuitBreaker):
        self.providers = provider_registry
        self.costs = cost_tracker
        self.breaker = circuit_breaker
    
    async def generate_text(
        self,
        prompt: str,
        system: str,
        task_type: str,
        model_hint: Optional[str] = None,
        max_tokens: int = 2000,
        user_id: Optional[UUID] = None,
        org_id: Optional[UUID] = None,
    ) -> AITextResult:
        provider = self.providers.resolve_for_task(task_type, model_hint)
        
        async with self.breaker(provider.name):
            result = await provider.complete(
                prompt=prompt,
                system=system,
                max_tokens=max_tokens,
            )
        
        await self.costs.record(
            provider=provider.name,
            model=result.model,
            input_tokens=result.usage.input,
            output_tokens=result.usage.output,
            task_type=task_type,
            user_id=user_id,
            org_id=org_id,
        )
        return result
    
    async def generate_image(
        self,
        prompt: str,
        size: ImageSize,
        model: Optional[str] = None,
        references: Optional[list[bytes]] = None,
        user_id: Optional[UUID] = None,
        org_id: Optional[UUID] = None,
    ) -> bytes:
        ...
```

### Repository Pattern

```python
# repositories/base.py

class BaseRepository(Generic[ModelT, CreateSchemaT, UpdateSchemaT]):
    def __init__(self, session: AsyncSession, model: Type[ModelT]):
        self.session = session
        self.model = model
    
    async def get(self, id: Any) -> Optional[ModelT]:
        ...
    
    async def get_multi(
        self,
        *,
        skip: int = 0,
        limit: int = 20,
        filters: dict = None,
        order_by: str = "created_at",
    ) -> tuple[list[ModelT], int]:
        ...
    
    async def create(self, obj_in: CreateSchemaT) -> ModelT:
        ...
    
    async def update(self, id: Any, obj_in: UpdateSchemaT) -> ModelT:
        ...
    
    async def delete(self, id: Any) -> bool:
        ...

# repositories/brand_repository.py

class BrandRepository(BaseRepository[Brand, BrandCreate, BrandUpdate]):
    async def get_by_org(self, org_id: UUID) -> list[Brand]:
        ...
    
    async def get_with_stats(self, brand_id: int) -> BrandWithStats:
        ...
    
    async def search(self, query: str, org_id: UUID) -> list[Brand]:
        ...
```

---

## 5. Error Handling Strategy

```python
# core/exceptions.py

class AppException(Exception):
    """Base application exception"""
    status_code: int = 500
    code: str = "INTERNAL_ERROR"
    message: str = "An unexpected error occurred"

class NotFoundError(AppException):
    status_code = 404
    code = "NOT_FOUND"

class UnauthorizedError(AppException):
    status_code = 401
    code = "UNAUTHORIZED"

class ForbiddenError(AppException):
    status_code = 403
    code = "FORBIDDEN"

class ValidationError(AppException):
    status_code = 422
    code = "VALIDATION_ERROR"

class InsufficientCreditsError(AppException):
    status_code = 402
    code = "INSUFFICIENT_CREDITS"

class AIServiceError(AppException):
    status_code = 503
    code = "AI_SERVICE_UNAVAILABLE"

class RateLimitError(AppException):
    status_code = 429
    code = "RATE_LIMIT_EXCEEDED"

# Global exception handler
@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "code": exc.code,
            "message": exc.message,
            "request_id": request.state.request_id,
        }
    )
```

---

## 6. Dependency Injection (deps.py)

```python
# deps.py

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = verify_access_token(token)
    user = await UserRepository(db).get(payload.sub)
    if not user:
        raise UnauthorizedError()
    return user

async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_active:
        raise ForbiddenError("Account is inactive")
    return current_user

async def get_current_admin(
    current_user: User = Depends(get_current_active_user),
) -> User:
    if current_user.role != UserRole.ADMIN:
        raise ForbiddenError("Admin access required")
    return current_user

def require_permission(permission: str):
    async def _check(
        current_user: User = Depends(get_current_active_user),
        org_id: Optional[UUID] = None,
    ) -> User:
        if not await check_permission(current_user, org_id, permission):
            raise ForbiddenError(f"Permission '{permission}' required")
        return current_user
    return _check
```
