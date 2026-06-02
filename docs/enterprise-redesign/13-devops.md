# المرحلة الثالثة عشرة: DevOps والنشر

## 1. Docker Configuration

### 1.1 Dockerfile للـ API

```dockerfile
# docker/Dockerfile.api

# ─── Build stage ───────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# ─── Production stage ──────────────────────────────────────────
FROM python:3.12-slim AS production

WORKDIR /app

# Copy Python packages from builder
COPY --from=builder /root/.local /root/.local

# System deps (runtime only)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 curl \
    && rm -rf /var/lib/apt/lists/*

# Copy application code
COPY . .

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

ENV PATH=/root/.local/bin:$PATH
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", \
     "--workers", "4", "--worker-class", "uvicorn.workers.UvicornWorker"]
```

### 1.2 Dockerfile للـ Worker

```dockerfile
# docker/Dockerfile.worker

FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

CMD ["celery", "-A", "app.workers.celery_app", "worker", \
     "--loglevel=info", \
     "--queues=ai_high,email_medium,analytics_low", \
     "--concurrency=4", \
     "--max-tasks-per-child=100"]
```

### 1.3 Dockerfile للـ Frontend

```dockerfile
# docker/Dockerfile.frontend

FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

RUN npm install -g pnpm

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

USER appuser

EXPOSE 3000

CMD ["pnpm", "start"]
```

---

## 2. Docker Compose (Development)

```yaml
# docker-compose.yml

version: '3.9'

services:
  # PostgreSQL
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: brand_architect
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis
  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD} --maxmemory 512mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s

  # API Server
  api:
    build:
      context: ./backend
      dockerfile: docker/Dockerfile.api
    environment:
      DATABASE_URL: postgresql+asyncpg://postgres:${POSTGRES_PASSWORD}@postgres/brand_architect
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379/0
      AUTH_JWT_SECRET: ${AUTH_JWT_SECRET}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID}
      AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY}
      S3_BUCKET: ${S3_BUCKET}
    ports:
      - "8080:8080"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./backend:/app  # hot reload in dev

  # Celery Worker
  worker:
    build:
      context: ./backend
      dockerfile: docker/Dockerfile.worker
    environment:
      DATABASE_URL: postgresql+asyncpg://postgres:${POSTGRES_PASSWORD}@postgres/brand_architect
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379/0
      OPENAI_API_KEY: ${OPENAI_API_KEY}
    depends_on:
      - redis
      - postgres
    volumes:
      - ./backend:/app

  # Celery Beat (Scheduler)
  beat:
    build:
      context: ./backend
      dockerfile: docker/Dockerfile.worker
    command: celery -A app.workers.celery_app beat --loglevel=info
    environment:
      DATABASE_URL: postgresql+asyncpg://postgres:${POSTGRES_PASSWORD}@postgres/brand_architect
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379/0
    depends_on:
      - redis
      - postgres

  # Frontend (Next.js)
  frontend:
    build:
      context: ./frontend
      dockerfile: docker/Dockerfile.frontend
    environment:
      NEXT_PUBLIC_API_URL: http://api:8080
    ports:
      - "3000:3000"
    depends_on:
      - api

  # Flower (Celery monitoring)
  flower:
    image: mher/flower:2.0
    command: celery flower --broker=redis://:${REDIS_PASSWORD}@redis:6379/0
    ports:
      - "5555:5555"
    depends_on:
      - redis

volumes:
  postgres_data:
  redis_data:
```

---

## 3. CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/ci.yml

name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  # ── Test Backend ─────────────────────────────────────────────
  test-backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: test_db
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: test_password
        ports: ["5432:5432"]
        options: --health-cmd pg_isready --health-interval 10s
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
        options: --health-cmd "redis-cli ping" --health-interval 10s
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'
          cache: 'pip'
      
      - name: Install dependencies
        run: pip install -r backend/requirements.txt -r backend/requirements-test.txt
      
      - name: Run linting
        run: |
          cd backend
          ruff check .
          mypy app/ --ignore-missing-imports
      
      - name: Run tests
        run: |
          cd backend
          pytest tests/ -v --cov=app --cov-report=xml --cov-fail-under=80
        env:
          DATABASE_URL: postgresql+asyncpg://postgres:test_password@localhost/test_db
          REDIS_URL: redis://localhost:6379/0
          AUTH_JWT_SECRET: test_secret_key_for_testing_only
      
      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          file: backend/coverage.xml

  # ── Test Frontend ─────────────────────────────────────────────
  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: TypeScript check
        run: pnpm --filter frontend typecheck
      
      - name: Lint
        run: pnpm --filter frontend lint
      
      - name: Run tests
        run: pnpm --filter frontend test --coverage

  # ── Security Scan ─────────────────────────────────────────────
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          security-checks: 'vuln,secret'
          severity: 'CRITICAL,HIGH'
          exit-code: '1'
      
      - name: Python dependency audit
        run: pip install safety && safety check -r backend/requirements.txt
      
      - name: JS dependency audit
        run: pnpm audit --audit-level=high

  # ── Build & Push Images ───────────────────────────────────────
  build:
    needs: [test-backend, test-frontend, security]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Build and push API image
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          file: ./backend/docker/Dockerfile.api
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/api:latest
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/api:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
      
      - name: Build and push Frontend image
        uses: docker/build-push-action@v5
        with:
          context: ./frontend
          file: ./frontend/docker/Dockerfile.frontend
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/frontend:latest
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/frontend:${{ github.sha }}

  # ── Deploy to Production ──────────────────────────────────────
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: production
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Run DB migrations
        run: |
          kubectl exec -it deploy/brand-architect-api -- \
            alembic upgrade head
      
      - name: Deploy API
        run: |
          kubectl set image deployment/brand-architect-api \
            api=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/api:${{ github.sha }}
          kubectl rollout status deployment/brand-architect-api
      
      - name: Deploy Frontend
        run: |
          kubectl set image deployment/brand-architect-frontend \
            frontend=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/frontend:${{ github.sha }}
          kubectl rollout status deployment/brand-architect-frontend
      
      - name: Notify on Slack
        uses: slackapi/slack-github-action@v1.26.0
        with:
          payload: |
            {
              "text": "✅ Deployed brand-architect to production (${{ github.sha }})"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

---

## 4. Monitoring Stack

### 4.1 Prometheus Metrics

```python
# monitoring/metrics.py

from prometheus_client import Counter, Histogram, Gauge, generate_latest

# API metrics
http_requests_total = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status_code"],
)

http_request_duration = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration",
    ["method", "endpoint"],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
)

# AI metrics
ai_requests_total = Counter(
    "ai_requests_total",
    "Total AI API requests",
    ["provider", "model", "task_type", "status"],
)

ai_request_duration = Histogram(
    "ai_request_duration_seconds",
    "AI request duration",
    ["provider", "model", "task_type"],
)

ai_tokens_total = Counter(
    "ai_tokens_total",
    "Total AI tokens used",
    ["provider", "model", "direction"],  # direction: input/output
)

ai_cost_usd_total = Counter(
    "ai_cost_usd_total",
    "Total AI cost in USD",
    ["provider", "model"],
)

# Business metrics
credits_consumed = Counter(
    "credits_consumed_total",
    "Total credits consumed",
    ["operation"],
)

# System metrics
celery_queue_depth = Gauge(
    "celery_queue_depth",
    "Number of tasks in Celery queue",
    ["queue_name"],
)

active_users = Gauge(
    "active_users",
    "Currently active users (with valid session)",
)

# Expose metrics endpoint
@router.get("/metrics")
async def metrics(request: Request):
    # Only allow from monitoring subnet
    if request.client.host not in settings.metrics_allowed_ips:
        raise HTTPException(403)
    return Response(generate_latest(), media_type="text/plain")
```

### 4.2 Grafana Dashboards

```yaml
# Dashboards to configure:

1. API Performance:
   - Request rate (RPS)
   - Error rate (%)
   - P50/P95/P99 latency
   - Active connections

2. AI Usage:
   - Requests per model per hour
   - Average response time per model
   - Cost per hour/day
   - Token consumption rate
   - Error rate per provider

3. Business Metrics:
   - New signups per day
   - Credits consumed per hour
   - Active users (DAU/MAU)
   - Campaign generation rate
   - Image generation rate

4. Infrastructure:
   - CPU/Memory per pod
   - DB query times (p50/p95)
   - Redis memory + hit rate
   - Celery worker utilization
   - S3 request rate + latency
```

### 4.3 Alerting Rules

```yaml
# prometheus/alerts.yml

groups:
  - name: api
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status_code=~"5.."}[5m]) > 0.05
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Error rate > 5% for 2 minutes"

      - alert: HighLatency
        expr: histogram_quantile(0.95, http_request_duration_seconds) > 2.0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "P95 latency > 2s"

  - name: ai
    rules:
      - alert: AIProviderDown
        expr: rate(ai_requests_total{status="error"}[5m]) > 0.5
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "AI provider error rate > 50%"

      - alert: HighAICost
        expr: increase(ai_cost_usd_total[1h]) > 100
        labels:
          severity: warning
        annotations:
          summary: "AI cost > $100 in the last hour"

  - name: database
    rules:
      - alert: DatabaseConnections
        expr: pg_stat_activity_count > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "PostgreSQL connections > 80"

  - name: celery
    rules:
      - alert: QueueBacklog
        expr: celery_queue_depth{queue_name="ai_high"} > 100
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "AI queue backlog > 100 tasks"
```

---

## 5. Logging

```python
# core/logging.py

import structlog
import logging

def configure_logging(level: str = "INFO", json: bool = True):
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.StackInfoRenderer(),
            structlog.dev.set_exc_info,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer() if json 
            else structlog.dev.ConsoleRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, level)
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
    )

# Usage:
logger = structlog.get_logger()

# In request middleware — add correlation context
structlog.contextvars.bind_contextvars(
    request_id=request.state.request_id,
    user_id=getattr(request.state, "user_id", None),
    org_id=getattr(request.state, "org_id", None),
    method=request.method,
    path=request.url.path,
)

# Log entry example (JSON):
# {
#   "timestamp": "2026-01-15T10:30:00Z",
#   "level": "info",
#   "request_id": "req_abc123",
#   "user_id": "user_uuid",
#   "org_id": "org_uuid",
#   "method": "POST",
#   "path": "/api/v1/brands/42/generate-kit",
#   "status": 202,
#   "duration_ms": 45,
#   "event": "request_completed"
# }
```

---

## 6. Backup Strategy

```yaml
Database Backups:
  Tool: pg_dump + AWS S3
  
  Continuous WAL Archiving:
    - archive_command: 'aws s3 cp %p s3://backups/wal/%f'
    - Allows point-in-time recovery
  
  Scheduled Backups:
    Daily full backup at 3 AM UTC:
      pg_dump brandarchitect | gzip | aws s3 cp - s3://backups/daily/$(date +%Y-%m-%d).sql.gz
    
    Retention: 30 days daily, 12 weeks weekly, 12 months monthly
  
  Restore Test: Weekly automated restore test to staging

File Backups (S3):
  - Cross-region replication enabled
  - Versioning enabled (30-day recovery window)
  - Lifecycle: move to S3 Glacier after 6 months

Redis:
  - RDB snapshots every 1 hour to S3
  - AOF (Append Only File) enabled

Backup Monitoring:
  - Alert if backup hasn't run in 25 hours
  - Alert if backup size < 80% of yesterday (data loss detection)
  - Weekly restore drill
```

---

## 7. Environment Configuration

```bash
# .env.example

# App
APP_ENV=production
APP_VERSION=2.0.0
SECRET_KEY=<generate with: openssl rand -hex 32>
DEBUG=false

# Database
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/brand_architect
DATABASE_POOL_SIZE=20
DATABASE_MAX_OVERFLOW=30

# Redis
REDIS_URL=redis://:password@host:6379/0
REDIS_CACHE_DB=1
REDIS_QUEUE_DB=2

# Auth
AUTH_JWT_SECRET=<RS256 private key>
AUTH_JWT_PUBLIC_KEY=<RS256 public key>
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# AI Providers
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...

# Storage
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
S3_BUCKET_LOGOS=brand-logos
S3_BUCKET_IMAGES=generated-images
CDN_BASE_URL=https://cdn.brandarchitect.ai

# Billing
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_live_...

# Email
SENDGRID_API_KEY=SG....
FROM_EMAIL=noreply@brandarchitect.ai

# Monitoring
SENTRY_DSN=https://...@sentry.io/...
PROMETHEUS_METRICS_TOKEN=<secure token>

# Feature Flags
CREDITS_ENABLED=true
MFA_ENABLED=true
```
