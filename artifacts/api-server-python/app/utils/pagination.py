"""
Pagination utilities for list endpoints.

Provides a consistent pagination interface across all list routes.
All list endpoints should use PaginationParams as a FastAPI Depends() to
ensure uniform query params (page, pageSize) and behaviour.

Usage in a route:
    from app.utils import paginate, PaginationParams
    from fastapi import Depends, Query

    @router.get("")
    def list_items(
        pagination: PaginationParams = Depends(),
        db: Session = Depends(get_db),
    ):
        query = db.query(Item).filter(...)
        items, total = paginate(query, pagination)
        return {"items": items, "total": total, "page": pagination.page}

Extension points:
  - Add cursor-based pagination for large tables: replace page/offset with cursor
  - Add sort_by / sort_dir params for dynamic ordering
  - Add search param here or in a separate SearchParams class
"""
from dataclasses import dataclass
from typing import Any, TypeVar

from fastapi import Query
from sqlalchemy.orm import Query as SAQuery

T = TypeVar("T")


@dataclass
class PaginationParams:
    """
    FastAPI-injectable pagination parameters.

    Query params:
      ?page=1        — 1-indexed page number (default: 1)
      ?pageSize=20   — items per page (default: 20, max: 200)
    """
    page: int = Query(1, ge=1, description="Page number (1-indexed)")
    page_size: int = Query(20, ge=1, le=200, alias="pageSize", description="Items per page")

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        return self.page_size


def paginate(query: SAQuery, params: PaginationParams) -> tuple[list[Any], int]:
    """
    Apply pagination to a SQLAlchemy query.

    Returns:
        (items, total_count) — items for the current page and total row count.

    Example:
        items, total = paginate(db.query(Brand).filter(...), pagination)
    """
    total: int = query.count()
    items: list[Any] = query.offset(params.offset).limit(params.limit).all()
    return items, total
