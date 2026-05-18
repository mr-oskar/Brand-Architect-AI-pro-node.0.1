# Excluded Features — Documentation

This document lists all features that were intentionally excluded from the Python backend.
Each section explains WHY it was excluded and HOW to add it when ready.

---

## 1. Authentication & Authorization Layers

### 1.1 OAuth2 / Social Login (Google, GitHub, Apple)
**Status:** Not implemented  
**Why excluded:** Requires OAuth2 redirect flows and additional DB tables (oauth_accounts).  
**How to add:**
1. Install `authlib` or `social-core`
2. Add GET `/api/auth/{provider}` → redirect to OAuth provider
3. Add GET `/api/auth/{provider}/callback` → exchange code for user
4. Store `(provider, provider_user_id)` in a new `oauth_accounts` table
5. Issue auth cookie same as password login

### 1.2 Clerk Integration (External Auth Provider)
**Status:** Not implemented  
**Why excluded:** Clerk requires frontend SDK changes and a Clerk account.  
**How to add:**
1. Set `CLERK_SECRET_KEY` env var
2. Create `app/layers/clerk_auth.py` verifying Clerk JWTs
3. Swap `auth_layer = AuthLayer()` → `auth_layer = ClerkAuthLayer()` in `app/deps.py`
4. No routes need to change

### 1.3 API Key Authentication
**Status:** Not implemented  
**Why excluded:** Not needed for browser-based app; useful for programmatic access.  
**How to add:**
1. Add `api_keys` table (key_hash, user_id, name, scopes, last_used_at)
2. Create `app/layers/api_key_auth.py`
3. Update `_extract_token()` in `app/layers/auth.py` to check `X-API-Key` header

### 1.4 Magic Link / Passwordless Login
**Status:** Not implemented  
**Why excluded:** Requires email sending infrastructure.  
**How to add:**
1. Add email provider (SendGrid, Resend, or AWS SES)
2. POST `/api/auth/magic-link` → generate token, send email
3. GET `/api/auth/verify?token=...` → verify token, set cookie

### 1.5 Email Verification
**Status:** Not implemented (users can register without verifying email)  
**Why excluded:** Requires email infrastructure.  
**How to add:**
1. Add `email_verified` boolean column to `users` table
2. On register: send verification email
3. GET `/api/auth/verify-email?token=...` → mark user as verified

### 1.6 Multi-Factor Authentication (MFA/TOTP)
**Status:** Not implemented  
**How to add:**
1. Install `pyotp`
2. Add `totp_secret` and `mfa_enabled` to `users` table
3. Add TOTP setup/verify endpoints
4. Require TOTP code in login flow when `mfa_enabled=true`

---

## 2. Payments & Subscriptions

### 2.1 Stripe Integration
**Status:** Stub only (see `app/layers/payments.py`)  
**Why excluded:** Requires a Stripe account, business setup, and careful webhook handling.  
**How to add:**
```bash
pip install stripe
```
Set env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

Implement:
- `POST /api/payments/create-checkout-session` → create Stripe Checkout session
- `POST /api/payments/webhook` → handle `payment_intent.succeeded`, `customer.subscription.*`
- `GET /api/payments/portal` → Stripe Customer Portal URL

Credit packs (examples):
```python
CREDIT_PACKS = {
    "starter": {"credits": 500, "price_id": "price_xxx"},
    "pro": {"credits": 2000, "price_id": "price_yyy"},
}
```

Store `stripe_customer_id` on the User model.

### 2.2 RevenueCat (Mobile In-App Purchases)
**Status:** Not implemented  
**Why excluded:** Only needed for iOS/Android app.  
**How to add:**
1. Add `POST /api/payments/revenuecat-webhook`
2. Verify RevenueCat JWT signature
3. Call `credits_layer.add_credits()` on purchase events

### 2.3 Subscription Tiers
**Status:** Not implemented (flat credit balance only)  
**Why excluded:** Requires product/pricing design decisions.  
**How to add:**
1. Add `subscription_tier` column to `users` (free | starter | pro | enterprise)
2. Create `app/layers/subscription.py` with tier-based limits
3. Replace `credits_layer.charge_credits()` with `subscription_layer.check_usage()`

### 2.4 Invoice History
**Status:** Not implemented  
**How to add:**
1. Create `invoices` table (user_id, amount, credits, stripe_invoice_id, created_at)
2. Add `GET /api/payments/invoices` endpoint
3. Populate from Stripe webhook events

---

## 3. Admin Panel
**Status:** Not implemented (removed from frontend)  
**Why excluded:** Removed as per user request for MVP scope.  
**How to add:**
1. Create `app/routes/admin.py` with `Depends(get_current_admin)`
2. Endpoints needed:
   - `GET /api/admin/users` — paginated user list
   - `PATCH /api/admin/users/{id}/credits` — set user credits
   - `PATCH /api/admin/users/{id}/role` — change user role
   - `GET /api/admin/settings` — read all app_settings
   - `PUT /api/admin/settings/{key}` — update a setting
   - `GET /api/admin/stats` — platform-wide statistics

---

## 4. Social Media Publishing

### 4.1 Direct Publishing (Instagram, Twitter/X, LinkedIn, Facebook)
**Status:** Not implemented  
**Why excluded:** Requires OAuth scopes for each platform + platform API accounts.  
**How to add:**
1. Add `social_accounts` table (user_id, platform, access_token, token_expiry, page_id)
2. Create `app/services/social/` with per-platform clients
3. Add `POST /api/posts/{id}/publish` → call platform API
4. Add `POST /api/posts/{id}/schedule` → store `scheduled_at`, background scheduler publishes it

### 4.2 Post Scheduling
**Status:** Not implemented  
**How to add:**
1. Add `scheduled_at` column (already in schema!)
2. Use APScheduler or Celery + Redis for a background scheduler
3. Add `POST /api/posts/{id}/schedule` → set `scheduled_at`
4. Scheduler polls posts WHERE `scheduled_at <= NOW() AND publish_status = 'scheduled'`

---

## 5. Content Calendar
**Status:** Removed (was frontend only)  
**Why excluded:** Removed as per user request for MVP scope.  
**How to add:**
1. Re-add the `ContentCalendar.tsx` frontend page
2. Backend: add `GET /api/posts?from=DATE&to=DATE&brandId=X` for calendar view
3. Add drag-and-drop rescheduling via PATCH `/api/posts/{id}` (update `scheduled_at`)

---

## 6. Asset Library
**Status:** Removed  
**Why excluded:** Removed as per user request for MVP scope.  
**How to add:**
1. Create `assets` table (user_id, file_url, file_type, tags, created_at)
2. Add multipart upload endpoint: `POST /api/assets/upload`
3. Add `GET /api/assets` with search/filter

---

## 7. Templates
**Status:** Removed  
**Why excluded:** Removed as per user request for MVP scope.  
**How to add:**
1. Create `templates` table (name, category, prompt_template, platform, is_public)
2. Add `GET /api/templates` — list/search templates
3. Add `POST /api/templates/{id}/apply/{post_id}` — apply template to a post

---

## 8. Brand Book (PDF Export)
**Status:** Removed  
**Why excluded:** Removed as per user request for MVP scope.  
**How to add:**
```bash
pip install reportlab weasyprint  # or playwright for HTML→PDF
```
Add `GET /api/brands/{id}/export/pdf` → render brand kit as PDF

---

## 9. Nodes / Visual Editor
**Status:** Completely removed  
**Why excluded:** Removed as per user request for MVP scope.  
**How to add:** Re-add `artifacts/api-server/src/routes/nodes.ts` logic in Python form.

---

## 10. Brand Design Studio
**Status:** Completely removed  
**Why excluded:** Removed as per user request for MVP scope.

---

## 11. Analytics & Usage Tracking
**Status:** Not implemented  
**Why excluded:** Requires analytics infrastructure.  
**How to add:**
1. Create `usage_events` table (user_id, action, cost, metadata, created_at)
2. Log every `charge_credits` call to this table
3. Add `GET /api/dashboard/analytics` with burn rate, top actions, etc.

---

## 12. Webhooks (Outbound)
**Status:** Not implemented  
**Why excluded:** Advanced feature for power users.  
**How to add:**
1. Create `webhooks` table (user_id, url, events, secret, active)
2. Add webhook management endpoints
3. Fire webhooks via background thread on matching events (campaign.generated, post.published, etc.)

---

## 13. Multi-Tenant / Team Accounts
**Status:** Not implemented (single-user brands only)  
**How to add:**
1. Create `teams` table (name, owner_id, plan_tier)
2. Create `team_members` table (team_id, user_id, role)
3. Migrate brands from `user_id` to `team_id`
4. Update all ownership checks to accept team membership

---

## Architecture Notes

### Adding a new feature (general pattern):
```
1. app/models.py          → add SQLAlchemy model + run Alembic migration
2. app/schemas.py         → add Pydantic request/response schemas
3. app/services/          → add business logic (no FastAPI deps here)
4. app/routes/my_feature.py → add FastAPI router
5. main.py               → include the new router
```

### Adding a new auth layer:
```
1. Create app/layers/my_auth.py implementing: require_user(), get_user_or_none(), create_token(), set_cookie(), clear_cookie()
2. Update app/deps.py: auth_layer = MyAuthLayer()
3. Done — no routes need to change
```

### Adding a new AI provider:
```
1. Update app/services/ai/client.py: add to _resolve_client() priority chain
2. Add model mapping in GEMINI_MODEL_MAP (or similar)
3. Optionally add provider-specific image generation in app/services/ai/image.py
```
