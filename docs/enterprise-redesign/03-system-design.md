# المرحلة الثالثة: تصميم النظام (System Design)

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                │
│  Web Browser (Next.js SPA/SSR)  │  Mobile (React Native - Future)   │
│  Third-party Integrations (API) │  CLI Tool (Future)                 │
└────────────────────┬────────────────────────────────────────────────┘
                     │ HTTPS / WSS
┌────────────────────▼────────────────────────────────────────────────┐
│                         CDN / EDGE LAYER                             │
│         Cloudflare CDN  ─  Static Assets, Image Delivery            │
│         DDoS Protection  ─  WAF  ─  SSL Termination                 │
└────────────────────┬────────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────────────┐
│                       LOAD BALANCER (Nginx / AWS ALB)                │
│                  Round Robin + Health Checks + TLS                   │
└──────┬─────────────────┬────────────────────┬───────────────────────┘
       │                 │                    │
┌──────▼──────┐  ┌───────▼──────┐   ┌────────▼──────┐
│  API Server │  │  API Server  │   │  API Server   │
│  Instance 1 │  │  Instance 2  │   │  Instance N   │
│  (FastAPI)  │  │  (FastAPI)   │   │  (FastAPI)    │
└──────┬──────┘  └───────┬──────┘   └────────┬──────┘
       └─────────────────┼────────────────────┘
                         │
        ┌────────────────┼────────────────────┐
        │                │                    │
┌───────▼──────┐  ┌──────▼──────┐   ┌────────▼──────┐
│  PostgreSQL  │  │    Redis    │   │  Message Queue │
│  (Primary)   │  │  (Cache +   │   │  (Celery +     │
│  + Replicas  │  │   Sessions) │   │   Redis/RMQ)   │
└──────────────┘  └─────────────┘   └────────┬──────┘
                                              │
                                    ┌─────────▼──────┐
                                    │  Celery Workers │
                                    │  (AI Tasks)     │
                                    └─────────┬──────┘
                                              │
                              ┌───────────────┼────────────┐
                              │               │            │
                    ┌─────────▼──┐  ┌─────────▼──┐  ┌─────▼───────┐
                    │  OpenAI    │  │   Google   │  │  Anthropic  │
                    │  API       │  │   Gemini   │  │  Claude     │
                    └────────────┘  └────────────┘  └─────────────┘
                              │
                    ┌─────────▼────────┐
                    │  Cloud Storage   │
                    │  (S3 / R2)       │
                    └──────────────────┘
```

---

## 2. Component Architecture

### 2.1 Frontend (Next.js 15)
```
Next.js Application
├── App Router (RSC + Client Components)
├── Middleware (Auth, i18n, Rate Limit)
├── API Routes (BFF - Backend for Frontend)
│   ├── /api/auth/* → Auth proxy
│   └── /api/upload/* → File upload proxy
├── State Management
│   ├── Server State: TanStack Query v5
│   ├── Global State: Zustand
│   └── Form State: React Hook Form + Zod
├── UI Layer
│   ├── Design System: shadcn/ui + Radix UI
│   ├── Animations: Framer Motion
│   ├── Charts: Recharts
│   └── Icons: Lucide React
└── Optimization
    ├── ISR (Incremental Static Regeneration)
    ├── Image Optimization (next/image)
    ├── Font Optimization (next/font)
    └── Bundle Analysis & Code Splitting
```

### 2.2 Backend (FastAPI)
```
FastAPI Application
├── API Router (v1, v2)
│   ├── Auth Routes
│   ├── Brand Routes
│   ├── Campaign Routes
│   ├── Post Routes
│   ├── Organization Routes
│   ├── Billing Routes
│   ├── Admin Routes
│   └── Webhook Routes
├── Services Layer
│   ├── AI Services (Brand, Campaign, Post, Image)
│   ├── Storage Service (S3/R2 abstraction)
│   ├── Email Service (SendGrid/SES)
│   ├── Billing Service (Stripe)
│   └── Analytics Service
├── Repository Layer
│   ├── UserRepository
│   ├── BrandRepository
│   ├── CampaignRepository
│   └── ...
├── Infrastructure
│   ├── Database (SQLAlchemy async)
│   ├── Cache (Redis)
│   ├── Queue (Celery)
│   └── Storage (boto3)
└── Cross-cutting Concerns
    ├── Authentication Middleware
    ├── Rate Limiting (per user/org)
    ├── Logging & Tracing
    ├── Error Handling
    └── Audit Logging
```

### 2.3 AI Services Layer
```
AI Orchestrator
├── Provider Registry
│   ├── OpenAI Provider
│   ├── Gemini Provider
│   ├── Anthropic Provider
│   └── Custom Provider (OpenAI-compatible)
├── Agent System
│   ├── BrandAgent (Brand Kit generation)
│   ├── CampaignAgent (Campaign planning)
│   ├── ContentAgent (Text generation)
│   ├── ImageAgent (Image generation)
│   └── AnalyticsAgent (Insights)
├── Prompt Management
│   ├── Prompt Templates (versioned)
│   ├── Context Builder
│   └── Output Parser
└── Reliability
    ├── Retry Logic (exponential backoff)
    ├── Fallback Providers
    ├── Circuit Breaker
    └── Cost Control (token budgets)
```

### 2.4 Worker System (Celery)
```
Celery Workers
├── AI Task Queue (high priority)
│   ├── generate_brand_kit
│   ├── generate_campaign
│   ├── generate_image
│   └── bulk_generate_images
├── Email Queue (medium priority)
│   ├── send_invite
│   ├── send_notification
│   └── send_report
├── Analytics Queue (low priority)
│   ├── aggregate_usage_stats
│   ├── generate_daily_report
│   └── cleanup_old_jobs
└── Scheduler (Celery Beat)
    ├── Daily stats aggregation
    ├── Expired session cleanup
    └── Billing renewal checks
```

---

## 3. Data Flow

### 3.1 Brand Kit Generation
```
User → POST /api/v1/brands/{id}/generate-kit
     → Auth Middleware (JWT validation)
     → Credit Check (sufficient credits?)
     → Celery Task Queue (enqueue)
     → Return: { jobId, status: "queued" }

Celery Worker:
     → Fetch Brand data from DB
     → Build context (company info + logo)
     → Call AI Provider (GPT-4o)
     → Parse & validate response
     → Save Brand Kit to DB
     → Deduct credits (50 credits)
     → Update job status: "completed"
     → Notify via WebSocket / polling

User → GET /api/v1/jobs/{jobId}
     → Return: { status, progress, result }
```

### 3.2 Image Generation
```
User → POST /api/v1/posts/{id}/generate-image
     → Auth Middleware
     → Credit Check (10 credits)
     → Validate request body
     → Enqueue Celery Task

Celery Worker:
     → Fetch Post + Brand from DB
     → Enhance prompt (if model=pro)
     → Select AI provider (by model_override or config)
     → Generate image (with retry + fallback)
     → Upload to Cloud Storage (S3/R2)
     → Save URL to Post + image_history
     → Update job status

User ← GET /api/v1/jobs/{jobId} (polling)
      or WebSocket notification
```

### 3.3 Authentication Flow
```
Login:
User → POST /api/v1/auth/login
     → Validate credentials
     → Generate: access_token (15min) + refresh_token (7 days)
     → Store refresh_token in Redis (revocable)
     → Set HttpOnly cookie (refresh_token)
     → Return: { access_token, user }

Token Refresh:
User → POST /api/v1/auth/refresh
     → Validate refresh_token from cookie
     → Check Redis (not revoked?)
     → Generate new access_token
     → Rotate refresh_token (optional)
     → Return: { access_token }

Logout:
User → POST /api/v1/auth/logout
     → Revoke refresh_token in Redis
     → Clear HttpOnly cookie
```

---

## 4. Infrastructure Design

### 4.1 Database Strategy
```yaml
Primary Database: PostgreSQL 16
  - Write operations
  - Critical reads
  - ACID transactions

Read Replicas: PostgreSQL (1-3 replicas)
  - Read-heavy operations
  - Analytics queries
  - Reporting

Cache: Redis 7
  - Session storage
  - Rate limit counters
  - API response cache (TTL-based)
  - Job status
  - Real-time features (Pub/Sub)

Search: PostgreSQL Full-Text Search (initially)
  → Elasticsearch (when scale requires)
```

### 4.2 Storage Strategy
```yaml
User Uploads (logos): AWS S3 / Cloudflare R2
  - Bucket: brand-logos
  - Max size: 10MB
  - Accepted: PNG, JPG, SVG, WEBP
  - CDN delivery via CloudFront/Cloudflare

Generated Images: AWS S3 / Cloudflare R2
  - Bucket: generated-images
  - Auto-organized: /{tenant_id}/{brand_id}/{post_id}/
  - CDN delivery with signed URLs
  - Retention policy: 1 year

Exports & Reports: S3
  - Bucket: exports
  - TTL: 7 days
  - Pre-signed URLs
```

### 4.3 Caching Strategy
```yaml
L1 Cache (Application level):
  - In-process LRU cache
  - TTL: 60 seconds
  - Use case: frequently accessed configs

L2 Cache (Redis):
  User Profile: TTL 5 minutes
  Brand Kit: TTL 10 minutes
  AI Model List: TTL 1 hour
  System Settings: TTL 30 minutes
  Rate Limit Counters: TTL = window size
  
Cache Invalidation:
  - Write-through: update cache on DB write
  - Tag-based: invalidate all related cache on entity update
  - Event-driven: invalidate via Redis Pub/Sub on write
```

### 4.4 Monitoring Stack
```yaml
Metrics: Prometheus + Grafana
  - API response times
  - Error rates
  - AI request durations
  - Queue depth
  - Credit usage rates
  - DB query performance

Logging: ELK Stack (Elasticsearch + Logstash + Kibana)
  - Structured JSON logs
  - Log levels: DEBUG, INFO, WARN, ERROR
  - Correlation IDs per request
  - PII masking

Error Tracking: Sentry
  - Exception capture
  - Performance monitoring
  - User impact assessment

Alerting: PagerDuty / Slack
  - Critical: immediate page
  - High: Slack alert
  - Medium: daily digest
```

---

## 5. Multi-Tenancy Architecture

### Tenant Isolation Model: **Shared Database, Separate Schema (Logical Isolation)**

```sql
-- Every table has tenant_id (org_id)
-- Row-Level Security (RLS) في PostgreSQL
-- Partitioning by tenant_id للجداول الكبيرة

-- مثال على Row Level Security
CREATE POLICY tenant_isolation ON brands
  USING (org_id = current_setting('app.current_org_id')::uuid);
```

### Tenant Resolution
```
Request → Extract JWT → Get org_id
        → Set DB context: SET app.current_org_id = '{org_id}'
        → RLS تفلتر تلقائياً
```

### Tenant Limits
```yaml
Free Plan:
  - 1 Organization
  - 2 Brands
  - 5 Campaigns/month
  - 100 Credits/month

Starter Plan:
  - 1 Organization
  - 10 Brands
  - 50 Campaigns/month
  - 1,000 Credits/month

Professional Plan:
  - 3 Organizations
  - Unlimited Brands
  - Unlimited Campaigns
  - 5,000 Credits/month

Business Plan:
  - 10 Organizations
  - Unlimited everything
  - 25,000 Credits/month
  - Team of 10

Enterprise:
  - Custom limits
  - Dedicated infrastructure option
  - SLA guarantees
```

---

## 6. Security Architecture

```
Internet
    ↓
[Cloudflare WAF] ← DDoS, Bot Protection, OWASP Rules
    ↓
[Load Balancer] ← TLS Termination, Health Checks
    ↓
[API Gateway] ← Rate Limiting, Auth Validation, Request Logging
    ↓
[FastAPI] ← JWT Validation, RBAC, Input Validation
    ↓
[Service Layer] ← Business Logic Validation
    ↓
[Repository] ← SQL Injection Prevention (ORM), RLS
    ↓
[PostgreSQL] ← Encrypted at Rest, Audit Logging
```

---

## 7. Disaster Recovery

```yaml
Backup Strategy:
  Database:
    - Continuous WAL archiving to S3
    - Daily full backup
    - Point-in-time recovery (PITR) up to 7 days
    
  Files (S3):
    - Cross-region replication
    - Versioning enabled
    - 30-day retention for deleted files

Failover:
  - Automatic failover to read replica (RDS Multi-AZ)
  - RTO: < 15 minutes
  - RPO: < 1 hour

Geo-redundancy (Future):
  - Multi-region deployment
  - Active-passive configuration
  - DNS failover via Route 53
```
