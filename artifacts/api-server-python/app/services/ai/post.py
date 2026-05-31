"""
Post AI Generation — regenerate, create variants, and generate long-form content.

Extension points:
  - Add SEO optimization step for blog posts.
  - Add A/B testing framework integration.
  - Add multi-language support for regeneration.
"""
import json
import re
from typing import Literal, Optional

from app.services.ai.client import call_ai, call_ai_with_fallback, get_client
from app.config import settings
from app.utils.token_optimizer import get_max_tokens


def _clean_json(raw: str) -> str:
    return re.sub(r"```json\n?|```\n?", "", raw).strip()


PLATFORM_TONE = {
    "linkedin": "professional, thought-leadership focused, no casual slang, authoritative",
    "twitter": "punchy, concise, conversational, under 280 chars for hook",
    "facebook": "community-focused, conversational, slightly longer stories",
    "instagram": "visual-first, engaging, uses emojis, energetic",
}


def regenerate_post(
    post: dict,
    brand_company_name: str,
    brand_industry: str,
    brand_kit: Optional[dict] = None,
) -> dict:
    """
    Regenerate a completely fresh version of an existing post.
    Returns: {hook, caption, cta, hashtags, imagePrompt}
    """
    kit = brand_kit or {}
    primary_color = kit.get("colorPalette", {}).get("primary", "#6366F1")
    style = kit.get("visualStyle", "minimal")
    tone = kit.get("toneOfVoice", "professional and clear")
    personality = kit.get("personality", "")
    pillars = " | ".join(kit.get("messagingPillars", []))
    platform = post.get("platform", "instagram")
    platform_tone = PLATFORM_TONE.get(platform, PLATFORM_TONE["instagram"])

    prompt = f"""You are a world-class social media copywriter. Regenerate a completely FRESH, UNIQUE version of this Day {post.get('day', 1)} {platform} post for "{brand_company_name}" in the {brand_industry} industry.

Original post (do NOT repeat — create something completely different):
- Hook: {post.get('hook', '')}
- Caption excerpt: {str(post.get('caption', ''))[:100]}
- CTA: {post.get('cta', '')}

Brand personality: {personality}
Tone of voice: {tone}
Messaging pillars: {pillars}
Platform tone for {platform}: {platform_tone}
Visual style: {style}

Create a DIFFERENT hook structure, different emotional angle, different story. Make it feel fresh and surprising.

Return ONLY valid JSON:
{{
  "hook": "completely new hook — different structure and angle from original",
  "caption": "fresh full caption from a completely different angle (3-5 paragraphs, line breaks, ends with CTA naturally)",
  "cta": "different compelling call to action",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"],
  "imagePrompt": "Professional commercial visual — completely different scene: [describe in detail]. {style} aesthetic, {primary_color} dominant color accent, cinematic lighting. Typography: [specify if brand name or key message should appear]. 16:9 ultra-high quality, reserve area for logo if needed."
}}"""

    try:
        system_prompt = "You are a world-class social media copywriter. Return only valid JSON."
        raw = call_ai_with_fallback(system_prompt, prompt, task_type="post_regen", max_tokens=get_max_tokens("post_regen", len(prompt)))
        return json.loads(_clean_json(raw))
    except Exception:
        return {
            "hook": f"Here is what nobody in {brand_industry} will tell you about Day {post.get('day', 1)}...",
            "caption": (
                f"The truth about {brand_company_name} is simpler than most people expect.\n\n"
                f"We do not chase trends. We build systems.\n\n"
                f"Systems that generate consistent results for businesses who are serious about growth in {brand_industry}.\n\n"
                f"If that is you — the link in bio is waiting."
            ),
            "cta": "See how we work",
            "hashtags": [
                f"#{brand_company_name.replace(' ', '')}",
                f"#{brand_industry.replace(' ', '')}",
                "#GrowthStrategy",
                "#Results",
                "#BusinessSuccess",
            ],
            "imagePrompt": (
                f"Abstract commercial concept: growth and innovation in {brand_industry}. "
                f"{style} aesthetic, {primary_color} color accent, studio lighting. "
                f"Bold typographic overlay with brand message. 16:9 ultra-high quality."
            ),
        }


def generate_post_variant(
    post: dict,
    brand_company_name: str,
    brand_industry: str,
    brand_kit: dict,
) -> dict:
    """
    Generate an A/B variant of a post with a completely different angle.
    Returns: {hook, caption, cta, hashtags, imagePrompt}
    """
    style = brand_kit.get("visualStyle", "minimal")
    primary_color = brand_kit.get("colorPalette", {}).get("primary", "#6366F1")
    tone = brand_kit.get("toneOfVoice", "professional")

    prompt = f"""You are a world-class social media copywriter. Create a completely different, better-performing A/B variant of this social media post for "{brand_company_name}" ({brand_industry}).

Original post (Day {post.get('day', 1)}, {post.get('platform', 'instagram')}):
- Hook: {post.get('hook', '')}
- Caption excerpt: {str(post.get('caption', ''))[:120]}
- CTA: {post.get('cta', '')}

Brand tone: {tone}
Visual style: {style}

Create a DIFFERENT approach — different hook structure, angle, emotional trigger. The variant must feel completely fresh while staying true to the brand.

Return ONLY a JSON object:
{{
  "hook": "completely different attention-grabbing hook (different structure than original)",
  "caption": "fresh caption from a completely different angle (3-4 paragraphs, line breaks)",
  "cta": "a different but compelling call to action",
  "hashtags": ["#new1", "#new2", "#new3", "#different4", "#fresh5"],
  "imagePrompt": "Professional commercial visual — completely different scene from original: [describe in detail]. {style} aesthetic, {primary_color} as dominant color. Typography: [include brand name, headline, or tagline if it strengthens the concept]. Cinematic lighting, ultra-high quality, 16:9 ratio. Reserve clean area if logo overlay needed."
}}"""

    try:
        system_prompt = "You are a world-class social media copywriter. Return only valid JSON."
        raw = call_ai_with_fallback(system_prompt, prompt, task_type="post_variant", max_tokens=get_max_tokens("post_variant", len(prompt)))
        return json.loads(_clean_json(raw))
    except Exception:
        return {
            "hook": f"Here is a truth about {brand_industry} most brands won't tell you...",
            "caption": (
                f"The {brand_industry} landscape has changed dramatically.\n\n"
                f"While most brands are still using yesterday's playbook, {brand_company_name} has been quietly building something different.\n\n"
                f"A smarter approach. A more human approach. One that actually works in 2026.\n\n"
                f"Ready to see what's possible? The link in bio has the answer."
            ),
            "cta": "Discover the difference",
            "hashtags": [
                f"#{brand_company_name.replace(' ', '')}",
                f"#{brand_industry.replace(' ', '')}Trends",
                "#Innovation",
                "#BusinessStrategy",
                "#Results",
            ],
            "imagePrompt": (
                f"Commercial photography: abstract modern concept for {brand_industry}. "
                f"{style} aesthetic, {primary_color} dominant color, studio lighting. "
                f"Bold typography with the brand name prominently displayed. Ultra high quality 16:9."
            ),
        }


def generate_long_form_content(
    company_name: str,
    company_description: str,
    industry: str,
    brand_kit: dict,
    content_type: Literal["blog", "email", "newsletter"],
    topic: Optional[str] = None,
) -> dict:
    """
    Generate long-form content (blog post, email, or newsletter).
    Returns: {type, title, content, metaDescription?, subjectLine?}
    """
    tone = brand_kit.get("toneOfVoice", "professional")
    persona = brand_kit.get("personality", "")
    topic_str = topic or f"How {company_name} is transforming {industry}"

    if content_type == "blog":
        system_prompt = "You are a world-class content strategist and B2B writer. Create SEO-optimized blog posts that rank, engage, and convert. Return only JSON."
        user_prompt = f"""Write a complete blog post for {company_name} ({industry}).
Topic: {topic_str}
Brand tone: {tone}
Brand personality: {persona}
Return JSON: {{"type": "blog", "title": "SEO-optimized compelling title", "metaDescription": "Meta description under 160 chars", "content": "Full blog post in markdown. Structure: Hook paragraph → 3-4 H2 sections → Conclusion with CTA. 600-900 words."}}"""

    elif content_type == "email":
        system_prompt = "You are a world-class email copywriter specializing in high-converting B2B emails. Return only JSON."
        user_prompt = f"""Write a high-converting marketing email for {company_name} ({industry}).
Topic/Goal: {topic_str}
Brand tone: {tone}
Return JSON: {{"type": "email", "title": "Email campaign name", "subjectLine": "Subject line (under 50 chars)", "content": "Full email body. Structure: Greeting → Hook → Problem → Solution → Social proof → CTA → PS. Under 300 words."}}"""

    else:  # newsletter
        system_prompt = "You are a world-class newsletter writer who builds loyal audiences. Return only JSON."
        user_prompt = f"""Write a compelling brand newsletter for {company_name} ({industry}).
Topic: {topic_str}
Brand tone: {tone}
Return JSON: {{"type": "newsletter", "title": "Newsletter edition name", "subjectLine": "Newsletter subject line", "content": "Full newsletter in markdown. Structure: Personal opening → Main insight/story (400 words) → Quick tips (3 bullets) → Featured resource → CTA → Sign-off."}}"""

    try:
        task = f"long_form_{content_type}"
        prompt_len = len(system_prompt) + len(user_prompt)
        raw = call_ai_with_fallback(system_prompt, user_prompt, task_type=task, max_tokens=get_max_tokens(task, prompt_len))
        return json.loads(_clean_json(raw))
    except Exception:
        return {
            "type": content_type,
            "title": topic_str,
            "content": f"# {topic_str}\n\nAt {company_name}, we believe that {company_description[:150]}.\n\n## The Challenge\n\nThe {industry} landscape is evolving faster than most businesses can adapt...\n\n## Our Approach\n\nWe have developed a systematic approach that combines deep expertise with intelligent systems...\n\n## Ready to Transform Your {industry} Strategy?\n\nConnect with our team to discover what's possible for your business.",
            "metaDescription": f"Discover how {company_name} is transforming {industry} with innovative strategies and measurable results.",
            "subjectLine": topic_str[:45],
        }
