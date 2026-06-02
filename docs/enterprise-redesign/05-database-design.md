# المرحلة الخامسة: تصميم قاعدة البيانات

## 1. مبادئ التصميم

- **Multi-Tenant:** كل الجداول الرئيسية تحمل `org_id` للعزل
- **UUID للـ Primary Keys:** لا يمكن تخمين IDs
- **Soft Delete:** `deleted_at` بدلاً من الحذف الفعلي
- **Audit Fields:** `created_at`, `updated_at`, `created_by` في كل جدول
- **Row Level Security:** PostgreSQL RLS للحماية على مستوى الصفوف
- **Indexing Strategy:** Composite indexes للاستعلامات الشائعة
- **JSONB:** للبيانات شبه-المنظّمة (Brand Kit, Campaign Days)

---

## 2. Schema الكامل

### Organizations (المؤسسات)

```sql
CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(100) UNIQUE NOT NULL,  -- URL-friendly name
    domain          VARCHAR(255),                  -- company domain
    logo_url        TEXT,
    plan_id         UUID REFERENCES subscription_plans(id),
    credits_balance INTEGER NOT NULL DEFAULT 0,
    credits_reset_at TIMESTAMP,
    max_brands      INTEGER NOT NULL DEFAULT 5,
    max_members     INTEGER NOT NULL DEFAULT 3,
    settings        JSONB NOT NULL DEFAULT '{}',   -- feature toggles, preferences
    metadata        JSONB NOT NULL DEFAULT '{}',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at      TIMESTAMP WITH TIME ZONE      -- soft delete
);

CREATE INDEX idx_orgs_slug ON organizations(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_orgs_domain ON organizations(domain) WHERE domain IS NOT NULL;
```

### Users (المستخدمون)

```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255),                  -- NULL for OAuth-only users
    full_name       VARCHAR(255) NOT NULL,
    avatar_url      TEXT,
    role            VARCHAR(50) NOT NULL DEFAULT 'user',  -- user | admin | super_admin
    is_active       BOOLEAN NOT NULL DEFAULT true,
    is_verified     BOOLEAN NOT NULL DEFAULT false,
    verification_token VARCHAR(255),
    reset_token     VARCHAR(255),
    reset_token_expires TIMESTAMP WITH TIME ZONE,
    last_login_at   TIMESTAMP WITH TIME ZONE,
    mfa_enabled     BOOLEAN NOT NULL DEFAULT false,
    mfa_secret      VARCHAR(255),                  -- encrypted
    preferences     JSONB NOT NULL DEFAULT '{}',
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at      TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_role ON users(role);
```

### Organization Members (عضوية المؤسسة)

```sql
CREATE TABLE organization_members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            VARCHAR(50) NOT NULL DEFAULT 'member',  -- owner | admin | editor | viewer
    invited_by      UUID REFERENCES users(id),
    invite_email    VARCHAR(255),                  -- for pending invites
    invite_token    VARCHAR(255),                  -- for email invites
    invite_expires  TIMESTAMP WITH TIME ZONE,
    accepted_at     TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(org_id, user_id)
);

CREATE INDEX idx_org_members_org_id ON organization_members(org_id);
CREATE INDEX idx_org_members_user_id ON organization_members(user_id);
CREATE INDEX idx_org_members_invite ON organization_members(invite_token) 
    WHERE invite_token IS NOT NULL;
```

### OAuth Accounts (حسابات OAuth)

```sql
CREATE TABLE oauth_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider        VARCHAR(50) NOT NULL,   -- google | github | microsoft
    provider_user_id VARCHAR(255) NOT NULL,
    access_token    TEXT,                   -- encrypted
    refresh_token   TEXT,                   -- encrypted
    expires_at      TIMESTAMP WITH TIME ZONE,
    scope           TEXT,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(provider, provider_user_id)
);
```

### Brands (العلامات التجارية)

```sql
CREATE TABLE brands (
    id              BIGSERIAL PRIMARY KEY,
    org_id          UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id),     -- creator
    company_name    VARCHAR(255) NOT NULL,
    industry        VARCHAR(100),
    description     TEXT,
    website         VARCHAR(500),
    logo_url        TEXT,
    logo_colors     JSONB DEFAULT '[]',          -- extracted colors [{hex, name, percentage}]
    brand_kit       JSONB DEFAULT '{}',           -- full brand kit
    is_archived     BOOLEAN NOT NULL DEFAULT false,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at      TIMESTAMP WITH TIME ZONE
);

-- Partial index for active brands
CREATE INDEX idx_brands_org ON brands(org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_brands_user ON brands(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_brands_name ON brands USING gin(to_tsvector('english', company_name));
```

### Campaigns (الحملات)

```sql
CREATE TABLE campaigns (
    id              BIGSERIAL PRIMARY KEY,
    org_id          UUID REFERENCES organizations(id) ON DELETE CASCADE,
    brand_id        BIGINT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id),
    name            VARCHAR(255) NOT NULL,
    brief           TEXT,
    platforms       TEXT[] NOT NULL DEFAULT '{}',
    duration_days   SMALLINT NOT NULL DEFAULT 7,
    strategy        JSONB DEFAULT '{}',           -- AI-generated strategy
    days            JSONB DEFAULT '[]',            -- legacy compatibility
    status          VARCHAR(50) NOT NULL DEFAULT 'draft',  -- draft|active|archived|generating
    objectives      TEXT[],
    tone            VARCHAR(100),
    is_archived     BOOLEAN NOT NULL DEFAULT false,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at      TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_campaigns_brand ON campaigns(brand_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_campaigns_org ON campaigns(org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_campaigns_status ON campaigns(status);
```

### Posts (المنشورات)

```sql
CREATE TABLE posts (
    id              BIGSERIAL PRIMARY KEY,
    org_id          UUID REFERENCES organizations(id) ON DELETE CASCADE,
    campaign_id     BIGINT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    brand_id        BIGINT NOT NULL REFERENCES brands(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    day             SMALLINT NOT NULL,
    platform        VARCHAR(50) NOT NULL,
    content         TEXT NOT NULL,
    hashtags        TEXT[],
    image_url       TEXT,
    image_history   JSONB DEFAULT '[]',    -- [{url, model, prompt, created_at}]
    image_prompt    TEXT,
    scheduled_at    TIMESTAMP WITH TIME ZONE,
    published_at    TIMESTAMP WITH TIME ZONE,
    status          VARCHAR(50) NOT NULL DEFAULT 'draft',  -- draft|scheduled|published
    engagement_data JSONB DEFAULT '{}',    -- future: likes, shares, etc.
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at      TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_posts_campaign ON posts(campaign_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_posts_platform ON posts(platform);
CREATE INDEX idx_posts_scheduled ON posts(scheduled_at) WHERE scheduled_at IS NOT NULL;
```

### Background Jobs (وظائف الخلفية)

```sql
CREATE TABLE background_jobs (
    id              VARCHAR(100) PRIMARY KEY,   -- UUID or Celery task ID
    type            VARCHAR(100) NOT NULL,      -- brand_kit | campaign | image | etc.
    status          VARCHAR(50) NOT NULL DEFAULT 'queued',
    progress        SMALLINT NOT NULL DEFAULT 0,
    step            VARCHAR(255),
    result          JSONB,
    error           TEXT,
    user_id         UUID REFERENCES users(id),
    org_id          UUID REFERENCES organizations(id),
    metadata        JSONB DEFAULT '{}',         -- task-specific context
    celery_task_id  VARCHAR(255),
    started_at      TIMESTAMP WITH TIME ZONE,
    completed_at    TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_jobs_user ON background_jobs(user_id);
CREATE INDEX idx_jobs_status ON background_jobs(status);
CREATE INDEX idx_jobs_type ON background_jobs(type);
```

### Subscription Plans (خطط الاشتراك)

```sql
CREATE TABLE subscription_plans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    slug            VARCHAR(50) UNIQUE NOT NULL,   -- free | starter | pro | business | enterprise
    description     TEXT,
    price_monthly   DECIMAL(10,2) NOT NULL DEFAULT 0,
    price_yearly    DECIMAL(10,2) NOT NULL DEFAULT 0,
    stripe_price_monthly_id VARCHAR(255),
    stripe_price_yearly_id  VARCHAR(255),
    stripe_product_id       VARCHAR(255),
    credits_per_month  INTEGER NOT NULL DEFAULT 100,
    max_brands         INTEGER NOT NULL DEFAULT 2,
    max_members        INTEGER NOT NULL DEFAULT 1,
    max_campaigns_per_month INTEGER,            -- NULL = unlimited
    features           JSONB NOT NULL DEFAULT '{}',   -- feature flags per plan
    is_active          BOOLEAN NOT NULL DEFAULT true,
    is_public          BOOLEAN NOT NULL DEFAULT true,
    sort_order         SMALLINT NOT NULL DEFAULT 0,
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Subscriptions (الاشتراكات)

```sql
CREATE TABLE subscriptions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES organizations(id),
    plan_id             UUID NOT NULL REFERENCES subscription_plans(id),
    stripe_subscription_id VARCHAR(255) UNIQUE,
    stripe_customer_id  VARCHAR(255),
    status              VARCHAR(50) NOT NULL DEFAULT 'active',
    billing_cycle       VARCHAR(20) NOT NULL DEFAULT 'monthly',  -- monthly | yearly
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end  TIMESTAMP WITH TIME ZONE,
    cancel_at           TIMESTAMP WITH TIME ZONE,
    canceled_at         TIMESTAMP WITH TIME ZONE,
    trial_start         TIMESTAMP WITH TIME ZONE,
    trial_end           TIMESTAMP WITH TIME ZONE,
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_org ON subscriptions(org_id);
CREATE INDEX idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);
```

### Credit Transactions (معاملات الاعتمادات)

```sql
CREATE TABLE credit_transactions (
    id              BIGSERIAL PRIMARY KEY,
    org_id          UUID NOT NULL REFERENCES organizations(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    amount          INTEGER NOT NULL,   -- positive=add, negative=deduct
    balance_after   INTEGER NOT NULL,
    type            VARCHAR(50) NOT NULL,  -- purchase|usage|refund|bonus|reset
    description     TEXT,
    reference_type  VARCHAR(100),          -- brand_kit|image|campaign|etc.
    reference_id    VARCHAR(255),
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_credit_txn_org ON credit_transactions(org_id);
CREATE INDEX idx_credit_txn_user ON credit_transactions(user_id);
CREATE INDEX idx_credit_txn_type ON credit_transactions(type);
```

### AI Providers (موردو الذكاء الاصطناعي)

```sql
CREATE TABLE ai_providers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,     -- openai | gemini | anthropic | custom
    display_name    VARCHAR(255) NOT NULL,
    base_url        TEXT,
    api_key         TEXT,                      -- encrypted
    is_enabled      BOOLEAN NOT NULL DEFAULT true,
    is_default      BOOLEAN NOT NULL DEFAULT false,
    priority        SMALLINT NOT NULL DEFAULT 0,
    config          JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### AI Models (نماذج الذكاء الاصطناعي)

```sql
CREATE TABLE ai_models (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id     UUID NOT NULL REFERENCES ai_providers(id),
    model_id        VARCHAR(255) NOT NULL,      -- gpt-4o, dall-e-3, etc.
    display_name    VARCHAR(255) NOT NULL,
    capability      VARCHAR(50) NOT NULL,        -- text | image | embedding
    context_window  INTEGER,
    is_enabled      BOOLEAN NOT NULL DEFAULT true,
    is_default      BOOLEAN NOT NULL DEFAULT false,
    pricing_input   DECIMAL(10,6),              -- $ per 1K tokens input
    pricing_output  DECIMAL(10,6),              -- $ per 1K tokens output
    config          JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(provider_id, model_id)
);

CREATE INDEX idx_ai_models_provider ON ai_models(provider_id);
CREATE INDEX idx_ai_models_capability ON ai_models(capability);
```

### AI Usage Logs (سجلات استخدام AI)

```sql
CREATE TABLE ai_usage_logs (
    id              BIGSERIAL PRIMARY KEY,
    org_id          UUID REFERENCES organizations(id),
    user_id         UUID REFERENCES users(id),
    provider_id     UUID REFERENCES ai_providers(id),
    model_id        UUID REFERENCES ai_models(id),
    task_type       VARCHAR(100) NOT NULL,
    input_tokens    INTEGER,
    output_tokens   INTEGER,
    total_tokens    INTEGER,
    cost_usd        DECIMAL(10,6),
    duration_ms     INTEGER,
    success         BOOLEAN NOT NULL DEFAULT true,
    error_code      VARCHAR(100),
    is_fallback     BOOLEAN NOT NULL DEFAULT false,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Monthly partitions for performance
CREATE TABLE ai_usage_logs_2026_01 
    PARTITION OF ai_usage_logs
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE INDEX idx_ai_usage_org ON ai_usage_logs(org_id, created_at);
CREATE INDEX idx_ai_usage_model ON ai_usage_logs(model_id, created_at);
```

### App Settings (إعدادات التطبيق)

```sql
CREATE TABLE app_settings (
    key             VARCHAR(255) PRIMARY KEY,
    value           TEXT,
    value_json      JSONB,
    description     TEXT,
    is_public       BOOLEAN NOT NULL DEFAULT false,
    updated_by      UUID REFERENCES users(id),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Audit Logs (سجلات التدقيق)

```sql
CREATE TABLE audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    org_id          UUID REFERENCES organizations(id),
    user_id         UUID REFERENCES users(id),
    action          VARCHAR(100) NOT NULL,      -- create | update | delete | login | etc.
    resource_type   VARCHAR(100) NOT NULL,      -- brand | campaign | user | etc.
    resource_id     VARCHAR(255),
    changes         JSONB,                      -- { before: {}, after: {} }
    ip_address      INET,
    user_agent      TEXT,
    request_id      VARCHAR(100),
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
) PARTITION BY RANGE (created_at);

CREATE INDEX idx_audit_org ON audit_logs(org_id, created_at);
CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at);
CREATE INDEX idx_audit_action ON audit_logs(action, created_at);
```

### Notifications (الإشعارات)

```sql
CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    type            VARCHAR(100) NOT NULL,
    title           VARCHAR(255) NOT NULL,
    body            TEXT,
    data            JSONB DEFAULT '{}',
    is_read         BOOLEAN NOT NULL DEFAULT false,
    read_at         TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notifs_user ON notifications(user_id, is_read, created_at);
```

### Feature Flags (أعلام الميزات)

```sql
CREATE TABLE feature_flags (
    key             VARCHAR(255) PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    is_enabled      BOOLEAN NOT NULL DEFAULT false,
    rollout_percentage SMALLINT NOT NULL DEFAULT 0,  -- 0-100
    allowed_org_ids UUID[],    -- specific orgs whitelist
    allowed_plan_slugs TEXT[], -- plans whitelist
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 3. Entity Relationship Diagram (ERD)

```
organizations ────< organization_members >──── users
      │                                          │
      │                                    oauth_accounts
      ├────< subscriptions >──── subscription_plans
      │
      ├────< brands
      │           │
      │           └────< campaigns
      │                       │
      │                       └────< posts
      │
      ├────< credit_transactions ────── users
      │
      └────< ai_usage_logs ─── ai_models ─── ai_providers
```

---

## 4. Database Migrations Strategy (Alembic)

```python
# alembic/env.py
# Async SQLAlchemy with Alembic

# Naming convention for constraints
convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}
```

### Migration Workflow
```bash
# Create new migration
alembic revision --autogenerate -m "add_organizations_table"

# Apply migrations
alembic upgrade head

# Rollback
alembic downgrade -1

# Show history
alembic history
```

---

## 5. Performance Indexes

```sql
-- Composite indexes for common query patterns
CREATE INDEX idx_brands_org_active 
    ON brands(org_id, created_at DESC) 
    WHERE deleted_at IS NULL;

CREATE INDEX idx_campaigns_brand_status 
    ON campaigns(brand_id, status) 
    WHERE deleted_at IS NULL;

CREATE INDEX idx_posts_campaign_day 
    ON posts(campaign_id, day ASC) 
    WHERE deleted_at IS NULL;

CREATE INDEX idx_credit_txn_org_date 
    ON credit_transactions(org_id, created_at DESC);

-- Full text search
CREATE INDEX idx_brands_fts 
    ON brands USING gin(to_tsvector('english', company_name || ' ' || COALESCE(description, '')));

-- JSONB indexes
CREATE INDEX idx_brands_kit 
    ON brands USING gin(brand_kit);
```

---

## 6. Row Level Security (RLS)

```sql
-- Enable RLS on all tenant tables
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Brands: user sees only their org's brands
CREATE POLICY brands_tenant_isolation ON brands
    USING (
        org_id = current_setting('app.current_org_id', true)::uuid
        OR
        user_id = current_setting('app.current_user_id', true)::uuid
    );

-- Admin bypass
CREATE POLICY brands_admin_access ON brands
    USING (current_setting('app.is_admin', true)::boolean = true);
```
