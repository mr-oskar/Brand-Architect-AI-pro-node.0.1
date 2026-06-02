# المرحلة الثانية عشرة: الأمن (Security)

## 1. Security Architecture Overview

```
Internet
    ↓
[Cloudflare WAF]
  • DDoS protection (L3, L4, L7)
  • Bot management
  • OWASP Top 10 rules
  • IP reputation filtering
  • Rate limiting at edge
    ↓
[TLS Termination]
  • TLS 1.2 minimum (TLS 1.3 preferred)
  • HSTS preload
  • Certificate pinning (mobile)
    ↓
[Nginx / ALB]
  • Request ID injection
  • Security headers
  • IP allowlist for admin
    ↓
[FastAPI Application]
  • JWT validation
  • RBAC enforcement
  • Input validation (Pydantic)
  • SQL injection prevention (ORM)
  • Rate limiting per user
    ↓
[PostgreSQL + Redis]
  • Encryption at rest (AES-256)
  • Network isolation (VPC)
  • Audit logging
  • Row Level Security
```

---

## 2. JWT Security

```python
# auth/jwt.py

from datetime import datetime, timedelta
from jose import jwt, JWTError
from cryptography.hazmat.primitives import serialization

# Use RS256 (asymmetric) in production — more secure than HS256
ALGORITHM = "RS256"

class JWTManager:
    def __init__(self, private_key: str, public_key: str):
        self.private_key = private_key
        self.public_key = public_key
    
    def create_access_token(
        self,
        user_id: str,
        org_id: str,
        role: str,
        extra_claims: dict = None,
    ) -> str:
        payload = {
            "sub": user_id,
            "org_id": org_id,
            "role": role,
            "type": "access",
            "iat": datetime.utcnow(),
            "exp": datetime.utcnow() + timedelta(minutes=15),
            "jti": str(uuid4()),  # JWT ID for revocation
            **(extra_claims or {}),
        }
        return jwt.encode(payload, self.private_key, algorithm=ALGORITHM)
    
    def create_refresh_token(self) -> str:
        """Refresh token is a random UUID stored in Redis — not a JWT."""
        return secrets.token_urlsafe(64)
    
    def verify_access_token(self, token: str) -> dict:
        try:
            payload = jwt.decode(
                token,
                self.public_key,
                algorithms=[ALGORITHM],
                options={
                    "verify_exp": True,
                    "verify_iat": True,
                    "require": ["sub", "org_id", "role", "exp", "jti"],
                }
            )
            return payload
        except JWTError as e:
            raise UnauthorizedError(f"Invalid token: {e}")
```

---

## 3. Rate Limiting

```python
# middlewares/rate_limit_middleware.py

from slowapi import Limiter
from slowapi.util import get_remote_address

# Per-endpoint rate limits
RATE_LIMITS = {
    # Auth (strict — prevent brute force)
    "/api/v1/auth/login":           "5/minute",
    "/api/v1/auth/register":        "3/minute",
    "/api/v1/auth/forgot-password": "3/hour",
    
    # AI operations (generous but controlled)
    "/api/v1/brands/*/generate-kit":      "10/hour",
    "/api/v1/campaigns/*/generate":       "5/hour",
    "/api/v1/posts/*/generate-image":     "30/hour",
    
    # Standard API
    "default": "200/minute",
}

# Per-user rate limits (using Redis)
class UserRateLimiter:
    def __init__(self, redis: Redis):
        self.redis = redis
    
    async def check(
        self,
        user_id: str,
        endpoint: str,
        limit: int,
        window: int,  # seconds
    ) -> bool:
        key = f"rate:{user_id}:{endpoint}:{int(time.time() // window)}"
        
        pipe = self.redis.pipeline()
        pipe.incr(key)
        pipe.expire(key, window)
        results = await pipe.execute()
        
        current = results[0]
        
        if current > limit:
            raise RateLimitError(
                f"Rate limit exceeded. Max {limit} requests per {window}s."
            )
        
        return True
    
    async def get_remaining(
        self, user_id: str, endpoint: str, limit: int, window: int
    ) -> dict:
        key = f"rate:{user_id}:{endpoint}:{int(time.time() // window)}"
        current = int(await self.redis.get(key) or 0)
        return {
            "limit": limit,
            "remaining": max(0, limit - current),
            "reset": int(time.time() // window + 1) * window,
        }
```

---

## 4. Input Validation & Sanitization

```python
# schemas/brand.py — Validation examples

class BrandCreateRequest(BaseModel):
    company_name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        # Strip HTML tags
        strip_whitespace=True,
    )
    description: str = Field(
        ...,
        min_length=10,
        max_length=2000,
    )
    website: Optional[AnyHttpUrl] = None
    industry: str = Field(..., max_length=100)
    
    @field_validator("company_name", "description")
    @classmethod
    def sanitize_text(cls, v: str) -> str:
        # Remove HTML tags
        import bleach
        return bleach.clean(v, tags=[], strip=True)
    
    @field_validator("website")
    @classmethod
    def validate_website(cls, v):
        if v:
            parsed = urlparse(str(v))
            if parsed.scheme not in ("http", "https"):
                raise ValueError("Only HTTP/HTTPS URLs allowed")
        return v

# File upload validation
class FileUploadValidator:
    ALLOWED_MIME_TYPES = {"image/png", "image/jpeg", "image/webp", "image/svg+xml"}
    MAX_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
    
    @staticmethod
    async def validate(file: UploadFile) -> None:
        # Check MIME type
        if file.content_type not in FileUploadValidator.ALLOWED_MIME_TYPES:
            raise ValidationError(f"File type {file.content_type} not allowed")
        
        # Check file size
        content = await file.read()
        if len(content) > FileUploadValidator.MAX_SIZE_BYTES:
            raise ValidationError("File too large (max 5MB)")
        
        # Verify magic bytes (prevent MIME spoofing)
        import magic
        detected_type = magic.from_buffer(content[:1024], mime=True)
        if detected_type not in FileUploadValidator.ALLOWED_MIME_TYPES:
            raise ValidationError("File content doesn't match declared type")
        
        await file.seek(0)
```

---

## 5. Security Headers

```python
# middlewares/security_middleware.py

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), "
            "payment=(), usb=(), magnetometer=()"
        )
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'nonce-{nonce}'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https://*.amazonaws.com https://*.cloudflare.com; "
            "connect-src 'self' https://api.openai.com; "
            "frame-ancestors 'none';"
        )
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains; preload"
        )
        
        return response
```

---

## 6. Data Encryption

```python
# core/encryption.py

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import base64, os

class EncryptionManager:
    """
    AES-256-GCM encryption for sensitive fields.
    Used for: API keys, OAuth tokens, MFA secrets.
    """
    
    def __init__(self, key: bytes):
        # key must be 32 bytes (256 bits)
        self.key = key
    
    def encrypt(self, plaintext: str) -> str:
        aesgcm = AESGCM(self.key)
        nonce = os.urandom(12)  # 96-bit nonce
        ciphertext = aesgcm.encrypt(nonce, plaintext.encode(), None)
        # Store nonce + ciphertext together
        return base64.b64encode(nonce + ciphertext).decode()
    
    def decrypt(self, ciphertext_b64: str) -> str:
        aesgcm = AESGCM(self.key)
        data = base64.b64decode(ciphertext_b64)
        nonce, ciphertext = data[:12], data[12:]
        return aesgcm.decrypt(nonce, ciphertext, None).decode()

# API Key hashing (one-way — for comparison only)
def hash_api_key(key: str) -> str:
    """SHA-256 hash of API key for storage."""
    return hashlib.sha256(key.encode()).hexdigest()

def verify_api_key(key: str, stored_hash: str) -> bool:
    return hmac.compare_digest(hash_api_key(key), stored_hash)
```

---

## 7. OWASP Top 10 Mitigations

```yaml
A01 — Broken Access Control:
  ✅ RBAC on every endpoint
  ✅ Ownership check (can user access this resource?)
  ✅ Tenant isolation (org_id filter on all queries)
  ✅ Admin routes protected separately
  ✅ Rate limiting per user/org

A02 — Cryptographic Failures:
  ✅ TLS 1.2+ enforced
  ✅ bcrypt for passwords (cost=12)
  ✅ AES-256-GCM for sensitive fields
  ✅ Secrets in environment variables (never in code)
  ✅ HSTS preload

A03 — Injection:
  ✅ SQLAlchemy ORM (no raw SQL)
  ✅ Pydantic validation on all inputs
  ✅ HTML sanitization (bleach)
  ✅ File type validation (magic bytes)
  ✅ Parameterized queries only

A04 — Insecure Design:
  ✅ Threat modeling document
  ✅ Defense in depth (multiple layers)
  ✅ Principle of least privilege

A05 — Security Misconfiguration:
  ✅ Security headers middleware
  ✅ CORS: specific origins only
  ✅ Debug mode disabled in production
  ✅ Error messages don't leak internals
  ✅ Dependency scanning (dependabot)

A06 — Vulnerable Components:
  ✅ Automated dependency updates (Dependabot)
  ✅ Regular security audits (npm audit / pip audit)
  ✅ SBOM (Software Bill of Materials)

A07 — Auth Failures:
  ✅ Refresh token rotation
  ✅ Session revocation
  ✅ Brute force protection (account lockout)
  ✅ MFA support
  ✅ Secure password reset flow

A08 — Software & Data Integrity:
  ✅ Signed container images
  ✅ CI/CD: only signed commits
  ✅ Stripe webhook signature verification
  ✅ Content integrity (CSP)

A09 — Logging & Monitoring Failures:
  ✅ Structured logging (all auth events)
  ✅ Audit logs (all CRUD + admin actions)
  ✅ Anomaly detection alerts
  ✅ Correlation IDs per request

A10 — SSRF:
  ✅ URL whitelist for outbound requests
  ✅ Block private IP ranges in user inputs
  ✅ Timeout on all external HTTP calls
```

---

## 8. Audit Logging

```python
# analytics/audit_logger.py

SENSITIVE_FIELDS = {
    "password", "hashed_password", "api_key", "access_token",
    "refresh_token", "secret", "credit_card",
}

def mask_sensitive(data: dict) -> dict:
    """Remove sensitive fields from audit logs."""
    return {
        k: "***REDACTED***" if k in SENSITIVE_FIELDS else v
        for k, v in data.items()
    }

# Middleware integration
class AuditMiddleware(BaseHTTPMiddleware):
    AUDITED_METHODS = {"POST", "PATCH", "PUT", "DELETE"}
    
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        if request.method in self.AUDITED_METHODS and response.status_code < 400:
            await audit_logger.log(
                action=f"{request.method.lower()}.{request.url.path}",
                user_id=getattr(request.state, "user_id", None),
                org_id=getattr(request.state, "org_id", None),
                resource_type=self._extract_resource_type(request.url.path),
                ip_address=request.client.host,
                user_agent=request.headers.get("user-agent"),
                request_id=request.state.request_id,
            )
        
        return response
```

---

## 9. GDPR Compliance

```python
# api/v1/auth.py — Data export & deletion

@router.get("/me/export")
async def export_user_data(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    """GDPR Article 20: Data portability."""
    data = await user_service.export_all_data(current_user.id)
    
    # Create downloadable JSON
    filename = f"data_export_{current_user.id}_{date.today()}.json"
    filepath = f"/tmp/{filename}"
    with open(filepath, "w") as f:
        json.dump(data, f, default=str, ensure_ascii=False)
    
    return FileResponse(
        filepath,
        media_type="application/json",
        filename=filename,
    )

@router.delete("/me")
async def delete_account(
    confirmation: DeleteAccountRequest,  # requires password confirmation
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """GDPR Article 17: Right to erasure."""
    # Verify password
    if not verify_password(confirmation.password, current_user.hashed_password):
        raise UnauthorizedError("Password incorrect")
    
    await user_service.anonymize_user(current_user.id)
    # Anonymize: replace PII with hashed values, keep non-PII for analytics
    # Hard delete after 30-day grace period
```
