# المرحلة التاسعة: مواصفات الصفحات الكاملة

## 1. Landing Page (الصفحة الرئيسية العامة)

**المسار:** `/`  
**الهدف:** تحويل الزوار إلى مشتركين

### الأقسام
```
Hero Section:
  - عنوان رئيسي: "Build Your Brand Identity with AI"
  - وصف قصير
  - CTA: "Start Free" + "Watch Demo"
  - صورة/فيديو توضيحي

Features Section:
  - Brand Kit AI
  - Campaign Generator
  - Image Studio
  - Team Collaboration

Pricing Section:
  - Free / Starter / Professional / Business / Enterprise
  - مقارنة المميزات
  - CTA لكل خطة

Testimonials Section:
  - آراء العملاء مع الصور

FAQ Section

Footer:
  - روابط الصفحات
  - التواصل الاجتماعي
  - Legal (Privacy, Terms)
```

### الحالات
```
Loading: Skeleton للـ pricing (من API)
Error: Static fallback pricing
```

---

## 2. Dashboard (لوحة التحكم الرئيسية)

**المسار:** `/dashboard`  
**الصلاحية:** مستخدم مسجل  
**الهدف:** نظرة شاملة على كل العلامات والحملات

### المكونات والبيانات

```
Header:
  - اسم المستخدم + greeting
  - رصيد الاعتمادات الحالي
  - زر "New Brand"

Stats Cards (4 cards):
  - Total Brands: count
  - Active Campaigns: count
  - Posts Generated: count (this month)
  - Credits Used: N / total (this month)

Recent Brands (grid):
  - BrandCard × 6
  - "View All" link

Recent Campaigns:
  - CampaignCard × 4
  - "View All" link

Quick Actions:
  - Create Brand
  - Generate Campaign
  - Image Studio

Usage Chart:
  - Bar chart: Credits used per day (last 30 days)
  - Provider breakdown (OpenAI vs Gemini)

AI Tips Widget:
  - اقتراحات تحسين الـ brand
```

### حالات التحميل
```
Loading: Skeleton لكل قسم
Empty (no brands): EmptyState + "Create your first brand"
Error: Alert + retry button
```

---

## 3. Brands List Page

**المسار:** `/brands`  
**الهدف:** عرض وإدارة جميع العلامات التجارية

### المكونات
```
Page Header:
  - عنوان "My Brands"
  - عداد العلامات
  - Search input (debounced)
  - Filter: Industry
  - Sort: Newest / Oldest / Alphabetical
  - زر "New Brand"

Brands Grid:
  - BrandCard للعلامة:
    ├── شعار الشركة (أو placeholder)
    ├── اسم الشركة
    ├── الصناعة
    ├── عدد الحملات
    ├── تاريخ الإنشاء
    ├── Brand Kit status badge
    └── Actions: View | Edit | Delete | Duplicate

Pagination:
  - Page numbers + previous/next
  - Items per page: 12 / 24 / 48

Empty State:
  - رسالة + CTA "Create your first brand"
```

---

## 4. Brand Wizard (معالج إنشاء العلامة)

**المسار:** `/brands/new`  
**الهدف:** إنشاء علامة تجارية جديدة بخطوات موجّهة

### الخطوات

```
Step 1 — Basic Info:
  - Company Name *
  - Industry (select)
  - Description (textarea, 50-1000 chars)
  - Website (optional)
  - Target Audience (optional)
  Progress: 25%

Step 2 — Logo Upload:
  - Dropzone (PNG/JPG/SVG/WEBP, max 5MB)
  - Preview + crop
  - Color extraction preview (5 colors)
  - Skip option
  Progress: 50%

Step 3 — Brand Preferences:
  - Tone of Voice (chips: Professional/Friendly/Bold/Playful/...)
  - Visual Style (chips: Modern/Classic/Minimalist/...)
  - Content Pillars (multi-select)
  Progress: 75%

Step 4 — Generate & Review:
  - "Generate Brand Kit" button (costs 50 credits)
  - Credit cost indicator
  - Progress animation during generation
  - Preview Brand Kit on success
  - Edit any field
  Progress: 100%

Navigation:
  - Back / Next / Skip
  - Progress bar at top
  - Save draft on each step
```

### حالات التحميل
```
Generating: Full-screen overlay with:
  - Progress bar (0-100%)
  - Current step text: "Analyzing your brand..."
  - Animated AI visualization
Error: Toast + option to retry
Success: Redirect to Brand Kit page
```

---

## 5. Brand Kit Page

**المسار:** `/brands/[id]`  
**الهدف:** عرض وإدارة Brand Kit الكامل

### الأقسام

```
Brand Header:
  - Logo (large) + company name
  - Industry badge
  - Edit button
  - "Generate New Kit" (if outdated)
  - Share button

Brand Kit Display:
  Personality & Positioning:
    - Personality trait chips
    - Positioning statement
    - Unique Value Proposition
  
  Tone of Voice:
    - Description
    - Do's / Don'ts examples
  
  Target Audience:
    - Audience segments as cards
    - Demographics
  
  Color Palette:
    - Color swatches (5 colors)
    - Hex codes (click to copy)
    - Color names
  
  Visual Style:
    - Style description
    - Mood board images
  
  Content Pillars:
    - Pillar cards with descriptions
  
  Brand Story:
    - Full text
    - "Regenerate" button (10 credits)

Logo Section:
  - Original logo
  - B&W variant
  - Grayscale variant
  - "Generate Variants" button (5 credits)

Long-Form Content:
  - "Generate Blog Post" (5 credits)
  - "Generate Newsletter" (5 credits)
  - "Generate Email" (5 credits)

Campaigns Section:
  - Recent campaigns list (3)
  - "View All Campaigns" button
  - "Create New Campaign" button

Brand Stats:
  - Total campaigns
  - Total posts
  - Total images generated
  - Credits used for this brand
```

---

## 6. Campaign Brief Page

**المسار:** `/brands/[id]/campaigns/new`  
**الهدف:** إنشاء حملة تسويقية جديدة

### المكونات
```
Brand Context Header:
  - Brand name + logo
  - Brand Kit summary (personality, colors)

Brief Form:
  Campaign Name:
    - Text input

  Campaign Brief:
    - Textarea (min 50 chars)
    - AI suggestions button
    - Character counter

  Platforms:
    - Multi-select chips:
      Instagram / Facebook / Twitter / LinkedIn / TikTok / YouTube
    - Platform-specific notes (char limits, etc.)

  Duration:
    - Slider: 1-30 days
    - Quick select: 7 days / 14 days / 30 days

  Campaign Objectives (optional):
    - Multi-select: Brand Awareness / Lead Gen / Sales / Engagement / ...

  Tone Override (optional):
    - Inherits from Brand Kit by default
    - Override if needed

  Advanced Settings (collapsible):
    - Image style preference
    - Hashtag density

Generate Button:
  - "Generate Campaign (60 credits)"
  - Credit cost breakdown
  - Estimated time: "~2-3 minutes"
```

---

## 7. Campaign Workspace

**المسار:** `/campaigns/[id]`  
**الهدف:** عرض وإدارة منشورات الحملة

### الهيكل

```
Campaign Header:
  - Campaign name + edit icon
  - Brand name link
  - Status badge (draft/generating/completed)
  - Dates range
  - "Generate All Images" button (bulk)
  - Export dropdown: CSV / JSON / PDF

Generating State:
  - Full progress bar
  - Current step text
  - Estimated time remaining
  - Cancel option

Filter/Sort Bar:
  - Filter by: Day / Platform / Has Image / No Image
  - Sort by: Day / Platform

Posts Grid/List (toggle):
  PostCard for each post:
    ├── Platform badge + Day number
    ├── Post text (truncated + expand)
    ├── Hashtags
    ├── Image (if generated) or placeholder
    ├── Actions:
    │   ├── Edit text (inline)
    │   ├── Generate Image
    │   ├── Regenerate Text (8 credits)
    │   ├── Generate Variant A/B (5 credits)
    │   ├── Generate Long-Form (5 credits)
    │   ├── View Image History
    │   └── Delete post
    └── Schedule toggle

Image Generation Dialog:
  - Custom prompt (pre-filled from image_prompt)
  - Enhancement level: Nano / Mini / Pro
  - Model selector
  - Size selector
  - Logo reference toggle
  - Reference images upload
  - "Generate" button

Schedule Panel (sidebar):
  - Calendar view
  - Drag posts to dates
  - Platform time suggestions
```

---

## 8. Settings Pages

### 8.1 General Settings (`/settings`)
```
Profile:
  - Full name
  - Email (read-only + change flow)
  - Avatar upload
  - Password change

Preferences:
  - Language
  - Timezone
  - Email notifications

Danger Zone:
  - Delete account (with confirmation)
```

### 8.2 Organization Settings (`/settings/organization`)
```
Organization Info:
  - Name
  - Logo
  - Domain
  - Slug

Billing (link to billing page)

Danger Zone:
  - Delete organization
```

### 8.3 Team Management (`/settings/team`)
```
Members Table:
  - Avatar | Name | Email | Role | Joined | Actions
  - Roles: Owner / Admin / Editor / Viewer
  - Actions: Change role / Remove

Pending Invitations:
  - Email | Invited by | Expires | Revoke

Invite Form:
  - Email input
  - Role selector
  - Send Invitation button

Member Limit:
  - Current: N/max members
  - Upgrade prompt if at limit
```

### 8.4 Billing (`/settings/billing`)
```
Current Plan Card:
  - Plan name
  - Credits: N/total (progress bar)
  - Next reset date
  - Upgrade/Downgrade button

Plans Comparison:
  - Plan cards side by side
  - Current plan highlighted
  - Annual/Monthly toggle

Payment Methods:
  - Saved cards
  - Add new card (Stripe Elements)
  - Default payment method

Invoice History:
  - Table: Date | Amount | Status | Download PDF

Credit Packs (one-time purchase):
  - 500 credits / 2,000 / 10,000
  - Buy button → Stripe checkout
```

### 8.5 API Keys (`/settings/api-keys`)
```
API Keys Table:
  - Name | Last Used | Created | Scopes | Delete

Create New Key:
  - Key name
  - Scopes selection
  - Create → show key once (copy)

Usage per key (charts)
```

---

## 9. Admin Pages

### 9.1 Admin Dashboard (`/admin`)
```
Platform Stats:
  - Total Users: N
  - Active Organizations: N
  - Brands Created: N
  - Images Generated: N
  - API Requests Today: N
  - Revenue (MRR): $N

Charts:
  - Daily signups (last 30 days)
  - Daily AI requests
  - Revenue trend
  - Credits consumed by type

System Health:
  - API Response Time (p50, p95, p99)
  - DB Connection Pool
  - Redis Status
  - Celery Workers Active
  - Error Rate

Recent Activity:
  - New signups
  - Failed jobs
  - System alerts
```

### 9.2 Users Management (`/admin/users`)
```
Filters: Search | Role | Plan | Status | Date range

Users Table:
  - Avatar | Name | Email | Role | Plan | Credits | Brands | Last Login | Status
  - Actions: View | Edit | Reset Credits | Impersonate | Disable | Delete

User Detail Modal:
  - Full profile
  - Subscription info
  - Credit transactions
  - Activity log
  - Edit role/credits
```

### 9.3 AI Providers (`/admin/ai-providers`)
```
Provider Cards:
  OpenAI:
    - Status: Connected ✓
    - Key: sk-...XXXX (masked)
    - Test Connection button
    - Default model selectors:
      - Text model: GPT-4o ▼
      - Image model: DALL-E 3 ▼
    - Sync Models button
    - Edit / Disable

  Google Gemini:
    - Status / Key / Models / Toggle

  Custom Provider:
    - Base URL + Key + Test + Models

Available Models List:
  - Table: Model ID | Display Name | Capability | Context Window | Enabled toggle

Task-to-Model Mapping:
  - brand_kit: GPT-4o ▼
  - campaign_generation: GPT-4o ▼
  - post_generation: GPT-4o-mini ▼
  - image_generation: DALL-E 3 ▼
  - prompt_enhancement: GPT-4o-mini ▼

Usage Statistics:
  - Bar chart: requests per model
  - Cost breakdown by model
  - Success rate per model
```

### 9.4 Usage Analytics (`/admin/usage`)
```
Date Range Picker

Overview Cards:
  - Total AI Requests
  - Total Tokens Used
  - Total Cost ($)
  - Average Response Time

Charts:
  - Requests over time (line chart)
  - Cost over time
  - Token usage by type (stacked bar)
  - Top users by credit consumption

Usage Logs Table:
  - Timestamp | User | Org | Task Type | Model | Tokens | Cost | Duration | Status
  - Filters + Export CSV

Cost Breakdown:
  - By provider
  - By task type
  - By organization
```

### 9.5 Subscription Plans (`/admin/plans`)
```
Plans Table:
  - Name | Slug | Monthly Price | Yearly | Credits | Max Brands | Members | Status
  - Edit | Clone | Disable

Create/Edit Plan Form:
  - All plan fields
  - Feature flags checkboxes
  - Stripe product/price IDs

Active Subscriptions:
  - Table of all active subscriptions
  - Organization | Plan | Billing Cycle | Next Payment | Status
```
