"""
Brand Architect AI Pro — Python/FastAPI Backend (v2.1)

Entry point. All configuration lives in app/config.py.
All routes are mounted under /api/.

── Middleware stack (outermost → innermost) ──────────────────────────────────
  CORSMiddleware          — handles cross-origin headers (outermost, runs first)
  SlowAPIMiddleware       — enforces per-IP rate limits
  RequestLoggerMiddleware — logs every request + timing (innermost, runs last)

── To add a new feature module ───────────────────────────────────────────────
  1. Create app/routes/my_feature.py with an APIRouter
  2. Import it below and call app.include_router(my_feature.router, prefix="/api")
  3. Add Pydantic schemas to app/schemas.py
  4. Add business logic to app/services/my_feature.py

── To add new middleware ─────────────────────────────────────────────────────
  1. Create app/middleware/my_middleware.py (see app/middleware/logging.py as template)
  2. Import and register with app.add_middleware() in the Middleware section below
  3. Document it in app/middleware/__init__.py

── To run ────────────────────────────────────────────────────────────────────
  uvicorn main:app --host 0.0.0.0 --port 8080 --reload
"""
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
from app.layers.rate_limit import limiter, rate_limit_exceeded_handler
from app.middleware import RequestLoggerMiddleware
from app.routes import auth, brands, campaigns, posts, dashboard, system, admin

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("brand-os")

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Brand Architect AI Pro",
    description="AI Brand & Marketing OS — Python Backend",
    version="2.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# ── Rate Limiter state ────────────────────────────────────────────────────────

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# ── Middleware (add innermost first, outermost last) ──────────────────────────
#
# Starlette stacks middleware in reverse registration order:
#   last added = outermost (runs first on request)
#
# Request flow: CORS → SlowAPI → Logger → handler

app.add_middleware(RequestLoggerMiddleware)   # innermost: logs actual route timing
app.add_middleware(SlowAPIMiddleware)          # middle:    rate limit checks
app.add_middleware(                            # outermost: CORS headers
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Exception handlers ────────────────────────────────────────────────────────

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Return clean 400 errors for invalid request bodies."""
    errors = exc.errors()
    message = "; ".join(
        f"{' → '.join(str(loc) for loc in e['loc'])}: {e['msg']}"
        for e in errors
    )
    return JSONResponse(status_code=400, content={"error": message, "detail": errors})


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all handler — never leak stack traces in production."""
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    if settings.is_production:
        return JSONResponse(status_code=500, content={"error": "Internal server error"})
    return JSONResponse(status_code=500, content={"error": str(exc)})


# ── Routes ────────────────────────────────────────────────────────────────────

app.include_router(auth.router,       prefix="/api")
app.include_router(brands.router,     prefix="/api")
app.include_router(campaigns.router,  prefix="/api")
app.include_router(posts.router,      prefix="/api")
app.include_router(dashboard.router,  prefix="/api")
app.include_router(system.router,     prefix="/api")
app.include_router(admin.router,      prefix="/api")   # Admin-only management


# ── Root ──────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "name": "Brand Architect AI Pro",
        "version": "2.1.0",
        "docs": "/api/docs",
        "health": "/api/health",
    }


# ── Startup ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
def startup_event():
    logger.info("Brand Architect AI Pro (Python) starting up...")
    logger.info("✓ CORS origins: %s", settings.allowed_origins)

    try:
        from app.database import engine
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("✓ Database connected")
    except Exception as e:
        logger.error("✗ Database connection failed: %s", e)

    try:
        from app.services.ai.client import get_client
        get_client()
        logger.info("✓ AI provider configured")
    except RuntimeError as e:
        logger.warning("⚠ AI provider: %s", e)

    _ensure_seed_admin()

    logger.info("✓ Rate limiting active (slowapi)")
    logger.info("✓ Middleware: CORS → SlowAPI → RequestLogger")
    logger.info("✓ Admin routes: /api/admin/* (admin-only)")
    logger.info("✓ Server ready — listening on /api/*")


def _ensure_seed_admin():
    """
    Ensure the default admin account exists on every startup.
    Creates or upgrades to admin if missing — safe to run repeatedly.
    """
    import uuid
    from app.database import SessionLocal
    from app.models import User
    from app.layers.credits import DEFAULT_USER_CREDITS
    from app.deps import auth_layer

    SEED_EMAIL = "oskar1python@gmail.com"
    SEED_PASSWORD = "oskar2004#"
    SEED_NAME = "Oskar (Admin)"

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == SEED_EMAIL).first()
        if existing:
            if existing.role != "admin":
                existing.role = "admin"
                db.commit()
                logger.info("✓ Seed admin upgraded to admin role: %s", SEED_EMAIL)
            else:
                logger.info("✓ Seed admin already exists: %s", SEED_EMAIL)
        else:
            admin = User(
                id=str(uuid.uuid4()),
                email=SEED_EMAIL,
                password_hash=auth_layer.hash_password(SEED_PASSWORD),
                name=SEED_NAME,
                role="admin",
                credits=DEFAULT_USER_CREDITS,
            )
            db.add(admin)
            db.commit()
            logger.info("✓ Seed admin created: %s", SEED_EMAIL)
    except Exception as e:
        db.rollback()
        logger.error("✗ Seed admin creation failed: %s", e)
    finally:
        db.close()
