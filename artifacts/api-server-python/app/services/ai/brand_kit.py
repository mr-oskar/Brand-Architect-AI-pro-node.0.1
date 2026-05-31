"""
Brand Kit AI Generation.

Generates a comprehensive brand identity (BrandKit) using AI.
See the BrandKit TypedDict below for all fields.

Extension points:
  - Add industry-specific prompts for different verticals.
  - Add multi-language support (Arabic, French, etc.) via language param.
  - Add competitor analysis: pass competitor names for sharper positioning.
"""
import json
import re
from typing import Optional

from app.services.ai.client import call_ai_with_fallback
from app.utils.token_optimizer import get_max_tokens


# ── BrandKit schema ───────────────────────────────────────────────────────────

BRAND_KIT_FALLBACK_VISUAL_STYLE = "minimal"
VALID_VISUAL_STYLES = {"tech", "luxury", "bold", "minimal"}


def _clean_json(raw: str) -> str:
    """Strip markdown code fences and whitespace from AI JSON output."""
    return re.sub(r"```json\n?|```\n?", "", raw).strip()


def generate_brand_kit(
    company_name: str,
    company_description: str,
    industry: str,
    brand_colors: Optional[list[str]] = None,
) -> dict:
    """
    Generate a full BrandKit for the given company using AI.
    Falls back to a deterministic kit if AI fails.

    Returns a dict matching the BrandKit schema.
    """
    color_context = (
        f"The company logo contains these extracted colors: {', '.join(brand_colors)}. "
        "Use these as the foundation for the brand color palette — keep them as primary/secondary, "
        "and derive accent/background/text/neutral from them. Honor these colors precisely."
        if brand_colors
        else "Derive a distinctive, professional brand color palette from the industry, positioning, and target audience."
    )

    system_prompt = (
        "You are the world's most accomplished brand strategist, creative director, and chief marketing officer combined. "
        "You have built brands for Fortune 500 companies, luxury conglomerates, and unicorn startups. "
        "Your brand identity systems are used as case studies at top business schools. "
        "You produce COMPREHENSIVE, SPECIFIC, ORIGINAL brand identities — never generic. "
        "You ALWAYS respond with valid JSON only — no markdown, no explanation, just the raw JSON object."
    )

    user_prompt = f"""Perform a deep brand analysis and generate a complete, professional brand identity system for this company:

Company: {company_name}
Industry: {industry}
Description: {company_description}
{color_context}

Return a JSON object with EXACTLY these fields (be deeply specific and original — no generic templates):
{{
  "personality": "2-3 sentence brand personality statement — who they truly are, their character, energy, and essence. Make it vivid and specific.",
  "positioning": "2-3 sentence market positioning — where they sit in the competitive landscape, their unique angle, what they own in the mind of customers.",
  "toneOfVoice": "Specific description of their communication style — vocabulary range, sentence rhythm, emotional register, energy level, examples of how they would and wouldn't speak.",
  "audienceSegments": [
    "Primary segment: [job title/role], [age range], [specific pain point], [aspiration], [platform where they spend time]",
    "Secondary segment: [detailed demographic + psychographic]",
    "Tertiary segment: [detailed demographic + psychographic]"
  ],
  "visualStyle": "one of exactly: tech | luxury | bold | minimal",
  "colorPalette": {{
    "primary": "#HEXCODE",
    "secondary": "#HEXCODE",
    "accent": "#HEXCODE",
    "background": "#HEXCODE",
    "text": "#HEXCODE",
    "neutral": "#HEXCODE"
  }},
  "visualStyleRules": "Comprehensive paragraph: photography style, layout principles, typography hierarchy, iconography style, what to ALWAYS and NEVER do.",
  "brandStory": "A compelling 3-paragraph brand origin and purpose story.",
  "missionStatement": "One powerful sentence: what we do, for whom, and why it matters. Under 20 words.",
  "visionStatement": "One inspiring sentence: the world we are building toward. Under 20 words.",
  "taglines": ["Primary tagline: 3-5 words", "Alternative 1", "Alternative 2", "Campaign tagline"],
  "brandKeywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5", "keyword6", "keyword7", "keyword8"],
  "messagingPillars": [
    "Pillar 1: [Theme] — [One-sentence explanation]",
    "Pillar 2: [Theme] — [Explanation]",
    "Pillar 3: [Theme] — [Explanation]"
  ],
  "dosCommunication": [
    "Do: [specific communication rule with example]",
    "Do: [specific rule]",
    "Do: [specific rule]",
    "Do: [specific rule]"
  ],
  "dontsCommunication": [
    "Don't: [specific thing to avoid with reason]",
    "Don't: [specific thing to avoid]",
    "Don't: [specific thing to avoid]",
    "Don't: [specific thing to avoid]"
  ],
  "socialBio": "Ready-to-use social media bio (under 150 chars): emoji + core value prop + CTA",
  "typographyRecommendations": "Heading font style, Body font style, accent/quote font, font pairing rationale.",
  "competitivePosition": "2-3 sentences on where this brand sits vs. competitors."
}}

Be deeply specific, original, and tailored to {company_name}. Every field must reflect this exact company."""

    prompt_len = len(system_prompt) + len(user_prompt)
    raw = call_ai_with_fallback(system_prompt, user_prompt, task_type="brand_kit", max_tokens=get_max_tokens("brand_kit", prompt_len))
    try:
        kit = json.loads(_clean_json(raw))
    except (json.JSONDecodeError, ValueError):
        return _build_fallback_kit(company_name, company_description, industry, brand_colors)
    if kit.get("visualStyle") not in VALID_VISUAL_STYLES:
        kit["visualStyle"] = BRAND_KIT_FALLBACK_VISUAL_STYLE
    if not kit.get("colorPalette", {}).get("neutral"):
        kit.setdefault("colorPalette", {})["neutral"] = "#6B7280"
    return kit


def generate_brand_story(
    company_name: str,
    company_description: str,
    industry: str,
    brand_kit: dict,
) -> str:
    """
    Generate or regenerate a compelling brand story for the given brand.
    Returns a multi-paragraph story string.
    """
    tone = brand_kit.get("toneOfVoice", "professional and human")
    personality = brand_kit.get("personality", "")
    positioning = brand_kit.get("positioning", "")
    mission = brand_kit.get("missionStatement", "")

    system_prompt = (
        "You are a world-class brand storyteller and narrative strategist. "
        "You craft origin stories that make customers fall in love with brands. "
        "Your stories are specific, emotionally resonant, and true to the brand's identity. "
        "Return ONLY the story text — no JSON, no markdown headers."
    )

    user_prompt = f"""Write a compelling, emotionally engaging brand origin and purpose story for {company_name}.

Company: {company_name}
Industry: {industry}
Description: {company_description}
Brand personality: {personality}
Brand positioning: {positioning}
Mission: {mission}
Tone of voice: {tone}

Write exactly 3 paragraphs:
1. The origin — what problem or gap did the founders observe? What sparked the idea?
2. The journey — how did they build it? What did they learn? What makes the approach unique?
3. The purpose — why does this brand exist today? What future are they building toward?

Be specific to {company_name}. No generic startup clichés. Every sentence must feel authentic."""

    prompt_len = len(system_prompt) + len(user_prompt)
    raw = call_ai_with_fallback(system_prompt, user_prompt, task_type="brand_story", max_tokens=get_max_tokens("brand_story", prompt_len))
    return raw.strip()


def _build_fallback_kit(
    company_name: str,
    company_description: str,
    industry: str,
    brand_colors: Optional[list[str]] = None,
) -> dict:
    if brand_colors and len(brand_colors) >= 2:
        palette = {
            "primary": brand_colors[0],
            "secondary": brand_colors[1],
            "accent": brand_colors[2] if len(brand_colors) > 2 else "#06B6D4",
            "background": "#0F172A",
            "text": "#F1F5F9",
            "neutral": "#6B7280",
        }
    else:
        palette = {
            "primary": "#6366F1",
            "secondary": "#8B5CF6",
            "accent": "#06B6D4",
            "background": "#0F172A",
            "text": "#F1F5F9",
            "neutral": "#6B7280",
        }
    return {
        "personality": f"{company_name} is a dynamic, results-driven brand in the {industry} space that combines deep expertise with genuine human connection. We are ambitious yet approachable, innovative yet reliable.",
        "positioning": f"{company_name} occupies a unique position as the intelligent choice in {industry} — where professional excellence meets authentic partnership.",
        "toneOfVoice": "Direct, confident, and human. We speak plainly but powerfully — no jargon, no corporate speak.",
        "audienceSegments": [
            f"Growth-focused business owners (30–45), frustrated with slow results, seeking a reliable {industry} partner",
            "Senior managers at SMBs who need to justify ROI to stakeholders",
            "Entrepreneurs building their second or third venture",
        ],
        "visualStyle": "minimal",
        "colorPalette": palette,
        "visualStyleRules": "Clean, modern compositions with generous white space. Primary color used for key focal points only. Photography: natural light, authentic moments, people-first.",
        "brandStory": f"{company_name} was founded with a single observation: {company_description[:100]}. The gap between what businesses needed and what they were getting was too wide to ignore.\n\nSo we built a different approach — one that combines intelligent systems with genuine human expertise.\n\nToday, {company_name} is the partner that growth-minded businesses trust when the stakes are real.",
        "missionStatement": f"Helping {industry} businesses achieve breakthrough results through intelligent strategy and genuine partnership.",
        "visionStatement": f"A world where every ambitious business has access to world-class {industry} expertise.",
        "taglines": ["Built for Growth", "Intelligence Meets Action", "Results, Not Just Promises", "Your Growth Partner"],
        "brandKeywords": ["growth", "results", "intelligent", "trusted", "innovative", "strategic", "human", "impactful"],
        "messagingPillars": [
            "Results-First — We lead with measurable outcomes and always tie our work to business impact",
            "Intelligent Partnership — We bring AI-driven insights and deep human expertise to every engagement",
            "Proven Excellence — We back every claim with evidence and transparent methodology",
        ],
        "dosCommunication": [
            "Do: Lead with specific outcomes and numbers when possible",
            "Do: Use active, direct language that respects the reader's time",
            "Do: Acknowledge real challenges before presenting solutions",
            "Do: Speak to ambitions, not just problems",
        ],
        "dontsCommunication": [
            "Don't: Use buzzwords or vague superlatives without evidence",
            "Don't: Over-promise or use absolute claims",
            "Don't: Speak down to the audience or be condescending",
            "Don't: Use passive voice or corporate jargon",
        ],
        "socialBio": f"✦ {industry} growth partner | Results-driven strategy | Link below 👇",
        "typographyRecommendations": "Headings: Geometric sans-serif (Inter Bold, weight 700–900). Body: Humanist sans-serif (Inter Regular, weight 400). Pairing: consistency creates trust; variation in weight creates hierarchy.",
        "competitivePosition": f"{company_name} occupies the intelligent professional space — more sophisticated than generalist agencies, more human than pure-tech platforms.",
    }
