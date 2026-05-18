"""
Auth Layer — JWT cookie-based authentication.

This is a PLUGGABLE layer. To swap it out:
  1. Create a new class implementing the same interface (require_user, get_user_or_none,
     create_token, set_cookie, clear_cookie).
  2. Update app/deps.py to use the new class.
  Routes do NOT need to change.

Excluded / Future layers:
  - OAuth2 (Google, GitHub): add a new OAuth2AuthLayer
  - Clerk: add a ClerkAuthLayer that verifies Clerk JWTs
  - API Key auth: add ApiKeyAuthLayer for programmatic access
  - Magic link: add MagicLinkAuthLayer
  See EXCLUDED_FEATURES.md for documentation.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt as _bcrypt
from fastapi import HTTPException, Request, Response
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.models import User


class AuthTokenPayload:
    def __init__(self, user_id: str, email: str):
        self.user_id = user_id
        self.email = email


class AuthLayer:
    """
    JWT cookie-based auth layer.

    Tokens are stored in an httpOnly cookie named by settings.auth_cookie_name.

    Uses bcrypt directly (avoiding passlib compatibility issues with newer bcrypt versions).
    Passwords > 72 bytes are SHA-256 hashed first so bcrypt doesn't silently truncate them.
    """

    ALGORITHM = "HS256"

    # ── Password hashing ──────────────────────────────────────────────────────

    @staticmethod
    def _prepare(plain: str) -> bytes:
        """
        Pre-hash passwords > 72 bytes to prevent bcrypt's 72-byte truncation.
        Uses SHA-256 so any length password produces a safe 32-byte input.
        """
        raw = plain.encode("utf-8")
        if len(raw) > 72:
            import hashlib
            raw = hashlib.sha256(raw).digest()
        return raw

    def hash_password(self, plain: str) -> str:
        salt = _bcrypt.gensalt(rounds=10)
        hashed = _bcrypt.hashpw(self._prepare(plain), salt)
        return hashed.decode("utf-8")

    def verify_password(self, plain: str, hashed: str) -> bool:
        try:
            return _bcrypt.checkpw(self._prepare(plain), hashed.encode("utf-8"))
        except Exception:
            return False

    # ── Token creation ────────────────────────────────────────────────────────

    def create_token(self, user_id: str, email: str) -> str:
        expire = datetime.now(timezone.utc) + timedelta(days=settings.auth_token_ttl_days)
        payload = {
            "userId": str(user_id),   # always cast — DB may return UUID object
            "email": str(email),
            "exp": expire,
        }
        return jwt.encode(payload, settings.auth_jwt_secret, algorithm=self.ALGORITHM)

    def decode_token(self, token: str) -> AuthTokenPayload | None:
        try:
            payload = jwt.decode(token, settings.auth_jwt_secret, algorithms=[self.ALGORITHM])
            user_id = payload.get("userId")
            email = payload.get("email")
            if not user_id or not email:
                return None
            return AuthTokenPayload(user_id=user_id, email=email)
        except JWTError:
            return None

    # ── Cookie management ─────────────────────────────────────────────────────

    def set_cookie(self, response: Response, token: str) -> None:
        max_age = settings.auth_token_ttl_days * 24 * 60 * 60
        response.set_cookie(
            key=settings.auth_cookie_name,
            value=token,
            httponly=True,
            secure=settings.is_production,
            samesite="lax",
            path="/",
            max_age=max_age,
        )

    def clear_cookie(self, response: Response) -> None:
        response.delete_cookie(
            key=settings.auth_cookie_name,
            path="/",
            httponly=True,
            samesite="lax",
        )

    # ── Request extraction ────────────────────────────────────────────────────

    def _extract_token(self, request: Request) -> str | None:
        """Extract token from cookie or Authorization header (Bearer <token>)."""
        # 1. Cookie (primary)
        token = request.cookies.get(settings.auth_cookie_name)
        if token:
            return token
        # 2. Bearer header (for API key / programmatic access)
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            return auth_header[7:]
        return None

    def get_user_or_none(self, request: Request, db: Session) -> User | None:
        token = self._extract_token(request)
        if not token:
            return None
        payload = self.decode_token(token)
        if not payload:
            return None
        user = db.query(User).filter(User.id == payload.user_id).first()
        return user

    def require_user(self, request: Request, db: Session) -> User:
        user = self.get_user_or_none(request, db)
        if not user:
            raise HTTPException(
                status_code=401,
                detail="Authentication required",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return user
