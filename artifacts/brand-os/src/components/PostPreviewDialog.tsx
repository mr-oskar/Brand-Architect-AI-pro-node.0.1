/**
 * PostPreviewDialog — mock social media post preview.
 *
 * Shows how a post will look on Instagram, LinkedIn, Twitter, or Facebook.
 * Extracted from CampaignWorkspace for reuse across any page.
 *
 * Usage:
 *   import { PostPreviewDialog } from "@/components/PostPreviewDialog";
 */

import { useState } from "react";
import { Eye, X, Image as ImageIcon } from "lucide-react";
import { Instagram, Linkedin, Twitter, Facebook } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SocialPost } from "@workspace/api-client-react";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PostPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  post: SocialPost;
  brandName: string;
  brandLogoUrl?: string | null;
  brandPrimaryColor: string;
}

// ─── Platform switcher data ───────────────────────────────────────────────────

const PREVIEW_PLATFORMS = [
  { id: "instagram", label: "Instagram", icon: Instagram },
  { id: "linkedin",  label: "LinkedIn",  icon: Linkedin  },
  { id: "twitter",   label: "Twitter",   icon: Twitter   },
  { id: "facebook",  label: "Facebook",  icon: Facebook  },
] as const;

type PreviewPlatform = (typeof PREVIEW_PLATFORMS)[number]["id"];

// ─── Component ────────────────────────────────────────────────────────────────

export function PostPreviewDialog({
  open, onClose, post, brandName, brandLogoUrl, brandPrimaryColor,
}: PostPreviewDialogProps) {
  const [platform, setPlatform] = useState<PreviewPlatform>((post.platform as PreviewPlatform) ?? "instagram");

  if (!open) return null;

  const handle = brandName.toLowerCase().replace(/\s/g, "_");
  const Avatar = () => (
    <div className="w-full h-full rounded-full flex items-center justify-center text-white font-bold" style={{ background: brandPrimaryColor }}>
      {brandLogoUrl ? <img src={brandLogoUrl} className="w-full h-full rounded-full object-cover" alt={brandName} /> : brandName[0]}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-background rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Post Preview</span>
          </div>
          <div className="flex items-center gap-1">
            {PREVIEW_PLATFORMS.map(({ id, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setPlatform(id)}
                className={cn("p-1.5 rounded-lg transition-colors", platform === id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
            <button onClick={onClose} className="ml-2 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Instagram */}
        {platform === "instagram" && (
          <div className="bg-white dark:bg-zinc-900">
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="w-8 h-8 flex-shrink-0"><Avatar /></div>
              <p className="text-xs font-semibold text-zinc-900 dark:text-white flex-1">{handle}</p>
              <span className="text-muted-foreground">···</span>
            </div>
            {post.imageUrl
              ? <img src={post.imageUrl} className="w-full aspect-square object-cover" alt="Post" />
              : <div className="aspect-square bg-gradient-to-br from-pink-100 to-purple-100 dark:from-zinc-800 dark:to-zinc-700 flex items-center justify-center"><ImageIcon className="w-10 h-10 text-pink-300" /></div>
            }
            <div className="px-3 pt-2 pb-3">
              <div className="flex items-center gap-3 mb-2 text-zinc-800 dark:text-zinc-200">
                <span>♥</span><span>💬</span><span>✈</span>
                <span className="ml-auto">🔖</span>
              </div>
              <p className="text-xs text-zinc-900 dark:text-white leading-relaxed">
                <span className="font-semibold">{handle} </span>
                {post.caption.slice(0, 120)}{post.caption.length > 120 ? "... more" : ""}
              </p>
              <p className="text-xs text-blue-500 mt-1">{post.hashtags.slice(0, 5).join(" ")}</p>
            </div>
          </div>
        )}

        {/* LinkedIn */}
        {platform === "linkedin" && (
          <div className="bg-[#f3f2ef] dark:bg-zinc-800 p-3">
            <div className="bg-white dark:bg-zinc-900 rounded-xl overflow-hidden shadow-sm">
              <div className="flex items-center gap-2 p-3">
                <div className="w-10 h-10 flex-shrink-0"><Avatar /></div>
                <div>
                  <p className="text-xs font-semibold text-zinc-900 dark:text-white">{brandName}</p>
                  <p className="text-[10px] text-zinc-500">Company · Just now</p>
                </div>
              </div>
              <p className="px-3 pb-3 text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed">{post.caption.slice(0, 200)}{post.caption.length > 200 ? "..." : ""}</p>
              {post.imageUrl && <img src={post.imageUrl} className="w-full aspect-video object-cover" alt="Post" />}
              <div className="px-3 py-2 border-t border-zinc-100 dark:border-zinc-700 flex gap-4 text-[11px] text-zinc-500">
                <span>👍 Like</span><span>💬 Comment</span><span>🔁 Repost</span>
              </div>
            </div>
          </div>
        )}

        {/* Twitter / X */}
        {platform === "twitter" && (
          <div className="bg-black p-3">
            <div className="flex gap-2">
              <div className="w-10 h-10 flex-shrink-0"><Avatar /></div>
              <div className="flex-1">
                <div className="flex items-center gap-1">
                  <p className="text-sm font-bold text-white">{brandName}</p>
                  <p className="text-xs text-zinc-500">@{handle} · now</p>
                </div>
                <p className="text-sm text-white leading-relaxed mt-1">{post.hook}</p>
                {post.imageUrl && <img src={post.imageUrl} className="w-full rounded-xl mt-2 aspect-video object-cover" alt="Post" />}
                <div className="flex gap-5 mt-2 text-zinc-500 text-xs">
                  <span>💬 0</span><span>🔁 0</span><span>♥ 0</span><span>📤</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Facebook */}
        {platform === "facebook" && (
          <div className="bg-[#f0f2f5] dark:bg-zinc-800 p-3">
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 p-3">
                <div className="w-10 h-10 flex-shrink-0"><Avatar /></div>
                <div>
                  <p className="text-xs font-semibold text-zinc-900 dark:text-white">{brandName}</p>
                  <p className="text-[10px] text-zinc-500">Just now · 🌐</p>
                </div>
              </div>
              <p className="px-3 pb-2 text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed">{post.caption.slice(0, 200)}{post.caption.length > 200 ? "..." : ""}</p>
              {post.imageUrl && <img src={post.imageUrl} className="w-full aspect-video object-cover" alt="Post" />}
              <div className="px-3 py-2 border-t border-zinc-100 dark:border-zinc-700 flex gap-4 text-[11px] text-zinc-500">
                <span>👍 Like</span><span>💬 Comment</span><span>↗ Share</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
