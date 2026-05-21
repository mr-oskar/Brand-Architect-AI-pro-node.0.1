/**
 * ImageGenDialog — AI Image Studio modal.
 *
 * Standalone component extracted from CampaignWorkspace.
 * Import wherever image generation is needed:
 *   import { ImageGenDialog } from "@/components/ImageGenDialog";
 *
 * Props are intentionally explicit (no context magic) so the component
 * works in any page without coupling to a specific data source.
 */

import { useState, useEffect, useRef } from "react";
import {
  Wand2, X, Upload, Plus, Trash2, Image as ImageIcon,
  ChevronDown, Check, Sparkles, Loader2, Eye, History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fileToDataUrl } from "@/lib/imageUtils";
import { IMAGE_SIZE_OPTIONS, IMAGE_MODEL_OPTIONS, IMAGE_ASPECT_PRESETS } from "@/lib/constants";
import type { ImageGenOptions, ImageSize, ImageModel, PostImageHistoryEntry, ReferenceImageItem } from "@/types";

// ─── SVG shape that visually represents an aspect ratio ───────────────────────

function SizeShape({ ratio }: { ratio: "square" | "portrait" | "landscape" | "auto" | "custom" }) {
  if (ratio === "auto") {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="flex-shrink-0">
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.1" strokeDasharray="3 2.5" />
        <circle cx="10" cy="10" r="2.5" fill="currentColor" fillOpacity="0.7" />
      </svg>
    );
  }
  if (ratio === "custom") {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="flex-shrink-0">
        <rect x="2" y="2" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.07" strokeDasharray="3 2.5" />
        <path d="M10 6v8M6 10h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  const map = { square: { w: 14, h: 14 }, portrait: { w: 10, h: 16 }, landscape: { w: 16, h: 10 } };
  const { w, h } = map[ratio];
  const rx = (20 - w) / 2, ry = (20 - h) / 2;
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="flex-shrink-0">
      <rect x={rx} y={ry} width={w} height={h} rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.12" />
    </svg>
  );
}

// ─── Geometric icon conveying AI processing intensity ─────────────────────────

function ModelDot({ level }: { level: ImageModel }) {
  if (level === "nano") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="flex-shrink-0">
        <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.25" fill="currentColor" fillOpacity="0.06" />
        <circle cx="9" cy="9" r="3" fill="currentColor" fillOpacity="0.5" />
      </svg>
    );
  }
  if (level === "mini") {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="flex-shrink-0">
        <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.25" fill="currentColor" fillOpacity="0.06" />
        <circle cx="9" cy="9" r="4.5" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.12" />
        <circle cx="9" cy="9" r="2" fill="currentColor" fillOpacity="0.8" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="flex-shrink-0">
      <circle cx="9" cy="9" r="7.5" stroke="currentColor" strokeWidth="1.25" fill="currentColor" fillOpacity="0.06" />
      <circle cx="9" cy="9" r="5" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.1" />
      <circle cx="9" cy="9" r="2.5" fill="currentColor" />
    </svg>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ImageGenDialogProps {
  open: boolean;
  onClose: () => void;
  onGenerate: (opts: ImageGenOptions) => void;
  defaultPrompt: string;
  generating: boolean;
  brandLogoUrl?: string | null;
  brandName: string;
  imageHistory: PostImageHistoryEntry[];
  currentImageUrl?: string | null;
  onRestoreFromHistory: (url: string) => Promise<void>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ImageGenDialog({
  open,
  onClose,
  onGenerate,
  defaultPrompt,
  generating,
  brandLogoUrl,
  brandName,
  imageHistory,
  currentImageUrl,
  onRestoreFromHistory,
}: ImageGenDialogProps) {
  const [customPrompt, setCustomPrompt] = useState(defaultPrompt);
  const [overlayText, setOverlayText] = useState("");
  const [sizeMode, setSizeMode] = useState<ImageSize | "custom">("1024x1024");
  const [customW, setCustomW] = useState<number>(1080);
  const [customH, setCustomH] = useState<number>(1080);
  const [model, setModel] = useState<ImageModel>("pro");
  const [includeLogo, setIncludeLogo] = useState(!!brandLogoUrl);
  const [refImages, setRefImages] = useState<ReferenceImageItem[]>([]);
  const [progress, setProgress] = useState(0);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);

  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const sizeDropRef = useRef<HTMLDivElement | null>(null);
  const modelDropRef = useRef<HTMLDivElement | null>(null);

  // Animated progress bar while generating
  useEffect(() => {
    if (!generating) {
      const t = setTimeout(() => setProgress(0), 350);
      return () => clearTimeout(t);
    }
    setProgress((p) => (p < 8 ? 8 : p));
    const interval = setInterval(() => {
      setProgress((p) => (p < 92 ? Math.min(92, p + Math.max(0.4, (92 - p) * 0.05)) : p));
    }, 350);
    return () => clearInterval(interval);
  }, [generating]);

  // Close dropdowns on outside click
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (sizeOpen && sizeDropRef.current && !sizeDropRef.current.contains(e.target as Node)) setSizeOpen(false);
      if (modelOpen && modelDropRef.current && !modelDropRef.current.contains(e.target as Node)) setModelOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [sizeOpen, modelOpen]);

  // Lock body scroll + Escape key handler
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = setTimeout(() => {
      promptRef.current?.focus({ preventScroll: true });
      const len = promptRef.current?.value.length ?? 0;
      promptRef.current?.setSelectionRange(len, len);
    }, 30);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !generating) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      clearTimeout(focusTimer);
    };
  }, [open, generating, onClose]);

  if (!open) return null;

  async function handleAddReferenceFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const newItems: ReferenceImageItem[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const dataUrl = await fileToDataUrl(file);
      newItems.push({ id: Math.random().toString(36).slice(2), dataUrl, name: file.name, label: "" });
    }
    setRefImages((prev) => [...prev, ...newItems].slice(0, 6));
  }

  function removeRef(id: string) { setRefImages((prev) => prev.filter((r) => r.id !== id)); }
  function setRefLabel(id: string, label: string) { setRefImages((prev) => prev.map((r) => (r.id === id ? { ...r, label } : r))); }
  function insertRefToken(idx: number) {
    const token = `@${idx + 1}`;
    setCustomPrompt((p) => (p.endsWith(" ") || p.length === 0 ? `${p}${token} ` : `${p} ${token} `));
  }
  function applyAspect(w: number, h: number) { setSizeMode("custom"); setCustomW(w); setCustomH(h); }

  function handleSubmit() {
    if (generating || !customPrompt.trim()) return;
    let size: ImageSize;
    let cW: number | undefined;
    let cH: number | undefined;
    if (sizeMode === "custom") {
      cW = customW; cH = customH;
      const r = customW / Math.max(1, customH);
      size = r > 1.2 ? "1536x1024" : r < 0.84 ? "1024x1536" : "1024x1024";
    } else {
      size = sizeMode;
    }
    onGenerate({
      customPrompt, size, customWidth: cW, customHeight: cH, model, overlayText, includeLogo,
      referenceImages: refImages.map((r) => ({ dataUrl: r.dataUrl, label: r.label.trim() || undefined })),
    });
  }

  async function handleRestore(url: string) {
    if (generating) return;
    setRestoring(url);
    try { await onRestoreFromHistory(url); } finally { setRestoring(null); }
  }

  const refTokensInPrompt = Array.from(customPrompt.matchAll(/@(\d+)/g)).map((m) => parseInt(m[1]!, 10));
  const invalidTokens = refTokensInPrompt.filter((n) => n < 1 || n > refImages.length);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overscroll-contain"
      onClick={() => { if (!generating) onClose(); }}
      onWheel={(e) => { if (e.target === e.currentTarget) e.preventDefault(); }}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-background sm:rounded-2xl rounded-t-2xl border border-card-border shadow-2xl w-full max-w-5xl max-h-[95vh] sm:max-h-[92vh] overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_340px] grid-rows-[1fr_auto] lg:grid-rows-1 overscroll-contain"
      >
        {/* ── Left: design controls ── */}
        <div className="overflow-y-auto p-4 sm:p-6 space-y-5 relative min-h-0">
          {generating && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-primary/10">
              <div className="h-full bg-gradient-to-r from-primary to-primary/70 transition-[width] duration-300 ease-out" style={{ width: `${progress}%` }} />
            </div>
          )}

          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-primary" /> AI Image Studio
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Upload reference images and reference them in the prompt with{" "}
                <code className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono">@1</code>,{" "}
                <code className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono">@2</code>…
              </p>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors" disabled={generating}>
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Reference images */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-primary" />
                Reference Images <span className="text-muted-foreground font-normal">({refImages.length}/6)</span>
              </label>
              <label className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-dashed border-primary/40 text-xs text-primary cursor-pointer hover:bg-primary/5 transition-colors", refImages.length >= 6 && "opacity-50 pointer-events-none")}>
                <Upload className="w-3.5 h-3.5" /> Add
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { handleAddReferenceFiles(e.target.files); e.target.value = ""; }} />
              </label>
            </div>

            {refImages.length === 0 ? (
              <label className="flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-border hover:border-primary/40 transition-colors cursor-pointer text-center">
                <Plus className="w-5 h-5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Drop images or click to upload — order becomes <code className="font-mono">@1, @2…</code></span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { handleAddReferenceFiles(e.target.files); e.target.value = ""; }} />
              </label>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {refImages.map((r, idx) => (
                  <div key={r.id} className="group relative rounded-xl border border-border overflow-hidden bg-muted/30">
                    <div className="aspect-square relative">
                      <img src={r.dataUrl} alt={r.name} className="w-full h-full object-cover" />
                      <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-mono font-semibold">@{idx + 1}</div>
                      <button onClick={() => removeRef(r.id)} className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600" title="Remove">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="p-1.5 flex items-center gap-1">
                      <input type="text" placeholder={`Label for @${idx + 1}`} value={r.label} onChange={(e) => setRefLabel(r.id, e.target.value)} className="flex-1 min-w-0 px-1.5 py-1 text-[11px] bg-transparent border-0 focus:outline-none text-foreground placeholder:text-muted-foreground" />
                      <button onClick={() => insertRefToken(idx)} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20" title="Insert into prompt">@{idx + 1}</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Logo reference toggle */}
          {brandLogoUrl && (
            <div onClick={() => !generating && setIncludeLogo(!includeLogo)} className={cn("flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all", includeLogo ? "border-primary bg-primary/5" : "border-border hover:border-primary/40", generating && "opacity-60 pointer-events-none")}>
              <img src={brandLogoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-cover border border-border flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">Use brand logo as visual reference</p>
                <p className="text-[11px] text-muted-foreground">Background removed · guides AI style and placement</p>
              </div>
              <div className={cn("w-4 h-4 rounded-full border-2 flex-shrink-0 transition-all", includeLogo ? "border-primary bg-primary" : "border-muted-foreground")} />
            </div>
          )}

          {/* Prompt */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Design Description</label>
            <textarea
              ref={promptRef}
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none font-mono"
              rows={5}
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Describe the visual: style, mood, colors, subject, composition. Reference uploaded images with @1, @2…"
              disabled={generating}
            />
            {invalidTokens.length > 0 && (
              <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                Prompt references {invalidTokens.map((n) => `@${n}`).join(", ")} but only {refImages.length} reference image(s) uploaded.
              </p>
            )}
          </div>

          {/* Overlay text */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Text in Design <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input type="text" className="w-full px-4 py-2.5 rounded-xl border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" value={overlayText} onChange={(e) => setOverlayText(e.target.value)} placeholder="e.g. 'New Collection 2025' or brand tagline…" disabled={generating} />
          </div>

          {/* Size + Model dropdowns */}
          <div className="grid grid-cols-2 gap-3">
            {/* Size */}
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Canvas Size</label>
              <div className="relative" ref={sizeDropRef}>
                <button type="button" onClick={() => { if (!generating) { setSizeOpen(v => !v); setModelOpen(false); } }} disabled={generating} className={cn("w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm text-left transition-all", sizeOpen ? "border-primary/50 bg-primary/5" : "border-input bg-background hover:border-border", generating && "opacity-50 cursor-not-allowed")}>
                  {(() => { const opt = IMAGE_SIZE_OPTIONS.find(o => o.id === sizeMode); return (<><span className="text-muted-foreground"><SizeShape ratio={opt?.ratio ?? "square"} /></span><span className="flex-1 font-medium">{opt?.label ?? "Square"}</span><span className="text-xs text-muted-foreground">{opt?.dim ?? ""}</span></>); })()}
                  <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform duration-150 flex-shrink-0", sizeOpen && "rotate-180")} />
                </button>
                {sizeOpen && (
                  <div className="absolute z-50 top-[calc(100%+4px)] left-0 right-0 bg-[#0c0c14] border border-border rounded-xl shadow-2xl overflow-hidden py-1">
                    {IMAGE_SIZE_OPTIONS.map(opt => (
                      <button key={opt.id} type="button" onClick={() => { setSizeMode(opt.id); setSizeOpen(false); }} className={cn("w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors", sizeMode === opt.id ? "bg-primary/10 text-primary" : "text-foreground hover:bg-white/[0.04]")}>
                        <span className={sizeMode === opt.id ? "text-primary" : "text-muted-foreground"}><SizeShape ratio={opt.ratio} /></span>
                        <span className="flex-1 text-left font-medium">{opt.label}</span>
                        <span className="text-xs text-muted-foreground">{opt.dim}</span>
                        {sizeMode === opt.id && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Model */}
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Prompt Quality</label>
              <div className="relative" ref={modelDropRef}>
                <button type="button" onClick={() => { if (!generating) { setModelOpen(v => !v); setSizeOpen(false); } }} disabled={generating} className={cn("w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm text-left transition-all", modelOpen ? "border-primary/50 bg-primary/5" : "border-input bg-background hover:border-border", generating && "opacity-50 cursor-not-allowed")}>
                  {(() => { const opt = IMAGE_MODEL_OPTIONS.find(o => o.id === model); return (<><span className="text-muted-foreground"><ModelDot level={model} /></span><span className="flex-1 font-medium">{opt?.label ?? "Pro"}</span><span className="text-xs text-muted-foreground">{opt?.tagline ?? ""}</span></>); })()}
                  <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform duration-150 flex-shrink-0", modelOpen && "rotate-180")} />
                </button>
                {modelOpen && (
                  <div className="absolute z-50 top-[calc(100%+4px)] left-0 right-0 bg-[#0c0c14] border border-border rounded-xl shadow-2xl overflow-hidden py-1">
                    {IMAGE_MODEL_OPTIONS.map(opt => (
                      <button key={opt.id} type="button" onClick={() => { setModel(opt.id); setModelOpen(false); }} className={cn("w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors", model === opt.id ? "bg-primary/10 text-primary" : "text-foreground hover:bg-white/[0.04]")}>
                        <span className={model === opt.id ? "text-primary" : "text-muted-foreground"}><ModelDot level={opt.id} /></span>
                        <div className="flex-1 text-left"><div className="font-medium">{opt.label}</div><div className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</div></div>
                        {model === opt.id && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Custom dimensions */}
          {sizeMode === "custom" && (
            <div className="p-3 rounded-xl border border-border bg-muted/20 space-y-3">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wide">Width px</label>
                  <input type="number" min={256} max={4096} value={customW} onChange={(e) => setCustomW(Math.max(256, Math.min(4096, parseInt(e.target.value, 10) || 0)))} className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" disabled={generating} />
                </div>
                <span className="pb-2 text-sm text-muted-foreground font-light">×</span>
                <div className="flex-1">
                  <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wide">Height px</label>
                  <input type="number" min={256} max={4096} value={customH} onChange={(e) => setCustomH(Math.max(256, Math.min(4096, parseInt(e.target.value, 10) || 0)))} className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" disabled={generating} />
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {IMAGE_ASPECT_PRESETS.map((p) => (
                  <button key={p.label} onClick={() => applyAspect(p.w, p.h)} disabled={generating} className={cn("px-2 py-1 rounded-md border text-[11px] font-medium transition-colors", customW === p.w && customH === p.h ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground")}>
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">Custom dimensions snap to the closest supported AI ratio (1:1, 2:3, or 3:2).</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1 sticky bottom-0 bg-background pt-3 -mx-6 px-6 border-t border-border">
            <button onClick={onClose} disabled={generating} className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50">
              {generating ? "Generating..." : "Cancel"}
            </button>
            <button onClick={handleSubmit} disabled={generating || !customPrompt.trim()} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generating ? `Generating ${Math.round(progress)}%` : `Generate${refImages.length > 0 ? ` with ${refImages.length} ref${refImages.length === 1 ? "" : "s"}` : ""}`}
            </button>
          </div>
        </div>

        {/* ── Right: history & current ── */}
        <div className="border-t lg:border-t-0 lg:border-l border-border bg-muted/20 overflow-y-auto p-4 sm:p-5 space-y-4 max-h-[40vh] lg:max-h-none">
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-4">
            <div>
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5"><Eye className="w-4 h-4 text-primary" /> Current</h4>
              <div className="mt-2 rounded-xl overflow-hidden border border-border bg-background">
                {currentImageUrl
                  ? <img src={currentImageUrl} alt="Current" className="w-full aspect-square object-cover" />
                  : <div className="aspect-square flex items-center justify-center text-muted-foreground text-xs"><ImageIcon className="w-8 h-8 opacity-40" /></div>
                }
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <History className="w-4 h-4 text-primary" /> History
                {imageHistory.length > 0 && <span className="text-[10px] font-normal text-muted-foreground">({imageHistory.length})</span>}
              </h4>
              {imageHistory.length === 0
                ? <p className="mt-2 text-[11px] text-muted-foreground italic">Past generations will appear here so you can compare and restore.</p>
                : (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {imageHistory.map((h, i) => (
                      <button key={`${h.url}-${i}`} onClick={() => handleRestore(h.url)} disabled={generating || restoring !== null} className="group relative rounded-lg overflow-hidden border border-border hover:border-primary transition-colors disabled:opacity-60" title={h.prompt?.slice(0, 200) ?? "Restore"}>
                        <img src={h.url} alt="History" className="w-full aspect-square object-cover" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
                          {restoring === h.url
                            ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                            : <span className="text-[10px] text-white font-semibold opacity-0 group-hover:opacity-100">Restore</span>
                          }
                        </div>
                      </button>
                    ))}
                  </div>
                )
              }
            </div>
          </div>
          <p className="hidden lg:block text-[10px] text-muted-foreground border-t border-border pt-3">
            Brand: <span className="text-foreground font-medium">{brandName}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
