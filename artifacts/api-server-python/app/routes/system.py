"""
System routes — health check, public settings, job status, image storage.

Extension points:
  - Add /api/system/metrics for Prometheus-compatible metrics.
  - Add /api/system/version for build info.
  - Add /api/admin/* for admin-only management (settings, user list, credit management).
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, get_optional_user
from app.layers.credits import DEFAULT_CREDIT_COSTS, DEFAULT_USER_CREDITS
from app.models import AppSetting, User
from app.services.image_storage import get_stored_image
from app.services.job_store import job_store

router = APIRouter(tags=["system"])


# ── Health check ──────────────────────────────────────────────────────────────

@router.get("/health")
def health_check(db: Session = Depends(get_db)):
    """
    Health check endpoint — verifies the server and DB are responsive.
    Used by Replit and load balancers to determine service health.
    """
    try:
        db.execute(__import__("sqlalchemy").text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    from app.services.ai.client import get_client
    try:
        get_client()
        ai_ok = True
        ai_error = None
    except RuntimeError as e:
        ai_ok = False
        ai_error = str(e)

    return {
        "status": "ok" if db_ok else "degraded",
        "database": "connected" if db_ok else "error",
        "ai": "configured" if ai_ok else "not configured",
        "aiError": ai_error,
        "version": "2.0.0-python",
    }


# ── Public settings ───────────────────────────────────────────────────────────

@router.get("/public-settings")
def get_public_settings(db: Session = Depends(get_db)):
    """
    Return publicly accessible settings (site branding, features, maintenance mode).
    Does NOT require authentication.
    """
    rows = db.query(AppSetting).filter(
        AppSetting.key.in_(["site", "features", "maintenance"])
    ).all()
    settings_map = {r.key: r.value for r in rows}

    site = settings_map.get("site") or {}
    features = settings_map.get("features") or {}
    maintenance = settings_map.get("maintenance") or {}

    return {
        "siteName": site.get("siteName", "Brand Architect AI Pro"),
        "tagline": site.get("tagline", "AI Brand & Marketing OS"),
        "primaryColor": site.get("primaryColor", "#7c3aed"),
        "defaultLanguage": site.get("defaultLanguage", "ar"),
        "features": features,
        "maintenance": maintenance,
    }


# ── Jobs ─────────────────────────────────────────────────────────────────────

@router.get("/jobs/{job_id}")
def get_job_status(
    job_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Poll the status of a long-running background job.
    Status values: pending | running | done | failed
    """
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.user_id and job.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return {
        "id": job.id,
        "status": job.status,
        "progress": job.progress,
        "total": job.total,
        "result": job.result,
        "error": job.error,
    }


# ── Image storage ─────────────────────────────────────────────────────────────

@router.get("/storage/images/objects/uploads/{object_id}")
def serve_image(object_id: str):
    """
    Serve a stored image by its UUID.
    Security: only UUID-shaped IDs are accepted (prevents path traversal).
    """
    import re
    UUID_RE = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
    if not re.match(UUID_RE, object_id, re.IGNORECASE):
        raise HTTPException(status_code=400, detail="Invalid image ID")

    result = get_stored_image(f"/objects/uploads/{object_id}")
    if not result:
        raise HTTPException(status_code=404, detail="Image not found")

    data, content_type = result
    return Response(
        content=data,
        media_type=content_type,
        headers={
            "Cache-Control": "public, max-age=86400",
            "Content-Length": str(len(data)),
        },
    )


# ── Credit costs (public) ─────────────────────────────────────────────────────

@router.get("/credit-costs")
def get_credit_costs(db: Session = Depends(get_db)):
    """
    Return the current credit costs per action.
    Useful for displaying cost info in the UI before triggering operations.
    """
    rows = db.query(AppSetting).filter(AppSetting.key == "creditCosts").all()
    custom = (rows[0].value or {}) if rows else {}
    return {**DEFAULT_CREDIT_COSTS, **custom}
