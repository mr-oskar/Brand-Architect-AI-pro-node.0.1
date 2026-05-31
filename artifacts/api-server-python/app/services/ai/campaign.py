"""
Campaign AI Generation — Multi-Phase Pipeline.

Pipeline (run in order):
  1. research_trends_and_opportunities()
     → Identifies current industry trends + audience pain points + brand-aligned angles
  2. analyze_brief()          [only when brief / reference images provided]
     → Extracts objective, audience, themes, enhanced brief from raw client input
  3. generate_campaign()
     → Builds the full campaign using brand DNA + trend research + brief analysis

Extension points (documented, not yet implemented):
  - Real-time trend injection via Google Trends / social listening API
  - Language detection for Arabic / bilingual campaigns
  - Platform-specific post variant generation (one post per platform per day)
  - Competitor awareness: pass competitor names for sharper differentiation
"""
import json
import re
from typing import Optional

from app.services.ai.client import call_ai, call_ai_with_fallback, get_client
from app.config import settings
from app.utils.token_optimizer import get_max_tokens


# ── Platform config ───────────────────────────────────────────────────────────

PLATFORM_SIZES = {
    "instagram": {"size": "1080×1080px", "ratio": "1:1 square"},
    "instagram_portrait": {"size": "1080×1350px", "ratio": "4:5 portrait"},
    "linkedin": {"size": "1200×628px", "ratio": "1.91:1 landscape"},
    "twitter": {"size": "1200×675px", "ratio": "16:9 landscape"},
    "facebook": {"size": "1200×630px", "ratio": "1.91:1 landscape"},
}

PLATFORM_TONE = {
    "linkedin": (
        "Professional, thought-leadership focused, no casual slang, authoritative. "
        "Use data and insights. 1,300-char limit. Paragraphs, not bullet lists."
    ),
    "twitter": (
        "Punchy, concise, conversational, hook under 280 chars. "
        "No hashtag spam — 2 max. Start with a bold opinion or surprising fact."
    ),
    "facebook": (
        "Community-focused, conversational, slightly longer storytelling. "
        "Ask questions. Invite comments. Friendly and warm."
    ),
    "instagram": (
        "Visual-first, engaging, uses 2-4 emojis naturally, energetic. "
        "Hook within first 2 lines (before 'more' cut). 5-7 hashtags."
    ),
    "tiktok": (
        "Raw, authentic, trend-aware. Hook in the first sentence. "
        "Conversational, Gen-Z friendly. 3-5 hashtags including trending ones."
    ),
}

IMAGE_STYLE_NOTES = {
    "luxury": "editorial aspirational mood, magazine-quality lighting, elegant negative space, premium textures, soft film grain, Vogue-editorial feel",
    "tech": "clean futuristic aesthetic, gradient overlays, glowing UI elements, dark-mode vibes, neon accents, sci-fi product photography",
    "bold": "high-contrast energy, saturated colors, dynamic diagonal compositions, street-art influence, punchy and loud, Gen-Z energy",
    "minimal": "breathing room, intentional white space, refined typography hierarchy, quiet confidence, Scandinavian minimal influence, Apple-level restraint",
    "professional": "authoritative corporate photography, clean business environment, confident subjects, neutral palette with brand color pops",
    "playful": "bright saturated palette, dynamic geometric shapes, fun typography, energetic composition, millennial/Gen-Z appeal",
    "organic": "natural textures, earthy tones, hand-crafted aesthetic, warm natural lighting, artisan feel",
    "creative": "avant-garde composition, experimental layout, bold typography as visual element, unexpected color combinations",
}

# Proven campaign narrative frameworks
CAMPAIGN_FRAMEWORKS = [
    "Awareness → Education → Trust → Conversion (classic funnel)",
    "Problem Agitation → Solution Reveal → Social Proof → CTA (PAS extended)",
    "Before → After → Bridge: Show current pain → ideal state → your brand as the bridge",
    "7-day Story Arc: Each post is a chapter in a single narrative journey",
    "Authority Ladder: Day 1 insight → Day 2 case study → Day 3 data → Day 4 expert quote → Day 5-7 offer",
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _clean_json(raw: str) -> str:
    return re.sub(r"```json\n?|```\n?", "", raw).strip()


def _detect_arabic(text: str) -> bool:
    return bool(re.search(r"[\u0600-\u06FF]", text))


def _format_dos_donts(kit: dict) -> str:
    dos = kit.get("dosCommunication", [])
    donts = kit.get("dontsCommunication", [])
    lines = []
    if dos:
        lines.append("BRAND COMMUNICATION RULES — MUST FOLLOW:")
        for d in dos:
            lines.append(f"  ✓ {d}")
    if donts:
        lines.append("BRAND COMMUNICATION RULES — STRICTLY FORBIDDEN:")
        for d in donts:
            lines.append(f"  ✗ {d}")
    return "\n".join(lines)


def _format_audience(kit: dict) -> str:
    segments = kit.get("audienceSegments", [])
    if not segments:
        return ""
    lines = ["TARGET AUDIENCE SEGMENTS:"]
    for i, seg in enumerate(segments, 1):
        lines.append(f"  {i}. {seg}")
    return "\n".join(lines)


def _format_taglines(kit: dict) -> str:
    taglines = kit.get("taglines", [])
    if not taglines:
        return ""
    return "BRAND TAGLINES (use as CTA inspiration): " + " | ".join(taglines)


# ── Phase 1: Trend & Opportunity Research ────────────────────────────────────

def research_trends_and_opportunities(
    company_name: str,
    industry: str,
    brand_kit: dict,
    campaign_goal: Optional[str] = None,
) -> dict:
    """
    Phase 1: Research current industry trends and brand-specific campaign opportunities.

    The AI is asked to act as a market researcher and identify:
    - Current trends in the industry (as of its latest training data)
    - Audience pain points aligned with the brand's messaging pillars
    - Specific campaign angles that fit the brand's personality and positioning
    - Content hooks that would stop the scroll on each platform

    Returns a dict with: trends, painPoints, campaignAngles, contentHooks, recommendedFramework
    """
    personality = brand_kit.get("personality", "")
    positioning = brand_kit.get("positioning", "")
    pillars = brand_kit.get("messagingPillars", [])
    audience = brand_kit.get("audienceSegments", [])
    tone = brand_kit.get("toneOfVoice", "professional")
    competitive = brand_kit.get("competitivePosition", "")

    goal_context = f"\nCampaign Goal: {campaign_goal}" if campaign_goal else ""

    system_prompt = (
        "You are a senior market researcher and social media strategist with deep expertise across industries. "
        "You stay current with the latest trends, consumer psychology, and platform algorithms. "
        "You analyze brands and identify the most resonant campaign opportunities for their specific audience. "
        "Always respond with valid JSON only."
    )

    user_prompt = f"""Research current trends and campaign opportunities for this brand:

Company: {company_name}
Industry: {industry}
Brand Personality: {personality}
Market Positioning: {positioning}
Competitive Advantage: {competitive}
Messaging Pillars: {' | '.join(pillars) if pillars else 'Not defined'}
Target Audience: {'; '.join(audience[:2]) if audience else 'Not defined'}
Tone of Voice: {tone}{goal_context}

Perform deep research and return a JSON object:
{{
  "industryTrends": [
    {{
      "trend": "Specific trend name",
      "description": "1-2 sentence description of the trend and why it matters now",
      "contentOpportunity": "How this brand can leverage this trend in content",
      "urgency": "high | medium | low"
    }}
  ],
  "audiencePainPoints": [
    "Pain point 1: specific, visceral description of what keeps this audience up at night",
    "Pain point 2",
    "Pain point 3"
  ],
  "campaignAngles": [
    {{
      "angle": "Campaign angle name",
      "rationale": "Why this angle works for this brand's positioning and audience",
      "exampleHook": "Example opening line that would stop the scroll"
    }}
  ],
  "contentHooks": {{
    "curiosity": "Hook using curiosity gap technique",
    "controversy": "Hook using a bold/counterintuitive opinion",
    "empathy": "Hook that immediately validates audience pain",
    "data": "Hook using a surprising statistic or fact",
    "story": "Hook that opens a compelling story"
  }},
  "recommendedFramework": "Which campaign framework fits best and why (2-3 sentences)",
  "trendingHashtags": ["#trend1", "#trend2", "#trend3", "#niche1", "#niche2"],
  "seasonalContext": "Any seasonal, cultural, or timely events relevant to this campaign period"
}}

Be deeply specific to {company_name} in the {industry} industry. No generic answers."""

    try:
        prompt_len = len(system_prompt) + len(user_prompt)
        raw = call_ai_with_fallback(system_prompt, user_prompt, task_type="trend_research", max_tokens=get_max_tokens("trend_research", prompt_len), model="gpt-4o-mini")
        result = json.loads(_clean_json(raw))
        return result
    except Exception:
        # Fallback: return minimal structure so generation can still proceed
        return {
            "industryTrends": [],
            "audiencePainPoints": [],
            "campaignAngles": [],
            "contentHooks": {},
            "recommendedFramework": f"Awareness → Trust → Conversion for {industry}",
            "trendingHashtags": [],
            "seasonalContext": "",
        }


# ── Phase 2: Brief Analysis ───────────────────────────────────────────────────

def analyze_brief(
    brief: str,
    company_name: str = "",
    industry: str = "",
    reference_images: Optional[list[str]] = None,
) -> dict:
    """
    Phase 2 (optional): Analyze a campaign brief to extract structured intent.

    Runs vision analysis on reference images if provided (gpt-4o-mini vision).
    Returns: {objective, targetAudience, language, tone, themes, enhancedBrief, visualStyleFromImages}
    """
    visual_style = ""

    if reference_images:
        try:
            client = get_client()
            image_messages = [
                {"type": "image_url", "image_url": {"url": img, "detail": "low"}}
                for img in reference_images[:3]
            ]
            image_messages.append({
                "type": "text",
                "text": (
                    "Analyze these reference images and describe their visual style for AI image generation. "
                    "Focus on: color palette, composition, lighting, typography, overall aesthetic. "
                    "Be concise and actionable."
                ),
            })
            resp = client.chat.completions.create(
                model="gpt-4o-mini",
                max_completion_tokens=400,
                messages=[{"role": "user", "content": image_messages}],
            )
            visual_style = (resp.choices[0].message.content or "").strip()
        except Exception:
            pass

    system_prompt = (
        "You are a senior marketing strategist. "
        "Analyze a campaign brief and return structured JSON. "
        "Always respond with valid JSON only."
    )
    user_prompt = f"""Analyze this campaign brief for {company_name} in the {industry} industry:

Brief: "{brief}"
{f'Reference image style: {visual_style}' if visual_style else ''}

Return JSON:
{{
  "objective": "one sentence campaign objective",
  "targetAudience": "specific audience description",
  "language": "arabic" or "english" or "bilingual",
  "tone": "tone description",
  "themes": ["theme1", "theme2", "theme3"],
  "enhancedBrief": "enriched 2-3 sentence brief with more specific details and implied needs"
}}

Detect language from the brief text. If brief is in Arabic → "arabic". If mixed → "bilingual"."""

    try:
        raw = call_ai_with_fallback(system_prompt, user_prompt, task_type="brief_analysis", max_tokens=get_max_tokens("brief_analysis"), model="gpt-4o-mini")
        parsed = json.loads(_clean_json(raw))
        parsed["visualStyleFromImages"] = visual_style
        return parsed
    except Exception:
        return {
            "objective": brief[:100],
            "targetAudience": "General audience",
            "language": "arabic" if _detect_arabic(brief) else "english",
            "tone": "professional and engaging",
            "themes": [],
            "enhancedBrief": brief,
            "visualStyleFromImages": visual_style,
        }


# ── Phase 3: Campaign Generation ─────────────────────────────────────────────

def generate_campaign(
    company_name: str,
    company_description: str,
    industry: str,
    brand_kit: dict,
    brief: Optional[str] = None,
    post_count: int = 7,
    platforms: Optional[list[str]] = None,
    analyzed_brief: Optional[dict] = None,
    trend_research: Optional[dict] = None,
) -> dict:
    """
    Phase 3: Generate a complete multi-day campaign.

    Uses brand DNA (full brand kit), trend research, and analyzed brief to produce
    a campaign that is:
    - On-brand: tone, voice, dos/don'ts are enforced
    - Trend-aware: uses current industry trends from Phase 1
    - Brief-faithful: follows client brief if provided (Phase 2)
    - Platform-native: content is calibrated for each platform's norms

    Returns: {title, strategy, days: [...], posts: [...]}
    """
    platforms = platforms or ["instagram"]
    count = max(1, min(14, post_count))

    palette = brand_kit.get("colorPalette", {})
    style = brand_kit.get("visualStyle", "minimal")
    image_notes = IMAGE_STYLE_NOTES.get(style, IMAGE_STYLE_NOTES["minimal"])

    # Language detection
    is_arabic = (
        (analyzed_brief or {}).get("language") in ("arabic", "bilingual")
        or _detect_arabic(brief or "")
        or _detect_arabic(company_description or "")
    )
    language_instruction = (
        "LANGUAGE: Write ALL captions, hooks, and CTAs in Arabic (Modern Standard Arabic / فصحى). "
        "Keep a professional, warm, and culturally relevant Arabic tone. "
        "Hashtags: mix Arabic (#التسويق_الرقمي) and English hashtags. "
        "IMAGE PROMPTS MUST ALWAYS BE IN ENGLISH — AI image models require English for best results."
        if is_arabic
        else "LANGUAGE: Write in English. Image prompts in English."
    )

    # ── Brand DNA block ───────────────────────────────────────────────────────
    personality = brand_kit.get("personality", "")
    positioning = brand_kit.get("positioning", "")
    tone_of_voice = brand_kit.get("toneOfVoice", "")
    mission = brand_kit.get("missionStatement", "")
    vision = brand_kit.get("visionStatement", "")
    brand_story = brand_kit.get("brandStory", "")
    pillars = brand_kit.get("messagingPillars", [])
    keywords = brand_kit.get("brandKeywords", [])
    competitive = brand_kit.get("competitivePosition", "")
    dos_donts = _format_dos_donts(brand_kit)
    audience_block = _format_audience(brand_kit)
    taglines_line = _format_taglines(brand_kit)

    brand_dna_block = f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BRAND DNA — FOLLOW PRECISELY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Brand Personality: {personality}
Market Positioning: {positioning}
Competitive Advantage: {competitive}
Mission: {mission}
Vision: {vision}
Tone of Voice: {tone_of_voice}
Messaging Pillars: {' | '.join(pillars) if pillars else '—'}
Brand Keywords: {', '.join(keywords) if keywords else '—'}
{taglines_line}
{audience_block}
{dos_donts}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"""

    if brand_story:
        brand_dna_block += f"\nBrand Story Context (for narrative continuity):\n{brand_story[:400]}...\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # ── Trend research block ──────────────────────────────────────────────────
    trend_block = ""
    if trend_research:
        tr = trend_research
        trends = tr.get("industryTrends", [])
        pain_points = tr.get("audiencePainPoints", [])
        angles = tr.get("campaignAngles", [])
        hooks = tr.get("contentHooks", {})
        trending_tags = tr.get("trendingHashtags", [])
        seasonal = tr.get("seasonalContext", "")
        framework = tr.get("recommendedFramework", "")

        trend_lines = ["\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "MARKET INTELLIGENCE & TREND RESEARCH", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]

        if trends:
            trend_lines.append("CURRENT INDUSTRY TRENDS (leverage these):")
            for t in trends[:5]:
                urgency = t.get("urgency", "medium")
                trend_lines.append(f"  [{urgency.upper()}] {t.get('trend', '')}: {t.get('description', '')} → Content opportunity: {t.get('contentOpportunity', '')}")

        if pain_points:
            trend_lines.append("\nAUDIENCE PAIN POINTS (address these):")
            for pp in pain_points:
                trend_lines.append(f"  • {pp}")

        if angles:
            trend_lines.append("\nBRAND-SPECIFIC CAMPAIGN ANGLES:")
            for a in angles:
                trend_lines.append(f"  → {a.get('angle', '')}: {a.get('rationale', '')}")
                if a.get("exampleHook"):
                    trend_lines.append(f"    Example hook: \"{a['exampleHook']}\"")

        if hooks:
            trend_lines.append("\nPROVEN HOOK TECHNIQUES (use and vary these across posts):")
            for hook_type, hook_text in hooks.items():
                trend_lines.append(f"  [{hook_type}] {hook_text}")

        if trending_tags:
            trend_lines.append(f"\nTRENDING HASHTAGS: {' '.join(trending_tags)}")

        if seasonal:
            trend_lines.append(f"\nSEASONAL/TIMELY CONTEXT: {seasonal}")

        if framework:
            trend_lines.append(f"\nRECOMMENDED CAMPAIGN FRAMEWORK: {framework}")

        trend_lines.append("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        trend_block = "\n".join(trend_lines)

    # ── Brief block ───────────────────────────────────────────────────────────
    brief_block = ""
    if brief:
        brief_block = f'\n\nCLIENT CAMPAIGN BRIEF (highest priority — follow exactly):\n"{brief}"'
    if analyzed_brief:
        ab = analyzed_brief
        brief_block += f"""
\nANALYZED BRIEF:
- Objective: {ab.get('objective', '')}
- Target Audience: {ab.get('targetAudience', '')}
- Tone Override: {ab.get('tone', '')}
- Campaign Themes: {', '.join(ab.get('themes', []))}
- Enhanced Brief: {ab.get('enhancedBrief', '')}
{f"- Reference Image Style: {ab['visualStyleFromImages']}" if ab.get('visualStyleFromImages') else ""}"""

    # ── Platform config ───────────────────────────────────────────────────────
    platform_str = ", ".join(platforms)
    primary_platform = platforms[0]
    platform_sizes_str = "; ".join(
        f"{p}: {PLATFORM_SIZES.get(p, PLATFORM_SIZES['instagram'])['size']} "
        f"({PLATFORM_SIZES.get(p, PLATFORM_SIZES['instagram'])['ratio']})"
        for p in platforms
    )
    platform_tone = PLATFORM_TONE.get(primary_platform, PLATFORM_TONE["instagram"])

    # ── System prompt ─────────────────────────────────────────────────────────
    system_prompt = (
        f"You are a world-class social media strategist, brand consultant, and creative director with 15+ years "
        f"building viral campaigns for global brands across {industry} and adjacent industries. "
        f"You create multi-day campaigns that are deeply brand-consistent, trend-aware, and psychologically optimized. "
        f"You NEVER produce generic content — every post is specific to the brand, the audience, and the current market moment. "
        f"You enforce brand dos/don'ts rigorously — never break them. "
        f"You are fluent in Arabic and English. {language_instruction} "
        f"You ALWAYS respond with valid JSON only — no markdown, no explanation, just the raw JSON object."
    )

    # ── User prompt ───────────────────────────────────────────────────────────
    user_prompt = f"""Create a complete {count}-day social media campaign for:

Company: {company_name}
Industry: {industry}
Description: {company_description}
Platforms: {platform_str}
{brand_dna_block}
{trend_block}
{brief_block}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GENERATION RULES — NON-NEGOTIABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Every hook MUST be structurally different (question / bold claim / story opener / data / curiosity gap)
2. Every caption MUST be unique in length, angle, and story — NO repeated structures
3. Leverage at least 3 of the identified industry trends across the campaign
4. Address at least 2 audience pain points directly in posts
5. Use the brand's messaging pillars as content themes — each pillar must appear at least once
6. Brand dos/don'ts MUST be enforced in every single post — no exceptions
7. CTAs must use the brand's tagline language, not generic "click here" or "buy now"
8. Platform tone for {primary_platform}: {platform_tone}
9. Hashtags: mix 2-3 trending + 2-3 niche + 1-2 brand-specific per post
10. Image prompts must describe SPECIFIC commercial scenes — no generic stock photo descriptions

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Return EXACTLY this JSON structure (no extra keys):
{{
  "title": "Specific, compelling campaign title that captures the campaign's unique narrative",
  "strategy": "4-5 sentence strategic overview: the psychological journey, narrative arc, trend leverage strategy, and expected outcomes. Must reference {company_name} specifically.",
  "days": [
    {{
      "day": 1,
      "objective": "Specific measurable objective for day 1",
      "postConcept": "Original creative concept tied to a trend or brand moment",
      "marketingAngle": "The psychological / behavioral science angle being used",
      "cta": "Specific, brand-voice CTA — not generic"
    }}
  ],
  "posts": [
    {{
      "day": 1,
      "platform": "{primary_platform}",
      "hook": "Scroll-stopping opening line. Under 12 words. Must be different in structure from all other hooks.",
      "caption": "Full platform-appropriate caption. Match brand tone of voice exactly. Use line breaks for readability. Weave in a trend or pain point. End with the CTA. 3-5 paragraphs.",
      "cta": "Specific, on-brand call to action",
      "hashtags": ["#brand-specific", "#trending1", "#niche1", "#niche2", "#industry"],
      "imagePrompt": "Ultra-high-quality commercial advertising image for {company_name}. VISUAL CONCEPT: [Describe a highly specific, original scene directly tied to this post's objective — NO generic stock photography]. BRAND DNA: {style} aesthetic — {image_notes}. Hero color: {palette.get('primary', '#6366F1')} (dominant element: background gradient / lighting / prop). Secondary: {palette.get('secondary', '#8B5CF6')} (accents, shadows). LIGHTING: [Specify exact lighting type]. COMPOSITION: [Rule of thirds / leading lines / negative space placement]. TYPOGRAPHY SPACE: Reserve [corner/area] for brand logo — keep that area clean. QUALITY: Commercial photography, ultra-sharp, 8K equivalent. Platform: {primary_platform} optimized, {platform_sizes_str}."
    }}
  ]
}}

Generate exactly {count} day objects and {count} post objects.
Every post must feel unmistakably like {company_name} — specific brand, specific audience, specific moment."""

    try:
        prompt_len = len(system_prompt) + len(user_prompt)
        raw = call_ai_with_fallback(system_prompt, user_prompt, task_type="campaign", max_tokens=get_max_tokens("campaign", prompt_len))
        return json.loads(_clean_json(raw))
    except Exception:
        return _build_fallback_campaign(company_name, industry, brand_kit, count)


# ── Fallback ──────────────────────────────────────────────────────────────────

def _build_fallback_campaign(
    company_name: str,
    industry: str,
    brand_kit: dict,
    count: int = 7,
) -> dict:
    """
    Fallback campaign used only when the AI call fails entirely.
    Uses brand kit data where available for better quality than pure generics.
    """
    palette = brand_kit.get("colorPalette", {})
    style = brand_kit.get("visualStyle", "minimal")
    primary = palette.get("primary", "#6366F1")
    tone = brand_kit.get("toneOfVoice", "professional")
    pillars = brand_kit.get("messagingPillars", [])
    keywords = brand_kit.get("brandKeywords", ["growth", "results", "excellence"])
    taglines = brand_kit.get("taglines", ["Built for Growth"])
    mission = brand_kit.get("missionStatement", f"Help {industry} businesses achieve their goals.")

    pillar_labels = [p.split(" — ")[0].replace("Pillar ", "").strip(":").strip() for p in pillars] if pillars else [
        "Brand awareness", "Pain point", "Value proposition",
        "Social proof", "Thought leadership", "Behind the scenes", "Conversion",
    ]

    day_templates = [
        ("Brand awareness", "Introduce {company} with our origin story and mission", "Storytelling & curiosity gap", taglines[0] if taglines else "Learn our story"),
        ("Pain point", "The problem we were built to solve — and why most solutions fail", "Empathy + problem agitation (PAS)", "See how we're different"),
        ("Value proposition", "Our unique approach: {mission_snippet}", "Differentiation through specificity", "Discover our approach"),
        ("Social proof", "Client transformation: from challenge to breakthrough", "Social proof + aspiration", "Read the full story"),
        ("Thought leadership", f"3 trends reshaping {industry} in 2025 — and what to do about them", "Authority + education", "Get our insights"),
        ("Behind the scenes", "How we actually work — our process, no filters", "Transparency + trust building", "Work with us"),
        ("Conversion", "Why now is the right moment — and what's at stake if you wait", "Urgency + loss aversion", taglines[-1] if taglines else "Take the first step"),
    ]

    mission_snippet = mission[:60] if mission else f"transforming {industry}"

    days = []
    posts = []
    for i in range(count):
        template = day_templates[i % len(day_templates)]
        concept = template[1].format(company=company_name, mission_snippet=mission_snippet)
        day_num = i + 1
        kw = keywords[i % len(keywords)] if keywords else "growth"
        days.append({
            "day": day_num,
            "objective": template[0],
            "postConcept": concept,
            "marketingAngle": template[2],
            "cta": template[3],
        })
        posts.append({
            "day": day_num,
            "platform": "instagram",
            "hook": f"{concept}.",
            "caption": (
                f"{concept}\n\n"
                f"At {company_name}, we believe every {industry} business deserves {template[0].lower()}.\n\n"
                f"→ {mission}\n→ Real results, not empty promises\n→ A partner invested in your growth\n\n"
                f"{template[3]} — link in bio."
            ),
            "cta": template[3],
            "hashtags": [
                f"#{company_name.replace(' ', '')}",
                f"#{industry.replace(' ', '')}",
                f"#{kw.title()}",
                "#Marketing",
                "#BusinessGrowth",
            ],
            "imagePrompt": (
                f"Commercial advertising photography: {concept} concept for {company_name}. "
                f"{style} aesthetic. {primary} as hero color. Professional cinematic lighting. "
                f"Ultra high quality 8K commercial photography. "
                f"Clean area reserved for brand name overlay. 1:1 square format."
            ),
        })

    return {
        "title": f"{company_name} — {count}-Day Brand Campaign",
        "strategy": (
            f"A strategically sequenced {count}-day campaign for {company_name} that follows the "
            f"awareness → education → trust → conversion arc. "
            f"Each day builds on the previous, guiding the {industry} audience from discovering the brand "
            f"to understanding its unique value and feeling confident enough to act. "
            f"Content pillars are drawn from the brand's messaging framework to ensure consistency."
        ),
        "days": days,
        "posts": posts,
    }
