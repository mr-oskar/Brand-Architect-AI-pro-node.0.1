/**
 * Application-wide constants for Brand Architect AI Pro.
 *
 * Centralising constants here avoids magic strings/numbers scattered across
 * the codebase and makes future changes a single-line edit.
 *
 * To add a new constant:
 *   1. Add it to the appropriate section below
 *   2. Import from "@/lib/constants" wherever needed
 *   3. Never hard-code values that appear in more than one file
 */

// ── Auth ──────────────────────────────────────────────────────────────────────

/** localStorage key used to persist the JWT auth token. */
export const AUTH_TOKEN_KEY = "brand_os_auth_token";

/** Minimum password length enforced on the frontend (matches backend). */
export const PASSWORD_MIN_LENGTH = 8;

// ── Pagination ────────────────────────────────────────────────────────────────

/** Default page size for list endpoints. */
export const DEFAULT_PAGE_SIZE = 20;

/** Maximum page size allowed. */
export const MAX_PAGE_SIZE = 200;

// ── Brand ─────────────────────────────────────────────────────────────────────

/** Maximum logo file size the frontend accepts before uploading (bytes). */
export const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/** Accepted logo MIME types. */
export const ACCEPTED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

/** Industries shown in the brand creation wizard and edit form. */
export const INDUSTRIES = [
  "Technology",
  "SaaS",
  "E-commerce & Retail",
  "Fashion & Apparel",
  "Luxury",
  "Health & Wellness",
  "Food & Beverage",
  "Finance & Fintech",
  "Legal",
  "Real Estate",
  "Education & EdTech",
  "Media & Entertainment",
  "Travel & Hospitality",
  "Beauty & Cosmetics",
  "Consulting & Professional Services",
  "Non-profit",
  "Manufacturing",
  "Sports & Fitness",
  "Automotive",
  "Other",
] as const;

export type Industry = (typeof INDUSTRIES)[number];

/** Tone-of-voice options for the brand creation wizard. */
export const TONE_OPTIONS = [
  { value: "professional", label: "Professional", desc: "Formal, authoritative, trustworthy" },
  { value: "friendly",     label: "Friendly",     desc: "Warm, approachable, conversational" },
  { value: "bold",         label: "Bold",         desc: "Confident, direct, impactful" },
  { value: "playful",      label: "Playful",      desc: "Fun, energetic, creative" },
  { value: "minimalist",   label: "Minimalist",   desc: "Clean, refined, understated" },
  { value: "luxury",       label: "Luxury",       desc: "Premium, exclusive, sophisticated" },
] as const;

// ── Campaign ──────────────────────────────────────────────────────────────────

/** Minimum campaign days. */
export const MIN_CAMPAIGN_DAYS = 1;

/** Maximum campaign days. */
export const MAX_CAMPAIGN_DAYS = 14;

/** Default campaign duration. */
export const DEFAULT_CAMPAIGN_DAYS = 7;

/** Supported social media platforms. */
export const SOCIAL_PLATFORMS = [
  { id: "instagram", label: "Instagram" },
  { id: "twitter",   label: "X (Twitter)" },
  { id: "linkedin",  label: "LinkedIn" },
  { id: "facebook",  label: "Facebook" },
  { id: "tiktok",    label: "TikTok" },
] as const;

// ── AI ────────────────────────────────────────────────────────────────────────

/** Polling interval in ms while waiting for a background AI job. */
export const JOB_POLL_INTERVAL_MS = 2000;

/** Maximum time in ms to poll before giving up. */
export const JOB_POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// ── UI ────────────────────────────────────────────────────────────────────────

/** Duration in ms for success/info toast notifications. */
export const TOAST_DURATION_MS = 4000;

/** Duration in ms for error toast notifications (longer so user can read). */
export const TOAST_ERROR_DURATION_MS = 7000;

/** Breakpoints matching Tailwind's config. */
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

// ── Platform ──────────────────────────────────────────────────────────────────
// Import ComponentType for icon typing without pulling in JSX into this file.
import type { ComponentType } from "react";

/**
 * Visual config for each supported social platform.
 * Used by PlatformBadge, PostPreviewDialog, and CampaignBriefPage.
 * Add new platforms here — all consumers update automatically.
 */
export const PLATFORM_CONFIG: Record<
  string,
  {
    label: string;
    color: string;
    bgColor: string;
    textColor: string;
    icon: ComponentType<{ className?: string }>;
  }
> = (() => {
  // Icons are imported lazily via dynamic import to avoid circular deps.
  // The actual icon components are assigned after module init.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config: Record<string, any> = {
    instagram: { label: "Instagram", color: "#E1306C", bgColor: "bg-pink-50 dark:bg-pink-950/40", textColor: "text-pink-600 dark:text-pink-400" },
    linkedin:  { label: "LinkedIn",  color: "#0A66C2", bgColor: "bg-blue-50 dark:bg-blue-950/40",  textColor: "text-blue-600 dark:text-blue-400"  },
    twitter:   { label: "X / Twitter", color: "#000000", bgColor: "bg-slate-50 dark:bg-slate-900",  textColor: "text-slate-700 dark:text-slate-300" },
    facebook:  { label: "Facebook",  color: "#1877F2", bgColor: "bg-blue-50 dark:bg-blue-950/40",  textColor: "text-blue-700 dark:text-blue-300"  },
  };
  return config;
})();

// ── Image Generation ──────────────────────────────────────────────────────────

import type { ImageSize, ImageModel } from "@/types";

/** Canvas size options for AI image generation. */
export const IMAGE_SIZE_OPTIONS: {
  id: ImageSize | "custom";
  label: string;
  dim: string;
  ratio: "square" | "portrait" | "landscape" | "auto" | "custom";
}[] = [
  { id: "1024x1024", label: "Square",    dim: "1024 × 1024", ratio: "square"    },
  { id: "1024x1536", label: "Portrait",  dim: "1024 × 1536", ratio: "portrait"  },
  { id: "1536x1024", label: "Landscape", dim: "1536 × 1024", ratio: "landscape" },
  { id: "auto",      label: "Auto",      dim: "AI decides",  ratio: "auto"      },
  { id: "custom",    label: "Custom",    dim: "Enter W × H", ratio: "custom"    },
];

/** AI model quality tiers for image generation. */
export const IMAGE_MODEL_OPTIONS: {
  id: ImageModel;
  label: string;
  tagline: string;
  desc: string;
}[] = [
  { id: "nano", label: "Nano", tagline: "Fast & direct",     desc: "No prompt enhancement — uses your text as-is" },
  { id: "mini", label: "Mini", tagline: "Light enhancement", desc: "Adds lighting and composition details"         },
  { id: "pro",  label: "Pro",  tagline: "Maximum quality",   desc: "Full art direction with brand DNA embedded"   },
];

/** Common aspect ratio presets for custom canvas dimensions. */
export const IMAGE_ASPECT_PRESETS: { label: string; w: number; h: number }[] = [
  { label: "1:1",  w: 1080, h: 1080 },
  { label: "4:5",  w: 1080, h: 1350 },
  { label: "9:16", w: 1080, h: 1920 },
  { label: "16:9", w: 1920, h: 1080 },
  { label: "3:2",  w: 1500, h: 1000 },
  { label: "2:3",  w: 1000, h: 1500 },
  { label: "21:9", w: 2100, h: 900  },
  { label: "4:3",  w: 1200, h: 900  },
];

// ── Posts ─────────────────────────────────────────────────────────────────────

/** Tailwind classes for each post publish status badge. */
export const POST_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft:     { label: "Draft",     cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"         },
  scheduled: { label: "Scheduled", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"      },
  published: { label: "Published", cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"  },
  failed:    { label: "Failed",    cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"          },
};
