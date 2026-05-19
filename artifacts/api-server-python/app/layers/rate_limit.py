"""
Rate Limiting Layer — protects all API endpoints from abuse.

Strategy:
  - Auth endpoints (login, register): 10 requests / minute per IP  ← brute-force protection
  - AI generation endpoints: 20 requests / minute per IP           ← cost protection
  - General API: 120 requests / minute per IP                      ← DoS protection

Uses slowapi (built on `limits` library) with in-memory storage.

Extension points:
  - Replace InMemoryStorage with RedisStorage for multi-process deployments:
      from limits.storage import RedisStorage
      storage = RedisStorage("redis://localhost:6379")
      limiter = Limiter(key_func=get_remote_address, storage_uri="redis://localhost:6379")
  - Add user-based limits (exempt admins, higher limits for paid tiers):
      def get_user_key(request: Request) -> str:
          token = request.headers.get("Authorization", "")
          return token or get_remote_address(request)
"""
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
from fastapi.responses import JSONResponse

limiter = Limiter(key_func=get_remote_address)


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Return a clean 429 with a friendly message instead of slowapi's default."""
    return JSONResponse(
        status_code=429,
        content={
            "error": "Too many requests. Please slow down and try again shortly.",
            "retryAfter": str(exc.limit.limit),
        },
        headers={"Retry-After": "60"},
    )
