"""
Request Logger Middleware — logs every HTTP request with method, path,
status code, and response time.

Implemented as a proper Starlette BaseHTTPMiddleware class so it can be
registered cleanly with app.add_middleware() rather than the @app.middleware
decorator pattern.

Extension points:
  - Add request IDs: generate uuid per request and attach to logging context
  - Add structured logging: emit JSON lines for log aggregation (Datadog, Loki)
  - Add slow-request alerting: log.warning() when elapsed > threshold
  - Add request body logging: read body for debug mode (be careful with large uploads)

Usage in main.py:
    from app.middleware.logging import RequestLoggerMiddleware
    app.add_middleware(RequestLoggerMiddleware)
"""
import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("brand-os.http")

# Paths to skip logging (health checks, static assets) — keeps logs clean
_SKIP_PATHS: frozenset[str] = frozenset({
    "/favicon.ico",
})


class RequestLoggerMiddleware(BaseHTTPMiddleware):
    """
    Logs every HTTP request in the format:
        METHOD /path → STATUS_CODE (Xms)

    Example:
        POST /api/auth/login → 200 (42.3ms)
        GET  /api/brands     → 401 (1.1ms)
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.url.path in _SKIP_PATHS:
            return await call_next(request)

        start = time.perf_counter()
        response: Response = await call_next(request)
        elapsed_ms = (time.perf_counter() - start) * 1000

        logger.info(
            "%-6s %s → %d (%.1fms)",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
        )
        return response
