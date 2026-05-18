"""
Database engine and session management using SQLAlchemy (synchronous).

Extension points:
  - To switch to async: replace create_engine with create_async_engine
    and Session with AsyncSession. Update deps.py accordingly.
  - To add connection pooling tuning: adjust pool_size / max_overflow below.
  - To add read replicas: create a second engine pointing to replica URL.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session as SASession
from app.config import settings


def _make_engine():
    url = settings.database_url
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set. "
            "Provision a PostgreSQL database and set DATABASE_URL."
        )
    # Convert postgres:// to postgresql:// for SQLAlchemy 2.x
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    return create_engine(
        url,
        pool_pre_ping=True,   # detect stale connections
        pool_size=5,
        max_overflow=10,
        echo=False,           # set True to log SQL queries in development
    )


engine = _make_engine()

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
)


def get_db() -> SASession:
    """
    FastAPI dependency that yields a database session and closes it after the request.
    Usage:
        db: Session = Depends(get_db)
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
