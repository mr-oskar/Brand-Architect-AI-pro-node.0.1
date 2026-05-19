"""
Utils package — shared, stateless helper functions used across routes and services.

Each utility lives in its own module by concern:
  - pagination.py  → paginate() for list endpoints
  - ownership.py   → get_owned_or_404() for resource ownership checks
  - ai_errors.py   → handle_ai_error() for uniform AI exception handling

To add a new utility:
  1. Create app/utils/my_util.py with pure functions (no FastAPI/SQLAlchemy state)
  2. Import and re-export it here
  3. Import from app.utils in any route or service that needs it
"""
from .pagination import paginate, PaginationParams
from .ownership import get_owned_brand, get_owned_post, get_owned_campaign
from .ai_errors import handle_ai_error

__all__ = [
    "paginate",
    "PaginationParams",
    "get_owned_brand",
    "get_owned_post",
    "get_owned_campaign",
    "handle_ai_error",
]
