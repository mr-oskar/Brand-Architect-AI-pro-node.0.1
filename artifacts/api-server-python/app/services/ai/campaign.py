"""
Campaign AI Generation.

Generates multi-day social media campaigns using AI.
Each campaign includes a strategy, day-by-day plan, and ready-to-use posts.

Extension points:
  - Add trend data injection: fetch trending topics from a trends API.
  - Add language detection for Arabic/bilingual campaigns.
  - Add platform-specific post variants (Instagram vs LinkedIn).
  - Add brief analysis step before generation for better results.
"""
import json
import re
from typing import Optional

from app.services.ai.client import call_ai, get_client
from app.config import settings


PLATFORM_SIZES = {
    "instagram": {"size": "1080×1080px", "ratio": "1:1 square"},
    "instagram_portrait": {"size": "1080×1350px", "ratio": "4:5 portrait"},
    "linkedin": {"size": "1200×628px", "ratio": "1.91:1 landscape"},
    "twitter": {"size": "1200×675px", "ratio": "16:9 landscape"},
    "facebook": {"size": "1200×630px", "ratio": "1.91:1 landscape"},
}

PLATFORM_TONE = {
    "linkedin": "professional, thought-leadership focused, no casual slang, authoritative",
    "twitter": "punchy, concise, conversational, under 280 chars for hook",
    "facebook": "community-focused, conversational, slightly longer stories",
    "instagram": "visual-first, engaging, uses emojis, energetic",
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


def _clean_json(raw: str) -> str:
    return re.sub(r"```json\n?|```\n?", "", raw).strip()


def _detect_arabic(text: str) -> bool:
    return bool(re.search(r"[\u0600-\u06FF]", text))


def analyze_brief(
    brief: str,
    company_name: str = "",
    industry: str = "",
    reference_images: Optional[list[str]] = None,
) -> dict:
    """
    Analyze a campaign brief to extract structured intent.
    Returns: {objective, targetAudience, language, tone, themes, enhancedBrief, visualStyleFromImages}
    """
    visual_style = ""

    # Vision analysis for reference images (up to 3)
    if reference_images:
        try:
            client = get_client()
            image_messages = [
                {"type": "image_url", "image_url": {"url": img, "detail": "low"}}
                for img in reference_images[:3]
            ]
            image_messages.append({
                "type": "text",
                "text": "Analyze these reference images and describe their visual style for AI image generation. Focus on: color palette, composition, lighting, typography, overall aesthetic. Keep concise and actionable.",
            })
            resp = client.chat.completions.create(
                model="gpt-4o-mini",
                max_completion_tokens=400,
                messages=[{"role": "user", "content": image_messages}],
            )
            visual_style = (resp.choices[0].message.content or "").strip()
        except Exception:
            pass

    system_prompt = "You are a senior marketing strategist. Analyze a campaign brief and return structured JSON. Always respond with valid JSON only."
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
  "enhancedBrief": "enriched 2-3 sentence brief with more specific details"
}}

Detect language from the brief text itself. If brief is in Arabic, set language to "arabic". If mixed, set "bilingual"."""

    try:
        raw = call_ai(system_prompt, user_prompt, max_tokens=600, model="gpt-4o-mini")
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


def generate_campaign(
    company_name: str,
    company_description: str,
    industry: str,
    brand_kit: dict,
    brief: Optional[str] = None,
    post_count: int = 7,
    platforms: Optional[list[str]] = None,
    analyzed_brief: Optional[dict] = None,
) -> dict:
    """
    Generate a complete multi-day campaign with posts.

    Returns: {title, strategy, days: [...], posts: [...]}
    """
    platforms = platforms or ["instagram"]
    count = max(1, min(14, post_count))

    palette = brand_kit.get("colorPalette", {})
    style = brand_kit.get("visualStyle", "minimal")
    image_notes = IMAGE_STYLE_NOTES.get(style, IMAGE_STYLE_NOTES["minimal"])

    is_arabic = (
        (analyzed_brief or {}).get("language") in ("arabic", "bilingual")
        or _detect_arabic(brief or "")
    )
    language_instruction = (
        "LANGUAGE: Write ALL captions and hooks in Arabic (Modern Standard Arabic / فصحى). "
        "Hashtags: mix Arabic and English hashtags. Text must be right-to-left. "
        "IMAGE PROMPTS MUST ALWAYS BE IN ENGLISH — AI image models require English prompts for best results."
        if is_arabic
        else "LANGUAGE: Write in English unless the brand/brief specifies otherwise. Image prompts in English."
    )

    brief_section = ""
    if brief:
        brief_section = f'\n\nCRITICAL campaign brief from client (follow closely):\n"{brief}"'
    if analyzed_brief:
        ab = analyzed_brief
        brief_section += f"""
\nANALYZED CAMPAIGN BRIEF:
- Objective: {ab.get('objective', '')}
- Target Audience: {ab.get('targetAudience', '')}
- Tone: {ab.get('tone', '')}
- Themes: {', '.join(ab.get('themes', []))}
- Enhanced Brief: {ab.get('enhancedBrief', '')}
{f"- Reference Image Style: {ab['visualStyleFromImages']}" if ab.get('visualStyleFromImages') else ""}"""

    platform_str = ", ".join(platforms)
    primary_platform = platforms[0]
    platform_sizes_str = "; ".join(
        f"{p}: {PLATFORM_SIZES.get(p, PLATFORM_SIZES['instagram'])['size']} "
        f"({PLATFORM_SIZES.get(p, PLATFORM_SIZES['instagram'])['ratio']})"
        for p in platforms
    )
    platform_tone = PLATFORM_TONE.get(primary_platform, PLATFORM_TONE["instagram"])

    system_prompt = (
        f"You are a world-class social media strategist and creative director with 15 years experience "
        f"building viral campaigns for global brands. You create complete {count}-day multi-platform "
        f"marketing campaigns that are specific, creative, and trend-aware. You are fluent in Arabic and English. "
        f"{language_instruction} "
        f"You ALWAYS respond with valid JSON only — no markdown, no explanation, just the raw JSON object."
    )

    user_prompt = f"""Create a complete {count}-day social media campaign for this brand across platforms: {platform_str}

Company: {company_name}
Industry: {industry}
Description: {company_description}
Brand Personality: {brand_kit.get('personality', '')}
Positioning: {brand_kit.get('positioning', '')}
Tone of Voice: {brand_kit.get('toneOfVoice', '')}
Brand Keywords: {', '.join(brand_kit.get('brandKeywords', []))}
Messaging Pillars: {' | '.join(brand_kit.get('messagingPillars', []))}
Visual Style: {style}
Primary Color: {palette.get('primary', '#6366F1')}
Secondary Color: {palette.get('secondary', '#8B5CF6')}
Accent Color: {palette.get('accent', '#06B6D4')}
{brief_section}

Return a JSON object with exactly this structure:
{{
  "title": "Compelling campaign title that captures the campaign theme",
  "strategy": "3-4 sentence strategic overview: narrative arc, psychological journey, expected outcomes",
  "days": [
    {{
      "day": 1,
      "objective": "Specific objective for day 1",
      "postConcept": "Specific creative concept for this post",
      "marketingAngle": "The psychological/marketing angle",
      "cta": "Specific, compelling call to action"
    }}
  ],
  "posts": [
    {{
      "day": 1,
      "platform": "{primary_platform}",
      "hook": "Scroll-stopping opening line. Under 12 words.",
      "caption": "Full platform-appropriate caption (3-5 paragraphs). Match the brand's exact tone. Use line breaks. End with the CTA.",
      "cta": "Specific call to action",
      "hashtags": ["#relevant1", "#relevant2", "#trending3", "#niche4", "#brand5"],
      "imagePrompt": "Ultra-high-quality commercial advertising image for {company_name}. VISUAL CONCEPT: [Describe a highly specific, original scene directly tied to this post's objective and day concept — NO generic stock photography descriptions]. BRAND DNA: {style} aesthetic — {image_notes}. Hero color: {palette.get('primary', '#6366F1')} (use as dominant visual element in backgrounds, gradients, or lighting). Secondary: {palette.get('secondary', '#8B5CF6')} (accents, shadows, supporting elements). LIGHTING: [Specify exact lighting — cinematic rim light, soft diffused studio, golden hour backlight, dramatic moody, etc.]. COMPOSITION: [Specify layout — rule of thirds with subject at [position], leading lines toward [focal point], [amount] of intentional negative space]. TYPOGRAPHY: Reserve [specify corner/area] for brand logo overlay — keep that area clean and uncluttered. QUALITY: Professional commercial photography, ultra-sharp focus, 8K resolution equivalent, flawless execution. Platform: {primary_platform} optimized for {platform_sizes_str}."
    }}
  ]
}}

Rules:
- Every hook must be DIFFERENT in structure
- Every caption must be UNIQUE — different length, angle, story
- Image prompts must describe SPECIFIC, DETAILED scenes
- Hashtags: mix popular, trending, niche, and brand-specific
- Platform tone for {primary_platform}: {platform_tone}
- Generate exactly {count} days and {count} posts

Make every post SPECIFIC to {company_name} — no generic content."""

    try:
        raw = call_ai(system_prompt, user_prompt, max_tokens=8192)
        return json.loads(_clean_json(raw))
    except Exception:
        return _build_fallback_campaign(company_name, industry, brand_kit, count)


def _build_fallback_campaign(
    company_name: str,
    industry: str,
    brand_kit: dict,
    count: int = 7,
) -> dict:
    palette = brand_kit.get("colorPalette", {})
    style = brand_kit.get("visualStyle", "minimal")
    primary = palette.get("primary", "#6366F1")

    day_concepts = [
        ("Brand awareness", f"Introduce {company_name} with our origin story", "Storytelling & curiosity", "Learn our story"),
        ("Pain point", "The problem we were built to solve", "Empathy & problem agitation", "See how we help"),
        ("Value proposition", "Our unique approach and what makes us different", "Differentiation", "Discover our difference"),
        ("Social proof", "Client transformation story", "Social proof & aspiration", "Read the full story"),
        ("Thought leadership", f"3 trends reshaping {industry} in 2026", "Authority & education", "Get our full report"),
        ("Behind the scenes", "How we actually work — our process revealed", "Transparency & trust", "Work with us"),
        ("Conversion", "Our limited offer — why now is the time", "Urgency & scarcity", "Claim your spot"),
    ]

    days = []
    posts = []
    for i in range(count):
        concept = day_concepts[i % len(day_concepts)]
        day_num = i + 1
        days.append({
            "day": day_num,
            "objective": concept[0],
            "postConcept": concept[1],
            "marketingAngle": concept[2],
            "cta": concept[3],
        })
        posts.append({
            "day": day_num,
            "platform": "instagram",
            "hook": f"{company_name}: {concept[1]}.",
            "caption": (
                f"{concept[1]}\n\nAt {company_name}, we believe every {industry} business deserves {concept[0].lower()}.\n\n"
                f"→ Real results, not promises\n→ Strategy backed by data\n→ A partner invested in your growth\n\n{concept[3]} — link in bio."
            ),
            "cta": concept[3],
            "hashtags": [f"#{company_name.replace(' ', '')}", f"#{industry.replace(' ', '')}", "#Marketing", "#BusinessGrowth", "#Strategy"],
            "imagePrompt": f"Commercial advertising photography: {concept[1]} scene. {style} aesthetic, {primary} color accent. Professional cinematic lighting, ultra high quality. Bold typography overlay with brand name \"{company_name}\". 1:1 ratio.",
        })

    return {
        "title": f"{company_name} — {count}-Day Brand Campaign",
        "strategy": f"A strategically sequenced {count}-day campaign for {company_name} following the awareness → trust → authority → conversion arc. Each day builds on the previous, guiding the audience from discovering the brand to feeling confident enough to act.",
        "days": days,
        "posts": posts,
    }
