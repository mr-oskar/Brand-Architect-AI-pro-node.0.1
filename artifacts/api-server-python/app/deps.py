"""
FastAPI dependency injection — the glue between layers and routes.

How to extend:
  - Add new dependencies here (e.g. require_subscription, require_feature_flag).
  - Swap auth layer: replace the import in get_current_user without touching routes.
  - Add rate limiting: wrap get_current_user with a rate-limit check.
"""
from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.layers.auth import AuthLayer, AuthTokenPayload
from app.models import User


auth_layer = AuthLayer()


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    """
    Dependency: extracts and validates the auth cookie, returns the current User.
    Raises HTTP 401 if the token is missing or invalid.

    To swap auth providers (e.g. Clerk JWT):
        1. Create a new layer in app/layers/clerk_auth.py implementing the same interface.
        2. Replace AuthLayer() above with ClerkAuthLayer().
        No routes need to change.
    """
    return auth_layer.require_user(request, db)


def get_optional_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User | None:
    """
    Dependency: returns the current user or None (for public endpoints that
    optionally personalize content when authenticated).
    """
    return auth_layer.get_user_or_none(request, db)


def get_current_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Dependency: ensures the current user has the 'admin' role.
    Raises HTTP 403 otherwise.
    """
    from fastapi import HTTPException
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
