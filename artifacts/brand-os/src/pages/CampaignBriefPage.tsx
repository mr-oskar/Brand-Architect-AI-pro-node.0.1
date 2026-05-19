import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useGetBrand, getGetBrandQueryKey } from "@workspace/api-client-react";
import {
  ArrowRight, Sparkles, Upload, X, Plus, Instagram, Linkedin, Twitter,
  Facebook, Loader2, Check, Brain, FileText, Save, TrendingUp,
  Palette, Target, Wand2, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getAuthToken } from "@/contexts/AuthContext";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

// ─── Config ───────────────────────────────────────────────────────────────────

const PLATFORMS = [
  {
    id: "instagram",
    label: "Instagram",
    icon: Instagram,
    badge: "الأعلى تفاعلاً",
    colors: { base: "border-pink-500/30 bg-pink-500/5 text-pink-400", selected: "border-pink-500 bg-gradient-to-br from-pink-500/20 to-purple-600/20 text-pink-300" },
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    icon: Linkedin,
    badge: "B2B احترافي",
    colors: { base: "border-blue-600/30 bg-blue-600/5 text-blue-400", selected: "border-blue-500 bg-gradient-to-br from-blue-500/20 to-blue-800/20 text-blue-300" },
  },
  {
    id: "twitter",
    label: "X / Twitter",
    icon: Twitter,
    badge: "",
    colors: { base: "border-border bg-muted/20 text-muted-foreground", selected: "border-foreground/40 bg-foreground/5 text-foreground" },
  },
  {
    id: "facebook",
    label: "Facebook",
    icon: Facebook,
    badge: "الأوسع انتشاراً",
    colors: { base: "border-blue-500/30 bg-blue-500/5 text-blue-300", selected: "border-blue-400 bg-gradient-to-br from-blue-400/20 to-blue-700/20 text-blue-200" },
  },
];

const POST_COUNTS = [
  { value: 3,  label: "3",  sub: "سريع" },
  { value: 5,  label: "5",  sub: "خفيف" },
  { value: 7,  label: "7",  sub: "أسبوع" },
  { value: 10, label: "10", sub: "موسع" },
  { value: 14, label: "14", sub: "شامل" },
];

const AI_STEPS = [
  { icon: Brain,     label: "تحليل الموجز واستخراج الأهداف" },
  { icon: TrendingUp,label: "دراسة السوق وأحدث الترندات" },
  { icon: Palette,   label: "تحليل المراجع البصرية والأسلوب" },
  { icon: Target,    label: "بناء استراتيجية الحملة الذكية" },
  { icon: FileText,  label: "صياغة المنشورات والبرومتات" },
  { icon: Save,      label: "حفظ الحملة في مساحة العمل" },
];

// Log lines shown per step in the processing terminal
function getStepLogs(
  stepIdx: number,
  brief: string,
  refCount: number,
  postCount: number,
  platforms: string[],
): { icon: "cmd" | "ok" | "info"; text: string }[] {
  const platformAr: Record<string, string> = {
    instagram: "Instagram",
    linkedin: "LinkedIn",
    twitter: "X / Twitter",
    facebook: "Facebook",
  };
  const platformList = platforms.map((p) => platformAr[p] ?? p).join("، ");
  const briefSnip = brief.trim()
    ? brief.trim().substring(0, 60) + (brief.length > 60 ? "..." : "")
    : "لا يوجد موجز — سيُنشأ تلقائياً";

  const logs: { icon: "cmd" | "ok" | "info"; text: string }[][] = [
    // Step 0
    [
      { icon: "cmd",  text: "قراءة الموجز وتحديد الأهداف..." },
      { icon: "ok",   text: briefSnip },
      { icon: "ok",   text: `${postCount} منشورات على: ${platformList}` },
      { icon: "info", text: "تم تحديد الجمهور المستهدف ونبرة الصوت" },
    ],
    // Step 1
    [
      { icon: "cmd",  text: "دراسة السوق وأحدث الترندات..." },
      { icon: "ok",   text: "تم تحليل المنافسين والسوق" },
      { icon: "info", text: "تم اختيار أفضل الزوايا التسويقية" },
    ],
    // Step 2
    refCount > 0
      ? [
          { icon: "cmd",  text: `تحليل ${refCount} صور مرجعية...` },
          { icon: "ok",   text: "تم استخراج الأسلوب البصري والألوان" },
          { icon: "info", text: "سيُطبَّق الاتجاه البصري على جميع التصاميم" },
        ]
      : [
          { icon: "cmd",  text: "تحليل هوية العلامة التجارية..." },
          { icon: "ok",   text: "تم استخراج الأسلوب من Brand Kit" },
          { icon: "info", text: "تم تحديد اتجاه بصري متسق" },
        ],
    // Step 3
    [
      { icon: "cmd",  text: "بناء استراتيجية الحملة..." },
      { icon: "ok",   text: "تم صياغة الرسائل الرئيسية" },
      { icon: "info", text: "تم توزيع الزوايا الإبداعية على الأيام" },
    ],
    // Step 4
    [
      { icon: "cmd",  text: `كتابة ${postCount} منشورات متكاملة...` },
      { icon: "ok",   text: "نصوص، هوك، CTA، هاشتاقات" },
      { icon: "info", text: "برومتات التصاميم البصرية جاهزة" },
    ],
    // Step 5
    [
      { icon: "cmd",  text: "حفظ الحملة في مساحة العمل..." },
      { icon: "ok",   text: "الحملة جاهزة! 🎉" },
    ],
  ];

  // Return all logs up to and including the current step
  return logs.slice(0, stepIdx + 1).flat();
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CampaignBriefPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const brandId = Number(id);

  const { data: brand } = useGetBrand(brandId, {
    query: { enabled: !!brandId, queryKey: getGetBrandQueryKey(brandId) },
  });

  const [brief, setBrief]                   = useState("");
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [postCount, setPostCount]           = useState(7);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["instagram"]);
  const [isDragging, setIsDragging]         = useState(false);
  const [showTips, setShowTips]             = useState(false);

  const [phase, setPhase]           = useState<"input" | "processing">("input");
  const [jobId, setJobId]           = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError]           = useState<string | null>(null);
  const [visibleLogs, setVisibleLogs] = useState<{ icon: "cmd" | "ok" | "info"; text: string }[]>([]);

  const fileInputRef  = useRef<HTMLInputElement>(null);
  const pollRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const logRef        = useRef<HTMLDivElement>(null);
  const briefRef      = useRef(brief);
  const refCountRef   = useRef(referenceImages.length);
  const postCountRef  = useRef(postCount);
  const platformsRef  = useRef(selectedPlatforms);

  briefRef.current      = brief;
  refCountRef.current   = referenceImages.length;
  postCountRef.current  = postCount;
  platformsRef.current  = selectedPlatforms;

  const togglePlatform = (pid: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(pid)
        ? prev.length > 1 ? prev.filter((p) => p !== pid) : prev
        : [...prev, pid]
    );
  };

  const addImages = useCallback((files: FileList | null) => {
    if (!files) return;
    const remaining = 5 - referenceImages.length;
    Array.from(files).slice(0, remaining).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setReferenceImages((prev) => (prev.length < 5 ? [...prev, result] : prev));
      };
      reader.readAsDataURL(file);
    });
  }, [referenceImages.length]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addImages(e.dataTransfer.files);
  }, [addImages]);

  // Scroll log to bottom whenever new entries arrive
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [visibleLogs]);

  // Animate log entries as steps progress
  useEffect(() => {
    if (phase !== "processing") return;
    const allLogs = getStepLogs(
      currentStep,
      briefRef.current,
      refCountRef.current,
      postCountRef.current,
      platformsRef.current,
    );
    let i = 0;
    const timer = setInterval(() => {
      if (i >= allLogs.length) { clearInterval(timer); return; }
      setVisibleLogs(allLogs.slice(0, i + 1));
      i++;
    }, 300);
    return () => clearInterval(timer);
  }, [phase, currentStep]);

  async function handleSubmit() {
    if (!brief.trim() && referenceImages.length === 0) {
      setError("يرجى إدخال وصف الحملة أو رفع صور مرجعية");
      return;
    }

    setError(null);
    setPhase("processing");
    setCurrentStep(0);
    setVisibleLogs([]);

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
        throw new Error((data as { detail?: string; error?: string }).detail
          ?? (data as { error?: string }).error
          ?? "فشل إنشاء الحملة");
      }

      const { jobId: jid } = await resp.json() as { jobId: string };
      setJobId(jid);
    } catch (err) {
      setPhase("input");
      setError(err instanceof Error ? err.message : "فشل إنشاء الحملة");
    }
  }

  useEffect(() => {
    if (!jobId) return;
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    pollRef.current = setInterval(async () => {
      try {
        const resp = await fetch(`${BASE}/api/jobs/${jobId}`, { headers, credentials: "include" });
        if (!resp.ok) return;
        const job = await resp.json() as {
          status: string;
          progress: number;
          total: number;
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
          setTimeout(() => {
            if (campaignId) navigate(`/campaigns/${campaignId}`);
          }, 1000);
        }

        if (job.status === "failed") {
          clearInterval(pollRef.current!);
          setPhase("input");
          setError(job.error ?? "فشلت عملية التوليد");
        }
      } catch { /* ignore transient errors */ }
    }, 1500);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobId, navigate]);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {phase === "input" ? (
        <InputPhase
          brand={brand}
          brandId={brandId}
          brief={brief}
          setBrief={setBrief}
          referenceImages={referenceImages}
          setReferenceImages={setReferenceImages}
          postCount={postCount}
          setPostCount={setPostCount}
          selectedPlatforms={selectedPlatforms}
          togglePlatform={togglePlatform}
          isDragging={isDragging}
          setIsDragging={setIsDragging}
          fileInputRef={fileInputRef}
          onDrop={handleDrop}
          addImages={addImages}
          error={error}
          onSubmit={handleSubmit}
          showTips={showTips}
          setShowTips={setShowTips}
        />
      ) : (
        <ProcessingPhase
          currentStep={currentStep}
          brand={brand}
          visibleLogs={visibleLogs}
          logRef={logRef}
          postCount={postCount}
        />
      )}
    </div>
  );
}

// ─── Input Phase ──────────────────────────────────────────────────────────────

function InputPhase({
  brand, brandId, brief, setBrief, referenceImages, setReferenceImages,
  postCount, setPostCount, selectedPlatforms, togglePlatform,
  isDragging, setIsDragging, fileInputRef, onDrop, addImages, error, onSubmit,
  showTips, setShowTips,
}: {
  brand: { companyName?: string; logoUrl?: string | null } | null | undefined;
  brandId: number;
  brief: string;
  setBrief: (v: string) => void;
  referenceImages: string[];
  setReferenceImages: React.Dispatch<React.SetStateAction<string[]>>;
  postCount: number;
  setPostCount: (v: number) => void;
  selectedPlatforms: string[];
  togglePlatform: (id: string) => void;
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onDrop: (e: React.DragEvent) => void;
  addImages: (files: FileList | null) => void;
  error: string | null;
  onSubmit: () => void;
  showTips: boolean;
  setShowTips: (v: boolean) => void;
}) {
  const [, navigate] = useLocation();

  const BRIEF_TIPS = [
    "حدد شريحة جمهورك بدقة: العمر، الاهتمامات، المنطقة الجغرافية",
    "اذكر الهدف الرئيسي: توعية، مبيعات، ولاء، إطلاق منتج",
    "حدد نبرة الصوت المطلوبة: رسمي، شبابي، عاطفي، تحفيزي",
    "أضف مناسبة أو موسم إن وجد: رمضان، الجمعة البيضاء، اليوم الوطني",
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-7">

      {/* ─── Header ─── */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(`/brands/${brandId}`)}
          className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          <ArrowRight className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 min-w-0">
          {brand?.logoUrl && (
            <img
              src={brand.logoUrl}
              alt={brand.companyName}
              className="w-9 h-9 rounded-lg object-cover border border-border flex-shrink-0"
            />
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-foreground">إنشاء حملة ذكية</h1>
            {brand?.companyName && (
              <p className="text-sm text-muted-foreground truncate">لـ {brand.companyName}</p>
            )}
          </div>
        </div>
      </div>

      {/* ─── AI Task Manager Preview ─── */}
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-primary/3 p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
            <Brain className="w-4.5 h-4.5 text-primary" style={{ width: 18, height: 18 }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">مدير مهام الذكاء الاصطناعي</p>
            <p className="text-[11px] text-muted-foreground">سيقوم بتحليل متطلباتك واختيار أفضل الاستراتيجيات تلقائياً</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { icon: "🔍", text: "تحليل الموجز واستخراج الأهداف" },
            { icon: "📊", text: "دراسة السوق والترندات الحديثة" },
            { icon: "🎨", text: "تحليل المراجع البصرية إن وُجدت" },
            { icon: "✍️", text: `صياغة ${postCount} منشور احترافي` },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-xl bg-muted/40">
              <span className="text-sm leading-none mt-0.5">{item.icon}</span>
              <span className="text-[11px] text-muted-foreground leading-relaxed">{item.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Campaign Brief ─── */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-foreground">
            صف حملتك
            <span className="me-2 text-xs font-normal text-muted-foreground">(عربي أو إنجليزي)</span>
          </label>
          <button
            onClick={() => setShowTips(!showTips)}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            {showTips ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            نصائح الكتابة
          </button>
        </div>

        {showTips && (
          <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3 space-y-1.5">
            {BRIEF_TIPS.map((tip, i) => (
              <p key={i} className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
                <span className="mt-0.5 flex-shrink-0">•</span>
                {tip}
              </p>
            ))}
          </div>
        )}

        <textarea
          dir="auto"
          className="w-full min-h-[150px] px-4 py-3.5 rounded-xl border border-input bg-muted/20 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none leading-relaxed transition-colors"
          placeholder={`مثال:\nحملة إطلاق منتج لشريحة الشباب 18–30، هدفنا إثارة الفضول وبناء الانتظار قبل الإطلاق بأسبوع. نبرة شبابية وجريئة.\n\nأو:\nحملة رمضانية دافئة تركز على قيم العطاء والمشاركة، موجهة للعائلات، أسلوب إنساني وعاطفي.`}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
        />
        <p className="text-[11px] text-muted-foreground">
          كلما كانت التفاصيل أوضح، كانت نتائج الحملة أكثر احترافية ودقة
        </p>
      </div>

      {/* ─── Reference Images ─── */}
      <div className="space-y-2.5">
        <label className="block text-sm font-semibold text-foreground">
          مراجع بصرية للأسلوب التصميمي
          <span className="me-2 text-xs font-normal text-muted-foreground">اختياري — حتى 5 صور</span>
        </label>

        <div
          className={cn(
            "rounded-xl border-2 border-dashed transition-colors p-3.5",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/40 hover:bg-muted/10"
          )}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
        >
          <div className="flex items-start gap-2.5 flex-wrap">
            {referenceImages.map((img, i) => (
              <div key={i} className="relative group">
                <img
                  src={img}
                  alt={`مرجع ${i + 1}`}
                  className="w-20 h-20 rounded-xl object-cover border border-border"
                />
                <div className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button
                    onClick={() => setReferenceImages((prev) => prev.filter((_, j) => j !== i))}
                    className="w-7 h-7 rounded-lg bg-destructive text-destructive-foreground flex items-center justify-center"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="absolute -bottom-1 -end-1 px-1.5 py-0.5 rounded-md bg-black/70 text-white text-[9px] font-mono font-bold">
                  @{i + 1}
                </div>
              </div>
            ))}

            {referenceImages.length < 5 && (
              <label className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:border-primary/60 hover:bg-primary/5 transition-colors gap-1">
                <Plus className="w-5 h-5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">أضف</span>
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
              <div className="flex-1 flex flex-col items-center justify-center py-5 text-center gap-2 min-w-[200px]">
                <Upload className="w-7 h-7 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  اسحب صوراً هنا أو اضغط <span className="text-primary font-medium">+</span> لإضافتها
                </p>
                <p className="text-[11px] text-muted-foreground/70">
                  الذكاء الاصطناعي سيستخرج الأسلوب البصري ويطبقه على جميع التصاميم
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Platforms ─── */}
      <div className="space-y-2.5">
        <label className="block text-sm font-semibold text-foreground">المنصات المستهدفة</label>
        <div className="grid grid-cols-2 gap-2">
          {PLATFORMS.map(({ id: pid, label, icon: Icon, badge, colors }) => {
            const selected = selectedPlatforms.includes(pid);
            return (
              <button
                key={pid}
                onClick={() => togglePlatform(pid)}
                className={cn(
                  "relative flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all duration-200",
                  selected ? colors.selected : colors.base,
                  "hover:opacity-90"
                )}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <div className="text-start min-w-0">
                  <p className="font-semibold text-sm leading-tight">{label}</p>
                  {badge && <p className="text-[10px] opacity-70 leading-tight mt-0.5">{badge}</p>}
                </div>
                {selected && (
                  <div className="absolute top-2 end-2 w-4 h-4 rounded-full bg-current/20 flex items-center justify-center">
                    <Check className="w-2.5 h-2.5" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Post Count ─── */}
      <div className="space-y-2.5">
        <label className="block text-sm font-semibold text-foreground">عدد منشورات الحملة</label>
        <div className="grid grid-cols-5 gap-2">
          {POST_COUNTS.map(({ value, label, sub }) => (
            <button
              key={value}
              onClick={() => setPostCount(value)}
              className={cn(
                "flex flex-col items-center gap-0.5 py-3.5 px-1 rounded-xl border text-center transition-all duration-200",
                postCount === value
                  ? "border-primary bg-primary/10 text-primary shadow-sm shadow-primary/10"
                  : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground hover:bg-muted/30"
              )}
            >
              <span className={cn("text-2xl font-bold leading-none", postCount === value ? "text-primary" : "text-foreground")}>
                {label}
              </span>
              <span className="text-[10px] opacity-70 leading-tight">{sub}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          كل منشور يتضمن: نص احترافي، هوك جذاب، CTA، هاشتاقات، وبرومت للصورة
        </p>
      </div>

      {/* ─── Error ─── */}
      {error && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ─── Actions ─── */}
      <div className="flex items-center gap-3 pt-1 pb-8">
        <button
          onClick={() => navigate(`/brands/${brandId}`)}
          className="px-5 py-3 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          إلغاء
        </button>
        <button
          onClick={onSubmit}
          className="flex-1 flex items-center justify-center gap-2.5 py-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all duration-200 shadow-lg shadow-primary/25 hover:shadow-primary/40"
        >
          <Brain className="w-4 h-4" />
          إطلاق مدير المهام الذكي
          <Sparkles className="w-4 h-4 opacity-80" />
        </button>
      </div>
    </div>
  );
}

// ─── Processing Phase ─────────────────────────────────────────────────────────

function ProcessingPhase({
  currentStep,
  brand,
  visibleLogs,
  logRef,
  postCount,
}: {
  currentStep: number;
  brand: { companyName?: string } | null | undefined;
  visibleLogs: { icon: "cmd" | "ok" | "info"; text: string }[];
  logRef: React.RefObject<HTMLDivElement | null>;
  postCount: number;
}) {
  const done = currentStep >= AI_STEPS.length;
  const progress = done ? 100 : Math.round((currentStep / AI_STEPS.length) * 100);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg space-y-7">

        {/* ─── Header ─── */}
        <div className="text-center space-y-2">
          <div className="relative w-16 h-16 mx-auto mb-5">
            <div className={cn(
              "w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500",
              done ? "bg-emerald-500/15" : "bg-primary/10"
            )}>
              {done ? (
                <Check className="w-8 h-8 text-emerald-400" />
              ) : (
                <Brain className="w-8 h-8 text-primary animate-pulse" />
              )}
            </div>
            {!done && (
              <div className="absolute -inset-1 rounded-2xl border border-primary/30 animate-ping opacity-20" />
            )}
          </div>

          <h2 className="text-xl font-bold text-foreground">
            {done ? "الحملة جاهزة! 🎉" : "مدير المهام الذكي يعمل..."}
          </h2>
          {brand?.companyName && (
            <p className="text-sm text-muted-foreground">
              {done
                ? `تم إنشاء حملة بـ ${postCount} منشورات لـ ${brand.companyName}`
                : `ينشئ حملة احترافية بـ ${postCount} منشورات لـ ${brand.companyName}`}
            </p>
          )}
        </div>

        {/* ─── Progress bar ─── */}
        <div className="space-y-1.5">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700 ease-out",
                done ? "bg-emerald-500" : "bg-primary"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{AI_STEPS[Math.min(currentStep, AI_STEPS.length - 1)]?.label ?? "اكتمل"}</span>
            <span className={cn("font-semibold", done ? "text-emerald-400" : "text-primary")}>{progress}%</span>
          </div>
        </div>

        {/* ─── Steps list ─── */}
        <div className="space-y-2">
          {AI_STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isActive  = idx === currentStep && !done;
            const isDoneStep = idx < currentStep || done;
            const isPending  = idx > currentStep && !done;

            return (
              <div
                key={idx}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-500",
                  isDoneStep && "border-emerald-500/20 bg-emerald-500/5",
                  isActive   && "border-primary/40 bg-primary/8 shadow-sm",
                  isPending  && "border-border/40 bg-muted/10 opacity-40"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-300",
                  isDoneStep && "bg-emerald-500/15 text-emerald-400",
                  isActive   && "bg-primary/15 text-primary",
                  isPending  && "bg-muted text-muted-foreground"
                )}>
                  {isDoneStep
                    ? <Check className="w-4 h-4" />
                    : isActive
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Icon className="w-4 h-4" />}
                </div>
                <span className={cn(
                  "text-sm font-medium leading-tight",
                  isDoneStep && "text-emerald-400",
                  isActive   && "text-foreground",
                  isPending  && "text-muted-foreground"
                )}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* ─── AI Terminal Log ─── */}
        <div className="rounded-xl border border-border bg-slate-950 dark:bg-black/50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/50 bg-muted/10">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
            </div>
            <span className="text-[11px] text-slate-400 font-mono mx-auto">AI Task Manager — سجل المهام</span>
            <Wand2 className="w-3.5 h-3.5 text-primary/60" />
          </div>
          <div
            ref={logRef}
            className="p-3.5 space-y-1.5 h-[160px] overflow-y-auto font-mono text-xs"
          >
            {visibleLogs.map((entry, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2 leading-relaxed transition-all",
                  entry.icon === "cmd"  && "text-slate-300",
                  entry.icon === "ok"   && "text-emerald-400",
                  entry.icon === "info" && "text-blue-400",
                )}
              >
                <span className="flex-shrink-0 opacity-60">
                  {entry.icon === "cmd" ? "→" : entry.icon === "ok" ? "✓" : "ℹ"}
                </span>
                <span>{entry.text}</span>
              </div>
            ))}
            {!done && visibleLogs.length > 0 && (
              <div className="flex items-center gap-1 text-primary/60 mt-1">
                <span className="animate-pulse">▋</span>
              </div>
            )}
          </div>
        </div>

        {!done && (
          <p className="text-center text-xs text-muted-foreground animate-pulse">
            قد تستغرق العملية دقيقة أو دقيقتين — يرجى الانتظار
          </p>
        )}
      </div>
    </div>
  );
}
