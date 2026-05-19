"""
Middleware package — all HTTP middleware for the FastAPI app.

Each middleware lives in its own module. Register them in main.py via:
    app.add_middleware(MyMiddleware, **options)

Starlette middleware order: the LAST added middleware runs OUTERMOST (first to
intercept the request). Design accordingly.

Current middleware (innermost → outermost):
  1. RequestLoggerMiddleware  — logs every request + response time
  2. SlowAPIMiddleware        — enforces rate limits
  3. CORSMiddleware           — handles cross-origin headers

To add new middleware:
  1. Create app/middleware/my_middleware.py with a class inheriting BaseHTTPMiddleware
  2. Import it here and re-export
  3. Register it in main.py
"""
from .logging import RequestLoggerMiddleware

__all__ = ["RequestLoggerMiddleware"]
