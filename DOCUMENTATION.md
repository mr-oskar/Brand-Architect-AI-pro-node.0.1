# Brand Architect AI Pro — التوثيق الكامل

> **الإصدار الحالي:** v2.0 — Python/FastAPI Backend  
> **آخر تحديث:** 2026-05-18  
> **الحالة:** ✅ النظام يعمل بالكامل على Replit

---

## الفهرس

1. [نظرة عامة](#1-نظرة-عامة)
2. [المكدس التقني الحالي](#2-المكدس-التقني-الحالي)
3. [هيكل المشروع](#3-هيكل-المشروع)
4. [قاعدة البيانات](#4-قاعدة-البيانات)
5. [الـ API — مرجع كامل](#5-الـ-api--مرجع-كامل)
6. [خدمات الذكاء الاصطناعي](#6-خدمات-الذكاء-الاصطناعي)
7. [نظام الرصيد (Credits)](#7-نظام-الرصيد-credits)
8. [الواجهة الأمامية](#8-الواجهة-الأمامية)
9. [المتغيرات البيئية](#9-المتغيرات-البيئية)
10. [التشغيل على Replit](#10-التشغيل-على-replit)
11. [إضافة ميزة جديدة](#11-إضافة-ميزة-جديدة)
12. [الميزات المُنجزة مقابل المخطط لها](#12-الميزات-المُنجزة-مقابل-المخطط-لها)
13. [خارطة الطريق التطويرية](#13-خارطة-الطريق-التطويرية)
14. [استكشاف الأعطال](#14-استكشاف-الأعطال)

---

## 1) نظرة عامة

**Brand Architect AI Pro** منصة SaaS متكاملة لبناء الهويات التجارية وإدارة الحملات التسويقية بالذكاء الاصطناعي.

### ما يمكن للمنصة فعله الآن

| الميزة | الحالة |
|---|---|
| إنشاء حساب وتسجيل دخول (JWT) | ✅ يعمل |
| معالج بناء الهوية التجارية | ✅ يعمل |
| توليد Brand Kit بالذكاء الاصطناعي | ✅ يعمل |
| توليد حملات تسويقية متعددة الأيام | ✅ يعمل |
| توليد صور بوستات بالذكاء الاصطناعي | ✅ يعمل |
| إعادة توليد النصوص وتوليد النسخ البديلة | ✅ يعمل |
| لوحة التحكم (إحصائيات، رصيد، علامات حديثة) | ✅ يعمل |
| محرر النودز البصري (`/nodes`) | ✅ يعمل (frontend) |
| نظام الرصيد والتحكم بالاستخدام | ✅ يعمل |

---

## 2) المكدس التقني الحالي

### البنية الكاملة

```
Replit (pnpm monorepo)
│
├── artifacts/api-server-python/   ← Backend الفعّال ✅
│   └── Python 3.11 + FastAPI + Uvicorn (port 8080)
│
├── artifacts/brand-os/            ← Frontend ✅
│   └── React 19 + Vite 7 + TypeScript (port 5000)
│
├── artifacts/api-server/          ← Backend القديم (TypeScript/Express) — متوقف ⛔
│   └── موجود للمرجعية فقط — لا تشغّله
│
├── lib/db/                        ← Schema + Drizzle ORM
├── lib/api-client-react/          ← React Query hooks مولّدة
└── lib/integrations/              ← مكتبات AI مُجمَّعة
```

### Backend — Python FastAPI

| المكوّن | التقنية |
|---|---|
| Framework | FastAPI 0.115 |
| Server | Uvicorn 0.32 (مع uvloop) |
| ORM | SQLAlchemy 2.0 |
| قاعدة البيانات | PostgreSQL (Replit Native) |
| Auth | JWT (python-jose) + bcrypt (passlib) |
| Validation | Pydantic v2 |
| AI — نصوص | OpenAI GPT-4o / Gemini (عبر Replit AI Integrations) |
| AI — صور | OpenAI gpt-image-1 / Google Gemini |

### Frontend — React Vite

| المكوّن | التقنية |
|---|---|
| Framework | React 19 + Vite 7 |
| Routing | Wouter 3 |
| State / Data | TanStack Query v5 |
| UI | Tailwind CSS 4 + Radix UI |
| Animations | Framer Motion |
| محرر النودز | @xyflow/react |
| Canvas | Fabric.js |

---

## 3) هيكل المشروع

```
artifacts/api-server-python/
├── main.py                    ← نقطة الدخول (uvicorn main:app)
└── app/
    ├── config.py              ← الإعدادات من متغيرات البيئة (Pydantic Settings)
    ├── database.py            ← SQLAlchemy engine + SessionLocal
    ├── models.py              ← ORM models (مطابقة للـ DB الفعلية)
    ├── schemas.py             ← Pydantic request/response schemas
    ├── deps.py                ← FastAPI dependencies (auth, db)
    ├── layers/
    │   ├── auth.py            ← JWT + bcrypt (قابل للاستبدال)
    │   ├── credits.py         ← نظام الرصيد (قابل للتعطيل: CREDITS_ENABLED=false)
    │   └── payments.py        ← Stripe stub (موثّق، غير منفّذ)
    ├── routes/
    │   ├── auth.py            ← /api/auth/*
    │   ├── brands.py          ← /api/brands/*
    │   ├── campaigns.py       ← /api/campaigns/*
    │   ├── posts.py           ← /api/posts/*
    │   ├── dashboard.py       ← /api/dashboard/*
    │   └── system.py          ← /api/health, /api/jobs/*, /api/public-settings
    └── services/
        ├── ai/
        │   ├── client.py      ← محدِّد مزوّد الـ AI (OpenAI / Gemini / Replit Proxy)
        │   ├── brand_kit.py   ← توليد Brand Kit
        │   ├── campaign.py    ← توليد الحملات
        │   ├── post.py        ← إعادة التوليد + النسخ البديلة
        │   └── image.py       ← توليد الصور (مع الشعارات والمراجع)
        ├── image_storage.py   ← تخزين الصور المولّدة (ملفات محلية)
        └── job_store.py       ← تتبع المهام الخلفية (in-memory)

artifacts/brand-os/src/
├── pages/
│   ├── LandingPage.tsx        ← الصفحة الرئيسية
│   ├── SignIn.tsx / SignUp.tsx
│   ├── Dashboard.tsx          ← لوحة التحكم
│   ├── BrandWizard.tsx        ← معالج إنشاء العلامة
│   ├── BrandKit.tsx           ← تفاصيل العلامة + توليد الكيت
│   ├── BrandEdit.tsx          ← تعديل العلامة
│   ├── CampaignList.tsx       ← قائمة الحملات
│   ├── CampaignBriefPage.tsx  ← توليد حملة جديدة
│   ├── CampaignWorkspace.tsx  ← مساحة عمل الحملة
│   └── nodes/                 ← محرر النودز البصري (/nodes)
├── contexts/
│   ├── AuthContext.tsx         ← إدارة حالة المستخدم
│   └── SiteSettingsContext.tsx ← إعدادات الموقع
└── lib/
    ├── apiError.ts            ← extractApiError / notifyError / notifySuccess
    └── queryClient.ts
```

---

## 4) قاعدة البيانات

### الجداول الفعّالة

```sql
users
  id            UUID PK
  email         TEXT UNIQUE NOT NULL
  password_hash TEXT NOT NULL
  name          TEXT
  role          TEXT DEFAULT 'user'    -- 'user' | 'admin'
  status        TEXT DEFAULT 'active'
  credits       INTEGER DEFAULT 100
  created_at    TIMESTAMPTZ
  updated_at    TIMESTAMPTZ

brands
  id                  SERIAL PK
  user_id             TEXT (UUID → users.id)
  company_name        TEXT NOT NULL
  company_description TEXT                    -- ⚠ ليس 'description'
  industry            TEXT
  website_url         TEXT                    -- ⚠ ليس 'website'
  logo_url            TEXT
  logo_variants       JSONB
  status              TEXT DEFAULT 'active'
  brand_kit           JSONB                   -- Brand Kit المولّد بالـ AI
  created_at          TIMESTAMPTZ
  updated_at          TIMESTAMPTZ

campaigns
  id              SERIAL PK
  brand_id        INTEGER → brands.id
  title           TEXT
  strategy        TEXT
  start_date      DATE
  end_date        DATE
  days            JSONB                       -- مصفوفة أيام الحملة
  status          TEXT DEFAULT 'draft'
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ

posts
  id              SERIAL PK
  campaign_id     INTEGER → campaigns.id
  day             INTEGER
  caption         TEXT
  hook            TEXT
  cta             TEXT
  hashtags        TEXT[]
  image_prompt    TEXT
  image_url       TEXT
  image_history   JSONB                       -- سجل الصور السابقة
  platform        TEXT DEFAULT 'instagram'
  scheduled_at    TIMESTAMPTZ
  published_at    TIMESTAMPTZ
  publish_status  TEXT DEFAULT 'draft'        -- 'draft' | 'scheduled' | 'published'
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ

app_settings
  key             TEXT PK                     -- 'site' | 'features' | 'maintenance' | 'creditCosts'
  value           JSONB
  updated_at      TIMESTAMPTZ

-- جداول موجودة في DB لكن غير مفعّلة حالياً في Python backend:
designs, social_accounts, api_keys, audit_logs, plans,
subscriptions, usage_events, webhooks, pages
```

### تحديث الـ Schema

```bash
# الأمر الوحيد لمزامنة DB مع الـ schema
pnpm --filter @workspace/db run push
```

---

## 5) الـ API — مرجع كامل

**Base URL:** `/api`  
**Auth:** JWT في cookie `auth_token` + header `Authorization: Bearer <token>`  
**Docs التفاعلية:** `/api/docs` (Swagger UI)

---

### 5.1 Auth — `/api/auth`

| Method | Endpoint | Auth؟ | الوصف |
|---|---|---|---|
| `POST` | `/auth/register` | ❌ | تسجيل مستخدم جديد |
| `POST` | `/auth/login` | ❌ | تسجيل الدخول |
| `POST` | `/auth/logout` | ❌ | تسجيل الخروج (مسح الكوكي) |
| `GET` | `/auth/me` | ✅ | بيانات المستخدم الحالي |

**POST /auth/register**
```json
{ "email": "user@example.com", "password": "min8chars", "name": "أحمد" }
→ 200: UserResponse | 409: Email already registered
```

**POST /auth/login**
```json
{ "email": "user@example.com", "password": "mypassword" }
→ 200: UserResponse | 401: Invalid email or password
```

**UserResponse**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "أحمد",
  "role": "user",
  "credits": 500,
  "created_at": "2026-01-01T00:00:00"
}
```

> **ملاحظة:** أول مستخدم يُسجَّل يحصل تلقائياً على صلاحية `admin` ويُعفى من نظام الرصيد.

---

### 5.2 Brands — `/api/brands`

| Method | Endpoint | Auth؟ | Credits | الوصف |
|---|---|---|---|---|
| `GET` | `/brands` | ✅ | — | قائمة العلامات (paginated) |
| `POST` | `/brands` | ✅ | — | إنشاء علامة جديدة |
| `GET` | `/brands/{id}` | ✅ | — | تفاصيل علامة |
| `PATCH` | `/brands/{id}` | ✅ | — | تعديل علامة |
| `DELETE` | `/brands/{id}` | ✅ | — | حذف علامة |
| `POST` | `/brands/{id}/generate-kit` | ✅ | 50 | توليد Brand Kit بالـ AI |
| `POST` | `/brands/{id}/generate-campaign` | ✅ | 60 | بدء توليد حملة (background job) |

**GET /brands** — Query params: `page=1`, `page_size=20`

**POST /brands**
```json
{
  "company_name": "شركة النجاح",
  "industry": "التقنية",
  "description": "وصف الشركة",
  "website": "https://example.com",
  "logo_url": "https://..."
}
```

**POST /brands/{id}/generate-kit**
```json
{ "brand_colors": ["#7c3aed", "#a78bfa"] }
→ 200: BrandDetailResponse (مع brand_kit محدّث)
```

**POST /brands/{id}/generate-campaign**
```json
{
  "days": 7,
  "platforms": ["instagram", "twitter"],
  "brief": "حملة إطلاق منتج",
  "target_audience": "الشباب العربي 18-35",
  "campaign_goal": "زيادة الوعي بالعلامة",
  "reference_images": ["data:image/jpeg;base64,..."]
}
→ 202: { "jobId": "uuid" }  ← استخدم /api/jobs/{jobId} للمتابعة
```

---

### 5.3 Campaigns — `/api/campaigns`

| Method | Endpoint | Auth؟ | الوصف |
|---|---|---|---|
| `GET` | `/campaigns` | ✅ | قائمة الحملات (يدعم `brand_id=X`) |
| `GET` | `/campaigns/{id}` | ✅ | تفاصيل الحملة + كل البوستات |
| `DELETE` | `/campaigns/{id}` | ✅ | حذف الحملة والبوستات |

---

### 5.4 Posts — `/api/posts`

| Method | Endpoint | Auth؟ | Credits | الوصف |
|---|---|---|---|---|
| `GET` | `/posts/{id}` | ✅ | — | تفاصيل بوست |
| `PATCH` | `/posts/{id}` | ✅ | — | تعديل بوست (نص، صورة، منصة) |
| `DELETE` | `/posts/{id}` | ✅ | — | حذف بوست |
| `POST` | `/posts/{id}/generate-image` | ✅ | 10 | توليد صورة |
| `POST` | `/posts/{id}/restore-image` | ✅ | — | استعادة صورة سابقة |
| `POST` | `/posts/{id}/regenerate` | ✅ | 8 | إعادة توليد النص |
| `POST` | `/posts/{id}/generate-variant` | ✅ | 5 | توليد نسخة بديلة (A/B) |
| `POST` | `/posts/{id}/generate-content` | ✅ | 5 | توليد محتوى طويل (مدونة/إيميل) |
| `POST` | `/campaigns/{id}/generate-all-images` | ✅ | 10×N | توليد صور جميع البوستات |

**POST /posts/{id}/generate-image**
```json
{
  "custom_prompt": "صورة احترافية لمنتج تقني",
  "size": "1024x1024",
  "logo_data_url": "data:image/png;base64,...",
  "model": "pro",
  "reference_images": [{ "url": "...", "weight": 1.0 }]
}
→ 200: PostResponse (مع image_url محدّث)
```

**POST /posts/{id}/restore-image**
```json
{ "image_url": "https://..." }
→ 200: PostResponse
```

---

### 5.5 Dashboard — `/api/dashboard`

| Method | Endpoint | Auth؟ | الوصف |
|---|---|---|---|
| `GET` | `/dashboard/summary` | ✅ | إحصائيات + علامات حديثة |
| `GET` | `/dashboard/credits` | ✅ | رصيد المستخدم الحالي |
| `PATCH` | `/dashboard/profile` | ✅ | تحديث الاسم |
| `POST` | `/dashboard/change-password` | ✅ | تغيير كلمة المرور |

**GET /dashboard/summary → Response**
```json
{
  "brandCount": 5,
  "campaignCount": 12,
  "postCount": 84,
  "credits": 350,
  "recentBrands": [ ...BrandSummaryResponse ]
}
```

---

### 5.6 System — `/api`

| Method | Endpoint | Auth؟ | الوصف |
|---|---|---|---|
| `GET` | `/health` | ❌ | فحص صحة الخادم والـ DB |
| `GET` | `/public-settings` | ❌ | إعدادات الموقع العامة |
| `GET` | `/jobs/{id}` | ✅ | حالة مهمة خلفية |
| `GET` | `/storage/images/objects/uploads/{id}` | ❌ | خدمة صورة مخزّنة |
| `GET` | `/credit-costs` | ❌ | تكلفة كل عملية AI |
| `GET` | `/docs` | ❌ | Swagger UI (تفاعلي) |

**GET /jobs/{id} → Response**
```json
{
  "id": "uuid",
  "status": "pending | running | done | failed",
  "progress": 3,
  "total": 7,
  "result": { ... },
  "error": null
}
```

**GET /public-settings → Response**
```json
{
  "siteName": "Brand Architect AI Pro",
  "tagline": "AI Brand & Marketing OS",
  "primaryColor": "#7c3aed",
  "defaultLanguage": "ar",
  "features": {},
  "maintenance": { "enabled": false }
}
```

---

## 6) خدمات الذكاء الاصطناعي

### 6.1 ترتيب أولوية المزوّد

يتحقق `app/services/ai/client.py` من المفاتيح بهذا الترتيب:

```
1. OPENAI_API_KEY          → OpenAI مباشرة
2. AI_INTEGRATIONS_OPENAI_API_KEY → Replit AI Proxy (مُعيَّن تلقائياً)
3. GEMINI_API_KEY          → Google Gemini
```

> **الحالة الحالية:** يعمل عبر **Replit AI Integrations** (لا يحتاج مفتاح خاص — يُشحن من رصيد Replit).

### 6.2 توليد Brand Kit (`brand_kit.py`)

- يرسل معلومات الشركة إلى GPT-4o/Gemini
- يولّد: الشخصية، نبرة الصوت، الألوان، الخطوط، شعارات مرشّحة، قواعد التواصل

### 6.3 توليد الحملات (`campaign.py`)

- يحلّل الموجز (brief) وصور المرجع إن وجدت
- يولّد خطة أيام مع (caption, hook, cta, hashtags, image_prompt) لكل يوم

### 6.4 توليد الصور (`image.py`)

- **OpenAI:** `gpt-image-1` مع إمكانية إدراج شعار كمرجع (`images.edit`)
- **Gemini:** استدعاء مباشر لـ `generateContent` بـ httpx (format مختلف عن OpenAI)
- دعم `reference_images` متعددة كـ base64

### 6.5 النماذج المدعومة حالياً

| الغرض | OpenAI | Gemini |
|---|---|---|
| نصوص | gpt-4o-mini (افتراضي) | gemini-2.5-flash |
| صور | gpt-image-1 | gemini-2.0-flash-exp-image-generation |

---

## 7) نظام الرصيد (Credits)

### التكاليف الافتراضية

| العملية | التكلفة |
|---|---|
| توليد Brand Kit | 50 رصيد |
| توليد حملة تسويقية | 60 رصيد |
| توليد صورة بوست | 10 رصيد |
| إعادة توليد نص | 8 رصيد |
| توليد نسخة بديلة | 5 رصيد |
| توليد محتوى طويل | 5 رصيد |
| توليد صور كل الحملة (per post) | 10 رصيد |

### السلوك

- **المستخدم الجديد:** يبدأ بـ **100 رصيد** افتراضياً
- **المستخدم admin:** مُعفى بالكامل من نظام الرصيد
- **أول مستخدم مسجّل:** يصبح admin تلقائياً
- **تعطيل الرصيد:** `CREDITS_ENABLED=false` في المتغيرات البيئية
- **رصيد غير كافٍ:** يُعيد `402 Payment Required`
- **فشل العملية:** يُسترجع الرصيد تلقائياً

### تخصيص التكاليف

يمكن تخصيص التكاليف من DB:
```sql
INSERT INTO app_settings (key, value) VALUES
('creditCosts', '{"post.generate-image": 15, "brand.generate-kit": 75}');
```

---

## 8) الواجهة الأمامية

### الصفحات والمسارات

| المسار | الصفحة | Auth؟ |
|---|---|---|
| `/` | Landing / Dashboard (حسب حالة تسجيل الدخول) | — |
| `/sign-in` | تسجيل الدخول | ❌ |
| `/sign-up` | إنشاء حساب | ❌ |
| `/brands/new` | معالج إنشاء علامة | ✅ |
| `/brands/:id` | Brand Kit (تفاصيل + توليد) | ✅ |
| `/brands/:id/edit` | تعديل علامة | ✅ |
| `/brands/:id/campaigns` | قائمة حملات العلامة | ✅ |
| `/brands/:id/campaigns/new` | إنشاء حملة جديدة | ✅ |
| `/campaigns/:id` | مساحة عمل الحملة | ✅ |
| `/nodes` | محرر النودز البصري | ✅ |

### إدارة Auth في Frontend

```typescript
// AuthContext يخزن التوكن في:
// 1. httpOnly cookie (auth_token) — أمان
// 2. localStorage (brand_os_auth_token) — للاستمرارية

// كل API call يرسل:
Authorization: Bearer <token>
// + credentials: "include" للكوكي
```

### إضافة Endpoint جديد للـ Frontend

```typescript
// في lib/api-client-react أو مباشرة في الصفحة:
const res = await fetch("/api/my-endpoint", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getAuthToken()}`,
  },
  credentials: "include",
  body: JSON.stringify(data),
});
```

---

## 9) المتغيرات البيئية

| المتغير | المصدر | مطلوب | الوصف |
|---|---|---|---|
| `DATABASE_URL` | Replit Postgres (تلقائي) | ✅ | رابط قاعدة البيانات |
| `AUTH_JWT_SECRET` | Replit userenv | ✅ | مفتاح توقيع JWT |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Replit AI Integrations (تلقائي) | ✅* | مفتاح AI عبر Replit Proxy |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Replit AI Integrations (تلقائي) | ✅* | عنوان AI Proxy |
| `OPENAI_API_KEY` | Replit Secrets (اختياري) | ❌ | مفتاح OpenAI المباشر |
| `GEMINI_API_KEY` | Replit Secrets (اختياري) | ❌ | مفتاح Google Gemini |
| `CREDITS_ENABLED` | — | ❌ | `false` لتعطيل نظام الرصيد |
| `AI_TEXT_MODEL` | — | ❌ | override نموذج النص (افتراضي: gpt-4o-mini) |
| `AI_TEMPERATURE` | — | ❌ | درجة الإبداعية (افتراضي: 0.7) |

*\* يُعيَّن تلقائياً من Replit AI Integrations — لا حاجة لإضافته يدوياً.*

---

## 10) التشغيل على Replit

### الـ Workflows الفعّالة

| الـ Workflow | الأمر | المنفذ | الحالة |
|---|---|---|---|
| `Python API Server` | `uvicorn main:app --host 0.0.0.0 --port 8080 --reload` | 8080 | ✅ فعّال |
| `Start application` | `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/brand-os run dev` | 5000 | ✅ فعّال |
| `API Server` (TypeScript) | — | 8080 | ⛔ محذوف (تعارض مع Python) |

> **تحذير مهم:** لا تشغّل `Python API Server` و `API Server (TypeScript)` في نفس الوقت — كلاهما يستخدم المنفذ 8080.

### بعد أي تعديل على Backend

```bash
# لا تحتاج restart يدوي — uvicorn --reload يتابع التغييرات تلقائياً
# لكن إذا أضفت package جديد:
pip install <package>
# أضفه أيضاً إلى:
artifacts/api-server-python/requirements.txt
```

### بعد أي تعديل على DB Schema

```bash
pnpm --filter @workspace/db run push
```

### سكريبت ما بعد الدمج (`scripts/post-merge.sh`)

```bash
#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter @workspace/db run push
pip install -r artifacts/api-server-python/requirements.txt
```

---

## 11) إضافة ميزة جديدة

### نمط إضافة Endpoint (Backend)

```
1. app/models.py         → أضف SQLAlchemy model أو عمود جديد
2. lib/db/src/schema/    → أضف Drizzle schema المقابل
3. pnpm --filter @workspace/db run push  → طبّق التغيير على DB
4. app/schemas.py        → أضف Pydantic schemas للطلب والاستجابة
5. app/services/         → أضف منطق الأعمال (بدون FastAPI deps)
6. app/routes/my_route.py → أضف APIRouter
7. main.py               → app.include_router(my_route.router, prefix="/api")
```

### نمط إضافة مزوّد Auth جديد

```python
# 1. أنشئ app/layers/my_auth.py يُنفّذ:
#    require_user(), get_user_or_none(), create_token(), set_cookie(), clear_cookie()
# 2. في app/deps.py:
auth_layer = MyAuthLayer()   # بدلاً من AuthLayer()
# لا شيء آخر يحتاج تعديل
```

### نمط إضافة مزوّد AI جديد

```python
# في app/services/ai/client.py
# أضف الشرط في دالة _resolve_client():
if settings.my_provider_api_key:
    return MyProviderClient(api_key=settings.my_provider_api_key), "my_provider"
```

---

## 12) الميزات المُنجزة مقابل المخطط لها

### ✅ منجز بالكامل

| الميزة | الملف المسؤول |
|---|---|
| تسجيل / دخول / خروج (JWT) | `app/routes/auth.py` |
| CRUD كامل للعلامات التجارية | `app/routes/brands.py` |
| CRUD الحملات والبوستات | `app/routes/campaigns.py`, `posts.py` |
| توليد Brand Kit بالـ AI | `app/services/ai/brand_kit.py` |
| توليد حملات تسويقية | `app/services/ai/campaign.py` |
| توليد صور البوستات | `app/services/ai/image.py` |
| إعادة توليد النصوص + variants | `app/services/ai/post.py` |
| نظام الرصيد | `app/layers/credits.py` |
| مهام خلفية + polling | `app/services/job_store.py` |
| محرر النودز البصري | `artifacts/brand-os/src/pages/nodes/` |
| لوحة التحكم | `app/routes/dashboard.py` |
| Swagger UI | `/api/docs` |

### 🔶 موجود في DB لكن Backend غير مفعّل

| الجدول | الحالة |
|---|---|
| `designs` | موجود — لا endpoint في Python |
| `social_accounts` | موجود — لا endpoint في Python |
| `api_keys` | موجود — لا endpoint في Python |
| `plans`, `subscriptions` | موجود — لا endpoint في Python |
| `usage_events` | موجود — لا تسجيل في Python |
| `webhooks` | موجود — لا endpoint في Python |

### ❌ غير منجز (مخطط مستقبلاً)

| الميزة | الجهد التقريبي | ملاحظات |
|---|---|---|
| لوحة Admin | متوسط | راجع `EXCLUDED_FEATURES.md` §3 |
| Stripe للدفع | عالٍ | stub موجود في `app/layers/payments.py` |
| نشر مباشر على وسائل التواصل | عالٍ | يحتاج OAuth لكل منصة |
| جدولة البوستات | متوسط | `scheduled_at` موجود في DB |
| Brand Book PDF | منخفض | راجع `EXCLUDED_FEATURES.md` §8 |
| OAuth (Google/GitHub) | متوسط | راجع `EXCLUDED_FEATURES.md` §1.1 |
| تتبع استخدام الـ AI | منخفض | جدول `usage_events` جاهز |
| حسابات الفريق (Teams) | عالٍ | يحتاج تغيير Schema |

---

## 13) خارطة الطريق التطويرية

### المرحلة القادمة — أولوية عالية

#### أ) Admin Panel

```python
# app/routes/admin.py
@router.get("/admin/users", dependencies=[Depends(require_admin)])
# endpoints: قائمة المستخدمين، إدارة الأرصدة، تغيير الأدوار، الإحصائيات الكاملة
```

#### ب) تتبع استخدام الـ AI

```python
# في كل عملية AI بعد النجاح:
db.add(UsageEvent(user_id=user.id, action="post.generate-image", cost=10))
db.commit()
# + endpoint: GET /api/dashboard/analytics
```

#### ج) جدولة البوستات

```python
# الحقل scheduled_at موجود في posts
# يحتاج: APScheduler أو Celery + background worker
# POST /api/posts/{id}/schedule → { "scheduled_at": "2026-06-01T10:00:00" }
```

### المرحلة البعيدة — أولوية متوسطة

#### د) Stripe للدفع

```bash
pip install stripe
```

```python
# app/routes/payments.py
# POST /api/payments/create-checkout-session
# POST /api/payments/webhook
# GET  /api/payments/portal
```

#### هـ) نشر على وسائل التواصل

```python
# app/services/social/instagram.py, twitter.py, linkedin.py
# POST /api/posts/{id}/publish → نشر فوري
# POST /api/posts/{id}/schedule → جدولة للنشر لاحقاً
```

---

## 14) استكشاف الأعطال

### Python API Server لا يبدأ

```bash
# تحقق من الـ requirements:
pip install -r artifacts/api-server-python/requirements.txt

# تحقق من DB URL:
echo $DATABASE_URL

# شغّل يدوياً للتشخيص:
cd artifacts/api-server-python && python -c "from app.config import settings; print(settings)"
```

### خطأ "relation does not exist"

```bash
# DB Schema غير مُطبَّق — شغّل:
pnpm --filter @workspace/db run push
```

### خطأ "AI provider not configured"

```bash
# تحقق من الـ AI integrations:
# في Python server logs: يظهر "✓ AI provider configured" أو "⚠ AI provider: ..."
# الحل: تأكد من أن Replit AI Integrations مُفعّل في إعدادات المشروع
# أو أضف OPENAI_API_KEY في Replit Secrets
```

### Frontend يظهر أخطاء 401

```
طبيعي للمستخدم غير المُسجَّل — /api/auth/me يُعيد 401 دائماً للزوار
```

### Frontend يظهر أخطاء 502

```bash
# Backend متوقف — تحقق من workflow "Python API Server"
# أو شغّله يدوياً:
cd artifacts/api-server-python && uvicorn main:app --host 0.0.0.0 --port 8080
```

### رصيد غير كافٍ (402)

```bash
# تعطيل مؤقت للتطوير:
# أضف في Replit environment variables:
CREDITS_ENABLED=false

# أو أضف رصيداً مباشرة:
UPDATE users SET credits = 9999 WHERE email = 'your@email.com';
```

---

## قواعد للمطوّرين

1. **الـ Backend الفعّال هو Python فقط** — `artifacts/api-server` موجود للمرجعية ولا يُشغَّل
2. **لا تكتب secrets في الكود** — كل الأسرار عبر `os.environ` أو Replit Secrets
3. **لا تستخدم localhost** في الكود — استخدم URLs نسبية (`/api/...`)
4. **Schema DB = Drizzle** — التعديلات تمر عبر `lib/db/src/schema/` ثم `db push`
5. **لا تستدعي** `Base.metadata.create_all()` — الجداول مُدارة بـ Drizzle
6. **الـ Swagger UI** متاح على `/api/docs` للاختبار التفاعلي
7. **أخطاء المستخدم** دائماً بالإنجليزية — استخدم `notifyError` من `lib/apiError.ts`
