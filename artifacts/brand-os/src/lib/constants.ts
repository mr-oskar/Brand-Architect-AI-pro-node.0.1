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
