"""
Auth routes — register, login, logout, me.
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


@router.post("/register")
def register(body: RegisterRequest, response: Response, db: Session = Depends(get_db)):
    """
    Register a new user account.
    Returns {user, token}. First registered user is automatically admin.
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
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)):
    """Authenticate an existing user. Returns {user, token}."""
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
def me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user wrapped in {user}."""
    return {"user": UserResponse.from_orm(current_user).model_dump()}
