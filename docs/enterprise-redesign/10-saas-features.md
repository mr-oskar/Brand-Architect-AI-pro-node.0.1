# المرحلة العاشرة: مميزات SaaS

## 1. Authentication & Authorization

### 1.1 Authentication Methods

```yaml
Email/Password:
  - bcrypt hashing (cost factor 12)
  - Password requirements: min 8 chars, 1 uppercase, 1 number
  - Breach password check (HaveIBeenPwned API)

JWT Strategy:
  - Access Token: JWT, 15 minutes TTL
  - Refresh Token: UUID stored in Redis, 7 days TTL
  - HttpOnly cookie for refresh token
  - Bearer token for access token

OAuth2 Providers:
  - Google (recommended for enterprise)
  - GitHub
  - Microsoft (enterprise)
  - Apple (future mobile)

Multi-Factor Authentication (MFA):
  - TOTP (Google Authenticator, Authy)
  - Backup codes (10 single-use codes)
  - Recovery flow via email

Session Management:
  - View active sessions
  - Revoke specific sessions
  - Revoke all sessions ("sign out everywhere")
```

### 1.2 RBAC System

```python
# auth/permissions.py

class Role(str, Enum):
    SUPER_ADMIN = "super_admin"  # Platform admin
    ADMIN = "admin"              # Org admin
    EDITOR = "editor"            # Can create/edit
    VIEWER = "viewer"            # Read-only

PERMISSIONS: dict[str, list[Role]] = {
    # Organization permissions
    "org:read":           [Role.VIEWER, Role.EDITOR, Role.ADMIN],
    "org:update":         [Role.ADMIN],
    "org:delete":         [Role.ADMIN],
    "org:manage_members": [Role.ADMIN],
    "org:manage_billing": [Role.ADMIN],
    
    # Brand permissions
    "brand:read":         [Role.VIEWER, Role.EDITOR, Role.ADMIN],
    "brand:create":       [Role.EDITOR, Role.ADMIN],
    "brand:update":       [Role.EDITOR, Role.ADMIN],
    "brand:delete":       [Role.ADMIN],
    
    # Campaign permissions
    "campaign:read":      [Role.VIEWER, Role.EDITOR, Role.ADMIN],
    "campaign:create":    [Role.EDITOR, Role.ADMIN],
    "campaign:update":    [Role.EDITOR, Role.ADMIN],
    "campaign:delete":    [Role.ADMIN],
    
    # AI permissions
    "ai:use":             [Role.EDITOR, Role.ADMIN],
    "ai:manage":          [Role.ADMIN],
    
    # Admin permissions
    "admin:users":        [Role.SUPER_ADMIN],
    "admin:system":       [Role.SUPER_ADMIN],
    "admin:billing":      [Role.SUPER_ADMIN],
}

def has_permission(user_role: Role, permission: str) -> bool:
    allowed_roles = PERMISSIONS.get(permission, [])
    return user_role in allowed_roles
```

---

## 2. Organizations & Multi-Tenancy

### 2.1 Organization Structure

```
Platform
└── Organization (Tenant)
    ├── Owner (1)
    ├── Admins (N)
    ├── Editors (N)
    ├── Viewers (N)
    ├── Workspaces (future)
    │   ├── Brands
    │   └── Campaigns
    └── Subscription + Credits
```

### 2.2 Organization Lifecycle

```
Create Organization:
  - Default org created on registration
  - Org name defaults to user's name
  - Assigned Free plan (100 credits)

Add Members:
  - Email invitation
  - Role assignment
  - Max members per plan enforced
  - Invitation expiry (48 hours)

Transfer Ownership:
  - Current owner → new owner
  - Confirmation required from both parties

Delete Organization:
  - Confirmation: "delete all data"
  - Soft delete (30 days grace period)
  - GDPR compliance
  - Data export before deletion
```

### 2.3 Tenant Isolation

```python
# middlewares/tenant_middleware.py

class TenantMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Extract org_id from JWT
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        if token:
            payload = decode_jwt(token)
            org_id = payload.get("org_id")
            if org_id:
                # Set PostgreSQL context variable
                request.state.org_id = org_id
        
        response = await call_next(request)
        return response

# In repository layer:
class TenantRepository:
    def __init__(self, session: AsyncSession, org_id: UUID):
        self.session = session
        self.org_id = org_id
    
    async def get_brand(self, brand_id: int) -> Optional[Brand]:
        # Always filter by org_id
        result = await self.session.execute(
            select(Brand).where(
                Brand.id == brand_id,
                Brand.org_id == self.org_id,  # Tenant isolation
                Brand.deleted_at.is_(None),
            )
        )
        return result.scalar_one_or_none()
```

---

## 3. Subscription Management

### 3.1 Subscription Plans

```
Free:
  Price: $0/month
  Credits: 100/month
  Brands: 2
  Campaigns: 5/month
  Members: 1
  Image models: DALL-E 3 only
  Support: Community

Starter:
  Price: $29/month | $290/year
  Credits: 1,000/month
  Brands: 10
  Campaigns: unlimited
  Members: 1
  Image models: DALL-E 3 + GPT-Image-1
  Support: Email

Professional:
  Price: $79/month | $790/year
  Credits: 5,000/month
  Brands: unlimited
  Campaigns: unlimited
  Members: 3
  Image models: All models
  Features: A/B testing, long-form content
  Support: Priority email

Business:
  Price: $199/month | $1,990/year
  Credits: 25,000/month
  Brands: unlimited
  Campaigns: unlimited
  Members: 10
  Image models: All models
  Features: All + API access + export
  Support: Chat

Enterprise:
  Price: Custom
  Credits: Custom
  Brands: unlimited
  Members: unlimited
  Features: All + custom models + SLA + dedicated support
  Deployment: Cloud or On-premise
  Support: Dedicated CSM
```

### 3.2 Stripe Integration

```python
# billing/stripe_client.py

class StripeClient:
    def __init__(self, api_key: str):
        stripe.api_key = api_key
    
    async def create_checkout_session(
        self,
        org_id: UUID,
        plan_slug: str,
        billing_cycle: Literal["monthly", "yearly"],
        success_url: str,
        cancel_url: str,
    ) -> str:
        plan = await self.get_plan(plan_slug)
        price_id = (plan.stripe_price_monthly_id 
                    if billing_cycle == "monthly" 
                    else plan.stripe_price_yearly_id)
        
        session = stripe.checkout.Session.create(
            customer=await self._get_or_create_customer(org_id),
            payment_method_types=["card"],
            line_items=[{"price": price_id, "quantity": 1}],
            mode="subscription",
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={"org_id": str(org_id)},
        )
        return session.url
    
    async def handle_webhook(self, payload: bytes, signature: str):
        event = stripe.Webhook.construct_event(
            payload, signature, settings.stripe_webhook_secret
        )
        
        handlers = {
            "checkout.session.completed": self._on_checkout_complete,
            "customer.subscription.updated": self._on_subscription_update,
            "customer.subscription.deleted": self._on_subscription_cancel,
            "invoice.payment_succeeded": self._on_payment_success,
            "invoice.payment_failed": self._on_payment_failed,
        }
        
        handler = handlers.get(event.type)
        if handler:
            await handler(event.data.object)
```

---

## 4. Credits System

### 4.1 Credit Costs

```python
# core/constants.py

CREDIT_COSTS = {
    # Brand operations
    "brand.generate-kit":           50,
    "brand.generate-story":         10,
    "brand.generate-content":        5,
    "brand.generate-logo-variants":  5,
    
    # Campaign operations
    "campaign.generate":            60,
    
    # Post operations
    "post.generate-image":          10,
    "post.regenerate":               8,
    "post.generate-variant":         5,
    "post.generate-content":         5,
    
    # Bulk operations
    "campaign.generate-all-images": 10,  # per image
}
```

### 4.2 Credit Manager

```python
# billing/credit_manager.py

class CreditManager:
    def __init__(self, db: AsyncSession, redis: Redis):
        self.db = db
        self.redis = redis
    
    async def check_and_reserve(
        self,
        org_id: UUID,
        amount: int,
        operation: str,
    ) -> ReservationToken:
        """
        Thread-safe credit check + reservation.
        Uses Redis distributed lock to prevent race conditions.
        """
        lock_key = f"credit_lock:{org_id}"
        
        async with self.redis.lock(lock_key, timeout=5):
            balance = await self._get_balance(org_id)
            
            if balance < amount:
                raise InsufficientCreditsError(
                    f"Need {amount} credits, have {balance}"
                )
            
            # Reserve (hold) credits
            reservation_id = str(uuid4())
            await self.redis.setex(
                f"credit_reservation:{reservation_id}",
                300,  # 5 min expiry
                json.dumps({"org_id": str(org_id), "amount": amount}),
            )
            return reservation_id
    
    async def confirm(self, reservation_id: str, description: str) -> None:
        """Confirm reservation → finalize deduction."""
        data = await self._get_reservation(reservation_id)
        await self._deduct(
            org_id=UUID(data["org_id"]),
            amount=data["amount"],
            description=description,
        )
        await self.redis.delete(f"credit_reservation:{reservation_id}")
    
    async def release(self, reservation_id: str) -> None:
        """Release reserved credits (on task failure)."""
        await self.redis.delete(f"credit_reservation:{reservation_id}")
```

---

## 5. API Keys for External Access

```python
# models/api_key.py

class APIKey(Base):
    __tablename__ = "api_keys"
    
    id = Column(UUID, primary_key=True)
    org_id = Column(UUID, ForeignKey("organizations.id"))
    user_id = Column(UUID, ForeignKey("users.id"))
    name = Column(String(100))
    key_hash = Column(String(255))   # SHA-256 hash of actual key
    key_prefix = Column(String(8))   # First 8 chars for display: "sk_live_"
    scopes = Column(ARRAY(String))   # ["brands:read", "campaigns:write", ...]
    last_used_at = Column(DateTime)
    expires_at = Column(DateTime)    # NULL = never expires
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime)

# Key format: sk_live_XXXXXXXXXXXXXXXXXXXXXXXX
# Only shown ONCE at creation time
# Stored as SHA-256 hash
```

---

## 6. Audit Logging

```python
# analytics/audit_logger.py

class AuditLogger:
    TRACKED_ACTIONS = {
        "user.login", "user.logout", "user.password_changed",
        "brand.created", "brand.updated", "brand.deleted",
        "campaign.created", "campaign.deleted",
        "post.deleted",
        "member.invited", "member.removed", "member.role_changed",
        "subscription.upgraded", "subscription.cancelled",
        "api_key.created", "api_key.revoked",
        "admin.*",
    }
    
    async def log(
        self,
        action: str,
        user_id: UUID,
        org_id: Optional[UUID],
        resource_type: str,
        resource_id: Optional[str],
        changes: Optional[dict] = None,
        request: Optional[Request] = None,
    ) -> None:
        await self.db.execute(
            insert(AuditLog).values(
                action=action,
                user_id=user_id,
                org_id=org_id,
                resource_type=resource_type,
                resource_id=resource_id,
                changes=changes,
                ip_address=request.client.host if request else None,
                user_agent=request.headers.get("user-agent") if request else None,
                request_id=request.state.request_id if request else None,
            )
        )
```

---

## 7. Notifications System

### 7.1 Notification Types

```python
NOTIFICATION_TYPES = {
    "job.completed":          "Your {job_type} is ready!",
    "job.failed":             "Your {job_type} failed. Credits refunded.",
    "credits.low":            "You have {credits} credits remaining.",
    "credits.exhausted":      "Credits exhausted. Upgrade to continue.",
    "member.invited":         "{inviter} invited you to join {org_name}",
    "member.joined":          "{member_name} joined your team",
    "subscription.renewed":   "Your subscription renewed. {credits} credits added.",
    "subscription.expiring":  "Your subscription expires in {days} days.",
    "payment.failed":         "Payment failed. Please update your payment method.",
}
```

### 7.2 Delivery Channels

```yaml
In-App (Real-time):
  - WebSocket push (primary)
  - Bell icon in header
  - Notification drawer

Email:
  - SendGrid / AWS SES
  - HTML templates with brand colors
  - Unsubscribe link (GDPR)

Future:
  - SMS (Twilio)
  - Slack integration
  - Webhooks for enterprise
```

---

## 8. Feature Flags

```python
# core/feature_flags.py

class FeatureFlag:
    """
    Feature flags for gradual rollout and A/B testing.
    Stored in DB + cached in Redis.
    """
    
    FLAGS = {
        "bulk_image_generation":     {"default": True},
        "campaign_export_pdf":       {"default": True},
        "ai_model_selection":        {"default": True},
        "advanced_prompt_editor":    {"default": False},
        "team_collaboration":        {"default": True, "plan": "business"},
        "api_access":                {"default": False, "plan": "business"},
        "custom_ai_provider":        {"default": False, "plan": "enterprise"},
        "white_label":               {"default": False, "plan": "enterprise"},
        "sso_saml":                  {"default": False, "plan": "enterprise"},
    }
    
    async def is_enabled(
        self,
        flag_key: str,
        org_id: Optional[UUID] = None,
        user_id: Optional[UUID] = None,
    ) -> bool:
        # Check Redis cache first
        cached = await self.redis.get(f"feature:{flag_key}:{org_id}")
        if cached is not None:
            return bool(int(cached))
        
        # Check DB
        flag = await self.db.get(FeatureFlagModel, flag_key)
        if not flag:
            return self.FLAGS.get(flag_key, {}).get("default", False)
        
        # Check rollout percentage
        if flag.rollout_percentage < 100:
            return self._hash_in_rollout(str(user_id or org_id), flag.rollout_percentage)
        
        # Check org whitelist
        if flag.allowed_org_ids and org_id not in flag.allowed_org_ids:
            return False
        
        return flag.is_enabled
```
