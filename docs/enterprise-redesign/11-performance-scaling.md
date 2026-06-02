# المرحلة الحادية عشرة: الأداء والتوسع

## 1. Caching Strategy

### 1.1 Cache Layers

```
┌──────────────────────────────────────────────────────┐
│ L1: Browser Cache (Next.js)                          │
│   - Static assets: 1 year (immutable)                │
│   - API responses: no-store (dynamic data)           │
│   - Images: 30 days (CDN)                           │
└─────────────────────┬────────────────────────────────┘
                      │
┌─────────────────────▼────────────────────────────────┐
│ L2: CDN Cache (Cloudflare)                           │
│   - Generated images: 1 year                        │
│   - Logo files: 30 days                             │
│   - Public API responses: 5 min                     │
└─────────────────────┬────────────────────────────────┘
                      │
┌─────────────────────▼────────────────────────────────┐
│ L3: Application Cache (Redis)                        │
│   - User sessions: 7 days                           │
│   - Brand Kit: 10 min TTL                           │
│   - AI models list: 1 hour TTL                      │
│   - System settings: 30 min TTL                     │
│   - Rate limit counters: window size                │
│   - Job status: 24 hours                           │
└─────────────────────┬────────────────────────────────┘
                      │
┌─────────────────────▼────────────────────────────────┐
│ L4: Database (PostgreSQL)                            │
│   - Persistent data                                  │
│   - Read replicas for heavy reads                   │
└──────────────────────────────────────────────────────┘
```

### 1.2 Redis Caching Implementation

```python
# core/cache.py

class CacheManager:
    def __init__(self, redis: Redis):
        self.redis = redis
    
    async def get_or_set(
        self,
        key: str,
        factory: Callable[[], Awaitable[T]],
        ttl: int,
    ) -> T:
        cached = await self.redis.get(key)
        if cached:
            return json.loads(cached)
        
        value = await factory()
        await self.redis.setex(key, ttl, json.dumps(value, default=str))
        return value
    
    async def invalidate_pattern(self, pattern: str) -> int:
        """Invalidate all cache keys matching pattern."""
        keys = await self.redis.keys(pattern)
        if keys:
            return await self.redis.delete(*keys)
        return 0
    
    # Cache decorators
    def cached(self, ttl: int, key_builder: Callable = None):
        def decorator(func):
            @wraps(func)
            async def wrapper(*args, **kwargs):
                key = key_builder(*args, **kwargs) if key_builder else f"{func.__name__}:{hash((args, frozenset(kwargs.items())))}"
                return await self.get_or_set(key, lambda: func(*args, **kwargs), ttl)
            return wrapper
        return decorator

# Usage:
cache = CacheManager(redis)

@cache.cached(ttl=600, key_builder=lambda org_id, brand_id: f"brand:{org_id}:{brand_id}")
async def get_brand_with_kit(org_id: UUID, brand_id: int) -> dict:
    ...
```

### 1.3 Cache Invalidation

```python
# Cache keys convention
CACHE_KEYS = {
    "brand":         "brand:{org_id}:{brand_id}",
    "brands_list":   "brands_list:{org_id}",
    "campaign":      "campaign:{org_id}:{campaign_id}",
    "user":          "user:{user_id}",
    "org":           "org:{org_id}",
    "settings":      "settings:global",
    "ai_models":     "ai_models:all",
    "credits":       "credits:{org_id}",
}

# On brand update → invalidate brand + brands_list
async def on_brand_updated(org_id: UUID, brand_id: int):
    await cache.delete(f"brand:{org_id}:{brand_id}")
    await cache.delete(f"brands_list:{org_id}")
```

---

## 2. Message Queue (Celery + Redis)

### 2.1 Queue Architecture

```python
# workers/celery_app.py

celery_app = Celery(
    "brand_architect",
    broker="redis://localhost:6379/1",
    backend="redis://localhost:6379/2",
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    
    # Queue priorities
    task_routes={
        "workers.ai_tasks.*":        {"queue": "ai_high"},
        "workers.email_tasks.*":     {"queue": "email_medium"},
        "workers.analytics_tasks.*": {"queue": "analytics_low"},
        "workers.cleanup_tasks.*":   {"queue": "maintenance_low"},
    },
    
    # Concurrency per queue
    worker_concurrency=4,
    
    # Task timeouts
    task_soft_time_limit=240,   # 4 min soft limit → SoftTimeLimitExceeded
    task_time_limit=300,        # 5 min hard limit → force kill
    
    # Retry policy
    task_max_retries=3,
    task_default_retry_delay=30,
    
    # Rate limiting
    task_annotations={
        "workers.ai_tasks.generate_brand_kit": {"rate_limit": "20/m"},
        "workers.ai_tasks.generate_image": {"rate_limit": "50/m"},
    },
)

# Celery Beat schedule
celery_app.conf.beat_schedule = {
    "reset-monthly-credits": {
        "task": "workers.billing_tasks.reset_monthly_credits",
        "schedule": crontab(day_of_month=1, hour=0, minute=0),
    },
    "cleanup-old-jobs": {
        "task": "workers.cleanup_tasks.cleanup_expired_jobs",
        "schedule": crontab(hour=2, minute=0),  # Daily at 2 AM
    },
    "aggregate-daily-stats": {
        "task": "workers.analytics_tasks.aggregate_daily_stats",
        "schedule": crontab(hour=1, minute=0),  # Daily at 1 AM
    },
}
```

### 2.2 AI Tasks Implementation

```python
# workers/ai_tasks.py

@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    name="workers.ai_tasks.generate_brand_kit",
)
def generate_brand_kit_task(
    self,
    brand_id: int,
    user_id: str,
    org_id: str,
    reservation_id: str,
) -> dict:
    """Celery task for brand kit generation."""
    
    job_id = self.request.id
    
    try:
        # Update job progress
        update_job_progress(job_id, 10, "Analyzing brand information...")
        
        # Get brand from DB
        brand = sync_get_brand(brand_id)
        
        update_job_progress(job_id, 30, "Generating brand identity...")
        
        # Run AI generation (sync wrapper)
        kit = run_async(brand_agent.generate_brand_kit(brand))
        
        update_job_progress(job_id, 80, "Saving brand kit...")
        
        # Save to DB
        sync_update_brand_kit(brand_id, kit.dict())
        
        # Confirm credit deduction
        credit_manager.confirm(reservation_id, "Brand Kit generation")
        
        update_job_progress(job_id, 100, "Complete!")
        
        return {"brand_kit": kit.dict()}
        
    except AIServiceError as exc:
        # Retry on transient AI errors
        credit_manager.release(reservation_id)
        raise self.retry(exc=exc)
    
    except Exception as exc:
        # Non-retryable error
        credit_manager.release(reservation_id)
        update_job_status(job_id, "failed", error=str(exc))
        raise
```

---

## 3. Database Performance

### 3.1 Connection Pool

```python
# database/engine.py

engine = create_async_engine(
    DATABASE_URL,
    pool_size=20,           # Base connections
    max_overflow=30,        # Burst connections
    pool_pre_ping=True,     # Test connections before use
    pool_recycle=3600,      # Recycle connections hourly
    pool_timeout=30,        # Wait max 30s for connection
    echo=False,             # No SQL logging in prod
)
```

### 3.2 Query Optimization

```python
# N+1 Query Prevention — use joinedload / selectinload

# Bad: N+1
brands = await db.execute(select(Brand))
for brand in brands:
    campaigns = await db.execute(  # N queries!
        select(Campaign).where(Campaign.brand_id == brand.id)
    )

# Good: Single query with JOIN
brands = await db.execute(
    select(Brand)
    .options(selectinload(Brand.campaigns))
    .where(Brand.org_id == org_id)
)

# Pagination: cursor-based for large datasets
async def get_posts_cursor(
    campaign_id: int,
    cursor: Optional[int] = None,  # last post id
    limit: int = 20,
) -> list[Post]:
    query = (
        select(Post)
        .where(Post.campaign_id == campaign_id)
        .order_by(Post.day.asc(), Post.id.asc())
        .limit(limit)
    )
    if cursor:
        query = query.where(Post.id > cursor)
    return (await db.execute(query)).scalars().all()
```

### 3.3 Read Replicas

```python
# database/session.py

class DatabaseRouter:
    def __init__(self, write_url: str, read_urls: list[str]):
        self.write_engine = create_async_engine(write_url, ...)
        self.read_engines = [
            create_async_engine(url, ...) for url in read_urls
        ]
        self._read_index = 0
    
    def get_write_session(self) -> AsyncSession:
        return AsyncSession(self.write_engine)
    
    def get_read_session(self) -> AsyncSession:
        # Round-robin across read replicas
        engine = self.read_engines[self._read_index % len(self.read_engines)]
        self._read_index += 1
        return AsyncSession(engine)

# Usage in repositories
class BrandRepository:
    async def list(self, org_id: UUID) -> list[Brand]:
        # Use read replica for list queries
        async with db_router.get_read_session() as session:
            return await session.execute(select(Brand).where(...))
    
    async def update(self, brand_id: int, data: dict) -> Brand:
        # Always write to primary
        async with db_router.get_write_session() as session:
            await session.execute(update(Brand).where(...).values(**data))
```

---

## 4. Load Balancing

### 4.1 Nginx Configuration

```nginx
# nginx.conf

upstream api_backend {
    least_conn;  # Route to least busy server
    
    server api1:8080 weight=1;
    server api2:8080 weight=1;
    server api3:8080 weight=1;
    
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name api.brandarchitect.ai;
    
    # SSL configuration
    ssl_certificate /etc/ssl/certs/cert.pem;
    ssl_certificate_key /etc/ssl/private/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/m;
    limit_req zone=api_limit burst=200 nodelay;
    
    location /api/ {
        proxy_pass http://api_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";  # keepalive
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Request-ID $request_id;
        
        proxy_connect_timeout 5s;
        proxy_read_timeout 120s;  # Allow for AI generation
        
        proxy_buffering on;
        proxy_buffer_size 16k;
    }
    
    # WebSocket support
    location /ws/ {
        proxy_pass http://api_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### 4.2 Health Checks

```python
# api/v1/system.py

@router.get("/health")
async def health_check():
    return {"status": "ok", "timestamp": datetime.utcnow()}

@router.get("/health/deep")
async def deep_health_check(db: AsyncSession = Depends(get_db)):
    checks = {}
    
    # Database
    try:
        await db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as e:
        checks["database"] = f"error: {e}"
    
    # Redis
    try:
        await redis.ping()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"error: {e}"
    
    # Celery
    try:
        result = celery_app.control.ping(timeout=1)
        checks["celery"] = "ok" if result else "no_workers"
    except Exception as e:
        checks["celery"] = f"error: {e}"
    
    # AI Provider
    try:
        await ai_client.health_check()
        checks["ai_provider"] = "ok"
    except Exception as e:
        checks["ai_provider"] = f"error: {e}"
    
    status = "ok" if all(v == "ok" for v in checks.values()) else "degraded"
    
    return {
        "status": status,
        "checks": checks,
        "version": settings.app_version,
        "timestamp": datetime.utcnow(),
    }
```

---

## 5. Horizontal Scaling Strategy

### 5.1 Scaling Tiers

```yaml
Tier 1 — MVP (0-1K users):
  API: 1 instance (2 CPU, 4GB RAM)
  DB: 1 PostgreSQL instance
  Redis: 1 instance
  Workers: 2 Celery workers
  Cost: ~$100/month

Tier 2 — Growth (1K-10K users):
  API: 3 instances behind load balancer
  DB: 1 primary + 1 read replica
  Redis: Redis Sentinel (3 nodes)
  Workers: 5 Celery workers + autoscale
  Cost: ~$500/month

Tier 3 — Scale (10K-100K users):
  API: 5-10 instances (auto-scale)
  DB: 1 primary + 2 read replicas + PgBouncer
  Redis: Redis Cluster (6 nodes)
  Workers: 10-20 Celery workers (Kubernetes autoscale)
  CDN: Cloudflare for static + images
  Cost: ~$2,000-5,000/month

Tier 4 — Enterprise (100K+ users):
  API: Kubernetes deployment (auto-scale 10-50 pods)
  DB: RDS Multi-AZ + Aurora Read Replicas
  Redis: ElastiCache Cluster
  Workers: Kubernetes Jobs (spot instances)
  Global: Multi-region with failover
  Cost: Custom
```

### 5.2 Kubernetes Deployment

```yaml
# k8s/api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: brand-architect-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: brand-architect-api
  template:
    spec:
      containers:
        - name: api
          image: brand-architect/api:latest
          resources:
            requests:
              cpu: "500m"
              memory: "512Mi"
            limits:
              cpu: "2000m"
              memory: "2Gi"
          livenessProbe:
            httpGet:
              path: /api/health
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /api/health/deep
              port: 8080
            initialDelaySeconds: 15
            periodSeconds: 5

---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: brand-architect-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: brand-architect-api
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```
