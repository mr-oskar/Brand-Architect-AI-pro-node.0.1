# المرحلة السادسة: طبقة الذكاء الاصطناعي (AI Layer)

## 1. نظرة عامة على المعمارية

```
┌─────────────────────────────────────────────────────────────┐
│                    AI ORCHESTRATOR                           │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Brand Agent │  │Campaign Agent│  │   Image Agent    │  │
│  │              │  │              │  │                  │  │
│  │ brand_kit    │  │ strategy     │  │ prompt_enhance   │  │
│  │ brand_story  │  │ posts        │  │ image_generate   │  │
│  │ brand_content│  │ brief_analyze│  │ multi_model      │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         └─────────────────┼────────────────────┘           │
│                            │                                │
│              ┌─────────────▼──────────────┐                │
│              │    Provider Router         │                │
│              │ (cost, speed, capability)  │                │
│              └─────────────┬──────────────┘                │
│                            │                                │
│    ┌───────────────────────┼───────────────────────┐       │
│    │                       │                       │       │
│    ▼                       ▼                       ▼       │
│ OpenAI             Google Gemini            Anthropic      │
│ GPT-4o              Gemini 2.5              Claude 3.5     │
│ DALL-E 3            Imagen 3                (text only)    │
│ GPT-Image-1                                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Agent System

### 2.1 Brand Agent

```python
# services/ai/agents/brand_agent.py

class BrandAgent:
    """
    المسؤول عن كل ما يتعلق بالهوية التجارية.
    
    Inputs:
        - company_name: str
        - industry: str
        - description: str
        - target_audience: str
        - logo_analysis: dict (colors, style)
        - existing_kit: dict (for updates)
    
    Outputs:
        - brand_kit: BrandKit
        - brand_story: str
        - content_pillars: list[str]
    
    Memory:
        - Brand context (company + industry + audience)
        - Previous iterations (for improvement)
    
    Tools:
        - call_ai_text() → GPT-4o / Claude
        - parse_brand_kit() → structured output
        - validate_kit() → schema validation
    """
    
    def __init__(self, orchestrator: AIOrchestrator):
        self.orchestrator = orchestrator
    
    async def generate_brand_kit(
        self,
        brand: Brand,
        logo_analysis: Optional[dict] = None,
    ) -> BrandKit:
        """
        Workflow:
        1. تحليل معلومات الشركة
        2. استخراج insights من الـ logo (إن وجد)
        3. توليد Brand DNA كاملة
        4. Validate وإعادة المحاولة إذا لزم
        """
        context = self._build_context(brand, logo_analysis)
        
        system = BRAND_KIT_SYSTEM_PROMPT
        user = BRAND_KIT_USER_PROMPT.format(**context)
        
        result = await self.orchestrator.generate_text(
            prompt=user,
            system=system,
            task_type="brand_kit",
            max_tokens=3000,
        )
        
        return self._parse_brand_kit(result.text)
    
    async def generate_brand_story(self, brand: Brand) -> str:
        context = {
            "name": brand.company_name,
            "industry": brand.industry,
            "description": brand.description,
            "kit": brand.brand_kit,
        }
        
        result = await self.orchestrator.generate_text(
            prompt=BRAND_STORY_PROMPT.format(**context),
            system="You are a master brand storyteller.",
            task_type="brand_story",
            max_tokens=800,
        )
        return result.text
    
    async def generate_long_form_content(
        self,
        brand: Brand,
        content_type: Literal["blog", "newsletter", "email"],
        topic: str,
    ) -> str:
        ...
    
    def _build_context(self, brand: Brand, logo_analysis: Optional[dict]) -> dict:
        return {
            "company_name": brand.company_name,
            "industry": brand.industry or "general",
            "description": brand.description,
            "target_audience": brand.target_audience or "",
            "logo_colors": logo_analysis.get("colors", []) if logo_analysis else [],
            "logo_style": logo_analysis.get("style", "") if logo_analysis else "",
        }
    
    def _parse_brand_kit(self, text: str) -> BrandKit:
        """Parse structured JSON from AI response with fallback."""
        import json, re
        json_match = re.search(r'\{[\s\S]+\}', text)
        if json_match:
            try:
                data = json.loads(json_match.group())
                return BrandKit(**data)
            except Exception:
                pass
        return self._fallback_parse(text)
```

### 2.2 Campaign Agent

```python
# services/ai/agents/campaign_agent.py

class CampaignAgent:
    """
    المسؤول عن تخطيط وتوليد الحملات التسويقية.
    
    Inputs:
        - brand: Brand (including brand_kit)
        - brief: str
        - platforms: list[Platform]
        - duration_days: int
        - objectives: list[str]
        - tone: str
    
    Outputs:
        - strategy: CampaignStrategy
        - posts: list[PostContent]
    
    Workflow:
        Step 1: تحليل الـ brief واستخراج الأهداف
        Step 2: توليد استراتيجية الحملة
        Step 3: توزيع المحتوى على الأيام والمنصات
        Step 4: توليد نص كل منشور
        Step 5: توليد Image Prompt لكل منشور
    """
    
    async def generate_campaign(
        self,
        brand: Brand,
        brief: str,
        platforms: list[str],
        duration_days: int,
        objectives: Optional[list[str]] = None,
        tone: Optional[str] = None,
        progress_callback: Optional[Callable] = None,
    ) -> CampaignResult:
        
        # Step 1: Analyze brief
        if progress_callback:
            await progress_callback(10, "تحليل الـ brief...")
        
        strategy = await self._generate_strategy(brand, brief, objectives, tone)
        
        # Step 2: Generate posts
        posts = []
        total = duration_days * len(platforms)
        for day in range(1, duration_days + 1):
            for platform in platforms:
                if progress_callback:
                    pct = 20 + int(80 * len(posts) / total)
                    await progress_callback(pct, f"اليوم {day} - {platform}...")
                
                post = await self._generate_post(
                    brand=brand,
                    strategy=strategy,
                    day=day,
                    platform=platform,
                    brief=brief,
                )
                posts.append(post)
        
        return CampaignResult(strategy=strategy, posts=posts)
    
    async def _generate_strategy(
        self, brand: Brand, brief: str, objectives, tone
    ) -> CampaignStrategy:
        prompt = CAMPAIGN_STRATEGY_PROMPT.format(
            brand_name=brand.company_name,
            industry=brand.industry,
            brand_kit=json.dumps(brand.brand_kit, ensure_ascii=False),
            brief=brief,
            objectives=objectives or [],
            tone=tone or "professional",
        )
        result = await self.orchestrator.generate_text(
            prompt=prompt,
            system=CAMPAIGN_STRATEGY_SYSTEM,
            task_type="campaign_strategy",
            max_tokens=1000,
        )
        return self._parse_strategy(result.text)
    
    async def _generate_post(
        self, brand, strategy, day, platform, brief
    ) -> PostContent:
        platform_config = PLATFORM_CONFIGS[platform]
        prompt = POST_GENERATION_PROMPT.format(
            brand_name=brand.company_name,
            strategy_theme=strategy.daily_themes.get(day, "general"),
            platform=platform,
            max_chars=platform_config.max_chars,
            hashtag_style=platform_config.hashtag_style,
            day=day,
            brand_personality=brand.brand_kit.get("personality", ""),
        )
        result = await self.orchestrator.generate_text(
            prompt=prompt,
            system=POST_GENERATION_SYSTEM,
            task_type="post_generation",
            max_tokens=600,
        )
        return self._parse_post(result.text, day, platform)
```

### 2.3 Image Agent

```python
# services/ai/agents/image_agent.py

class ImageAgent:
    """
    المسؤول عن توليد وتحسين الصور التسويقية.
    
    Inputs:
        - prompt: str (base prompt)
        - brand: Brand
        - size: ImageSize
        - model: str (optional override)
        - references: list[bytes] (logo + reference images)
        - enhancement_level: nano | mini | pro
    
    Outputs:
        - image_bytes: bytes (PNG)
        - enhanced_prompt: str
        - model_used: str
    
    Routing Logic:
        1. pro enhancement → call_ai_text() to enhance prompt
        2. Route to correct provider based on model
        3. Retry with fallback on failure
        4. Return image bytes
    """
    
    async def generate(
        self,
        prompt: str,
        brand: Brand,
        size: ImageSize,
        model: Optional[str] = None,
        references: Optional[list[bytes]] = None,
        enhancement: Literal["nano", "mini", "pro"] = "pro",
    ) -> ImageResult:
        
        # Step 1: Enhance prompt
        final_prompt = await self._enhance_prompt(prompt, brand, enhancement)
        
        # Step 2: Select provider
        provider = self._resolve_provider(model)
        
        # Step 3: Generate with fallback
        try:
            image_bytes = await provider.generate_image(
                prompt=final_prompt,
                size=size,
                model=model,
                references=references,
            )
        except ProviderError as e:
            if e.is_retryable:
                fallback = self._get_fallback_provider(provider)
                image_bytes = await fallback.generate_image(
                    prompt=final_prompt,
                    size=size,
                )
            else:
                raise
        
        return ImageResult(
            bytes=image_bytes,
            enhanced_prompt=final_prompt,
            model_used=model or provider.default_image_model,
        )
    
    async def _enhance_prompt(
        self, prompt: str, brand: Brand, level: str
    ) -> str:
        if level == "nano":
            return prompt
        
        kit = brand.brand_kit or {}
        enhancer_prompt = IMAGE_ENHANCE_PROMPT.format(
            level=level,
            prompt=prompt,
            brand_name=brand.company_name,
            visual_style=kit.get("visualStyle", ""),
            personality=kit.get("personality", ""),
            colors=json.dumps(kit.get("colorPalette", {})),
        )
        
        result = await self.orchestrator.generate_text(
            prompt=enhancer_prompt,
            system="You are a world-class creative director.",
            task_type="image_prompt_enhancement",
            max_tokens=700,
        )
        return result.text.strip() or prompt
```

---

## 3. Provider System

### 3.1 Abstract Base Provider

```python
# services/ai/providers/base.py

class AIProvider(ABC):
    """Abstract base for all AI providers."""
    
    name: str
    default_text_model: str
    default_image_model: Optional[str] = None
    
    @abstractmethod
    async def complete(
        self,
        prompt: str,
        system: str,
        model: Optional[str] = None,
        max_tokens: int = 2000,
        temperature: float = 0.7,
    ) -> TextResult:
        """Generate text completion."""
        ...
    
    @abstractmethod
    async def generate_image(
        self,
        prompt: str,
        size: ImageSize,
        model: Optional[str] = None,
        references: Optional[list[bytes]] = None,
    ) -> bytes:
        """Generate image. Returns PNG bytes."""
        ...
    
    @abstractmethod
    async def list_models(self) -> list[ModelInfo]:
        """List available models from this provider."""
        ...
    
    @abstractmethod
    async def health_check(self) -> ProviderHealth:
        """Test connectivity and auth."""
        ...
```

### 3.2 OpenAI Provider

```python
# services/ai/providers/openai_provider.py

class OpenAIProvider(AIProvider):
    name = "openai"
    default_text_model = "gpt-4o"
    default_image_model = "dall-e-3"
    
    def __init__(self, api_key: str, base_url: Optional[str] = None):
        self.client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
            timeout=120.0,
        )
    
    async def complete(self, prompt, system, model=None, max_tokens=2000, temperature=0.7):
        response = await self.client.chat.completions.create(
            model=model or self.default_text_model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return TextResult(
            text=response.choices[0].message.content,
            model=response.model,
            usage=Usage(
                input=response.usage.prompt_tokens,
                output=response.usage.completion_tokens,
            )
        )
    
    async def generate_image(self, prompt, size, model=None, references=None):
        img_model = model or self.default_image_model
        
        if "gpt-image-1" in img_model and references:
            # gpt-image-1 supports image[] parameter
            return await self._generate_with_references(prompt, size, img_model, references)
        
        response = await self.client.images.generate(
            model=img_model,
            prompt=prompt,
            size=size,
            n=1,
        )
        
        url = response.data[0].url
        async with httpx.AsyncClient() as client:
            r = await client.get(url, follow_redirects=True)
            return r.content
```

### 3.3 Circuit Breaker

```python
# services/ai/circuit_breaker.py

class CircuitBreaker:
    """
    تمنع الاستدعاءات المتكررة للـ provider عند الفشل.
    
    States: CLOSED → OPEN → HALF_OPEN → CLOSED
    
    CLOSED: طبيعي، كل الطلبات تمر
    OPEN: فشل متكرر، يُرفض الطلب فوراً
    HALF_OPEN: يسمح بطلب واحد للاختبار
    """
    
    def __init__(
        self,
        failure_threshold: int = 5,
        success_threshold: int = 2,
        timeout: int = 60,  # seconds before trying again
        redis_client: Optional[Redis] = None,
    ):
        self.failure_threshold = failure_threshold
        self.success_threshold = success_threshold
        self.timeout = timeout
        self.redis = redis_client
    
    async def call(self, provider_name: str, fn: Callable, *args, **kwargs):
        state = await self._get_state(provider_name)
        
        if state == "OPEN":
            if await self._should_try(provider_name):
                await self._set_state(provider_name, "HALF_OPEN")
            else:
                raise CircuitOpenError(f"Circuit breaker open for {provider_name}")
        
        try:
            result = await fn(*args, **kwargs)
            await self._record_success(provider_name)
            return result
        except Exception as e:
            await self._record_failure(provider_name)
            raise
```

---

## 4. Prompt Management

### 4.1 Prompt Templates

```python
# services/ai/prompts/brand_prompts.py

BRAND_KIT_SYSTEM_PROMPT = """
You are a world-class brand strategist with 20+ years of experience helping 
Fortune 500 companies and successful startups build powerful brand identities.

Your task is to create a comprehensive brand kit that captures the essence of 
the company and provides clear guidance for all marketing communications.

Always respond with valid JSON in the exact schema provided.
"""

BRAND_KIT_USER_PROMPT = """
Create a comprehensive Brand Kit for:

Company: {company_name}
Industry: {industry}
Description: {description}
Target Audience: {target_audience}
{logo_info}

Respond with ONLY this JSON structure:
{{
    "personality": "3-5 word brand personality (e.g., Innovative, Trustworthy, Approachable)",
    "positioning": "Concise positioning statement (max 2 sentences)",
    "toneOfVoice": "Tone description and communication style",
    "targetAudience": ["segment 1", "segment 2", "segment 3"],
    "visualStyle": "Visual style description",
    "colorPalette": {{
        "primary": "#HEX",
        "secondary": "#HEX",
        "accent": "#HEX",
        "background": "#HEX",
        "text": "#HEX"
    }},
    "uniqueValueProposition": "Clear UVP statement",
    "contentPillars": ["pillar 1", "pillar 2", "pillar 3", "pillar 4"],
    "keyMessages": ["message 1", "message 2", "message 3"]
}}
"""

CAMPAIGN_STRATEGY_SYSTEM = """
You are an expert social media campaign strategist.
Create data-driven, platform-optimized campaign strategies.
Always consider the brand's identity and target audience.
"""

POST_GENERATION_SYSTEM = """
You are a professional social media copywriter.
Create engaging, platform-native content that drives action.
Maintain brand voice and optimize for each platform's algorithm.
"""
```

### 4.2 Prompt Versioning

```python
# services/ai/prompts/version_manager.py

class PromptVersionManager:
    """
    إدارة إصدارات الـ prompts مع القدرة على A/B Testing.
    """
    
    def get_prompt(
        self, 
        prompt_key: str, 
        version: Optional[str] = None,
        user_id: Optional[UUID] = None,
    ) -> PromptTemplate:
        # A/B test: 10% get new version
        if user_id and self._in_experiment(user_id, prompt_key):
            return self._get_version(prompt_key, "experimental")
        return self._get_version(prompt_key, version or "stable")
```

---

## 5. Cost Control & Optimization

### 5.1 Token Budget Manager

```python
# services/ai/cost_control.py

TASK_BUDGETS = {
    "brand_kit":        {"max_tokens": 3000, "max_cost_usd": 0.10},
    "campaign_strategy": {"max_tokens": 1500, "max_cost_usd": 0.05},
    "post_generation":   {"max_tokens": 600, "max_cost_usd": 0.02},
    "image_prompt":      {"max_tokens": 700, "max_cost_usd": 0.02},
    "brand_story":       {"max_tokens": 1000, "max_cost_usd": 0.03},
}

class TokenBudgetManager:
    def get_budget(self, task_type: str) -> TaskBudget:
        return TaskBudget(**TASK_BUDGETS.get(task_type, {
            "max_tokens": 2000, 
            "max_cost_usd": 0.05,
        }))
    
    def estimate_cost(self, model: str, input_tokens: int, output_tokens: int) -> float:
        pricing = MODEL_PRICING.get(model, DEFAULT_PRICING)
        return (input_tokens * pricing.input + output_tokens * pricing.output) / 1000
```

### 5.2 Model Selection Strategy

```python
# services/ai/model_selector.py

TASK_TO_MODEL_MAP = {
    # High quality tasks (use best model)
    "brand_kit":        "gpt-4o",
    "campaign_strategy": "gpt-4o",
    
    # Medium quality (use efficient model)
    "post_generation":   "gpt-4o-mini",
    "brand_story":       "gpt-4o-mini",
    
    # Image tasks
    "image_generation":  "dall-e-3",
    "image_prompt":      "gpt-4o-mini",
}

class ModelSelector:
    def select_for_task(
        self,
        task_type: str,
        quality_tier: Literal["economy", "standard", "premium"] = "standard",
        user_plan: Optional[str] = None,
    ) -> str:
        base = TASK_TO_MODEL_MAP.get(task_type, "gpt-4o-mini")
        
        if quality_tier == "economy" or user_plan == "free":
            return self._downgrade(base)
        elif quality_tier == "premium" or user_plan in ("business", "enterprise"):
            return self._upgrade(base)
        return base
```

---

## 6. AI Usage Tracking

```python
# services/analytics/ai_tracker.py

class AIUsageTracker:
    async def record(
        self,
        provider: str,
        model: str,
        task_type: str,
        input_tokens: int,
        output_tokens: int,
        duration_ms: int,
        success: bool,
        user_id: Optional[UUID],
        org_id: Optional[UUID],
        error_code: Optional[str] = None,
    ) -> None:
        cost = self.cost_calculator.calculate(model, input_tokens, output_tokens)
        
        await self.db.execute(
            insert(AIUsageLog).values(
                provider_id=self._get_provider_id(provider),
                model_id=self._get_model_id(model),
                task_type=task_type,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=input_tokens + output_tokens,
                cost_usd=cost,
                duration_ms=duration_ms,
                success=success,
                error_code=error_code,
                user_id=user_id,
                org_id=org_id,
            )
        )
        
        # Update Redis counters for real-time stats
        await self.redis.incr(f"ai:requests:{org_id}:{date.today()}")
        await self.redis.incrbyfloat(f"ai:cost:{org_id}:{date.today()}", float(cost))
```
