# المرحلة السابعة: سير العمل (Workflows)

## 1. Brand Creation Workflow

### الوصف
تدفق إنشاء علامة تجارية جديدة من البداية حتى الحصول على Brand Kit كامل.

```
Trigger: User clicks "Create Brand" + submits form

┌─────────────────────────────────────────────────────────┐
│ Step 1: Validate Input                                   │
│   Input:  company_name, industry, description, logo     │
│   Output: validated_data                                │
│   Failure: ValidationError → show form errors           │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│ Step 2: Save Brand Record                                │
│   Input:  validated_data, user_id, org_id               │
│   Output: brand_id                                      │
│   Failure: DB Error → rollback + user error             │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│ Step 3: Process Logo (if provided)                       │
│   Input:  logo_file                                     │
│   Steps:                                                │
│     3a. Upload to S3 → logo_url                         │
│     3b. Extract colors (Canvas API)                     │
│     3c. Generate variants (B&W, grayscale)              │
│   Output: logo_url, logo_colors, logo_variants          │
│   Failure: Skip logo, continue without it               │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│ Step 4: Generate Brand Kit (Async)                       │
│   Input:  brand_data + logo_analysis                    │
│   Trigger: Celery task                                  │
│   Steps:                                                │
│     4a. Build AI context                                │
│     4b. Call BrandAgent.generate_brand_kit()            │
│     4c. Parse + validate response                       │
│     4d. Save brand_kit to DB                            │
│     4e. Deduct 50 credits                               │
│   Output: job_id                                        │
│   Failure:                                              │
│     - AI error → retry 3x (exponential backoff)        │
│     - All retries fail → job.status = "failed"         │
│     - Refund credits                                    │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│ Step 5: Notify User                                      │
│   - WebSocket: push completion event                    │
│   - Email: "Your Brand Kit is ready!"                   │
│   - In-app notification                                 │
└─────────────────────────────────────────────────────────┘

Recovery Strategy:
  - Step 3 fails: continue without logo, log warning
  - Step 4 fails after all retries: refund credits, notify user
  - Step 5 fails: log error (non-critical)
```

---

## 2. Campaign Generation Workflow

### الوصف
التدفق الأكثر تعقيداً — يولّد استراتيجية + عشرات المنشورات.

```
Trigger: User submits campaign brief

┌──────────────────────────────────────────────────────────┐
│ Step 1: Validate & Deduct Credits                        │
│   Input:  brief, platforms, duration_days, brand_id     │
│   Output: credit_reservation_id                         │
│   Cost:   60 credits (held, not deducted yet)           │
│   Failure: InsufficientCredits → 402 error              │
└─────────────────────┬────────────────────────────────────┘
                      │
┌─────────────────────▼────────────────────────────────────┐
│ Step 2: Create Campaign + Job                            │
│   Output: campaign_id, job_id                           │
│   Return job_id to user → frontend starts polling       │
└─────────────────────┬────────────────────────────────────┘
                      │ (async - Celery worker)
┌─────────────────────▼────────────────────────────────────┐
│ Step 3: Analyze Brief (10%)                              │
│   AI: Extract key messages, themes, objectives          │
│   Output: campaign_strategy                             │
└─────────────────────┬────────────────────────────────────┘
                      │
┌─────────────────────▼────────────────────────────────────┐
│ Step 4: Generate Posts (10%-90%)                         │
│   For each day (1 to N):                                │
│     For each platform:                                  │
│       4a. Build post context (day, platform, strategy)  │
│       4b. Call CampaignAgent._generate_post()           │
│       4c. Parse: content + hashtags + image_prompt      │
│       4d. Save post to DB                               │
│   Progress: updated per post                            │
└─────────────────────┬────────────────────────────────────┘
                      │
┌─────────────────────▼────────────────────────────────────┐
│ Step 5: Finalize (90%-100%)                              │
│   5a. Update campaign.status = "completed"              │
│   5b. Deduct 60 credits (from reservation)              │
│   5c. Update job.status = "completed"                   │
│   5d. Notify user (WebSocket + Email)                   │
└──────────────────────────────────────────────────────────┘

Recovery:
  Post fails: Skip + mark as "failed", continue other posts
  All posts fail: Refund credits, mark campaign as "failed"
  Worker dies: Celery auto-retry from last checkpoint
  
Timeout: Max 5 minutes total (configurable)
```

---

## 3. Image Generation Workflow

```
Trigger: User clicks "Generate Image" on a post

┌─────────────────────────────────────────────────────────┐
│ Step 1: Request Validation                              │
│   Input:  post_id, prompt, size, model, references      │
│   Check:  credits (10), ownership, post exists         │
│   Failure: 402 insufficient credits / 404 not found    │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│ Step 2: Enqueue Image Task                               │
│   Output: job_id                                        │
│   Return job_id immediately                             │
└─────────────────────┬───────────────────────────────────┘
                      │ (Celery Worker)
┌─────────────────────▼───────────────────────────────────┐
│ Step 3: Enhance Prompt                                  │
│   Input:  base_prompt, brand_kit, enhancement_level     │
│   AI:     GPT-4o-mini → enhanced prompt                │
│   Failure: Use original prompt                         │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│ Step 4: Select Provider & Generate                       │
│   4a. Resolve provider (model → OpenAI/Gemini/etc.)    │
│   4b. Generate image                                    │
│   4c. On 404: try fallback models                       │
│   4d. On all fail: try alternate provider               │
│   Output: image_bytes (PNG)                             │
│   Failure after all retries: refund credits, notify    │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│ Step 5: Store & Update                                   │
│   5a. Upload to S3/R2 → image_url                       │
│   5b. Add to post.image_history                         │
│   5c. Update post.image_url                             │
│   5d. Deduct 10 credits                                 │
│   5e. Update job.status = "completed"                   │
│   5f. Notify via WebSocket                              │
└─────────────────────────────────────────────────────────┘

Retry Strategy:
  - AI provider 429: wait 30s, retry up to 3x
  - AI provider 404 (model not found): try next model
  - AI provider 500: try alternate provider
  - Network error: retry 3x with exponential backoff
  - All fail: refund credits + error notification
```

---

## 4. User Onboarding Workflow

```
Trigger: New user registration

Step 1: Create User Account
  → Hash password (bcrypt, cost=12)
  → Generate verification token
  → Send verification email (async)
  → Create default Organization
  → Assign Free plan
  → Grant welcome credits (100)

Step 2: Email Verification
  User clicks link in email
  → Validate token (expires 24h)
  → Mark user as verified
  → Send welcome email
  → Redirect to onboarding wizard

Step 3: Onboarding Wizard (frontend)
  → Step 1: Tell us about your brand
  → Step 2: Upload logo (optional)
  → Step 3: Generate first Brand Kit (AI)
  → Step 4: Tour the interface

Recovery:
  Verification email not received: resend endpoint
  Token expired: resend endpoint
  Wizard abandoned: resume on next login
```

---

## 5. Billing & Credits Workflow

```
5.1 Credit Deduction Flow:
─────────────────────────
Request → CreditManager.check(org_id, amount)
        → InsufficientCredits if balance < amount
        → Reserve credits (Redis lock to prevent race)
        → Execute AI task
        → On success: finalize deduction
              CreditTransaction(type="usage", amount=-N)
              Update org.credits_balance
        → On failure: release reservation (refund)

5.2 Credit Purchase Flow:
────────────────────────
User → POST /api/v1/billing/credits/purchase
     → Create Stripe PaymentIntent
     → Return client_secret to frontend

Frontend → Stripe.confirmPayment()
         → Payment success → Stripe sends webhook

Webhook → POST /api/v1/webhooks/stripe
        → Verify signature
        → Handle payment_intent.succeeded
        → Add credits to org.credits_balance
        → Create CreditTransaction(type="purchase")
        → Send confirmation email

5.3 Subscription Renewal:
─────────────────────────
Celery Beat (monthly):
  → Find orgs with active subscriptions
  → Reset credits to plan.credits_per_month
  → Create CreditTransaction(type="reset")
  → Send monthly summary email

OR Stripe handles renewal:
  → Webhook: invoice.payment_succeeded
  → Reset credits + notify user
```

---

## 6. Authentication Workflow

```
6.1 Login Flow:
───────────────
POST /auth/login { email, password }
  → Find user by email
  → Verify bcrypt hash
  → Check user.is_active
  → Check user.is_verified (optional grace period)
  → Generate access_token (JWT, 15min)
  → Generate refresh_token (UUID, 7 days)
  → Store refresh_token in Redis: key=token, value=user_id, TTL=7days
  → Set HttpOnly cookie: refresh_token
  → Return: { access_token, user }
  → Log audit: "user.login" + IP + user_agent

6.2 Token Refresh:
──────────────────
POST /auth/refresh (cookie: refresh_token)
  → Read refresh_token from HttpOnly cookie
  → Look up in Redis (verify not revoked)
  → Verify token not expired
  → Generate new access_token
  → Rotate refresh_token (optional: new token + update Redis)
  → Return: { access_token }

6.3 Logout:
──────────
POST /auth/logout (cookie: refresh_token)
  → Delete refresh_token from Redis (instant revocation)
  → Clear HttpOnly cookie
  → Log audit: "user.logout"
  → Return 204

6.4 OAuth Flow:
──────────────
GET /auth/oauth/google
  → Redirect to Google OAuth consent
  
GET /auth/oauth/google/callback?code=...
  → Exchange code for tokens
  → Get user profile from Google
  → Find or create user (upsert by email)
  → Issue access_token + refresh_token
  → Redirect to frontend with token
```

---

## 7. Team Invitation Workflow

```
Trigger: Admin sends invitation

Step 1: Create Invitation
  → Validate email not already member
  → Generate secure token (UUID)
  → Store in organization_members with status="pending"
  → Send invitation email with link

Step 2: User Accepts
  → User clicks link (token in URL)
  → Validate token: exists + not expired (48h) + org still active
  → If user exists: add to org
  → If user new: show registration form, then add to org
  → Mark invitation as accepted
  → Notify admin: "{name} joined the team"

Recovery:
  Token expired: admin can resend invitation
  User already has account: skip registration
  Org at member limit: show upgrade prompt
```

---

## 8. Export Workflow

```
Trigger: User requests campaign export

Step 1: Validate & Enqueue
  Input: campaign_id, format (CSV/JSON/PDF)
  Output: job_id

Step 2: Generate Export (Worker)
  CSV:
    → Query all posts
    → Format: day, platform, content, hashtags, image_url
    → Write to temp file
  
  JSON:
    → Full campaign data with brand kit
    → Structured hierarchically
  
  PDF:
    → WeasyPrint/ReportLab
    → Brand colors + logo
    → One page per day
    → QR codes for images

Step 3: Upload & Notify
  → Upload to S3 exports bucket (TTL: 7 days)
  → Generate pre-signed URL (expires 24h)
  → Notify user: "Your export is ready"
  → Return download URL
```
