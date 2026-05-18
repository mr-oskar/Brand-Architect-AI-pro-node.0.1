# Python Backend Migration — AI Agent Task

## الهدف
أنت agent متخصص في تحويل backends. مهمتك هي **بناء backend جديد بالكامل بـ Python/FastAPI** يحل محل الـ backend الحالي المكتوب بـ TypeScript/Express.

---

## 1. المشروع الحالي

### البنية
```
/home/runner/workspace/
├── artifacts/
│   ├── api-server/          ← الـ backend الحالي (TypeScript/Express) — سيُستبدل
│   │   └── src/
│   │       ├── routes/      ← الـ API endpoints
│   │       │   ├── auth.ts
│   │       │   ├── brands.ts
│   │       │   ├── campaigns.ts
│   │       │   ├── posts.ts
│   │       │   ├── dashboard.ts
│   │       │   ├── health.ts
│   │       │   └── images.ts
│   │       └── lib/
│   │           ├── ai.ts         ← كل منطق الـ AI
│   │           ├── auth.ts       ← JWT + password hashing
│   │           ├── credits.ts    ← نظام النقاط
│   │           ├── imageStorage.ts  ← Object Storage
│   │           └── jobStore.ts   ← Async jobs (in-memory)
│   └── brand-os/            ← الـ frontend (React/Vite) — لا تلمسه
└── lib/
    └── db/                  ← Drizzle ORM schema (TypeScript)
```

### قاعدة البيانات (PostgreSQL)
اقرأ ملف `lib/db/src/schema.ts` لفهم الجداول. الجداول الرئيسية:

```sql
-- users
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'user',  -- 'user' | 'admin'
  credits INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- brands
CREATE TABLE brands (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  company_name TEXT NOT NULL,
  industry TEXT NOT NULL,
  description TEXT,
  website TEXT,
  logo_url TEXT,
  status TEXT DEFAULT 'active',
  brand_kit JSONB,       -- BrandKit object (personality, colors, tone, etc.)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- campaigns
CREATE TABLE campaigns (
  id SERIAL PRIMARY KEY,
  brand_id INTEGER NOT NULL REFERENCES brands(id),
  title TEXT NOT NULL,
  strategy TEXT,
  days INTEGER DEFAULT 7,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- posts
CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
  day INTEGER NOT NULL,
  caption TEXT,
  hook TEXT,
  cta TEXT,
  hashtags TEXT[],
  image_prompt TEXT,
  image_url TEXT,
  image_history TEXT[],
  platform TEXT DEFAULT 'instagram',
  scheduled_at TIMESTAMP,
  published_at TIMESTAMP,
  publish_status TEXT DEFAULT 'draft',
  publish_error TEXT,
  external_post_id TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- app_settings
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 2. الـ API endpoints المطلوب تنفيذها

### Auth — `/api/auth/`
```
POST /api/auth/register    → { email, password, name? } → set httpOnly cookie + { id, email, name, role }
POST /api/auth/login       → { email, password }         → set httpOnly cookie + { id, email, name, role }
POST /api/auth/logout      → clear cookie
GET  /api/auth/me          → current user info from cookie
```

### Brands — `/api/brands/`
```
GET    /api/brands                      → list user's brands (paginated, q search)
POST   /api/brands                      → create brand { companyName, industry, description?, website?, logoUrl? }
GET    /api/brands/:id                  → get brand details
PATCH  /api/brands/:id                  → update brand fields
DELETE /api/brands/:id                  → delete brand + its campaigns/posts

POST   /api/brands/:id/generate-kit     → AI: generate full BrandKit (personality, colors, tone, taglines...)
POST   /api/brands/:id/generate-campaign → AI: generate multi-day campaign
  body: { days, platforms[], targetAudience?, campaignGoal?, brief? }
POST   /api/brands/:id/campaign-brief-job → Async version of generate-campaign
  returns: { jobId } immediately, processes in background
```

### Campaigns — `/api/campaigns/`
```
GET  /api/campaigns/:id                 → get campaign with its posts + brand info
POST /api/campaigns/:id/generate-all-images → bulk generate AI images for all posts
  body: { size?, logoDataUrl?, skipExisting? }
```

### Posts — `/api/posts/`
```
GET   /api/posts/:id                    → get post
PATCH /api/posts/:id                    → update { caption?, hook?, cta?, hashtags?, imagePrompt?, platform? }
POST  /api/posts/:id/generate-image     → AI: generate image for post
  body: { size?, logoDataUrl?, referenceDataUrls? }
POST  /api/posts/:id/regenerate         → AI: regenerate post copy (caption/hook/cta/hashtags)
POST  /api/posts/:id/generate-variant   → AI: create A/B variant of post
```

### Dashboard — `/api/dashboard/`
```
GET /api/dashboard/summary → { brandCount, recentBrands[], campaignCount, postCount }
```

### System — misc
```
GET /api/healthz            → { status: "ok" }
GET /api/public-settings    → site settings from app_settings table (fallback to defaults)
GET /api/jobs/:id           → check async job status { id, status, progress, total, result?, error? }
GET /api/storage/images/objects/uploads/:uuid → serve stored image file
```

---

## 3. المنطق الأساسي الذي يجب تنفيذه

### Auth
- **JWT** في httpOnly cookie (اسمه `auth_token`)
- **bcrypt** لتشفير كلمات المرور
- middleware `require_auth`: يفك JWT من الـ cookie ويضع `user_id` في request state
- Cookie: httpOnly=True, samesite=lax, secure في production

### Credits System
```python
# كل action له تكلفة من app_settings (key="creditCosts")
# الأسعار الافتراضية:
DEFAULT_COSTS = {
    "brand.generate-kit": 5,
    "campaign.generate": 10,
    "post.generate-image": 3,
    "post.regenerate": 2,
    "post.generate-variant": 2,
}

# قبل كل AI operation:
# 1. اقرأ التكلفة من DB (أو استخدم الافتراضي)
# 2. تحقق أن user.credits >= cost (وإلا 402 Insufficient Credits)
# 3. اخصم الـ credits
# 4. إذا فشلت العملية → أعد الـ credits (refund)
```

### Async Jobs (jobStore)
```python
# In-memory store (dict) لتتبع العمليات الطويلة
# { job_id: { id, user_id, status, progress, total, result, error, created_at } }
# status: "pending" | "running" | "done" | "failed"
# تنظيف تلقائي كل 30 دقيقة
# الـ endpoint campaign-brief-job يبدأ background task ويرجع jobId فوراً
```

### Image Storage
```python
# تخزين الصور في Object Storage أو ملفات محلية
# إذا كان REPLIT_OBJECT_STORAGE_BUCKET_ID متوفر → Replit Object Storage
# وإلا → مجلد محلي uploads/
# يرجع URL: /api/storage/images/objects/uploads/<uuid>
```

### AI Integration
```python
# Priority: OPENAI_API_KEY → GEMINI_API_KEY → AI_INTEGRATIONS_OPENAI_API_KEY+BASE_URL
# نفس منطق lazy initialization — السيرفر يبدأ بدون مفاتيح، يرمي error عند الاستخدام فقط

# Text AI (OpenAI/Gemini):
# - generateBrandKit(brand) → BrandKit JSON
# - generateCampaign(brand, kit, options) → Campaign + Posts
# - regeneratePost(post, brand, kit) → updated post copy
# - generatePostVariant(post, brand) → variant post

# Image AI:
# - generateImageBuffer(prompt, size) → bytes
# - generateImageWithLogoReference(logo_data_url, prompt, size) → bytes
# عند Gemini: استخدم generativelanguage.googleapis.com API مباشرة
# عند OpenAI: استخدم gpt-image-1 model
```

### BrandKit AI Generation
```python
# generateBrandKit يطلب من GPT/Gemini JSON بهذا الشكل:
BrandKit = {
    "personality": str,
    "positioning": str,
    "toneOfVoice": str,
    "audienceSegments": list[str],
    "visualStyle": str,
    "colorPalette": {
        "primary": "#hex",
        "secondary": "#hex",
        "accent": "#hex",
        "background": "#hex",
        "text": "#hex",
        "neutral": "#hex",
    },
    "visualStyleRules": str,
    "brandStory": str,
    "missionStatement": str,
    "visionStatement": str,
    "taglines": list[str],
    "brandKeywords": list[str],
    "messagingPillars": list[str],
    "dosCommunication": list[str],
    "dontsCommunication": list[str],
    "socialBio": str,
    "typographyRecommendations": str,
    "competitivePosition": str,
}
```

---

## 4. التقنيات المطلوبة

```
Python 3.11+
FastAPI                  ← web framework
uvicorn                  ← ASGI server
SQLAlchemy 2.x (async)   ← ORM (مع asyncpg)
asyncpg                  ← PostgreSQL async driver
python-jose              ← JWT
passlib[bcrypt]          ← password hashing
httpx                    ← HTTP client (للـ AI calls)
openai                   ← OpenAI Python SDK
pillow                   ← Image processing
python-multipart         ← file uploads
pydantic v2              ← data validation
python-dotenv            ← env vars
```

---

## 5. بنية المشروع المطلوبة

```
artifacts/api-server-python/
├── main.py                    ← entry point (uvicorn app)
├── app/
│   ├── __init__.py
│   ├── database.py            ← SQLAlchemy async engine + session
│   ├── models.py              ← SQLAlchemy ORM models (نفس الجداول الموجودة)
│   ├── schemas.py             ← Pydantic schemas (request/response)
│   ├── auth.py                ← JWT + bcrypt utils
│   ├── credits.py             ← credits system
│   ├── image_storage.py       ← Object Storage / local file storage
│   ├── job_store.py           ← in-memory async jobs
│   ├── ai/
│   │   ├── __init__.py
│   │   ├── client.py          ← OpenAI/Gemini client (lazy init)
│   │   ├── brand_kit.py       ← generateBrandKit()
│   │   ├── campaign.py        ← generateCampaign()
│   │   ├── post.py            ← regenerate/variant
│   │   └── image.py           ← generateImageBuffer() + logo reference
│   └── routes/
│       ├── __init__.py
│       ├── auth.py
│       ├── brands.py
│       ├── campaigns.py
│       ├── posts.py
│       ├── dashboard.py
│       └── system.py          ← health + public-settings + jobs + image serving
├── requirements.txt
└── pyproject.toml
```

---

## 6. متطلبات مهمة

1. **CORS**: السماح لـ `http://localhost:5000` وأي `*.replit.dev` domain (الـ frontend)
2. **الـ Port**: السيرفر يعمل على port **8080** (نفس الحالي)
3. **Prefix**: جميع الـ routes تحت `/api/` (مثال: `/api/auth/login`)
4. **Cookie**: اسم الـ cookie `auth_token`، httpOnly=True
5. **Error responses**: دائماً `{ "error": "message" }` مع status code مناسب
6. **الـ DB**: استخدم نفس `DATABASE_URL` من environment variable — الجداول موجودة بالفعل، **لا تعيد إنشاءها**، استخدم SQLAlchemy `autoload` أو عرّف الـ models لتطابق الجداول الموجودة
7. **Timestamps**: أرسلها دائماً كـ ISO 8601 strings
8. **Pagination**: `GET /api/brands` يدعم `?page=1&pageSize=50&q=search`
9. **الـ Workflow**: أضف workflow جديد في Replit باسم `Python API Server` يشغّل:
   ```
   PORT=8080 uvicorn artifacts/api-server-python/main:app --host 0.0.0.0 --port 8080 --reload
   ```
10. **وقف الـ TypeScript server**: بعد التحقق من عمل الـ Python server، أوقف `artifacts/api-server: API Server` workflow

---

## 7. الخطوات المقترحة للتنفيذ

1. إنشاء `artifacts/api-server-python/` وتثبيت الـ packages
2. إعداد SQLAlchemy models تطابق الجداول الموجودة
3. بناء Auth (JWT + bcrypt + cookies)
4. بناء routes بالترتيب: health → auth → brands (CRUD) → campaigns → posts → dashboard → system
5. إضافة AI generation (brand kit أولاً، ثم campaigns، ثم images)
6. تشغيل السيرفر والتحقق من كل endpoint

---

## 8. ملاحظات إضافية

- **الـ Frontend** موجود في `artifacts/brand-os/` ويتوقع نفس الـ API endpoints — لا تغيّر الـ response shapes
- **Vite proxy**: الـ frontend يرسل جميع `/api/*` requests إلى `localhost:8080` — لا تغيّر هذا الـ port
- **قراءة الكود الحالي مرجعاً**: اقرأ `artifacts/api-server/src/routes/*.ts` و `artifacts/api-server/src/lib/ai.ts` لفهم المنطق الكامل قبل البدء
- **AI prompts**: اقرأ `artifacts/api-server/src/lib/ai.ts` بالكامل — يحتوي على كل الـ system prompts والـ JSON schemas المطلوبة للـ AI generation
- **الصور**: خزّن في مجلد محلي `artifacts/api-server-python/uploads/` إذا لم يكن Replit Object Storage متوفراً
