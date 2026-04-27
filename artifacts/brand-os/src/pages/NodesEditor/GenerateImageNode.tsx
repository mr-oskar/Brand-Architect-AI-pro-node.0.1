import { useEffect, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Sparkles,
  Loader2,
  AlertCircle,
  Download,
  Play,
  AtSign,
  Maximize2,
  Image as ImageIcon,
  Send,
  Palette,
  Briefcase,
  Library,
  Megaphone,
  Copy,
  Check,
  RefreshCw,
} from "lucide-react";
import type { GenerateNodeData } from "./types";
import ImageLightbox from "@/components/ImageLightbox";
import { pushExport, type ExportTarget } from "@/lib/nodesExport";
import { notifySuccess, notifyError } from "@/lib/apiError";

const SEND_TARGETS: { key: ExportTarget; label: string; Icon: typeof Palette }[] = [
  { key: "design-studio", label: "استوديو التصميم", Icon: Palette },
  { key: "brand-kit", label: "هوية العلامة", Icon: Briefcase },
  { key: "assets", label: "مكتبة الأصول", Icon: Library },
  { key: "campaign", label: "حملة جديدة", Icon: Megaphone },
];

export default function GenerateImageNode({ id, data }: NodeProps) {
  const raw = (data ?? {}) as Partial<GenerateNodeData>;
  const d: GenerateNodeData = {
    prompt: raw.prompt ?? "",
    status: raw.status ?? "idle",
    resultUrl: raw.resultUrl ?? null,
    error: raw.error ?? null,
    references: raw.references ?? [],
    onPromptChange: raw.onPromptChange ?? (() => {}),
    onRun: raw.onRun ?? (() => {}),
  };
  const isRunning = d.status === "running";
  const isDone = d.status === "done" && !!d.resultUrl;
  const isError = d.status === "error";

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [copied, setCopied] = useState(false);
  const sendMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showSend) return;
    const onDocClick = (e: MouseEvent) => {
      if (!sendMenuRef.current) return;
      if (!sendMenuRef.current.contains(e.target as Node)) setShowSend(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [showSend]);

  const insertMention = (mention: string) => {
    const el = textareaRef.current;
    const current = d.prompt || "";
    if (!el) {
      d.onPromptChange(id, `${current}${current && !current.endsWith(" ") ? " " : ""}${mention} `);
      return;
    }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const before = current.slice(0, start);
    const after = current.slice(end);
    const padBefore = before.length === 0 || before.endsWith(" ") ? "" : " ";
    const padAfter = after.length === 0 || after.startsWith(" ") ? "" : " ";
    const next = `${before}${padBefore}${mention}${padAfter}${after}`;
    d.onPromptChange(id, next);
    requestAnimationFrame(() => {
      const pos = (before + padBefore + mention + padAfter).length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const downloadImage = () => {
    if (!d.resultUrl) return;
    try {
      const a = document.createElement("a");
      a.href = d.resultUrl;
      a.download = `nodes-${id}-${Date.now()}.png`;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      notifySuccess("بدأ التحميل");
    } catch (err) {
      notifyError("تعذر التحميل", err);
    }
  };

  const copyUrl = async () => {
    if (!d.resultUrl) return;
    try {
      await navigator.clipboard.writeText(d.resultUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      notifyError("تعذر النسخ", err);
    }
  };

  const handleSendTo = (target: ExportTarget) => {
    if (!d.resultUrl) return;
    pushExport(target, { imageUrl: d.resultUrl, prompt: d.prompt });
    setShowSend(false);
  };

  return (
    <>
      <div
        className="bg-card border border-border rounded-2xl shadow-xl shadow-black/40 w-[340px] overflow-hidden hover:shadow-violet-500/10 transition-shadow"
        data-testid={`node-generate-${id}`}
      >
        {/* Connection handles */}
        <Handle
          type="target"
          position={Position.Left}
          id="references"
          className="!w-2.5 !h-2.5 !bg-cyan-500 !border-2 !border-card"
          style={{ top: "26%" }}
        />
        <Handle
          type="target"
          position={Position.Left}
          id="prompt"
          className="!w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-card"
          style={{ top: "70%" }}
        />

        {/* Header */}
        <div className="px-3 py-2 border-b border-border bg-gradient-to-r from-violet-500/15 via-fuchsia-500/10 to-primary/10 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-5 h-5 rounded-md bg-violet-500/20 flex items-center justify-center">
              <Sparkles className="w-3 h-3 text-violet-300" />
            </div>
            <span className="text-[11px] font-semibold text-foreground truncate">ChatGPT Image</span>
            <span className="text-[9px] text-muted-foreground/70 flex-shrink-0">5 CU</span>
            {isDone && (
              <span className="ml-1 inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-300 bg-emerald-500/15 border border-emerald-500/25 rounded-full px-1.5 py-0.5">
                <span className="w-1 h-1 rounded-full bg-emerald-400" />
                جاهزة
              </span>
            )}
            {isRunning && (
              <span className="ml-1 inline-flex items-center gap-1 text-[9px] font-semibold text-violet-200 bg-violet-500/15 border border-violet-500/25 rounded-full px-1.5 py-0.5">
                <Loader2 className="w-2 h-2 animate-spin" />
                توليد
              </span>
            )}
            {isError && (
              <span className="ml-1 inline-flex items-center gap-1 text-[9px] font-semibold text-red-300 bg-red-500/15 border border-red-500/25 rounded-full px-1.5 py-0.5">
                <AlertCircle className="w-2 h-2" />
                خطأ
              </span>
            )}
          </div>
          <button
            onClick={() => d.onRun(id)}
            disabled={isRunning}
            className="flex items-center justify-center w-6 h-6 rounded-md bg-violet-500/20 hover:bg-violet-500/35 text-violet-300 hover:text-violet-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all nodrag flex-shrink-0"
            title={isRunning ? "جاري التوليد..." : isDone ? "إعادة التوليد" : "توليد"}
            data-testid={`button-run-${id}`}
          >
            {isRunning ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : isDone ? (
              <RefreshCw className="w-3 h-3" />
            ) : (
              <Play className="w-3 h-3 fill-current" />
            )}
          </button>
        </div>

        <div className="p-3 space-y-2.5">
          {/* === IMAGE PREVIEW (TOP) === */}
          <div className="relative w-full rounded-xl overflow-hidden bg-[radial-gradient(ellipse_at_center,_#1a1d2e_0%,_#0a0a14_85%)] border border-border group/preview">
            {d.resultUrl ? (
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="block w-full h-56 nodrag cursor-zoom-in"
                title="اضغط للعرض بالحجم الكامل"
                data-testid={`button-preview-${id}`}
              >
                <img
                  src={d.resultUrl}
                  alt="generated"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover/preview:scale-[1.02]"
                />
                {/* gradient overlay for actions */}
                <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/55 to-transparent opacity-0 group-hover/preview:opacity-100 transition-opacity" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/55 to-transparent opacity-0 group-hover/preview:opacity-100 transition-opacity" />
                {/* Hint label (bottom-left) */}
                <div className="absolute bottom-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/55 backdrop-blur text-[9.5px] text-white/90 opacity-0 group-hover/preview:opacity-100 transition-opacity">
                  <Maximize2 className="w-2.5 h-2.5" />
                  عرض كامل
                </div>
              </button>
            ) : isRunning ? (
              <div className="flex flex-col items-center justify-center gap-2.5 h-56 text-muted-foreground">
                <div className="relative">
                  <Loader2 className="w-7 h-7 animate-spin text-violet-400" />
                  <div className="absolute inset-0 rounded-full blur-md bg-violet-500/30 animate-pulse" />
                </div>
                <span className="text-[10.5px] text-violet-200/80">جاري إنشاء الصورة بالذكاء الاصطناعي...</span>
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center justify-center gap-2 h-56 px-4 text-center">
                <div className="w-9 h-9 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                </div>
                <span className="text-[10.5px] leading-tight text-red-300">{d.error || "حدث خطأ أثناء التوليد"}</span>
                <button
                  onClick={() => d.onRun(id)}
                  className="mt-1 inline-flex items-center gap-1 text-[10px] text-red-200 hover:text-white bg-red-500/10 hover:bg-red-500/25 border border-red-500/30 rounded-md px-2 py-0.5 transition-colors nodrag"
                  data-testid={`button-retry-${id}`}
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  إعادة المحاولة
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 h-56 text-muted-foreground/70">
                <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                  <ImageIcon className="w-4 h-4 opacity-60" />
                </div>
                <span className="text-[10.5px]">المخرجات ستظهر هنا</span>
                <span className="text-[9.5px] text-muted-foreground/50">اكتب البرومت ثم اضغط ▶</span>
              </div>
            )}

            {/* === Floating action bar over image === */}
            {isDone && (
              <div className="absolute top-2 right-2 flex items-center gap-1.5 nodrag">
                <button
                  onClick={() => setLightboxOpen(true)}
                  className="w-7 h-7 rounded-full bg-black/65 hover:bg-black/85 text-white flex items-center justify-center backdrop-blur transition-colors"
                  title="عرض بالحجم الكامل"
                  data-testid={`button-expand-${id}`}
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={copyUrl}
                  className="w-7 h-7 rounded-full bg-black/65 hover:bg-black/85 text-white flex items-center justify-center backdrop-blur transition-colors"
                  title="نسخ الرابط"
                  data-testid={`button-copy-${id}`}
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <div ref={sendMenuRef} className="relative">
                  <button
                    onClick={() => setShowSend((s) => !s)}
                    className={`w-7 h-7 rounded-full flex items-center justify-center backdrop-blur transition-colors ${
                      showSend
                        ? "bg-violet-500/85 text-white"
                        : "bg-black/65 hover:bg-black/85 text-white"
                    }`}
                    title="إرسال إلى..."
                    data-testid={`button-send-${id}`}
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                  {showSend && (
                    <div
                      className="absolute top-9 right-0 w-44 rounded-xl border border-white/10 bg-[#0f111c]/95 backdrop-blur-xl shadow-2xl shadow-black/60 overflow-hidden z-30"
                      data-testid={`menu-send-${id}`}
                    >
                      <div className="px-3 py-1.5 border-b border-white/5 text-[9.5px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                        إرسال الصورة إلى
                      </div>
                      {SEND_TARGETS.map(({ key, label, Icon }) => (
                        <button
                          key={key}
                          onClick={() => handleSendTo(key)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-foreground/85 hover:text-foreground hover:bg-white/5 transition-colors"
                          data-testid={`button-send-${key}-${id}`}
                        >
                          <Icon className="w-3.5 h-3.5 text-violet-300" />
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={downloadImage}
                  className="h-7 px-2.5 inline-flex items-center gap-1 rounded-full bg-violet-500/85 hover:bg-violet-500 text-white backdrop-blur transition-colors text-[10.5px] font-medium"
                  title="تحميل الصورة"
                  data-testid={`button-download-${id}`}
                >
                  <Download className="w-3.5 h-3.5" />
                  تحميل
                </button>
              </div>
            )}
          </div>

          {/* Reference mentions chips */}
          {d.references.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                <AtSign className="w-2.5 h-2.5" />
                <span>المراجع المتصلة</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {d.references.map((ref) => (
                  <button
                    key={ref.id}
                    onClick={() => insertMention(ref.mention)}
                    className="group flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 hover:border-cyan-500/40 text-[10px] text-cyan-200 hover:text-cyan-100 transition-all nodrag"
                    title={`اضغط لإدراج ${ref.mention} في البرومت`}
                    data-testid={`chip-mention-${ref.id}`}
                  >
                    {ref.thumbnail ? (
                      <img src={ref.thumbnail} alt="" className="w-4 h-4 rounded-full object-cover ring-1 ring-cyan-500/40" />
                    ) : (
                      <div className="w-4 h-4 rounded-full bg-cyan-500/30 flex items-center justify-center">
                        <AtSign className="w-2 h-2 text-cyan-100" />
                      </div>
                    )}
                    <span className="font-mono">{ref.mention}</span>
                    <span className="text-cyan-400/60 truncate max-w-[80px]">{ref.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* === PROMPT (BOTTOM) === */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium">
              <span>البرومت</span>
              <span className="text-muted-foreground/50 normal-case">{(d.prompt || "").length} حرف</span>
            </div>
            <textarea
              ref={textareaRef}
              value={d.prompt}
              onChange={(e) => d.onPromptChange(id, e.target.value)}
              placeholder={
                d.references.length > 0
                  ? "اكتب البرومت هنا... استخدم @ref1, @ref2 لذكر المراجع"
                  : "اكتب البرومت هنا، أو وصّل صور مرجعية على اليسار"
              }
              rows={3}
              className="w-full text-[11.5px] leading-relaxed bg-muted/20 border border-border rounded-lg px-2.5 py-2 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-transparent resize-none nodrag"
              data-testid={`textarea-generate-prompt-${id}`}
            />
          </div>
        </div>

        <Handle
          type="source"
          position={Position.Right}
          id="image"
          className="!w-2.5 !h-2.5 !bg-emerald-500 !border-2 !border-card"
        />
      </div>

      <ImageLightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        src={d.resultUrl}
        title="الصورة المُولّدة"
        subtitle={d.prompt ? d.prompt.slice(0, 140) : undefined}
        filename={`nodes-${id}.png`}
      />
    </>
  );
}
