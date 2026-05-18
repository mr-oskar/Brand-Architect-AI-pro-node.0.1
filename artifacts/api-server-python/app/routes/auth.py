"""
Auth routes — register, login, logout, me.

Extension points:
  - Add OAuth2 endpoints (GET /auth/google, GET /auth/github).
  - Add magic link: POST /auth/magic-link → send email, GET /auth/verify?token=...
  - Add email verification flow.
  - Add password reset flow.
  See app/layers/payments.py and EXCLUDED_FEATURES.md for more.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
import uuid

from app.database import get_db
from app.deps import get_current_user, auth_layer
from app.layers.credits import DEFAULT_USER_CREDITS
from app.models import User
from app.schemas import LoginRequest, RegisterRequest, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse)
def register(body: RegisterRequest, response: Response, db: Session = Depends(get_db)):
    """
    Register a new user account.

    First registered user is automatically promoted to 'admin'.
    New users receive DEFAULT_USER_CREDITS credits.
    """
    existing = db.query(User).filter(User.email == body.email.lower()).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    is_first_user = db.query(User).count() == 0
    user = User(
        id=str(uuid.uuid4()),
        email=body.email.lower().strip(),
        password_hash=auth_layer.hash_password(body.password),
        name=body.name.strip() if body.name else None,
        role="admin" if is_first_user else "user",
        credits=DEFAULT_USER_CREDITS,
    )
    try:
        db.add(user)
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered")

    token = auth_layer.create_token(user.id, user.email)
    auth_layer.set_cookie(response, token)
    return UserResponse.from_orm(user)


@router.post("/login", response_model=UserResponse)
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)):
    """Authenticate an existing user and set auth cookie."""
    user = db.query(User).filter(User.email == body.email.lower().strip()).first()
    if not user or not auth_layer.verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        )
    token = auth_layer.create_token(user.id, user.email)
    auth_layer.set_cookie(response, token)
    return UserResponse.from_orm(user)


@router.post("/logout")
def logout(response: Response):
    """Clear the auth cookie."""
    auth_layer.clear_cookie(response)
    return {"ok": True}


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return UserResponse.from_orm(current_user)
