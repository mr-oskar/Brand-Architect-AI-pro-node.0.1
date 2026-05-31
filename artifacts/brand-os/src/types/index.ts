/**
 * Shared TypeScript types for the Brand Architect AI Pro frontend.
 *
 * These types are hand-written to supplement the auto-generated API types
 * in `@workspace/api-client-react`. Use these for:
 *   - UI-only types (component props, local state shapes)
 *   - Types derived from API responses but enriched for the frontend
 *   - Shared enums and constants used across multiple pages
 *
 * Auto-generated API types live in:
 *   lib/api-client-react/src/generated/api.schemas.ts
 *
 * To add a new type:
 *   1. Define it here if it's UI-only or shared across pages
 *   2. If it maps directly to an API schema, prefer importing from api-client-react
 *   3. Export from this file so consumers do: import { MyType } from "@/types"
 */

// ── Auth ──────────────────────────────────────────────────────────────────────

/** Authenticated user as stored in AuthContext. */
export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "user";
  status: "active" | "suspended" | string;
  credits: number;
}

// ── Brand ─────────────────────────────────────────────────────────────────────

/** Social media platform identifiers. */
export type SocialPlatform = "instagram" | "twitter" | "linkedin" | "facebook" | "tiktok";

/** Brand color palette entry. */
export interface BrandColor {
  name: string;
  hex: string;
  usage?: string;
}

/** Typography configuration from AI brand kit. */
export interface BrandTypography {
  primary: string;
  secondary?: string;
  heading?: string;
  body?: string;
}

/** Full AI-generated brand kit. */
export interface BrandKit {
  tagline?: string;
  brandStory?: string;
  brandVoice?: string[];
  targetAudience?: string;
  colors?: BrandColor[];
  typography?: BrandTypography;
  logoPrompt?: string;
  contentPillars?: string[];
}

// ── Campaign ──────────────────────────────────────────────────────────────────

/** Post publish status. */
export type PublishStatus = "draft" | "scheduled" | "published" | "failed";

/** Post as displayed in the campaign workspace. */
export interface PostSummary {
  id: number;
  day: number;
  caption: string | null;
  hook: string | null;
  cta: string | null;
  hashtags: string[] | null;
  imageUrl: string | null;
  imagePrompt: string | null;
  platform: SocialPlatform | string;
  publishStatus: PublishStatus;
  scheduledAt: string | null;
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

/** Background job status returned from GET /api/jobs/:id */
export type JobStatus = "pending" | "running" | "done" | "failed";

export interface JobProgress {
  id: string;
  status: JobStatus;
  progress: number;
  total: number;
  step?: string;
  result?: unknown;
  error?: string | null;
}

// ── UI helpers ────────────────────────────────────────────────────────────────

/** Generic async operation state for local component state. */
export interface AsyncState<T = void> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
}

/** Paginated API response wrapper. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Toast notification variant. */
export type ToastVariant = "default" | "destructive";

// ── Image Generation ───────────────────────────────────────────────────────────

/** Supported standard image sizes for AI image generation. */
export type ImageSize = "1024x1024" | "1024x1536" | "1536x1024" | "auto";

/** AI image generation model tiers (prompt enhancement level). */
export type ImageModel = "nano" | "mini" | "pro";

/**
 * An AI model returned by GET /api/ai/models.
 * Source is either "registry" (DB-backed System B) or "keystore" (api_key_store System A).
 */
export interface AvailableAIModel {
  id: string;
  name: string;
  description: string;
  capability: "image" | "text";
  isDefault: boolean;
  providerType: "openai" | "gemini" | "custom" | string;
  source: "registry" | "keystore";
}

/** Options passed to the AI image generation endpoint and ImageGenDialog. */
export interface ImageGenOptions {
  customPrompt: string;
  size: ImageSize;
  customWidth?: number;
  customHeight?: number;
  model: ImageModel;
  overlayText: string;
  includeLogo: boolean;
  logoDataUrl?: string;
  referenceImages?: Array<{ dataUrl: string; label?: string }>;
  /** Actual AI model ID to use (e.g. "gpt-image-1"). Overrides the admin default. */
  imageModelId?: string;
}

/** A single entry in a post's image generation history. */
export interface PostImageHistoryEntry {
  url: string;
  prompt?: string;
  createdAt: string;
}

/** A reference image item used inside the AI Image Studio dialog. */
export interface ReferenceImageItem {
  id: string;
  dataUrl: string;
  name: string;
  label: string;
}

// ── Content Generation ─────────────────────────────────────────────────────────

/** A/B variant generated from an existing post. */
export interface PostVariant {
  hook: string;
  caption: string;
  cta: string;
  hashtags: string[];
  imagePrompt: string;
}

/** Long-form content (blog, email, newsletter) expanded from a post hook. */
export interface LongFormContent {
  type: "blog" | "email" | "newsletter";
  title: string;
  content: string;
  metaDescription?: string;
  subjectLine?: string;
}
