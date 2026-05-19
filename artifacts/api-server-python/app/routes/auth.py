"""
Auth routes — register, login, logout, me.

Rate limits applied:
  - POST /register : 5 / minute per IP  — prevents automated account creation
  - POST /login    : 10 / minute per IP — brute-force protection
  - GET  /me       : 60 / minute per IP — light guard on token verification
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
import uuid

from app.database import get_db
from app.deps import get_current_user, auth_layer
from app.layers.credits import DEFAULT_USER_CREDITS
from app.layers.rate_limit import limiter
from app.models import User
from app.schemas import LoginRequest, RegisterRequest, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register")
@limiter.limit("5/minute")
def register(request: Request, body: RegisterRequest, response: Response, db: Session = Depends(get_db)):
    """
    Register a new user account.
    Returns {user, token}. First registered user is automatically admin.
    Rate limited: 5 registrations per minute per IP.
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
    return {"user": UserResponse.from_orm(user).model_dump(), "token": token}


@router.post("/login")
@limiter.limit("10/minute")
def login(request: Request, body: LoginRequest, response: Response, db: Session = Depends(get_db)):
    """
    Authenticate an existing user. Returns {user, token}.
    Rate limited: 10 attempts per minute per IP.
    """
    user = db.query(User).filter(User.email == body.email.lower().strip()).first()
    if not user or not auth_layer.verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        )
    token = auth_layer.create_token(user.id, user.email)
    auth_layer.set_cookie(response, token)
    return {"user": UserResponse.from_orm(user).model_dump(), "token": token}


@router.post("/logout")
def logout(response: Response):
    """Clear the auth cookie."""
    auth_layer.clear_cookie(response)
    return {"ok": True}


@router.get("/me")
@limiter.limit("60/minute")
def me(request: Request, current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user wrapped in {user}."""
    return {"user": UserResponse.from_orm(current_user).model_dump()}
