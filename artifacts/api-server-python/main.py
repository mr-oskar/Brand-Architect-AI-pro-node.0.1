"""
Brand Architect AI Pro — Python/FastAPI Backend (v2.0)

Entry point. All configuration is in app/config.py.
All routes are mounted under /api/.

To run:
    uvicorn main:app --host 0.0.0.0 --port 8080 --reload

Extension points:
  - Add new routers by importing and including them below.
  - Add middleware (rate limiting, request logging, etc.) in the middleware section.
  - For multi-process production: use gunicorn with uvicorn workers.
    See DEPLOYMENT.md for details.
"""
import logging
import time

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
from app.layers.rate_limit import limiter, rate_limit_exceeded_handler
from app.routes import auth, brands, campaigns, posts, dashboard, system

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
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# ── Rate Limiter state ────────────────────────────────────────────────────────

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# ── Middleware ────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_logger(request: Request, call_next):
    """Log every request with method, path, and response time."""
    start = time.perf_counter()
    response: Response = await call_next(request)
    elapsed = (time.perf_counter() - start) * 1000
    logger.info(
        "%s %s → %d (%.1fms)",
        request.method,
        request.url.path,
        response.status_code,
        elapsed,
    )
    return response


# ── Exception handlers ────────────────────────────────────────────────────────

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Return clean 400 errors for invalid request bodies."""
    errors = exc.errors()
    message = "; ".join(
        f"{' → '.join(str(l) for l in e['loc'])}: {e['msg']}"
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
#
# All routes are under /api/ prefix.
# To add a new feature module:
#   1. Create app/routes/my_feature.py with an APIRouter.
#   2. Import it here and call app.include_router(my_feature.router, prefix="/api").

app.include_router(auth.router,       prefix="/api")
app.include_router(brands.router,     prefix="/api")
app.include_router(campaigns.router,  prefix="/api")
app.include_router(posts.router,      prefix="/api")
app.include_router(dashboard.router,  prefix="/api")
app.include_router(system.router,     prefix="/api")


# ── Root ──────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "name": "Brand Architect AI Pro",
        "version": "2.0.0",
        "docs": "/api/docs",
        "health": "/api/health",
    }


# ── Startup ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
def startup_event():
    logger.info("Brand Architect AI Pro (Python) starting up...")

    # Log CORS origins for visibility
    logger.info("✓ CORS allowed origins: %s", settings.allowed_origins)

    # Validate DB connection on startup
    try:
        from app.database import engine
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("✓ Database connected")
    except Exception as e:
        logger.error("✗ Database connection failed: %s", e)

    # Warn about missing AI provider (don't crash — let routes return 503)
    try:
        from app.services.ai.client import get_client
        get_client()
        logger.info("✓ AI provider configured")
    except RuntimeError as e:
        logger.warning("⚠ AI provider: %s", e)

    logger.info("✓ Rate limiting active (slowapi)")
    logger.info("✓ Server ready — listening on /api/*")
