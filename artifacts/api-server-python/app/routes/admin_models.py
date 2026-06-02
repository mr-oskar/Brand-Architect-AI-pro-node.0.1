"""
Admin AI Model Management + Public Model Discovery

Admin routes  (require admin role):
  GET    /admin/models/providers                   — list providers
  POST   /admin/models/providers                   — create provider
  PATCH  /admin/models/providers/{id}              — update provider
  DELETE /admin/models/providers/{id}              — delete provider
  POST   /admin/models/providers/{id}/test         — test connection
  POST   /admin/models/providers/{id}/fetch-models — import models from API

  GET    /admin/models                             — list all models
  PATCH  /admin/models/{id}                        — update model
  DELETE /admin/models/{id}                        — delete model

  GET    /admin/plans                              — list plans
  POST   /admin/plans                              — create plan
  PATCH  /admin/plans/{id}                         — update plan
  DELETE /admin/plans/{id}                         — delete plan
  GET    /admin/plans/{id}/models                  — get plan model permissions
  PUT    /admin/plans/{id}/models                  — set plan model permissions

  GET    /admin/models/logs                        — usage logs (paginated)
  GET    /admin/models/stats                       — usage statistics

Public routes (any authenticated user):
  GET    /ai/models?capability=image|text          — available models for current user
"""
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin, get_current_user
from app.models import AIProvider, AIModel, AIPlan, AIPlanModel, AIUsageLog, User

logger = logging.getLogger("brand-os.routes.admin-models")

# ── Routers ────────────────────────────────────────────────────────────────────

admin_router  = APIRouter(prefix="/admin/models", tags=["admin-ai-models"])
public_router = APIRouter(prefix="/ai",           tags=["ai"])


# ── Model capability detection ─────────────────────────────────────────────────

_IMAGE_MODEL_PATTERNS = [
    "dall-e", "gpt-image", "imagen", "-image-", "image-generation",
    "image-generate", "stable-diffusion", "flux", "midjourney",
]

def _detect_capability(model_id: str) -> str:
    ml = model_id.lower()
    if any(p in ml for p in _IMAGE_MODEL_PATTERNS):
        return "image"
    return "text"


def _nice_model_name(model_id: str) -> str:
    """Convert 'gpt-4o-mini' → 'GPT-4o Mini' etc."""
    parts = model_id.replace("-", " ").replace(".", " ").title()
    for old, new in [("Gpt ", "GPT "), ("Dall ", "DALL-"), ("E-", "E-"), ("Ai ", "AI ")]:
        parts = parts.replace(old, new)
    return parts


# ═══════════════════════════════════════════════════════════════════════════════
# PROVIDER ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@admin_router.get("/providers")
def list_providers(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    rows = db.query(AIProvider).order_by(AIProvider.priority, AIProvider.name).all()
    result = []
    for p in rows:
        model_count = db.query(AIModel).filter(AIModel.provider_id == p.id).count()
        result.append({
            "id": p.id,
            "name": p.name,
            "providerType": p.provider_type,
            "enabled": p.enabled,
            "priority": p.priority,
            "hasApiKey": bool(p.api_key),
            "baseUrl": p.base_url,
            "modelCount": model_count,
            "createdAt": p.created_at.isoformat() if p.created_at else None,
            "updatedAt": p.updated_at.isoformat() if p.updated_at else None,
        })
    return result


@admin_router.post("/providers", status_code=201)
def create_provider(
    body: dict,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    name          = (body.get("name") or "").strip()
    provider_type = (body.get("providerType") or "openai").lower()
    api_key       = (body.get("apiKey") or "").strip() or None
    base_url      = (body.get("baseUrl") or "").strip() or None
    priority      = int(body.get("priority") or 100)
    enabled       = bool(body.get("enabled", True))

    if not name:
        raise HTTPException(400, "Provider name is required")
    if provider_type not in ("openai", "gemini", "custom"):
        raise HTTPException(400, "providerType must be 'openai', 'gemini', or 'custom'")
    if provider_type == "custom" and not base_url:
        raise HTTPException(400, "Custom providers require a baseUrl")

    row = AIProvider(
        id=str(uuid.uuid4()),
        name=name,
        provider_type=provider_type,
        api_key=api_key,
        base_url=base_url,
        enabled=enabled,
        priority=priority,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    _invalidate()

    # Sync legacy api_key_store for backward compat
    _sync_legacy_key_store(db, provider_type, api_key, base_url)

    return {
        "id": row.id,
        "name": row.name,
        "providerType": row.provider_type,
        "enabled": row.enabled,
        "priority": row.priority,
        "hasApiKey": bool(row.api_key),
        "baseUrl": row.base_url,
        "modelCount": 0,
    }


@admin_router.patch("/providers/{provider_id}")
def update_provider(
    provider_id: str,
    body: dict,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    row = db.query(AIProvider).filter(AIProvider.id == provider_id).first()
    if not row:
        raise HTTPException(404, "Provider not found")

    if "name" in body:
        row.name = (body["name"] or "").strip() or row.name
    if "providerType" in body:
        pt = (body["providerType"] or "openai").lower()
        if pt not in ("openai", "gemini", "custom"):
            raise HTTPException(400, "Invalid providerType")
        row.provider_type = pt
    if "apiKey" in body:
        row.api_key = (body["apiKey"] or "").strip() or None
    if "baseUrl" in body:
        row.base_url = (body["baseUrl"] or "").strip() or None
    if "priority" in body:
        row.priority = int(body["priority"] or 100)
    if "enabled" in body:
        row.enabled = bool(body["enabled"])

    db.commit()
    db.refresh(row)
    _invalidate()
    _sync_legacy_key_store(db, row.provider_type, row.api_key, row.base_url)

    model_count = db.query(AIModel).filter(AIModel.provider_id == row.id).count()
    return {
        "id": row.id,
        "name": row.name,
        "providerType": row.provider_type,
        "enabled": row.enabled,
        "priority": row.priority,
        "hasApiKey": bool(row.api_key),
        "baseUrl": row.base_url,
        "modelCount": model_count,
    }


@admin_router.delete("/providers/{provider_id}", status_code=204)
def delete_provider(
    provider_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    row = db.query(AIProvider).filter(AIProvider.id == provider_id).first()
    if not row:
        raise HTTPException(404, "Provider not found")
    db.delete(row)
    db.commit()
    _invalidate()


@admin_router.post("/providers/{provider_id}/test")
def test_provider(
    provider_id: str,
    body: dict = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    body = body or {}
    row = db.query(AIProvider).filter(AIProvider.id == provider_id).first()
    if not row:
        raise HTTPException(404, "Provider not found")
    if not row.api_key:
        raise HTTPException(400, "Provider has no API key configured")

    try:
        from app.ai.providers import build_provider
        provider = build_provider(row)
        test_model = (body.get("modelId") or "").strip() or None
        result = provider.test(test_model)
        return {"success": True, **result}
    except PermissionError as e:
        return {"success": False, "message": str(e)}
    except Exception as e:
        return {"success": False, "message": str(e)}


@admin_router.post("/providers/{provider_id}/fetch-models")
def fetch_provider_models(
    provider_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """
    Fetch the list of available models from the provider's API and import
    any new ones into ai_models.  Existing models are NOT deleted.
    Returns a summary of what was imported.
    """
    row = db.query(AIProvider).filter(AIProvider.id == provider_id).first()
    if not row:
        raise HTTPException(404, "Provider not found")

    try:
        fetched_ids = _fetch_model_ids(row)
    except Exception as e:
        raise HTTPException(502, f"Failed to fetch models from provider: {e}")

    existing_ids = {
        m.model_id
        for m in db.query(AIModel.model_id).filter(AIModel.provider_id == provider_id).all()
    }

    imported = []
    skipped  = []
    for model_id in fetched_ids:
        if model_id in existing_ids:
            skipped.append(model_id)
            continue
        cap = _detect_capability(model_id)
        new_model = AIModel(
            id=str(uuid.uuid4()),
            provider_id=provider_id,
            model_id=model_id,
            name=_nice_model_name(model_id),
            capability=cap,
            enabled=False,  # admin must explicitly enable models
            is_default=False,
            priority=100,
            credit_cost=1 if cap == "text" else 10,
        )
        db.add(new_model)
        imported.append({"modelId": model_id, "name": new_model.name, "capability": cap})

    db.commit()
    _invalidate()

    return {
        "imported": imported,
        "skipped": skipped,
        "total": len(imported),
        "message": f"Imported {len(imported)} new model(s). {len(skipped)} already existed.",
    }


# ═══════════════════════════════════════════════════════════════════════════════
# MODEL ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@admin_router.get("")
def list_models(
    capability: Optional[str] = Query(None),
    provider_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    q = db.query(AIModel)
    if capability:
        q = q.filter(AIModel.capability == capability)
    if provider_id:
        q = q.filter(AIModel.provider_id == provider_id)
    rows = q.order_by(AIModel.priority, AIModel.name).all()

    providers_map = {
        p.id: p
        for p in db.query(AIProvider).filter(AIProvider.id.in_([r.provider_id for r in rows])).all()
    }

    result = []
    for m in rows:
        prov = providers_map.get(m.provider_id)
        result.append({
            "id": m.id,
            "providerId": m.provider_id,
            "providerName": prov.name if prov else "Unknown",
            "providerType": prov.provider_type if prov else "openai",
            "providerEnabled": prov.enabled if prov else False,
            "modelId": m.model_id,
            "name": m.name or m.model_id,
            "description": m.description,
            "capability": m.capability,
            "enabled": m.enabled,
            "isDefault": m.is_default,
            "priority": m.priority,
            "creditCost": m.credit_cost,
            "createdAt": m.created_at.isoformat() if m.created_at else None,
            "updatedAt": m.updated_at.isoformat() if m.updated_at else None,
        })
    return result


@admin_router.patch("/{model_id}")
def update_model(
    model_id: str,
    body: dict,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    row = db.query(AIModel).filter(AIModel.id == model_id).first()
    if not row:
        raise HTTPException(404, "Model not found")

    if "name" in body:
        row.name = (body["name"] or "").strip() or row.name
    if "description" in body:
        row.description = body["description"]
    if "enabled" in body:
        row.enabled = bool(body["enabled"])
    if "isDefault" in body and body["isDefault"]:
        # Unset other defaults for same capability
        db.query(AIModel).filter(
            AIModel.capability == row.capability,
            AIModel.is_default == True,
            AIModel.id != row.id,
        ).update({"is_default": False})
        row.is_default = True
    elif "isDefault" in body:
        row.is_default = False
    if "priority" in body:
        row.priority = int(body["priority"] or 100)
    if "creditCost" in body:
        row.credit_cost = max(0, int(body["creditCost"] or 0))
    if "capability" in body and body["capability"] in ("text", "image"):
        row.capability = body["capability"]

    db.commit()
    db.refresh(row)
    _invalidate()

    prov = db.query(AIProvider).filter(AIProvider.id == row.provider_id).first()
    return {
        "id": row.id,
        "providerId": row.provider_id,
        "providerName": prov.name if prov else "Unknown",
        "providerType": prov.provider_type if prov else "openai",
        "modelId": row.model_id,
        "name": row.name,
        "description": row.description,
        "capability": row.capability,
        "enabled": row.enabled,
        "isDefault": row.is_default,
        "priority": row.priority,
        "creditCost": row.credit_cost,
    }


@admin_router.delete("/{model_id}", status_code=204)
def delete_model(
    model_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    row = db.query(AIModel).filter(AIModel.id == model_id).first()
    if not row:
        raise HTTPException(404, "Model not found")
    db.delete(row)
    db.commit()
    _invalidate()


# ═══════════════════════════════════════════════════════════════════════════════
# PLAN ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@admin_router.get("/plans")
def list_plans(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    rows = db.query(AIPlan).order_by(AIPlan.name).all()
    result = []
    for p in rows:
        model_count = db.query(AIPlanModel).filter(AIPlanModel.plan_id == p.id, AIPlanModel.allowed == True).count()
        result.append({
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "isDefault": p.is_default,
            "monthlyCredits": p.monthly_credits,
            "allowedModelCount": model_count,
            "createdAt": p.created_at.isoformat() if p.created_at else None,
        })
    return result


@admin_router.post("/plans", status_code=201)
def create_plan(
    body: dict,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    name    = (body.get("name") or "").strip()
    desc    = (body.get("description") or "").strip() or None
    is_def  = bool(body.get("isDefault", False))
    credits = int(body.get("monthlyCredits") or 0)

    if not name:
        raise HTTPException(400, "Plan name is required")

    if is_def:
        db.query(AIPlan).filter(AIPlan.is_default == True).update({"is_default": False})

    row = AIPlan(
        id=str(uuid.uuid4()),
        name=name,
        description=desc,
        is_default=is_def,
        monthly_credits=credits,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "name": row.name, "description": row.description,
            "isDefault": row.is_default, "monthlyCredits": row.monthly_credits, "allowedModelCount": 0}


@admin_router.patch("/plans/{plan_id}")
def update_plan(
    plan_id: str,
    body: dict,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    row = db.query(AIPlan).filter(AIPlan.id == plan_id).first()
    if not row:
        raise HTTPException(404, "Plan not found")

    if "name" in body:
        row.name = (body["name"] or "").strip() or row.name
    if "description" in body:
        row.description = body["description"]
    if "monthlyCredits" in body:
        row.monthly_credits = int(body["monthlyCredits"] or 0)
    if "isDefault" in body and body["isDefault"]:
        db.query(AIPlan).filter(AIPlan.is_default == True, AIPlan.id != plan_id).update({"is_default": False})
        row.is_default = True
    elif "isDefault" in body:
        row.is_default = False

    db.commit()
    db.refresh(row)
    count = db.query(AIPlanModel).filter(AIPlanModel.plan_id == plan_id, AIPlanModel.allowed == True).count()
    return {"id": row.id, "name": row.name, "description": row.description,
            "isDefault": row.is_default, "monthlyCredits": row.monthly_credits, "allowedModelCount": count}


@admin_router.delete("/plans/{plan_id}", status_code=204)
def delete_plan(
    plan_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    row = db.query(AIPlan).filter(AIPlan.id == plan_id).first()
    if not row:
        raise HTTPException(404, "Plan not found")
    db.delete(row)
    db.commit()


@admin_router.get("/plans/{plan_id}/models")
def get_plan_models(
    plan_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    plan = db.query(AIPlan).filter(AIPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(404, "Plan not found")

    all_models = db.query(AIModel).order_by(AIModel.capability, AIModel.priority).all()
    links_map  = {
        lk.model_id: lk
        for lk in db.query(AIPlanModel).filter(AIPlanModel.plan_id == plan_id).all()
    }
    providers_map = {
        p.id: p
        for p in db.query(AIProvider).filter(AIProvider.id.in_([m.provider_id for m in all_models])).all()
    }

    result = []
    for m in all_models:
        link = links_map.get(m.id)
        prov = providers_map.get(m.provider_id)
        result.append({
            "modelDbId": m.id,
            "modelId": m.model_id,
            "modelName": m.name or m.model_id,
            "capability": m.capability,
            "providerName": prov.name if prov else "Unknown",
            "creditCost": m.credit_cost,
            "allowed": link.allowed if link else False,
            "creditCostOverride": link.credit_cost_override if link else None,
        })
    return {"planId": plan_id, "planName": plan.name, "models": result}


@admin_router.put("/plans/{plan_id}/models")
def set_plan_models(
    plan_id: str,
    body: dict,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """
    Batch-set model permissions for a plan.
    Body: { models: [{ modelDbId, allowed, creditCostOverride? }] }
    """
    plan = db.query(AIPlan).filter(AIPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(404, "Plan not found")

    models_input = body.get("models") or []
    db.query(AIPlanModel).filter(AIPlanModel.plan_id == plan_id).delete()

    for item in models_input:
        model_db_id = item.get("modelDbId")
        if not model_db_id:
            continue
        link = AIPlanModel(
            plan_id=plan_id,
            model_id=model_db_id,
            allowed=bool(item.get("allowed", True)),
            credit_cost_override=item.get("creditCostOverride"),
        )
        db.add(link)

    db.commit()
    return {"success": True, "updated": len(models_input)}


# ═══════════════════════════════════════════════════════════════════════════════
# USAGE LOGS + STATS
# ═══════════════════════════════════════════════════════════════════════════════

@admin_router.get("/logs")
def get_usage_logs(
    capability: Optional[str] = Query(None),
    success: Optional[bool]   = Query(None),
    user_id: Optional[str]    = Query(None),
    task_type: Optional[str]  = Query(None),
    limit: int                = Query(50, ge=1, le=500),
    offset: int               = Query(0, ge=0),
    db: Session               = Depends(get_db),
    _: User                   = Depends(get_current_admin),
):
    q = db.query(AIUsageLog)
    if capability:
        q = q.filter(AIUsageLog.capability == capability)
    if success is not None:
        q = q.filter(AIUsageLog.success == success)
    if user_id:
        q = q.filter(AIUsageLog.user_id == user_id)
    if task_type:
        q = q.filter(AIUsageLog.task_type == task_type)

    total = q.count()
    rows  = q.order_by(AIUsageLog.created_at.desc()).offset(offset).limit(limit).all()

    items = [{
        "id": r.id,
        "userId": r.user_id,
        "providerName": r.provider_name,
        "modelName": r.model_name,
        "modelApiId": r.model_api_id,
        "capability": r.capability,
        "success": r.success,
        "errorMessage": r.error_message,
        "creditsCharged": r.credits_charged,
        "latencyMs": r.latency_ms,
        "isFallback": r.is_fallback,
        "originalModelApiId": r.original_model_api_id,
        "inputTokens": r.input_tokens,
        "outputTokens": r.output_tokens,
        "totalTokens": r.total_tokens,
        "monetaryCost": r.monetary_cost,
        "taskType": r.task_type,
        "createdAt": r.created_at.isoformat() if r.created_at else None,
    } for r in rows]

    return {"total": total, "items": items, "limit": limit, "offset": offset}


@admin_router.get("/stats")
def get_usage_stats(
    db: Session = Depends(get_db),
    _: User     = Depends(get_current_admin),
):
    from sqlalchemy import func

    total   = db.query(AIUsageLog).count()
    success = db.query(AIUsageLog).filter(AIUsageLog.success == True).count()
    fail    = total - success

    by_cap = db.query(AIUsageLog.capability, func.count()).group_by(AIUsageLog.capability).all()
    by_mod = (
        db.query(AIUsageLog.model_name, AIUsageLog.model_api_id, func.count())
        .group_by(AIUsageLog.model_name, AIUsageLog.model_api_id)
        .order_by(func.count().desc())
        .limit(10)
        .all()
    )
    avg_latency = db.query(func.avg(AIUsageLog.latency_ms)).filter(
        AIUsageLog.success == True, AIUsageLog.latency_ms.isnot(None)
    ).scalar()

    # Token + cost totals
    token_cost_row = db.query(
        func.coalesce(func.sum(AIUsageLog.total_tokens),  0),
        func.coalesce(func.sum(AIUsageLog.input_tokens),  0),
        func.coalesce(func.sum(AIUsageLog.output_tokens), 0),
        func.coalesce(func.sum(AIUsageLog.monetary_cost), 0.0),
    ).filter(AIUsageLog.success == True).first()

    total_tokens, input_tokens, output_tokens, total_cost = (
        (int(token_cost_row[0] or 0),
         int(token_cost_row[1] or 0),
         int(token_cost_row[2] or 0),
         float(token_cost_row[3] or 0.0))
        if token_cost_row else (0, 0, 0, 0.0)
    )

    return {
        "total": total,
        "success": success,
        "failed": fail,
        "successRate": round(success / total * 100, 1) if total else 0,
        "avgLatencyMs": round(float(avg_latency), 0) if avg_latency else None,
        "byCapability": [{"capability": c, "count": n} for c, n in by_cap],
        "topModels": [{"modelName": name, "modelApiId": api_id, "count": cnt} for name, api_id, cnt in by_mod],
        "totalTokens": total_tokens,
        "inputTokens": input_tokens,
        "outputTokens": output_tokens,
        "totalCostUsd": round(total_cost, 6),
    }


@admin_router.get("/cost-report")
def get_cost_report(
    period:     str           = Query("30d", description="Time window: 1d|7d|30d|90d|all"),
    group_by:   str           = Query("model",  description="Group by: model|task|day|user"),
    db: Session               = Depends(get_db),
    _: User                   = Depends(get_current_admin),
):
    """
    Aggregated token-cost report.

    period  : 1d | 7d | 30d | 90d | all
    group_by: model | task | day | user
    """
    from sqlalchemy import func, case
    from datetime import datetime, timezone, timedelta

    # ── Period filter ─────────────────────────────────────────────────────────
    now = datetime.now(timezone.utc)
    period_days = {"1d": 1, "7d": 7, "30d": 30, "90d": 90, "all": None}
    days = period_days.get(period, 30)
    q = db.query(AIUsageLog).filter(AIUsageLog.success == True)
    if days is not None:
        since = now - timedelta(days=days)
        q = q.filter(AIUsageLog.created_at >= since)

    # ── Summary totals ────────────────────────────────────────────────────────
    summary = q.with_entities(
        func.count().label("calls"),
        func.coalesce(func.sum(AIUsageLog.total_tokens),  0).label("total_tokens"),
        func.coalesce(func.sum(AIUsageLog.input_tokens),  0).label("input_tokens"),
        func.coalesce(func.sum(AIUsageLog.output_tokens), 0).label("output_tokens"),
        func.coalesce(func.sum(AIUsageLog.monetary_cost), 0.0).label("total_cost"),
        func.coalesce(func.avg(AIUsageLog.latency_ms), 0).label("avg_latency"),
    ).first()

    summary_dict = {
        "calls":         int(summary.calls       or 0),
        "totalTokens":   int(summary.total_tokens or 0),
        "inputTokens":   int(summary.input_tokens or 0),
        "outputTokens":  int(summary.output_tokens or 0),
        "totalCostUsd":  round(float(summary.total_cost or 0.0), 6),
        "avgLatencyMs":  round(float(summary.avg_latency or 0), 0),
    }

    # ── Grouped breakdown ────────────────────────────────────────────────────
    breakdown = []

    if group_by == "model":
        rows = q.with_entities(
            func.coalesce(AIUsageLog.model_api_id, "unknown").label("key"),
            func.count().label("calls"),
            func.coalesce(func.sum(AIUsageLog.total_tokens),  0).label("tokens"),
            func.coalesce(func.sum(AIUsageLog.monetary_cost), 0.0).label("cost"),
        ).group_by(AIUsageLog.model_api_id).order_by(func.sum(AIUsageLog.monetary_cost).desc().nullslast()).limit(20).all()
        breakdown = [{"label": r.key, "calls": int(r.calls), "tokens": int(r.tokens), "costUsd": round(float(r.cost or 0), 6)} for r in rows]

    elif group_by == "task":
        rows = q.with_entities(
            func.coalesce(AIUsageLog.task_type, "unknown").label("key"),
            func.count().label("calls"),
            func.coalesce(func.sum(AIUsageLog.total_tokens),  0).label("tokens"),
            func.coalesce(func.sum(AIUsageLog.monetary_cost), 0.0).label("cost"),
        ).group_by(AIUsageLog.task_type).order_by(func.sum(AIUsageLog.monetary_cost).desc().nullslast()).all()
        breakdown = [{"label": r.key, "calls": int(r.calls), "tokens": int(r.tokens), "costUsd": round(float(r.cost or 0), 6)} for r in rows]

    elif group_by == "day":
        rows = q.with_entities(
            func.date_trunc("day", AIUsageLog.created_at).label("key"),
            func.count().label("calls"),
            func.coalesce(func.sum(AIUsageLog.total_tokens),  0).label("tokens"),
            func.coalesce(func.sum(AIUsageLog.monetary_cost), 0.0).label("cost"),
        ).group_by(func.date_trunc("day", AIUsageLog.created_at)).order_by(func.date_trunc("day", AIUsageLog.created_at)).all()
        breakdown = [{"label": str(r.key)[:10] if r.key else "unknown", "calls": int(r.calls), "tokens": int(r.tokens), "costUsd": round(float(r.cost or 0), 6)} for r in rows]

    elif group_by == "user":
        rows = q.with_entities(
            func.coalesce(AIUsageLog.user_id, "anonymous").label("key"),
            func.count().label("calls"),
            func.coalesce(func.sum(AIUsageLog.total_tokens),  0).label("tokens"),
            func.coalesce(func.sum(AIUsageLog.monetary_cost), 0.0).label("cost"),
        ).group_by(AIUsageLog.user_id).order_by(func.sum(AIUsageLog.monetary_cost).desc().nullslast()).limit(50).all()
        breakdown = [{"label": r.key, "calls": int(r.calls), "tokens": int(r.tokens), "costUsd": round(float(r.cost or 0), 6)} for r in rows]

    return {
        "period": period,
        "groupBy": group_by,
        "summary": summary_dict,
        "breakdown": breakdown,
    }


@admin_router.get("/health")
def get_api_health(
    period: str   = Query("24h", description="Time window: 1h|24h|7d|30d"),
    db: Session   = Depends(get_db),
    _: User       = Depends(get_current_admin),
):
    """
    API health metrics: success rate, latency percentiles, error distribution, model performance.
    """
    from sqlalchemy import func, case
    from datetime import datetime, timezone, timedelta

    now = datetime.now(timezone.utc)
    period_hours = {"1h": 1, "24h": 24, "7d": 168, "30d": 720}
    hours = period_hours.get(period, 24)
    since = now - timedelta(hours=hours)

    q = db.query(AIUsageLog).filter(AIUsageLog.created_at >= since)

    total   = q.count()
    success = q.filter(AIUsageLog.success == True).count()
    failed  = total - success

    # Latency stats (successful calls only)
    latency_q = q.filter(AIUsageLog.success == True, AIUsageLog.latency_ms.isnot(None))
    latency_rows = latency_q.with_entities(AIUsageLog.latency_ms).all()
    latencies = sorted([r[0] for r in latency_rows if r[0] is not None])

    def _percentile(data: list, p: float) -> float | None:
        if not data:
            return None
        k = (len(data) - 1) * p
        f, c = int(k), min(int(k) + 1, len(data) - 1)
        return data[f] + (data[c] - data[f]) * (k - f)

    latency_stats = {
        "avg":  round(sum(latencies) / len(latencies), 0) if latencies else None,
        "p50":  _percentile(latencies, 0.50),
        "p90":  _percentile(latencies, 0.90),
        "p95":  _percentile(latencies, 0.95),
        "p99":  _percentile(latencies, 0.99),
        "min":  latencies[0]  if latencies else None,
        "max":  latencies[-1] if latencies else None,
    }

    # Error distribution
    error_rows = (
        db.query(AIUsageLog)
        .filter(AIUsageLog.created_at >= since, AIUsageLog.success == False, AIUsageLog.error_message.isnot(None))
        .with_entities(AIUsageLog.error_message, func.count().label("cnt"))
        .group_by(AIUsageLog.error_message)
        .order_by(func.count().desc())
        .limit(10)
        .all()
    )
    errors = [{"message": r[0][:120] if r[0] else "", "count": int(r[1])} for r in error_rows]

    # Per-model performance
    model_perf_rows = (
        q.with_entities(
            func.coalesce(AIUsageLog.model_api_id, "unknown").label("model"),
            func.count().label("total"),
            func.sum(case((AIUsageLog.success == True, 1), else_=0)).label("ok"),
            func.avg(
                case((AIUsageLog.success == True, AIUsageLog.latency_ms), else_=None)
            ).label("avg_lat"),
            func.coalesce(func.sum(AIUsageLog.total_tokens),  0).label("tokens"),
        )
        .group_by(AIUsageLog.model_api_id)
        .order_by(func.count().desc())
        .limit(15)
        .all()
    )
    model_perf = [
        {
            "model":       r.model,
            "total":       int(r.total),
            "success":     int(r.ok or 0),
            "failed":      int(r.total) - int(r.ok or 0),
            "successRate": round(int(r.ok or 0) / int(r.total) * 100, 1) if r.total else 0,
            "avgLatencyMs": round(float(r.avg_lat), 0) if r.avg_lat else None,
            "totalTokens": int(r.tokens),
        }
        for r in model_perf_rows
    ]

    # Hourly call volume (for sparkline)
    bucket_hours = 1 if hours <= 24 else (6 if hours <= 168 else 24)
    volume_rows = (
        q.with_entities(
            func.date_trunc(
                "hour" if bucket_hours == 1 else ("day" if bucket_hours == 24 else "hour"),
                AIUsageLog.created_at,
            ).label("bucket"),
            func.count().label("calls"),
            func.sum(case((AIUsageLog.success == True, 1), else_=0)).label("ok"),
        )
        .group_by("bucket")
        .order_by("bucket")
        .all()
    )
    volume = [
        {
            "time":    str(r.bucket)[:16] if r.bucket else "",
            "calls":   int(r.calls),
            "success": int(r.ok or 0),
        }
        for r in volume_rows
    ]

    return {
        "period": period,
        "totalCalls": total,
        "successCalls": success,
        "failedCalls": failed,
        "successRate": round(success / total * 100, 1) if total else 0,
        "latency": latency_stats,
        "errors": errors,
        "modelPerformance": model_perf,
        "callVolume": volume,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# ADMIN: Per-task primary + fallback model configuration
# ═══════════════════════════════════════════════════════════════════════════════

@admin_router.get("/task-config")
def get_task_model_configs(
    db: Session = Depends(get_db),
    _: User     = Depends(get_current_admin),
):
    """
    Return the full list of AI tasks with their configured primary + fallback models.
    Tasks without an override return primaryModel=null, fallbackModel=null.
    """
    from app.utils.task_model_store import get_all_configs, TASK_DEFINITIONS
    current = get_all_configs()
    result = []
    for task_type, info in TASK_DEFINITIONS.items():
        cfg = current.get(task_type, {})
        result.append({
            "taskType":     task_type,
            "label":        info["label"],
            "description":  info["description"],
            "primaryModel":  cfg.get("primaryModel")  or None,
            "fallbackModel": cfg.get("fallbackModel") or None,
        })
    return result


@admin_router.put("/task-config/{task_type}")
def set_task_model_config(
    task_type: str,
    body: dict,
    db: Session = Depends(get_db),
    _: User     = Depends(get_current_admin),
):
    """
    Save primary + fallback model for one task type.
    Pass primaryModel="" or null to clear the override.

    Body: { "primaryModel": "gpt-4o", "fallbackModel": "gpt-4o-mini" }
    """
    from app.utils.task_model_store import save_task_model_config, TASK_DEFINITIONS
    if task_type not in TASK_DEFINITIONS:
        raise HTTPException(status_code=400, detail=f"Unknown task type: {task_type}")

    primary  = (body.get("primaryModel")  or "").strip() or None
    fallback = (body.get("fallbackModel") or "").strip() or None
    save_task_model_config(db, task_type, primary, fallback)
    return {
        "taskType":     task_type,
        "primaryModel":  primary,
        "fallbackModel": fallback,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# PUBLIC: Available models for current user
# ═══════════════════════════════════════════════════════════════════════════════

_KEYSTORE_IMAGE_MODELS: dict[str, list[str]] = {
    "openai":  ["gpt-image-1", "dall-e-3", "dall-e-2"],
    "gemini":  [
        "gemini-2.0-flash-exp-image-generation",
        "imagen-3.0-generate-001",
        "imagen-3.0-fast-generate-001",
    ],
    "custom":  [],
}

_KEYSTORE_IMAGE_DESCRIPTIONS: dict[str, str] = {
    "gpt-image-1":                        "Latest OpenAI image model — supports reference images & logo inlining",
    "dall-e-3":                            "High quality & creative — does not support reference image input",
    "dall-e-2":                            "Fast & cost-effective — supports classic edit/inpainting API",
    "gemini-2.0-flash-exp-image-generation": "Gemini native image generation — multi-modal input supported",
    "imagen-3.0-generate-001":             "Google Imagen 3 — photorealistic image generation (text-only prompt)",
    "imagen-3.0-fast-generate-001":        "Google Imagen 3 Fast — faster, lower cost (text-only prompt)",
}


@public_router.get("/models")
def get_available_models(
    capability: Optional[str] = Query(None),
    db: Session               = Depends(get_db),
    current_user: User        = Depends(get_current_user),
):
    """
    Return AI models available to the current user.

    Priority:
      1. DB-backed registry (System B: AIProvider / AIModel tables) — richer metadata,
         plan-gated permissions. Returned when any AI providers are configured here.
      2. api_key_store fallback (System A) — curated list derived from the active
         provider type (openai / gemini / custom) + the configured default model.
         Used by installations that have not set up DB providers.

    Response shape:
      { models: [...], source: "registry" | "keystore" }

    Each model object:
      id          — model API identifier (e.g. "gpt-image-1"); pass as imageModelId
                    to POST /posts/:id/generate-image to override the admin default
      name        — human-readable name
      description — short capability note
      capability  — "image" | "text"
      isDefault   — true for the admin-configured default
      providerType — "openai" | "gemini" | "custom"
      allowed     — plan gate (only present for registry models)
      source      — "registry" | "keystore"
    """
    # ── System B: DB-backed registry ──────────────────────────────────────────
    q = db.query(AIModel).filter(AIModel.enabled == True)
    if capability:
        q = q.filter(AIModel.capability == capability)
    model_rows = q.order_by(AIModel.priority, AIModel.name).all()

    if model_rows:
        providers_map = {
            p.id: p
            for p in db.query(AIProvider).filter(
                AIProvider.id.in_([m.provider_id for m in model_rows]),
                AIProvider.enabled == True,
            ).all()
        }
        model_rows = [m for m in model_rows if m.provider_id in providers_map]

        plan_links: dict[str, AIPlanModel] = {}
        plans_exist = db.query(AIPlan).count() > 0
        if plans_exist:
            user_plan_id = getattr(current_user, "plan_id", None)
            if user_plan_id:
                plan = db.query(AIPlan).filter(AIPlan.id == user_plan_id).first()
            else:
                plan = db.query(AIPlan).filter(AIPlan.is_default == True).first()
            if plan:
                links = db.query(AIPlanModel).filter(AIPlanModel.plan_id == plan.id).all()
                plan_links = {lk.model_id: lk for lk in links}

        result = []
        for m in model_rows:
            prov = providers_map.get(m.provider_id)
            allowed = True
            if plans_exist and plan_links:
                link = plan_links.get(m.id)
                allowed = link.allowed if link else False
            result.append({
                "id":           m.model_id,
                "name":         m.name or _nice_model_name(m.model_id),
                "description":  m.description or _KEYSTORE_IMAGE_DESCRIPTIONS.get(m.model_id, ""),
                "capability":   m.capability,
                "isDefault":    m.is_default,
                "providerType": prov.provider_type if prov else "openai",
                "allowed":      allowed,
                "source":       "registry",
            })
        return {"models": result, "source": "registry"}

    # ── System A: api_key_store fallback ──────────────────────────────────────
    from app.services.ai.client import get_provider, get_image_model  # noqa: PLC0415
    from app.utils.api_key_store import get_models_for_use_case  # noqa: PLC0415

    provider = get_provider() or "openai"
    configured_img = get_image_model()
    models = []

    if not capability or capability == "image":
        # Include ALL admin-configured image models (not just the first one)
        admin_image_models = get_models_for_use_case("image")

        # Start with admin-configured models (they appear first, marked as default if primary)
        candidates: list[str] = list(admin_image_models)

        # Then add known-valid models for this provider as discovery options
        for m in _KEYSTORE_IMAGE_MODELS.get(provider, []):
            if m not in candidates:
                candidates.append(m)

        # Also ensure the resolved default is included
        if configured_img and configured_img not in candidates:
            candidates.insert(0, configured_img)

        seen: set[str] = set()
        for m in candidates:
            if not m or m in seen:
                continue
            seen.add(m)
            models.append({
                "id":           m,
                "name":         _nice_model_name(m),
                "description":  _KEYSTORE_IMAGE_DESCRIPTIONS.get(m, ""),
                "capability":   "image",
                "isDefault":    m == configured_img,
                "providerType": provider,
                "source":       "keystore",
            })

    if not capability or capability == "text":
        # Include ALL admin-configured text models
        admin_text_models = get_models_for_use_case("text")

        if admin_text_models:
            for i, txt in enumerate(admin_text_models):
                if not txt:
                    continue
                models.append({
                    "id":           txt,
                    "name":         _nice_model_name(txt),
                    "description":  "Admin-configured text generation model" if i > 0 else "Primary text generation model",
                    "capability":   "text",
                    "isDefault":    i == 0,
                    "providerType": provider,
                    "source":       "keystore",
                })
        else:
            # Fallback: resolve whichever model is currently active
            try:
                from app.services.ai.client import resolve_model  # noqa: PLC0415
                txt = resolve_model("gpt-4o", use_case="text")
                if txt:
                    models.append({
                        "id":           txt,
                        "name":         _nice_model_name(txt),
                        "description":  "Active text generation model",
                        "capability":   "text",
                        "isDefault":    True,
                        "providerType": provider,
                        "source":       "keystore",
                    })
            except Exception:
                pass

    return {"models": models, "source": "keystore"}


# ═══════════════════════════════════════════════════════════════════════════════
# Internal helpers
# ═══════════════════════════════════════════════════════════════════════════════

def _invalidate() -> None:
    """Bust both the ModelRegistry and legacy client caches."""
    try:
        from app.ai.registry import get_registry
        get_registry().invalidate()
    except Exception:
        pass
    try:
        from app.services.ai.client import invalidate_client_cache
        invalidate_client_cache()
    except Exception:
        pass


def _sync_legacy_key_store(db, provider_type: str, api_key: Optional[str], base_url: Optional[str]) -> None:
    """Mirror the newest key into AppSetting['apiKeys'] for backward compat."""
    if not api_key:
        return
    try:
        from app.utils.api_key_store import invalidate as aks_invalidate
        from app.models import AppSetting
        import json

        setting = db.query(AppSetting).filter(AppSetting.key == "apiKeys").first()
        current: dict = {}
        if setting and setting.value:
            current = dict(setting.value)

        if provider_type == "gemini":
            current["gemini"] = api_key
        elif provider_type == "custom":
            current["nanoBanana"] = api_key
            if base_url:
                current["nanoBananaBaseUrl"] = base_url
        else:
            current["openai"] = api_key

        if setting:
            setting.value = current
        else:
            db.add(AppSetting(key="apiKeys", value=current))
        db.commit()
        aks_invalidate()
    except Exception as e:
        logger.warning("Legacy key store sync failed (non-critical): %s", e)


def _fetch_model_ids(provider_row: AIProvider) -> list[str]:
    """Fetch model IDs from the provider's API."""
    ptype = provider_row.provider_type
    key   = provider_row.api_key or ""
    url   = provider_row.base_url or ""

    if ptype == "gemini":
        return _fetch_gemini_models(key)
    if ptype == "custom":
        return _fetch_openai_compat_models(key, url)
    return _fetch_openai_models(key)


def _fetch_openai_models(api_key: str) -> list[str]:
    from openai import OpenAI
    client = OpenAI(api_key=api_key, timeout=20.0)
    page = client.models.list()
    return [m.id for m in page.data]


def _fetch_openai_compat_models(api_key: str, base_url: str) -> list[str]:
    base = base_url.rstrip("/")
    models_url = f"{base}/models" if not base.endswith("/models") else base
    with httpx.Client(timeout=20.0) as client:
        resp = client.get(models_url, headers={"Authorization": f"Bearer {api_key}"})
    resp.raise_for_status()
    data = resp.json()
    items = data if isinstance(data, list) else data.get("data", [])
    return [m.get("id") or m.get("name") or "" for m in items if isinstance(m, dict)]


def _fetch_gemini_models(api_key: str) -> list[str]:
    url = "https://generativelanguage.googleapis.com/v1beta/models"
    with httpx.Client(timeout=20.0) as client:
        resp = client.get(url, params={"key": api_key})
    resp.raise_for_status()
    data = resp.json()
    ids = []
    for m in data.get("models", []):
        raw_name = m.get("name", "")  # "models/gemini-2.5-flash"
        model_id = raw_name.split("/")[-1] if "/" in raw_name else raw_name
        if model_id:
            ids.append(model_id)
    return ids
