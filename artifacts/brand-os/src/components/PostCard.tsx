/**
 * PostCard — displays a single social media post with all editing capabilities.
 *
 * Extracted from CampaignWorkspace. Self-contained: owns its own editing,
 * regeneration, variant, long-form, and image generation states.
 *
 * Usage:
 *   import { PostCard } from "@/components/PostCard";
 */

import { useState } from "react";
import {
  Edit3, Check, X, RefreshCw, Loader2, Hash, Image as ImageIcon,
  Megaphone, Sparkles, Wand2, Copy, CheckCircle2, Download, FileText,
  Mail, Newspaper, ChevronDown, TestTube2,
  ZoomIn, Send, Eye, Clock,
} from "lucide-react";
import { Instagram, Linkedin, Twitter, Facebook } from "lucide-react";
import type { SocialPost } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { extractApiError, notifyError } from "@/lib/apiError";
import { apiFetch, apiPost } from "@/lib/apiFetch";
import { removeLogoBackground } from "@/lib/imageUtils";
import { POST_STATUS_BADGE } from "@/lib/constants";
import { ImageGenDialog } from "@/components/ImageGenDialog";
import { PostPreviewDialog } from "@/components/PostPreviewDialog";
import type { ImageGenOptions, PostImageHistoryEntry, PostVariant, LongFormContent } from "@/types";

// ─── Platform badge ───────────────────────────────────────────────────────────

const PLATFORM_ICON: Record<string, React.ElementType> = {
  instagram: Instagram,
  linkedin: Linkedin,
  twitter: Twitter,
  facebook: Facebook,
};

const PLATFORM_STYLE: Record<string, { label: string; bgColor: string; textColor: string }> = {
  instagram: { label: "Instagram", bgColor: "bg-pink-50 dark:bg-pink-950/40",  textColor: "text-pink-600 dark:text-pink-400"  },
  linkedin:  { label: "LinkedIn",  bgColor: "bg-blue-50 dark:bg-blue-950/40",  textColor: "text-blue-600 dark:text-blue-400"  },
  twitter:   { label: "X / Twitter", bgColor: "bg-slate-50 dark:bg-slate-900", textColor: "text-slate-700 dark:text-slate-300" },
  facebook:  { label: "Facebook",  bgColor: "bg-blue-50 dark:bg-blue-950/40",  textColor: "text-blue-700 dark:text-blue-300"  },
};

function PlatformBadge({ platform }: { platform: string }) {
  const style = PLATFORM_STYLE[platform] ?? PLATFORM_STYLE.instagram!;
  const Icon = PLATFORM_ICON[platform] ?? Instagram;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold", style.bgColor, style.textColor)}>
      <Icon className="w-3 h-3" /> {style.label}
    </span>
  );
}

// ─── Reusable field sub-components ───────────────────────────────────────────

function PostTextField({ label, value, editing, onChange, onCopy, copied, isHighlight }: {
  label: string; value: string; editing: boolean; onChange?: (v: string) => void;
  onCopy?: () => void; copied?: boolean; isHighlight?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
        {onCopy && !editing && (
          <button onClick={onCopy} className="text-muted-foreground hover:text-foreground transition-colors">
            {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
      {editing && onChange
        ? <input className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" value={value} onChange={(e) => onChange(e.target.value)} />
        : <p className={cn("text-sm leading-relaxed", isHighlight ? "text-primary font-medium" : "text-foreground")}>{value}</p>
      }
    </div>
  );
}

function PostTextArea({ label, value, editing, onChange, rows, onCopy, copied }: {
  label: string; value: string; editing: boolean; onChange?: (v: string) => void;
  rows?: number; onCopy?: () => void; copied?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
        {onCopy && !editing && (
          <button onClick={onCopy} className="text-muted-foreground hover:text-foreground transition-colors">
            {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
      {editing && onChange
        ? <textarea className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none" rows={rows ?? 5} value={value} onChange={(e) => onChange(e.target.value)} />
        : <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{value}</p>
      }
    </div>
  );
}

function HashtagsField({ value, editing, tags, onChange, onCopy, copied }: {
  value: string; editing: boolean; tags: string[]; onChange?: (v: string) => void; onCopy?: () => void; copied?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Hash className="w-3 h-3" /> Hashtags</label>
        {onCopy && !editing && (
          <button onClick={onCopy} className="text-muted-foreground hover:text-foreground transition-colors">
            {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
      {editing && onChange
        ? <input className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring" value={value} onChange={(e) => onChange(e.target.value)} placeholder="#hashtag1 #hashtag2" />
        : (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag, i) => <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium">{tag}</span>)}
          </div>
        )
      }
    </div>
  );
}

function ImagePromptField({ value, editing, onChange }: { value: string; editing: boolean; onChange?: (v: string) => void }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3.5">
      <label className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
        <ImageIcon className="w-3 h-3" /> AI Image Prompt
      </label>
      {editing && onChange
        ? <textarea className="w-full px-3 py-2 rounded-lg border border-input bg-background text-xs text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none" rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
        : <p className="text-xs text-muted-foreground font-mono leading-relaxed">{value}</p>
      }
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PostCardProps {
  post: SocialPost;
  brandLogoUrl?: string | null;
  brandName: string;
  brandPrimaryColor: string;
  onSave: (id: number, data: Partial<SocialPost>) => Promise<void>;
  onRegenerate: (id: number) => Promise<void>;
  onGenerateImage: (id: number, opts: ImageGenOptions) => Promise<SocialPost | undefined>;
  onRestoreImage: (id: number, url: string) => Promise<void>;
  onPublishNow?: (id: number) => void;
  publishingNow?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PostCard({
  post, brandLogoUrl, brandName, brandPrimaryColor,
  onSave, onRegenerate, onGenerateImage, onRestoreImage,
  onPublishNow, publishingNow,
}: PostCardProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatingVariant, setGeneratingVariant] = useState(false);
  const [generatingContent, setGeneratingContent] = useState(false);
  const [showContentDropdown, setShowContentDropdown] = useState(false);
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [variant, setVariant] = useState<PostVariant | null>(null);
  const [longFormContent, setLongFormContent] = useState<LongFormContent | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<"post" | "variant" | "content">("post");
  const [imageExpanded, setImageExpanded] = useState(false);

  const [draft, setDraft] = useState({
    hook: post.hook,
    caption: post.caption,
    cta: post.cta,
    imagePrompt: post.imagePrompt,
    hashtags: post.hashtags.join(" "),
  });

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  function cancel() {
    setDraft({ hook: post.hook, caption: post.caption, cta: post.cta, imagePrompt: post.imagePrompt, hashtags: post.hashtags.join(" ") });
    setEditing(false);
  }

  async function save() {
    setSaving(true);
    await onSave(post.id, {
      hook: draft.hook, caption: draft.caption, cta: draft.cta,
      imagePrompt: draft.imagePrompt,
      hashtags: draft.hashtags.split(/\s+/).filter(Boolean),
    });
    setSaving(false);
    setEditing(false);
    setDraft({ hook: post.hook, caption: post.caption, cta: post.cta, imagePrompt: post.imagePrompt, hashtags: post.hashtags.join(" ") });
  }

  async function regen() {
    setRegenerating(true);
    await onRegenerate(post.id);
    setRegenerating(false);
    setVariant(null);
  }

  async function handleGenerateWithOptions(opts: ImageGenOptions) {
    if (generatingImage) return;
    setShowImageDialog(false);
    setGeneratingImage(true);
    try {
      let logoDataUrl: string | undefined;
      if (opts.includeLogo && brandLogoUrl) {
        logoDataUrl = await removeLogoBackground(brandLogoUrl);
      }
      await onGenerateImage(post.id, { ...opts, logoDataUrl });
    } catch (err) {
      notifyError("Image generation failed", err);
    } finally {
      setGeneratingImage(false);
    }
  }

  async function handleRestoreFromHistory(url: string) {
    if (generatingImage) return;
    setGeneratingImage(true);
    try { await onRestoreImage(post.id, url); }
    finally { setGeneratingImage(false); }
  }

  function downloadImage() {
    if (!post.imageUrl) return;
    const a = document.createElement("a");
    a.href = post.imageUrl;
    a.download = `${brandName.replace(/\s+/g, "-")}-day${post.day}.jpg`;
    a.click();
  }

  async function generateVariant() {
    setGeneratingVariant(true);
    setActivePanel("variant");
    try {
      const res = await apiFetch(`/api/posts/${post.id}/generate-variant`, { method: "POST" });
      if (!res.ok) throw new Error(await extractApiError(res, "Variant generation failed"));
      const data = await res.json() as PostVariant;
      setVariant(data);
    } catch (err) {
      setVariant(null);
      notifyError("Variant generation failed", err);
    } finally {
      setGeneratingVariant(false);
    }
  }

  async function generateLongForm(type: "blog" | "email" | "newsletter") {
    setGeneratingContent(true);
    setShowContentDropdown(false);
    setActivePanel("content");
    try {
      const res = await apiPost(`/api/posts/${post.id}/generate-content`, { contentType: type });
      if (!res.ok) throw new Error(await extractApiError(res, "Content generation failed"));
      const data = await res.json() as LongFormContent;
      setLongFormContent(data);
    } catch (err) {
      setLongFormContent(null);
      notifyError("Content generation failed", err);
    } finally {
      setGeneratingContent(false);
    }
  }

  const imageHistory = (post as unknown as { imageHistory?: PostImageHistoryEntry[] }).imageHistory ?? [];
  const publishStatus = (post as unknown as Record<string, unknown>).publishStatus as string | undefined;
  const scheduledAt = (post as unknown as Record<string, unknown>).scheduledAt as string | null;
  const statusBadge = publishStatus ? POST_STATUS_BADGE[publishStatus] : null;

  return (
    <>
      <ImageGenDialog
        open={showImageDialog}
        onClose={() => setShowImageDialog(false)}
        onGenerate={handleGenerateWithOptions}
        defaultPrompt={post.imagePrompt}
        generating={generatingImage}
        brandLogoUrl={brandLogoUrl}
        brandName={brandName}
        imageHistory={imageHistory}
        currentImageUrl={post.imageUrl}
        onRestoreFromHistory={handleRestoreFromHistory}
      />
      <PostPreviewDialog
        open={showPreview}
        onClose={() => setShowPreview(false)}
        post={post}
        brandName={brandName}
        brandLogoUrl={brandLogoUrl}
        brandPrimaryColor={brandPrimaryColor}
      />

      <div className="rounded-xl border border-card-border bg-card overflow-hidden flex flex-col">
        {/* Image area */}
        {post.imageUrl ? (
          <div className="relative group">
            <img src={post.imageUrl} alt={`Day ${post.day} visual`} className={cn("w-full object-cover transition-all cursor-pointer", imageExpanded ? "aspect-auto" : "aspect-video")} onClick={() => setImageExpanded((v) => !v)} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-transparent pointer-events-none" />
            <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => setImageExpanded((v) => !v)} className="p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80 backdrop-blur-sm transition-colors"><ZoomIn className="w-3.5 h-3.5" /></button>
            </div>
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
              <button onClick={downloadImage} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 text-slate-800 text-xs font-semibold hover:bg-white transition-colors backdrop-blur-sm shadow-sm">
                <Download className="w-3.5 h-3.5" /> Download
              </button>
              <button onClick={() => setShowImageDialog(true)} disabled={generatingImage} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white text-xs font-medium backdrop-blur-sm transition-colors disabled:opacity-60">
                {generatingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                {generatingImage ? "Generating..." : "Regenerate"}
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full aspect-video bg-gradient-to-br from-muted/60 to-muted/30 flex flex-col items-center justify-center gap-3 border-b border-card-border">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center"><ImageIcon className="w-7 h-7 text-primary/50" /></div>
            <p className="text-xs text-muted-foreground max-w-[200px] text-center">{post.imagePrompt.slice(0, 60)}...</p>
            <button onClick={() => setShowImageDialog(true)} disabled={generatingImage} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-sm">
              {generatingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generatingImage ? "Generating AI Image..." : "Generate AI Image"}
            </button>
            <p className="text-[11px] text-muted-foreground">AI generates image + auto-embeds brand logo</p>
          </div>
        )}

        {/* Card header */}
        <div className="px-4 py-3 bg-muted/30 border-b border-card-border flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">{post.day}</div>
            <span className="text-sm font-semibold text-foreground">Day {post.day}</span>
            <PlatformBadge platform={post.platform} />
            {statusBadge && publishStatus && publishStatus !== "draft" && (
              <div className="flex items-center gap-1">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusBadge.cls}`}>
                  {publishStatus === "scheduled" && <Clock className="w-2.5 h-2.5" />}
                  {publishStatus === "published" && <CheckCircle2 className="w-2.5 h-2.5" />}
                  {statusBadge.label}
                </span>
                {scheduledAt && publishStatus === "scheduled" && (
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(scheduledAt).toLocaleDateString("en-SA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {onPublishNow && !editing && publishStatus !== "published" && (
              <button onClick={() => onPublishNow(post.id)} disabled={publishingNow} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md border border-border transition-colors">
                {publishingNow ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {publishingNow ? "Publishing..." : "Publish Now"}
              </button>
            )}
            {editing ? (
              <>
                <button onClick={cancel} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md border border-border transition-colors"><X className="w-3.5 h-3.5" /> Cancel</button>
                <button onClick={save} disabled={saving} className="flex items-center gap-1 text-xs bg-primary text-primary-foreground px-2.5 py-1.5 rounded-md hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
                </button>
              </>
            ) : (
              <>
                <button onClick={regen} disabled={regenerating} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md border border-border transition-colors">
                  {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  {regenerating ? "Regenerating..." : "Regenerate"}
                </button>
                <button onClick={generateVariant} disabled={generatingVariant} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md border border-border transition-colors">
                  {generatingVariant ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube2 className="w-3.5 h-3.5" />}
                  A/B Variant
                </button>
                <div className="relative">
                  <button onClick={() => setShowContentDropdown((v) => !v)} disabled={generatingContent} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md border border-border transition-colors">
                    {generatingContent ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                    {generatingContent ? "Generating..." : "Long-Form"}
                    {!generatingContent && <ChevronDown className="w-3 h-3" />}
                  </button>
                  {showContentDropdown && (
                    <div className="absolute right-0 top-full mt-1 w-44 rounded-xl border border-card-border bg-card shadow-lg z-20 py-1 overflow-hidden">
                      {([
                        { key: "blog",       label: "Blog Post",       icon: FileText  },
                        { key: "email",      label: "Email Campaign",  icon: Mail      },
                        { key: "newsletter", label: "Newsletter",      icon: Newspaper },
                      ] as const).map(({ key, label, icon: Icon }) => (
                        <button key={key} onClick={() => generateLongForm(key)} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-foreground hover:bg-muted/50 transition-colors text-left">
                          <Icon className="w-3.5 h-3.5 text-muted-foreground" /> {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => setShowPreview(true)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md border border-border transition-colors">
                  <Eye className="w-3.5 h-3.5" /> Preview
                </button>
                <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md border border-border transition-colors">
                  <Edit3 className="w-3.5 h-3.5" /> Edit
                </button>
              </>
            )}
          </div>
        </div>

        {/* Panel tabs */}
        {(variant || longFormContent) && !editing && (
          <div className="flex border-b border-card-border">
            {[
              { id: "post" as const, label: "Post A", icon: Megaphone },
              ...(variant ? [{ id: "variant" as const, label: "Post B (Variant)", icon: TestTube2 }] : []),
              ...(longFormContent ? [{ id: "content" as const, label: longFormContent.type === "blog" ? "Blog Post" : longFormContent.type === "email" ? "Email" : "Newsletter", icon: FileText }] : []),
            ].map((tab) => (
              <button key={tab.id} onClick={() => setActivePanel(tab.id)} className={cn("flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors flex-1 justify-center", activePanel === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
                <tab.icon className="w-3 h-3" /> {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Content panels */}
        <div className="p-5 space-y-4 flex-1">
          {(activePanel === "post" || (activePanel === "variant" && generatingVariant)) && (
            <>
              <PostTextField label="Hook" value={editing ? draft.hook : post.hook} editing={editing} onChange={(v) => setDraft((d) => ({ ...d, hook: v }))} onCopy={() => copyText(post.hook, "hook")} copied={copied === "hook"} />
              <PostTextArea label="Caption" value={editing ? draft.caption : post.caption} editing={editing} rows={5} onChange={(v) => setDraft((d) => ({ ...d, caption: v }))} onCopy={() => copyText(post.caption, "caption")} copied={copied === "caption"} />
              <PostTextField label="Call to Action" value={editing ? draft.cta : post.cta} editing={editing} onChange={(v) => setDraft((d) => ({ ...d, cta: v }))} onCopy={() => copyText(post.cta, "cta")} copied={copied === "cta"} isHighlight />
              <HashtagsField value={editing ? draft.hashtags : post.hashtags.join(" ")} editing={editing} tags={post.hashtags} onChange={(v) => setDraft((d) => ({ ...d, hashtags: v }))} onCopy={() => copyText(post.hashtags.join(" "), "tags")} copied={copied === "tags"} />
              <ImagePromptField value={editing ? draft.imagePrompt : post.imagePrompt} editing={editing} onChange={(v) => setDraft((d) => ({ ...d, imagePrompt: v }))} />
            </>
          )}

          {activePanel === "variant" && !generatingVariant && variant && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <TestTube2 className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-300">This is your <strong>B variant</strong> — a different creative angle for A/B testing.</p>
              </div>
              <PostTextField label="Variant Hook" value={variant.hook} editing={false} onCopy={() => copyText(variant.hook, "vhook")} copied={copied === "vhook"} />
              <PostTextArea label="Variant Caption" value={variant.caption} editing={false} rows={5} onCopy={() => copyText(variant.caption, "vcaption")} copied={copied === "vcaption"} />
              <PostTextField label="Variant CTA" value={variant.cta} editing={false} onCopy={() => copyText(variant.cta, "vcta")} copied={copied === "vcta"} isHighlight />
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1"><Hash className="w-3 h-3" /> Variant Hashtags</label>
                <div className="flex flex-wrap gap-1.5">
                  {variant.hashtags.map((tag, i) => <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-medium">{tag}</span>)}
                </div>
              </div>
              <button onClick={async () => { await onSave(post.id, { hook: variant.hook, caption: variant.caption, cta: variant.cta, hashtags: variant.hashtags, imagePrompt: variant.imagePrompt }); setVariant(null); setActivePanel("post"); }} className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-colors">
                Apply Variant B → Replace Post A
              </button>
            </div>
          )}

          {activePanel === "content" && longFormContent && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800">
                <FileText className="w-4 h-4 text-violet-600 dark:text-violet-400 flex-shrink-0" />
                <p className="text-xs text-violet-700 dark:text-violet-300">
                  {longFormContent.type === "blog" ? "Blog post" : longFormContent.type === "email" ? "Email campaign" : "Newsletter"} generated from this post concept.
                </p>
              </div>
              {longFormContent.subjectLine && <div className="p-3 rounded-lg bg-muted/40"><p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Subject Line</p><p className="text-sm font-medium text-foreground">{longFormContent.subjectLine}</p></div>}
              {longFormContent.metaDescription && <div className="p-3 rounded-lg bg-muted/40"><p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Meta Description</p><p className="text-sm text-foreground">{longFormContent.metaDescription}</p></div>}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{longFormContent.title}</p>
                  <button onClick={() => copyText(longFormContent.content, "content")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    {copied === "content" ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied === "content" ? "Copied!" : "Copy All"}
                  </button>
                </div>
                <div className="rounded-lg bg-muted/30 p-4 max-h-72 overflow-y-auto">
                  <pre className="text-xs text-foreground whitespace-pre-wrap leading-relaxed font-sans">{longFormContent.content}</pre>
                </div>
              </div>
            </div>
          )}

          {activePanel === "variant" && generatingVariant && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="w-7 h-7 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Generating A/B variant...</p>
            </div>
          )}
          {activePanel === "content" && generatingContent && !longFormContent && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="w-7 h-7 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Generating long-form content...</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
