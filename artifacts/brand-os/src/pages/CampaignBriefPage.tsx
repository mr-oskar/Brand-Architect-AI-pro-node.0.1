import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useGetBrand, getGetBrandQueryKey } from "@workspace/api-client-react";
import {
  ArrowLeft, Sparkles, Upload, X, Plus, Instagram, Linkedin, Twitter,
  Facebook, Loader2, Check, Brain, FileText, Save, TrendingUp,
  Palette, Target, Building2, CheckSquare, Square, Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getAuthToken } from "@/contexts/AuthContext";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

// ─── Static config ────────────────────────────────────────────────────────────

const PLATFORMS = [
  { id: "instagram", label: "Instagram",  icon: Instagram, hint: "Highest engagement" },
  { id: "linkedin",  label: "LinkedIn",   icon: Linkedin,  hint: "B2B & professional" },
  { id: "twitter",   label: "X / Twitter",icon: Twitter,   hint: "Real-time reach" },
  { id: "facebook",  label: "Facebook",   icon: Facebook,  hint: "Broadest audience" },
];

const POST_COUNTS = [
  { value: 3,  label: "3",  sub: "Quick" },
  { value: 5,  label: "5",  sub: "Light" },
  { value: 7,  label: "7",  sub: "Week" },
  { value: 10, label: "10", sub: "Extended" },
  { value: 14, label: "14", sub: "Full" },
];

const AI_STEPS = [
  { icon: Brain,      label: "Parse brief & extract intent" },
  { icon: TrendingUp, label: "Research market & live trends" },
  { icon: Palette,    label: "Analyze visual references & style" },
  { icon: Target,     label: "Build campaign strategy" },
  { icon: FileText,   label: "Write posts & image prompts" },
  { icon: Save,       label: "Save campaign to workspace" },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function CampaignBriefPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const brandId = Number(id);

  const { data: brand } = useGetBrand(brandId, {
    query: { enabled: !!brandId, queryKey: getGetBrandQueryKey(brandId) },
  });

  // Form state
  const [brief, setBrief]                     = useState("");
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [postCount, setPostCount]             = useState(7);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["instagram"]);
  const [isDragging, setIsDragging]           = useState(false);

  // Job / processing state
  const [phase, setPhase]             = useState<"input" | "processing">("input");
  const [jobId, setJobId]             = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError]             = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null);

  const togglePlatform = (pid: string) =>
    setSelectedPlatforms((prev) =>
      prev.includes(pid)
        ? prev.length > 1 ? prev.filter((p) => p !== pid) : prev
        : [...prev, pid]
    );

  const addImages = useCallback((files: FileList | null) => {
    if (!files) return;
    Array.from(files).slice(0, 5 - referenceImages.length).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setReferenceImages((prev) => prev.length < 5 ? [...prev, result] : prev);
      };
      reader.readAsDataURL(file);
    });
  }, [referenceImages.length]);

  async function handleSubmit() {
    setError(null);
    setPhase("processing");
    setCurrentStep(0);

    const token = getAuthToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      const resp = await fetch(`${BASE}/api/brands/${brandId}/campaign-brief-job`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          brief: brief.trim() || undefined,
          referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
          postCount,
          platforms: selectedPlatforms,
        }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(
          (data as { detail?: string }).detail ??
          (data as { error?: string }).error ??
          "Failed to start campaign generation"
        );
      }

      const { jobId: jid } = await resp.json() as { jobId: string };
      setJobId(jid);
    } catch (err) {
      setPhase("input");
      setError(err instanceof Error ? err.message : "Failed to start campaign generation");
    }
  }

  useEffect(() => {
    if (!jobId) return;
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    let consecutiveErrors = 0;
    pollRef.current = setInterval(async () => {
      try {
        const resp = await fetch(`${BASE}/api/jobs/${jobId}`, { headers, credentials: "include" });
        if (!resp.ok) {
          // 404 most likely means the server restarted and lost the in-memory job.
          // Stop polling after 5 consecutive failures to avoid an infinite loop.
          consecutiveErrors++;
          if (consecutiveErrors >= 5) {
            clearInterval(pollRef.current!);
            setPhase("input");
            setError("Lost connection to the background job (server may have restarted). Please try again.");
          }
          return;
        }
        consecutiveErrors = 0;
        const job = await resp.json() as {
          status: string;
          progress: number;
          result?: { campaignId?: number; id?: number } | null;
          error?: string;
        };

        if (job.status === "running" || job.status === "pending") {
          setCurrentStep(Math.min(job.progress, AI_STEPS.length - 1));
        }
        if (job.status === "done" && job.result) {
          clearInterval(pollRef.current!);
          setCurrentStep(AI_STEPS.length);
          const campaignId = job.result.campaignId ?? job.result.id;
          setTimeout(() => { if (campaignId) navigate(`/campaigns/${campaignId}`); }, 900);
        }
        if (job.status === "failed") {
          clearInterval(pollRef.current!);
          setPhase("input");
          setError(job.error ?? "Campaign generation failed");
        }
      } catch { /* ignore transient network errors */ }
    }, 1500);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobId, navigate]);

  if (phase === "processing") {
    return <ProcessingView currentStep={currentStep} brand={brand} postCount={postCount} />;
  }

  return (
    <div className="px-6 py-8 max-w-3xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(`/brands/${brandId}`)}
          className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 min-w-0">
          {brand?.logoUrl ? (
            <img src={brand.logoUrl} alt={brand.companyName} className="w-10 h-10 rounded-xl object-cover border border-card-border flex-shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground">Campaign Brief</h1>
            {brand?.companyName && (
              <p className="text-sm text-muted-foreground truncate">for {brand.companyName}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── AI Task Manager card ── */}
      <div className="rounded-xl border border-card-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">AI Task Manager</h2>
          <span className="ml-auto text-xs text-muted-foreground">What happens when you submit</span>
        </div>
        <div className="space-y-2">
          {AI_STEPS.map(({ icon: Icon, label }, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                <Icon className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <span className="text-sm text-muted-foreground">{label}</span>
              <span className="ml-auto text-xs text-muted-foreground/50 font-mono tabular-nums">0{i + 1}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Campaign Instructions ── */}
      <div className="rounded-xl border border-card-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Campaign Instructions</h2>
        </div>
        <textarea
          className="w-full px-4 py-3 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          rows={5}
          placeholder={`Examples:\n• Product launch — create urgency and excitement for an upcoming release\n• B2B audience — keep it professional, data-driven, and concise\n• Ramadan campaign — warm, family-oriented tone with strong CTA`}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          The more specific your brief, the more targeted and effective your campaign will be.
        </p>
      </div>

      {/* ── Reference Images ── */}
      <div className="rounded-xl border border-card-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Visual References</h2>
          <span className="ml-auto text-xs text-muted-foreground">Optional — up to 5 images</span>
        </div>

        <div
          className={cn(
            "rounded-lg border-2 border-dashed p-4 transition-colors",
            isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
          )}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); addImages(e.dataTransfer.files); }}
        >
          <div className="flex items-center gap-3 flex-wrap">
            {referenceImages.map((img, i) => (
              <div key={i} className="relative group">
                <img src={img} alt={`ref ${i + 1}`} className="w-16 h-16 rounded-lg object-cover border border-card-border" />
                <button
                  onClick={() => setReferenceImages((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}

            {referenceImages.length < 5 && (
              <label className="w-16 h-16 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors gap-1">
                <Plus className="w-4 h-4 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">Add</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => addImages(e.target.files)}
                />
              </label>
            )}

            {referenceImages.length === 0 && (
              <div className="flex-1 flex items-center gap-3 py-2">
                <Upload className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="text-sm text-muted-foreground">Drag images here or click the <strong>+</strong> button</p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">AI will extract your visual style and apply it to all generated designs</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Target Platforms ── */}
      <div className="rounded-xl border border-card-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Target Platforms</h2>
          <span className="ml-auto text-xs text-muted-foreground">Select one or more</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {PLATFORMS.map(({ id: pid, label, icon: Icon, hint }) => {
            const selected = selectedPlatforms.includes(pid);
            return (
              <button
                key={pid}
                onClick={() => togglePlatform(pid)}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all text-left",
                  selected
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-muted/30"
                )}
              >
                {selected
                  ? <CheckSquare className="w-4 h-4 flex-shrink-0" />
                  : <Square className="w-4 h-4 flex-shrink-0" />}
                <Icon className="w-4 h-4 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="leading-tight">{label}</p>
                  <p className="text-[10px] opacity-60 leading-tight font-normal">{hint}</p>
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">At least one platform required</p>
      </div>

      {/* ── Number of Posts ── */}
      <div className="rounded-xl border border-card-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Number of Posts</h2>
          <span className="ml-auto text-sm font-bold text-primary">{postCount}</span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {POST_COUNTS.map(({ value, label, sub }) => (
            <button
              key={value}
              onClick={() => setPostCount(value)}
              className={cn(
                "flex flex-col items-center gap-0.5 py-3 rounded-lg border text-center transition-all",
                postCount === value
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-muted/20"
              )}
            >
              <span className={cn("text-xl font-bold leading-none", postCount === value ? "text-primary" : "text-foreground")}>
                {label}
              </span>
              <span className="text-[10px] opacity-60 leading-tight">{sub}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Each post includes hook, caption, CTA, hashtags, and an AI image prompt.</p>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Actions ── */}
      <div className="flex items-center gap-3 pb-8">
        <button
          onClick={() => navigate(`/brands/${brandId}`)}
          className="px-5 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 shadow-sm"
        >
          <Sparkles className="w-4 h-4" />
          Generate {postCount} Posts with AI
        </button>
      </div>
    </div>
  );
}

// ─── Processing view ───────────────────────────────────────────────────────────

function ProcessingView({
  currentStep,
  brand,
  postCount,
}: {
  currentStep: number;
  brand: { companyName?: string } | null | undefined;
  postCount: number;
}) {
  const done     = currentStep >= AI_STEPS.length;
  const progress = done ? 100 : Math.round((currentStep / AI_STEPS.length) * 100);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-md space-y-8">

        {/* Icon + heading */}
        <div className="text-center space-y-3">
          <div className="relative w-16 h-16 mx-auto">
            <div className={cn(
              "w-16 h-16 rounded-2xl flex items-center justify-center",
              done ? "bg-green-500/10" : "bg-primary/10"
            )}>
              {done
                ? <Check className="w-8 h-8 text-green-500" />
                : <Loader2 className="w-8 h-8 text-primary animate-spin" />}
            </div>
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">
              {done ? "Campaign ready!" : "AI is working on your campaign"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {done
                ? `${postCount} posts created for ${brand?.companyName ?? "your brand"}`
                : `Generating ${postCount} posts for ${brand?.companyName ?? "your brand"}. This takes 20–40 seconds.`}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-700", done ? "bg-green-500" : "bg-primary")}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{AI_STEPS[Math.min(currentStep, AI_STEPS.length - 1)]?.label ?? "Done"}</span>
            <span className={cn("font-semibold", done ? "text-green-500" : "text-primary")}>{progress}%</span>
          </div>
        </div>

        {/* Step list */}
        <div className="rounded-xl border border-card-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">AI Task Manager</h3>
          </div>
          {AI_STEPS.map(({ icon: Icon, label }, idx) => {
            const isActive  = idx === currentStep && !done;
            const isDone    = idx < currentStep || done;
            const isPending = idx > currentStep && !done;

            return (
              <div key={idx} className="flex items-center gap-3">
                <div className={cn(
                  "w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 transition-colors",
                  isDone    && "bg-green-500/10",
                  isActive  && "bg-primary/10",
                  isPending && "bg-muted"
                )}>
                  {isDone
                    ? <Check className="w-3.5 h-3.5 text-green-500" />
                    : isActive
                    ? <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                    : <Icon className="w-3.5 h-3.5 text-muted-foreground/50" />}
                </div>
                <span className={cn(
                  "text-sm transition-colors",
                  isDone    && "text-foreground",
                  isActive  && "text-foreground font-medium",
                  isPending && "text-muted-foreground"
                )}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {!done && (
          <p className="text-center text-xs text-muted-foreground">Please wait — do not close this tab</p>
        )}
      </div>
    </div>
  );
}
