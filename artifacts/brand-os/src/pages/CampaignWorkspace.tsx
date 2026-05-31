/**
 * CampaignWorkspace — campaign detail page.
 *
 * This file is intentionally thin: it fetches data and wires up handlers.
 * All visual components live in src/components/:
 *   - PostCard       → post editing, variant, long-form, image gen
 *   - ImageGenDialog → AI image studio modal
 *   - PostPreviewDialog → social post preview
 *
 * To add a new feature to the workspace:
 *   1. Add the handler here if it needs campaign-level state
 *   2. Pass it as a prop to PostCard or a new component
 *   3. Never put 200+ lines of JSX in this file — extract to a component
 */

import { useParams, Link } from "wouter";
import { useState, useEffect } from "react";
import {
  useGetCampaign, useUpdatePost, useRegeneratePost,
  getGetCampaignQueryKey, getGetPostQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Calendar, Loader2, Megaphone, Target,
  Settings2, Download, Images,
} from "lucide-react";
import type { SocialPost } from "@workspace/api-client-react";
import { extractApiError, notifyError } from "@/lib/apiError";
import { apiFetch, apiPost } from "@/lib/apiFetch";
import { PostCard } from "@/components/PostCard";
import type { ImageGenOptions } from "@/types";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CampaignWorkspace() {
  const params = useParams<{ id: string }>();
  const campaignId = parseInt(params.id, 10);
  const queryClient = useQueryClient();

  const { data: campaign, isLoading } = useGetCampaign(campaignId, {
    query: { enabled: !!campaignId, queryKey: getGetCampaignQueryKey(campaignId) },
  });

  const updatePost = useUpdatePost();
  const regeneratePost = useRegeneratePost();

  const [publishingPostId, setPublishingPostId] = useState<number | null>(null);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ generated: number; total: number } | null>(null);
  const [imageGenAvailable, setImageGenAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    apiFetch("/api/public-settings")
      .then((r) => r.json())
      .then((d) => setImageGenAvailable((d as { imageGenerationAvailable?: boolean }).imageGenerationAvailable ?? true))
      .catch(() => setImageGenAvailable(null));
  }, []);

  async function handlePublishNow(postId: number) {
    setPublishingPostId(postId);
    try {
      const res = await apiFetch(`/api/posts/${postId}/publish`, { method: "POST" });
      if (!res.ok) throw new Error(await extractApiError(res, "Publish failed"));
      queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
    } catch (err) {
      notifyError("Publish failed", err);
    } finally {
      setPublishingPostId(null);
    }
  }

  async function handleSavePost(id: number, data: Partial<SocialPost>) {
    await updatePost.mutateAsync({ id, data: { caption: data.caption, hook: data.hook, cta: data.cta, hashtags: data.hashtags, imagePrompt: data.imagePrompt } });
    queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
    queryClient.invalidateQueries({ queryKey: getGetPostQueryKey(id) });
  }

  async function handleRegeneratePost(id: number) {
    await regeneratePost.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
    queryClient.invalidateQueries({ queryKey: getGetPostQueryKey(id) });
  }

  async function handleGenerateImage(id: number, opts: ImageGenOptions): Promise<SocialPost | undefined> {
    const body: Record<string, unknown> = {
      customPrompt: opts.customPrompt,
      size: opts.size,
      model: opts.model,
      brandName: brandInfo?.companyName ?? undefined,
    };
    if (opts.overlayText) body.overlayText = opts.overlayText;
    if (opts.logoDataUrl) body.logoDataUrl = opts.logoDataUrl;
    if (opts.imageModelId) body.imageModelId = opts.imageModelId;
    if (opts.customWidth && opts.customHeight) { body.customWidth = opts.customWidth; body.customHeight = opts.customHeight; }
    if (opts.referenceImages?.length) body.referenceImages = opts.referenceImages;

    const res = await apiPost(`/api/posts/${id}/generate-image`, body);
    if (!res.ok) throw new Error(await extractApiError(res, "Image generation failed"));
    const result = await res.json() as SocialPost;
    queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
    queryClient.invalidateQueries({ queryKey: getGetPostQueryKey(id) });
    return result;
  }

  async function handleRestoreImage(id: number, url: string): Promise<void> {
    const res = await apiPost(`/api/posts/${id}/restore-image`, { url });
    if (!res.ok) throw new Error("Restore failed");
    queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
    queryClient.invalidateQueries({ queryKey: getGetPostQueryKey(id) });
  }

  function exportCampaignCSV() {
    if (!campaign?.posts) return;
    const posts = campaign.posts as (SocialPost & { day: number })[];
    const headers = ["Day", "Platform", "Hook", "Caption", "CTA", "Hashtags", "Image Prompt", "Has Image"];
    const rows = posts.sort((a, b) => a.day - b.day).map((p) => [
      p.day,
      p.platform ?? "instagram",
      `"${(p.hook ?? "").replace(/"/g, '""')}"`,
      `"${(p.caption ?? "").replace(/"/g, '""')}"`,
      `"${(p.cta ?? "").replace(/"/g, '""')}"`,
      `"${(p.hashtags ?? []).join(" ").replace(/"/g, '""')}"`,
      `"${(p.imagePrompt ?? "").replace(/"/g, '""')}"`,
      p.imageUrl ? "Yes" : "No",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${campaign.title?.replace(/\s+/g, "-") ?? "campaign"}-posts.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleBulkGenerateImages() {
    if (!campaign?.posts) return;
    if (imageGenAvailable === false) {
      notifyError("Image generation not available", "Add an OPENAI_API_KEY in Replit Secrets to enable AI image generation.");
      return;
    }
    setBulkGenerating(true);
    const total = (campaign.posts as SocialPost[]).filter((p) => !p.imageUrl).length;
    setBulkProgress({ generated: 0, total });
    try {
      const res = await apiPost(`/api/posts/campaigns/${campaignId}/generate-all-images`, { skipExisting: true });
      if (!res.ok) throw new Error(await extractApiError(res, "Image generation failed"));
      const data = await res.json() as { jobId: string | null };
      if (!data.jobId) { setBulkGenerating(false); setBulkProgress(null); return; }

      let consecutiveMisses = 0;
      const poll = setInterval(async () => {
        try {
          const jr = await apiFetch(`/api/jobs/${data.jobId}`);
          if (!jr.ok) {
            if (++consecutiveMisses >= 5) {
              clearInterval(poll);
              setBulkGenerating(false);
              setBulkProgress(null);
              notifyError("Image generation interrupted", "The server restarted mid-generation. Please try again.");
            }
            return;
          }
          consecutiveMisses = 0;
          const job = await jr.json() as { status: string; progress: number; total: number; error?: string };
          setBulkProgress({ generated: job.progress, total: job.total || total });
          if (job.status === "done") {
            clearInterval(poll);
            setBulkGenerating(false);
            queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
            setTimeout(() => setBulkProgress(null), 4000);
          }
          if (job.status === "failed") {
            clearInterval(poll);
            setBulkGenerating(false);
            setBulkProgress(null);
            notifyError("Image generation failed", job.error ?? "Unknown error");
          }
        } catch { /* ignore transient network errors */ }
      }, 2000);
    } catch (err) {
      setBulkGenerating(false);
      setBulkProgress(null);
      notifyError("Image generation failed", err);
    }
  }

  // ── Loading / error states ─────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-muted-foreground">Campaign not found</p>
        <Link href="/" className="text-primary text-sm hover:underline">Back to dashboard</Link>
      </div>
    );
  }

  const brandInfo = (campaign as unknown as { brand?: { logoUrl?: string; companyName?: string; primaryColor?: string } })?.brand;
  const brandLogoUrl = brandInfo?.logoUrl ?? undefined;
  const brandName = brandInfo?.companyName ?? "Brand";
  const brandPrimaryColor = brandInfo?.primaryColor ?? "#6366F1";

  type CampaignDay = { day: number; marketingAngle: string; postConcept: string; objective: string; cta: string };
  type CampaignPost = SocialPost & { day: number };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="px-4 sm:px-6 py-6 sm:py-8 max-w-6xl mx-auto space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <Link href={`/brands/${campaign.brandId}/campaigns`} className="text-muted-foreground hover:text-foreground transition-colors mt-1 flex-shrink-0" title="Back to campaigns">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-foreground leading-tight break-words">{campaign.title}</h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/50 border border-border text-[10px] font-medium text-muted-foreground">
                <Calendar className="w-3 h-3" />{campaign.days?.length ?? 0}d
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/50 border border-border text-[10px] font-medium text-muted-foreground">
                <Megaphone className="w-3 h-3" />{campaign.posts?.length ?? 0} posts
              </span>
            </div>
            {campaign.strategy && <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed max-w-2xl">{campaign.strategy}</p>}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap pl-8">
          <button onClick={handleBulkGenerateImages} disabled={bulkGenerating} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-primary/40 bg-primary/5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-60">
            {bulkGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Images className="w-3.5 h-3.5" />}
            {bulkGenerating
              ? bulkProgress ? `${bulkProgress.generated}/${bulkProgress.total} images…` : "Generating…"
              : "Generate All Images"}
          </button>
          {bulkProgress && !bulkGenerating && (
            <span className="inline-flex items-center text-[11px] text-green-600 font-medium">{bulkProgress.generated} generated ✓</span>
          )}
          <div className="ml-auto">
            <button onClick={exportCampaignCSV} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors" title="Export CSV">
              <Download className="w-3.5 h-3.5" /><span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </div>
      </div>

      {/* Campaign timeline */}
      <div>
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
          <Target className="w-4 h-4 text-muted-foreground" /> Campaign Strategy Plan
        </h2>
        <div className="relative">
          <div className="absolute left-0 right-0 top-5 h-0.5 bg-border hidden sm:block" />
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {(campaign.days as CampaignDay[] | undefined)?.map((day) => (
              <div key={day.day} className="relative flex flex-col items-center gap-2 text-center">
                <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold relative z-10 shadow-sm">{day.day}</div>
                <div className="w-full rounded-xl border border-card-border bg-card p-3 space-y-1.5">
                  <p className="text-[10px] font-bold text-primary uppercase tracking-wider">{day.marketingAngle}</p>
                  <p className="text-[11px] text-foreground leading-snug font-medium">{day.postConcept}</p>
                  <p className="text-[10px] text-muted-foreground">{day.objective}</p>
                  <div className="pt-1 border-t border-border"><p className="text-[10px] text-primary font-semibold">{day.cta}</p></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Posts grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-muted-foreground" /> Social Posts ({campaign.posts?.length ?? 0})
          </h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/40 border border-border">
              <Settings2 className="w-3 h-3" /> Model & size control
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {(campaign.posts as CampaignPost[] | undefined)
            ?.sort((a, b) => a.day - b.day)
            .map((post) => (
              <PostCard
                key={post.id}
                post={post}
                brandLogoUrl={brandLogoUrl}
                brandName={brandName}
                brandPrimaryColor={brandPrimaryColor}
                onSave={handleSavePost}
                onRegenerate={handleRegeneratePost}
                onGenerateImage={handleGenerateImage}
                onRestoreImage={handleRestoreImage}
                onPublishNow={handlePublishNow}
                publishingNow={publishingPostId === post.id}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
