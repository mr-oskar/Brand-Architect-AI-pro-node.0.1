import { useParams, Link } from "wouter";
import { useRef, useState, useEffect } from "react";
import {
  useGetBrand, useGetBrandStats,
  getGetBrandQueryKey, getGetBrandStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Sparkles, Loader2, X,
  Copy, CheckCircle2, Download, Edit, RefreshCw,
  ChevronRight, Zap, Heart, Shield, Target, Star, Quote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { extractApiError, notifyError } from "@/lib/apiError";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrandKit {
  personality: string;
  positioning: string;
  toneOfVoice: string;
  audienceSegments: string[];
  visualStyle: string;
  colorPalette: Record<string, string>;
  visualStyleRules: string;
  brandStory?: string;
  missionStatement?: string;
  visionStatement?: string;
  taglines?: string[];
  brandKeywords?: string[];
  messagingPillars?: string[];
  dosCommunication?: string[];
  dontsCommunication?: string[];
  socialBio?: string;
  typographyRecommendations?: string;
  competitivePosition?: string;
}

// ─── Animation helpers ────────────────────────────────────────────────────────

function useTypewriter(text: string, active: boolean, speed = 12) {
  const [displayed, setDisplayed] = useState(active ? text : "");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idxRef = useRef(0);

  useEffect(() => {
    if (!active) { setDisplayed(text); return; }
    setDisplayed("");
    idxRef.current = 0;
    function tick() {
      idxRef.current += 1;
      setDisplayed(text.slice(0, idxRef.current));
      if (idxRef.current < text.length) timerRef.current = setTimeout(tick, speed);
    }
    timerRef.current = setTimeout(tick, speed);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [active, text, speed]);

  const done = displayed.length >= text.length;
  return { displayed, done };
}

function TypewriterText({
  text, active, speed = 10, className, longText = false,
}: { text: string; active: boolean; speed?: number; className?: string; longText?: boolean }) {
  const effectiveSpeed = longText ? Math.max(2, Math.floor(speed / 3)) : speed;
  const { displayed, done } = useTypewriter(text, active, effectiveSpeed);
  return (
    <span className={className}>
      {active ? displayed : text}
      {active && !done && (
        <span className="inline-block w-0.5 h-[1em] bg-current ml-0.5 animate-pulse opacity-70 align-middle" />
      )}
    </span>
  );
}

function SkeletonLine({ w = "100%", h = "14px", className }: { w?: string; h?: string; className?: string }) {
  return (
    <div
      className={cn("rounded-md bg-muted/50 animate-pulse", className)}
      style={{ width: w, height: h }}
    />
  );
}

// ─── Color Swatch ─────────────────────────────────────────────────────────────

function ColorBlock({ color, label }: { color: string; label: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(color).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }
  const hex = color.replace("#", "");
  const isLight = hex.length >= 6
    ? (parseInt(hex.slice(0, 2), 16) * 299 + parseInt(hex.slice(2, 4), 16) * 587 + parseInt(hex.slice(4, 6), 16) * 114) / 1000 > 145
    : true;
  const txtCls = isLight ? "text-black/70" : "text-white/80";
  const subCls = isLight ? "text-black/50" : "text-white/50";
  return (
    <button
      onClick={copy}
      className="group relative flex-1 min-w-[80px] overflow-hidden rounded-2xl transition-transform hover:scale-[1.03] hover:z-10 focus:outline-none"
      style={{ backgroundColor: color, minHeight: 110 }}
      title={`Copy ${color}`}
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/10" />
      <div className="absolute bottom-0 left-0 right-0 px-3 py-2.5">
        <p className={cn("text-[11px] font-bold capitalize leading-none mb-0.5", txtCls)}>{label}</p>
        <p className={cn("text-[10px] font-mono flex items-center gap-1", subCls)}>
          {copied
            ? <><CheckCircle2 className="w-3 h-3 text-green-400" /> Copied!</>
            : <><Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />{color.toUpperCase()}</>}
        </p>
      </div>
    </button>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ visible, delay = 0, children, className }: {
  visible: boolean; delay?: number; children: React.ReactNode; className?: string;
}) {
  return (
    <div
      className={cn(
        "transition-all duration-700 ease-out",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6",
        className,
      )}
      style={{ transitionDelay: visible ? `${delay}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function Card({ children, className, accent }: {
  children: React.ReactNode; className?: string; accent?: string;
}) {
  return (
    <div
      className={cn("rounded-2xl border border-white/[0.07] bg-card p-6 relative overflow-hidden", className)}
      style={accent ? { borderColor: `${accent}25` } : undefined}
    >
      {accent && <div className="absolute top-0 left-0 right-0 h-0.5 opacity-60" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />}
      {children}
    </div>
  );
}

function SectionHeading({ icon: Icon, label, accent }: { icon?: React.ElementType; label: string; accent?: string }) {
  return (
    <div className="flex items-center gap-2 mb-5">
      {Icon && (
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={accent ? { backgroundColor: `${accent}18` } : { backgroundColor: "hsl(var(--primary)/0.12)" }}>
          <Icon className="w-3.5 h-3.5" style={accent ? { color: accent } : { color: "hsl(var(--primary))" }} />
        </div>
      )}
      <h2 className="text-[11px] font-bold tracking-widest uppercase text-muted-foreground">{label}</h2>
    </div>
  );
}

const styleLabels: Record<string, { label: string; bg: string; text: string }> = {
  tech:    { label: "Tech",    bg: "#3730A3", text: "#A5B4FC" },
  luxury:  { label: "Luxury",  bg: "#78350F", text: "#FCD34D" },
  bold:    { label: "Bold",    bg: "#7F1D1D", text: "#FCA5A5" },
  minimal: { label: "Minimal", bg: "#1E293B", text: "#94A3B8" },
};

// ─── REVEAL SECTIONS order ───────────────────────────────────────────────────

const REVEAL_KEYS = [
  "colors", "hero", "mission", "personality", "tone",
  "audience", "pillars", "dosdont", "keywords", "typography", "story", "cta",
] as const;
type RevealKey = typeof REVEAL_KEYS[number];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BrandKit() {
  const params = useParams<{ id: string }>();
  const brandId = parseInt(params.id, 10);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  // ── Regenerate kit state
  const [regeneratingKit, setRegeneratingKit] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  // ── Story regenerate
  const [generatingStory, setGeneratingStory] = useState(false);

  // ── PDF
  const [exportingPdf, setExportingPdf] = useState(false);

  // ── Reveal animation
  const [revealed, setRevealed] = useState<Set<RevealKey>>(new Set());
  const [animatingKit, setAnimatingKit] = useState(false);

  const { data: brand, isLoading } = useGetBrand(brandId, {
    query: { enabled: !!brandId, queryKey: getGetBrandQueryKey(brandId) },
  });
  const { data: stats } = useGetBrandStats(brandId, {
    query: { enabled: !!brandId, queryKey: getGetBrandStatsQueryKey(brandId) },
  });

  // Trigger reveal animation on first load
  useEffect(() => {
    if (!brand?.brandKit) return;
    const storageKey = `bk-revealed-${brandId}`;
    const alreadySeen = sessionStorage.getItem(storageKey);
    if (alreadySeen) {
      setRevealed(new Set(REVEAL_KEYS));
      return;
    }
    // Animate reveal
    setAnimatingKit(true);
    REVEAL_KEYS.forEach((key, i) => {
      setTimeout(() => {
        setRevealed((prev) => new Set([...prev, key]));
        if (i === REVEAL_KEYS.length - 1) {
          setAnimatingKit(false);
          sessionStorage.setItem(storageKey, "1");
        }
      }, 120 + i * 280);
    });
  }, [brand?.brandKit, brandId]);

  function triggerRevealAnimation() {
    sessionStorage.removeItem(`bk-revealed-${brandId}`);
    setRevealed(new Set());
    setAnimatingKit(true);
    REVEAL_KEYS.forEach((key, i) => {
      setTimeout(() => {
        setRevealed((prev) => new Set([...prev, key]));
        if (i === REVEAL_KEYS.length - 1) setAnimatingKit(false);
      }, 100 + i * 320);
    });
  }

  function isVisible(key: RevealKey) { return revealed.has(key); }
  function isAnimating(key: RevealKey) { return animatingKit && revealed.has(key) && !revealed.has(REVEAL_KEYS[REVEAL_KEYS.indexOf(key) + 1]); }

  async function handleRegenerateKit() {
    setRegeneratingKit(true);
    setRegenError(null);
    try {
      const res = await fetch(`/api/brands/${brandId}/generate-kit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (!res.ok) throw new Error(await extractApiError(res, "Failed to regenerate kit"));
      await queryClient.invalidateQueries({ queryKey: getGetBrandQueryKey(brandId) });
      triggerRevealAnimation();
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : "Failed to regenerate.");
      notifyError("Kit regeneration failed", err);
    } finally {
      setRegeneratingKit(false);
    }
  }

  async function handleRegenerateStory() {
    setGeneratingStory(true);
    try {
      const res = await fetch(`/api/brands/${brandId}/generate-story`, { method: "POST" });
      if (!res.ok) throw new Error(await extractApiError(res, "Story generation failed"));
      await queryClient.invalidateQueries({ queryKey: getGetBrandQueryKey(brandId) });
    } catch (err) {
      notifyError("Story generation failed", err);
    } finally {
      setGeneratingStory(false);
    }
  }

  // ── PDF Export (full implementation kept)
  async function handleExportPdf() {
    if (!kit || !brand) return;
    setExportingPdf(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const W = 210, H = 297;
      const primary = kit.colorPalette?.primary ?? "#6366F1";
      const secondary = kit.colorPalette?.secondary ?? "#8B5CF6";
      const accent = kit.colorPalette?.accent ?? "#EC4899";
      const bg = kit.colorPalette?.background ?? "#FFFFFF";
      const textCol = kit.colorPalette?.text ?? "#1E293B";
      const neutral = kit.colorPalette?.neutral ?? "#94A3B8";

      function hexToRgb(hex: string): [number, number, number] {
        const c = hex.replace("#", "");
        return [parseInt(c.substring(0, 2), 16) || 0, parseInt(c.substring(2, 4), 16) || 0, parseInt(c.substring(4, 6), 16) || 0];
      }
      function setFill(hex: string) { doc.setFillColor(...hexToRgb(hex)); }
      function setDraw(hex: string) { doc.setDrawColor(...hexToRgb(hex)); }
      function setTextColor(hex: string) { doc.setTextColor(...hexToRgb(hex)); }
      function sectionHeader(title: string, y: number) {
        setFill(primary); doc.rect(14, y, 4, 6, "F");
        setTextColor(textCol); doc.setFontSize(12); doc.setFont("helvetica", "bold");
        doc.text(title.toUpperCase(), 22, y + 5); return y + 12;
      }
      function bodyText(text: string, x: number, y: number, maxW: number, lineHeight = 5): number {
        doc.setFontSize(9); doc.setFont("helvetica", "normal"); setTextColor(neutral);
        const lines = doc.splitTextToSize(text || "", maxW);
        doc.text(lines, x, y); return y + lines.length * lineHeight;
      }
      // PAGE 1: COVER
      setFill(primary); doc.rect(0, 0, W, H * 0.6, "F");
      const [pr, pg, pb] = hexToRgb(primary);
      doc.setFillColor(Math.min(pr + 30, 255), Math.min(pg + 30, 255), Math.min(pb + 30, 255)); doc.circle(W - 30, 30, 50, "F");
      doc.setFillColor(Math.max(pr - 30, 0), Math.max(pg - 30, 0), Math.max(pb - 30, 0)); doc.circle(20, H * 0.55, 40, "F");
      if (brand.logoUrl && brand.logoUrl.startsWith("data:image")) {
        try { doc.addImage(brand.logoUrl, brand.logoUrl.includes("png") ? "PNG" : "JPEG", 14, 20, 40, 40, undefined, "FAST"); }
        catch { setTextColor("#FFFFFF"); doc.setFontSize(28); doc.setFont("helvetica", "bold"); doc.text(brand.companyName.substring(0, 2).toUpperCase(), 14, 55); }
      } else {
        setFill("#FFFFFF"); doc.roundedRect(14, 20, 40, 40, 6, 6, "F"); setTextColor(primary);
        doc.setFontSize(22); doc.setFont("helvetica", "bold");
        doc.text(brand.companyName.split(/\s+/).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase(), 34, 45, { align: "center" });
      }
      setTextColor("#FFFFFF"); doc.setFontSize(32); doc.setFont("helvetica", "bold"); doc.text(brand.companyName.toUpperCase(), 14, 85);
      doc.setFontSize(13); doc.setFont("helvetica", "normal"); doc.setTextColor(220, 220, 240); doc.text(brand.industry, 14, 95);
      if (kit.taglines?.[0]) { doc.setFontSize(14); doc.setFont("helvetica", "bolditalic"); setTextColor("#FFFFFF"); doc.text(doc.splitTextToSize(`"${kit.taglines[0]}"`, W - 28), 14, 115); }
      doc.setFontSize(11); doc.setFont("helvetica", "normal"); doc.setTextColor(190, 190, 220); doc.text("Brand Identity Guidelines", 14, H * 0.6 - 10);
      setFill("#FFFFFF"); doc.rect(0, H * 0.6, W, H * 0.4, "F");
      const summaryY = H * 0.6 + 15;
      [{ label: "Visual Style", value: kit.visualStyle?.toUpperCase() ?? "MINIMAL", color: primary }, { label: "Personality", value: (kit.personality ?? "").substring(0, 30) + "...", color: secondary }, { label: "Tone", value: (kit.toneOfVoice ?? "").substring(0, 30) + "...", color: accent }].forEach((box, i) => {
        const bx = 14 + i * ((W - 28 - 10) / 3 + 5); setFill(box.color); doc.roundedRect(bx, summaryY, (W - 28 - 10) / 3, 4, 1, 1, "F");
        setTextColor(box.color); doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.text(box.label.toUpperCase(), bx, summaryY + 12);
        setTextColor(textCol); doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.text(doc.splitTextToSize(box.value, (W - 28 - 10) / 3 - 2).slice(0, 2), bx, summaryY + 18);
      });
      setTextColor(neutral); doc.setFontSize(8); doc.text(`${brand.companyName} · Confidential Brand Identity Document`, W / 2, H - 10, { align: "center" });
      // PAGE 2-5: Color, Typography, Personality, Taglines (abbreviated for brevity)
      doc.addPage();
      setFill(primary); doc.rect(0, 0, W, 18, "F"); setTextColor("#FFFFFF"); doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.text(brand.companyName.toUpperCase(), 14, 11); doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.text("BRAND COLOR SYSTEM", W - 14, 11, { align: "right" });
      let yPos = 35; yPos = sectionHeader("Color Palette", yPos);
      Object.entries(kit.colorPalette ?? {}).forEach(([name, hex], i) => {
        const col = i % 5; const row = Math.floor(i / 5); const sx = 14 + col * ((W - 28) / 5); const sy = yPos + row * 50;
        setFill(hex as string); setDraw("#E2E8F0"); doc.roundedRect(sx, sy, 28, 28, 4, 4, "FD");
        setTextColor(textCol); doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.text(name.charAt(0).toUpperCase() + name.slice(1), sx, sy + 34);
        setTextColor(neutral); doc.setFontSize(7); doc.text((hex as string).toUpperCase(), sx, sy + 40);
      });
      yPos += Math.ceil(Object.keys(kit.colorPalette ?? {}).length / 5) * 50 + 15;
      yPos = sectionHeader("Brand Personality & Positioning", yPos);
      doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); setTextColor(textCol); doc.text("Positioning:", 14, yPos + 1);
      yPos = bodyText(kit.positioning ?? "", 14, yPos + 6, W - 28);
      yPos += 5; doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); setTextColor(textCol); doc.text("Personality:", 14, yPos + 1);
      yPos = bodyText(kit.personality ?? "", 14, yPos + 6, W - 28);
      yPos += 5; doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); setTextColor(textCol); doc.text("Tone of Voice:", 14, yPos + 1);
      yPos = bodyText(kit.toneOfVoice ?? "", 14, yPos + 6, W - 28);
      if (kit.missionStatement) { yPos += 8; setFill("#F0FDF4"); setDraw("#BBF7D0"); doc.roundedRect(14, yPos, W - 28, 20, 3, 3, "FD"); setTextColor(textCol); doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.text("MISSION", 22, yPos + 7); doc.setFontSize(9); doc.setFont("helvetica", "bolditalic"); doc.text(doc.splitTextToSize(`"${kit.missionStatement}"`, W - 44), 22, yPos + 14); yPos += 25; }
      if (kit.visionStatement) { setFill("#FFF7ED"); setDraw("#FED7AA"); doc.roundedRect(14, yPos, W - 28, 20, 3, 3, "FD"); setTextColor(textCol); doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.text("VISION", 22, yPos + 7); doc.setFontSize(9); doc.setFont("helvetica", "bolditalic"); doc.text(doc.splitTextToSize(`"${kit.visionStatement}"`, W - 44), 22, yPos + 14); yPos += 25; }
      setDraw("#E2E8F0"); doc.setLineWidth(0.3); doc.line(14, H - 15, W - 14, H - 15); setTextColor(neutral); doc.setFontSize(7.5); doc.text(`${brand.companyName} Brand Identity`, W / 2, H - 9, { align: "center" });
      doc.save(`${brand.companyName.replace(/\s+/g, "-")}-brand-identity.pdf`);
    } catch (err) { console.error("PDF export failed:", err); }
    finally { setExportingPdf(false); }
  }

  // ── Loading / not found
  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
    </div>
  );
  if (!brand) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <p className="text-muted-foreground">Brand not found</p>
      <Link href="/" className="text-primary text-sm hover:underline">Back to dashboard</Link>
    </div>
  );

  const kit = brand.brandKit as BrandKit | null;
  const primaryColor = kit?.colorPalette?.primary ?? "#7c3aed";
  const secondaryColor = kit?.colorPalette?.secondary ?? "#8B5CF6";
  const accentColor = kit?.colorPalette?.accent ?? "#06B6D4";
  const styleInfo = styleLabels[kit?.visualStyle ?? "minimal"] ?? styleLabels.minimal;
  const initials = brand.companyName.split(/\s+/).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();

  return (
    <div className="min-h-screen bg-background">

      {/* ── Kit Regenerating Overlay ─────────────────────────────────────────── */}
      {regeneratingKit && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex flex-col items-center justify-center gap-5">
          <div className="relative">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center" style={{ backgroundColor: `${primaryColor}15`, border: `1px solid ${primaryColor}25` }}>
              <Sparkles className="w-9 h-9" style={{ color: primaryColor }} />
            </div>
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center bg-background">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            </div>
          </div>
          <div className="text-center space-y-1.5">
            <h3 className="text-xl font-bold text-foreground">Rebuilding your brand identity</h3>
            <p className="text-sm text-muted-foreground max-w-xs">AI is crafting a fresh identity system for {brand.companyName}…</p>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {["Color System", "Brand Voice", "Personality", "Audience", "Messaging", "Strategy"].map((s) => (
              <div key={s} className="px-3 py-1.5 rounded-lg bg-muted/50 text-[11px] text-muted-foreground text-center animate-pulse">{s}</div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* STICKY HEADER                                                        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-background/90 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-5 py-3 flex items-center gap-3">
          <Link href="/" className="flex-shrink-0 p-1.5 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>

          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {brand.logoUrl ? (
              <img src={brand.logoUrl} alt={brand.companyName} className="w-8 h-8 rounded-xl object-cover border border-white/10 flex-shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-[10px] font-black text-white" style={{ background: primaryColor }}>
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground leading-none truncate">{brand.companyName}</p>
              <p className="text-[11px] text-muted-foreground leading-none mt-0.5 truncate">{brand.industry}</p>
            </div>
            {kit && (
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold flex-shrink-0"
                style={{ backgroundColor: styleInfo.bg, color: styleInfo.text }}>
                {styleInfo.label}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {kit && (
              <button onClick={handleRegenerateKit} disabled={regeneratingKit}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/[0.08] text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-50">
                <RefreshCw className={cn("w-3 h-3", regeneratingKit && "animate-spin")} />
                Regenerate
              </button>
            )}
            <Link href={`/brands/${brandId}/edit`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/[0.08] text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
              <Edit className="w-3 h-3" /> Edit
            </Link>
            {kit && (
              <button onClick={handleExportPdf} disabled={exportingPdf}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/[0.08] text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-50">
                {exportingPdf ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} PDF
              </button>
            )}
            {kit && (
              <button onClick={() => navigate(`/brands/${brandId}/campaigns/new`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                style={{ backgroundColor: primaryColor }}>
                <Sparkles className="w-3 h-3" />
                <span className="hidden sm:inline">Campaign</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* NO KIT STATE                                                         */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {!kit && (
        <div className="max-w-2xl mx-auto px-6 py-24 text-center">
          <div className="w-20 h-20 rounded-3xl mx-auto mb-6 flex items-center justify-center" style={{ backgroundColor: `${primaryColor}15`, border: `1px solid ${primaryColor}20` }}>
            <Sparkles className="w-9 h-9" style={{ color: primaryColor }} />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-3">No brand identity yet</h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Generate a complete AI-powered brand identity system — colors, personality, messaging, audience, typography, and more.
          </p>
          {regenError && <div className="mb-5 rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">{regenError}</div>}
          <button onClick={handleRegenerateKit} disabled={regeneratingKit}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl text-base font-bold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
            style={{ backgroundColor: primaryColor }}>
            <Sparkles className="w-5 h-5" /> Generate Brand Identity
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* BRAND KIT CONTENT                                                    */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {kit && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-24">

          {/* ── HERO ──────────────────────────────────────────────────────── */}
          <Section visible={isVisible("hero")} className="pt-10 mb-10">
            <div
              className="relative rounded-3xl overflow-hidden p-8 sm:p-12 flex flex-col sm:flex-row items-center gap-8"
              style={{ background: `linear-gradient(135deg, ${primaryColor}1A 0%, ${secondaryColor}0D 50%, ${accentColor}0A 100%)`, border: `1px solid ${primaryColor}20` }}
            >
              {/* Decorative orbs */}
              <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10 blur-3xl pointer-events-none" style={{ background: `radial-gradient(circle, ${primaryColor}, transparent)` }} />
              <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full opacity-10 blur-3xl pointer-events-none" style={{ background: `radial-gradient(circle, ${accentColor}, transparent)` }} />

              {/* Logo */}
              <div className="flex-shrink-0 relative z-10">
                {brand.logoUrl ? (
                  <img src={brand.logoUrl} alt={brand.companyName} className="w-24 h-24 rounded-2xl object-cover border-2 border-white/10 shadow-2xl" />
                ) : (
                  <div className="w-24 h-24 rounded-2xl flex items-center justify-center text-2xl font-black text-white shadow-2xl" style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}>
                    {initials}
                  </div>
                )}
                <div className="absolute -bottom-2 -right-2 px-2 py-0.5 rounded-lg text-[9px] font-bold"
                  style={{ backgroundColor: styleInfo.bg, color: styleInfo.text }}>
                  {styleInfo.label}
                </div>
              </div>

              {/* Info */}
              <div className="relative z-10 text-center sm:text-left flex-1 min-w-0">
                <h1 className="text-3xl sm:text-4xl font-black text-foreground tracking-tight mb-1">
                  {brand.companyName}
                </h1>
                <p className="text-muted-foreground text-sm mb-4">{brand.industry}</p>
                {kit.taglines?.[0] && (
                  <p className="text-lg font-semibold mb-4 italic" style={{ color: primaryColor }}>
                    "{isVisible("hero") ? <TypewriterText text={kit.taglines[0]} active={isAnimating("hero")} speed={30} /> : kit.taglines[0]}"
                  </p>
                )}
                {kit.socialBio && (
                  <p className="text-sm text-muted-foreground max-w-lg">{kit.socialBio}</p>
                )}
                {stats && (
                  <div className="flex items-center gap-5 mt-5 flex-wrap justify-center sm:justify-start">
                    {[
                      { label: "Campaigns", value: stats.totalCampaigns ?? 0 },
                      { label: "Posts", value: stats.totalPosts ?? 0 },
                      { label: "Images", value: stats.postsWithImages ?? 0 },
                    ].map(({ label, value }) => (
                      <div key={label} className="text-center sm:text-left">
                        <p className="text-xl font-black text-foreground">{value}</p>
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Section>

          {/* ── COLOR PALETTE ─────────────────────────────────────────────── */}
          <Section visible={isVisible("colors")} className="mb-10">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-[11px] font-bold tracking-widest uppercase text-muted-foreground">Color System</h2>
              <div className="h-px flex-1 bg-border/40" />
            </div>
            {isVisible("colors") ? (
              <div className="flex gap-2 sm:gap-3 h-28 sm:h-36">
                {Object.entries(kit.colorPalette ?? {}).map(([label, color]) => (
                  <ColorBlock key={label} color={color as string} label={label} />
                ))}
              </div>
            ) : (
              <div className="flex gap-2 sm:gap-3 h-28 sm:h-36">
                {[1, 2, 3, 4, 5, 6].map((i) => <SkeletonLine key={i} className="flex-1 rounded-2xl" h="100%" />)}
              </div>
            )}
          </Section>

          {/* ── MISSION & VISION ──────────────────────────────────────────── */}
          <Section visible={isVisible("mission")} className="mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Mission */}
              <Card accent="#22C55E">
                <SectionHeading icon={Target} label="Mission" accent="#22C55E" />
                {isVisible("mission") ? (
                  <div>
                    <Quote className="w-5 h-5 mb-3 opacity-30 text-green-400" />
                    <p className="text-base font-semibold text-foreground leading-relaxed">
                      <TypewriterText text={kit.missionStatement ?? "—"} active={isAnimating("mission")} speed={18} />
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2"><SkeletonLine /><SkeletonLine w="80%" /></div>
                )}
              </Card>

              {/* Vision */}
              <Card accent="#F59E0B">
                <SectionHeading icon={Star} label="Vision" accent="#F59E0B" />
                {isVisible("mission") ? (
                  <div>
                    <Quote className="w-5 h-5 mb-3 opacity-30 text-amber-400" />
                    <p className="text-base font-semibold text-foreground leading-relaxed">
                      <TypewriterText text={kit.visionStatement ?? "—"} active={isAnimating("mission")} speed={18} />
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2"><SkeletonLine /><SkeletonLine w="70%" /></div>
                )}
              </Card>
            </div>
          </Section>

          {/* ── BRAND PERSONALITY ─────────────────────────────────────────── */}
          <Section visible={isVisible("personality")} className="mb-6">
            <Card accent={primaryColor}>
              <SectionHeading icon={Heart} label="Brand Personality" accent={primaryColor} />
              {isVisible("personality") ? (
                <p className="text-sm text-foreground/90 leading-relaxed">
                  <TypewriterText text={kit.personality} active={isAnimating("personality")} longText speed={8} />
                </p>
              ) : (
                <div className="space-y-2"><SkeletonLine /><SkeletonLine /><SkeletonLine w="60%" /></div>
              )}
            </Card>
          </Section>

          {/* ── TONE OF VOICE ─────────────────────────────────────────────── */}
          <Section visible={isVisible("tone")} className="mb-6">
            <Card accent={accentColor}>
              <SectionHeading icon={Zap} label="Tone of Voice" accent={accentColor} />
              {isVisible("tone") ? (
                <div className="relative pl-4 border-l-2" style={{ borderColor: `${accentColor}50` }}>
                  <p className="text-sm text-foreground/90 leading-relaxed italic">
                    <TypewriterText text={kit.toneOfVoice} active={isAnimating("tone")} longText speed={6} />
                  </p>
                </div>
              ) : (
                <div className="space-y-2"><SkeletonLine /><SkeletonLine w="90%" /><SkeletonLine w="75%" /></div>
              )}
            </Card>
          </Section>

          {/* ── AUDIENCE SEGMENTS ─────────────────────────────────────────── */}
          <Section visible={isVisible("audience")} className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-[11px] font-bold tracking-widest uppercase text-muted-foreground">Target Audience</h2>
              <div className="h-px flex-1 bg-border/40" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {isVisible("audience") ? (kit.audienceSegments ?? []).slice(0, 3).map((seg, i) => {
                const labels = ["Primary", "Secondary", "Tertiary"];
                const colors = [primaryColor, secondaryColor, accentColor];
                return (
                  <div key={i} className="rounded-2xl border border-white/[0.07] bg-card p-5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-5 blur-xl" style={{ background: colors[i] }} />
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-3 text-xs font-black text-white" style={{ backgroundColor: colors[i] }}>
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: colors[i] }}>{labels[i]}</p>
                    <p className="text-xs text-foreground/80 leading-relaxed">
                      <TypewriterText text={seg} active={isAnimating("audience") && i === 0} speed={6} longText />
                    </p>
                  </div>
                );
              }) : [0, 1, 2].map((i) => <SkeletonLine key={i} className="rounded-2xl" h="120px" />)}
            </div>
          </Section>

          {/* ── MESSAGING PILLARS ─────────────────────────────────────────── */}
          <Section visible={isVisible("pillars")} className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-[11px] font-bold tracking-widest uppercase text-muted-foreground">Messaging Pillars</h2>
              <div className="h-px flex-1 bg-border/40" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {isVisible("pillars") ? (kit.messagingPillars ?? []).map((pillar, i) => {
                const colors = [primaryColor, secondaryColor, accentColor];
                const c = colors[i % 3];
                const [title, desc] = pillar.includes("—") ? pillar.split("—").map((s) => s.trim()) : [pillar, ""];
                return (
                  <div key={i} className="rounded-2xl border border-white/[0.07] bg-card p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-black tabular-nums" style={{ color: c }}>0{i + 1}</span>
                      <div className="h-px flex-1" style={{ backgroundColor: `${c}40` }} />
                    </div>
                    <p className="text-sm font-semibold text-foreground mb-1">{title}</p>
                    {desc && <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>}
                  </div>
                );
              }) : [0, 1, 2].map((i) => <SkeletonLine key={i} className="rounded-2xl" h="120px" />)}
            </div>
          </Section>

          {/* ── DO'S & DON'TS ─────────────────────────────────────────────── */}
          <Section visible={isVisible("dosdont")} className="mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Do's */}
              <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.04] p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <span className="text-[11px] font-bold tracking-widest uppercase text-emerald-400">Do</span>
                </div>
                {isVisible("dosdont") ? (
                  <ul className="space-y-3">
                    {(kit.dosCommunication ?? []).map((item, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                        <p className="text-xs text-foreground/80 leading-relaxed">{item.replace(/^Do:\s*/i, "")}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="space-y-2">{[80, 90, 75, 85].map((w, i) => <SkeletonLine key={i} w={`${w}%`} />)}</div>
                )}
              </div>

              {/* Don'ts */}
              <div className="rounded-2xl border border-red-500/15 bg-red-500/[0.04] p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-lg bg-red-500/20 flex items-center justify-center">
                    <X className="w-3.5 h-3.5 text-red-400" />
                  </div>
                  <span className="text-[11px] font-bold tracking-widest uppercase text-red-400">Don't</span>
                </div>
                {isVisible("dosdont") ? (
                  <ul className="space-y-3">
                    {(kit.dontsCommunication ?? []).map((item, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                        <p className="text-xs text-foreground/80 leading-relaxed">{item.replace(/^Don'?t:\s*/i, "")}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="space-y-2">{[80, 90, 75, 85].map((w, i) => <SkeletonLine key={i} w={`${w}%`} />)}</div>
                )}
              </div>
            </div>
          </Section>

          {/* ── KEYWORDS & TAGLINES ───────────────────────────────────────── */}
          <Section visible={isVisible("keywords")} className="mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Keywords */}
              <Card>
                <SectionHeading label="Brand Keywords" />
                {isVisible("keywords") ? (
                  <div className="flex flex-wrap gap-2">
                    {(kit.brandKeywords ?? []).map((kw, i) => (
                      <span key={i} className="px-3 py-1 rounded-full text-xs font-semibold border transition-colors"
                        style={{ backgroundColor: `${primaryColor}10`, color: primaryColor, borderColor: `${primaryColor}25` }}>
                        {kw}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {[60, 80, 55, 70, 65, 75, 50, 68].map((w, i) => <SkeletonLine key={i} w={`${w}px`} h="26px" className="rounded-full" />)}
                  </div>
                )}
              </Card>

              {/* Taglines */}
              <Card>
                <SectionHeading label="Taglines" />
                {isVisible("keywords") ? (
                  <div className="space-y-2">
                    {(kit.taglines ?? []).map((tl, i) => (
                      <div key={i} className={cn("px-4 py-2.5 rounded-xl text-sm", i === 0 ? "font-bold text-foreground" : "text-muted-foreground")}
                        style={i === 0 ? { backgroundColor: `${primaryColor}15`, color: primaryColor } : { backgroundColor: "hsl(var(--muted)/0.3)" }}>
                        "{tl}"
                        {i === 0 && <span className="ml-2 text-[9px] font-black uppercase tracking-widest opacity-60">Primary</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">{[1, 2, 3, 4].map((i) => <SkeletonLine key={i} h="36px" className="rounded-xl" />)}</div>
                )}
              </Card>
            </div>
          </Section>

          {/* ── TYPOGRAPHY & COMPETITIVE POSITION ────────────────────────── */}
          <Section visible={isVisible("typography")} className="mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card accent={secondaryColor}>
                <SectionHeading label="Typography" accent={secondaryColor} />
                {isVisible("typography") ? (
                  <div className="space-y-3">
                    <div className="rounded-xl p-3 bg-white/[0.04] border border-white/[0.06]">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Display</p>
                      <p className="text-2xl font-black text-foreground tracking-tight">{brand.companyName}</p>
                    </div>
                    <p className="text-xs text-foreground/80 leading-relaxed">
                      <TypewriterText text={kit.typographyRecommendations ?? "—"} active={isAnimating("typography")} longText speed={5} />
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <SkeletonLine h="54px" className="rounded-xl" />
                    <div className="space-y-1"><SkeletonLine /><SkeletonLine w="80%" /></div>
                  </div>
                )}
              </Card>

              <Card>
                <SectionHeading icon={Target} label="Competitive Position" />
                {isVisible("typography") ? (
                  <>
                    <p className="text-sm text-foreground/80 leading-relaxed mb-4">
                      <TypewriterText text={kit.competitivePosition ?? "—"} active={isAnimating("typography")} longText speed={5} />
                    </p>
                    {kit.positioning && (
                      <div className="rounded-xl p-3 bg-white/[0.04] border border-white/[0.06]">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Positioning Statement</p>
                        <p className="text-xs text-foreground/80 leading-relaxed">{kit.positioning}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-2"><SkeletonLine /><SkeletonLine /><SkeletonLine w="70%" /></div>
                )}
              </Card>
            </div>
          </Section>

          {/* ── VISUAL STYLE RULES ────────────────────────────────────────── */}
          {kit.visualStyleRules && (
            <Section visible={isVisible("typography")} className="mb-6">
              <Card>
                <SectionHeading label="Visual Identity Rules" />
                {isVisible("typography") ? (
                  <p className="text-sm text-foreground/80 leading-relaxed">{kit.visualStyleRules}</p>
                ) : (
                  <div className="space-y-2"><SkeletonLine /><SkeletonLine /><SkeletonLine w="75%" /></div>
                )}
              </Card>
            </Section>
          )}

          {/* ── BRAND STORY ───────────────────────────────────────────────── */}
          <Section visible={isVisible("story")} className="mb-6">
            <div
              className="rounded-3xl overflow-hidden p-8 sm:p-10"
              style={{ background: `linear-gradient(160deg, ${primaryColor}0E 0%, ${secondaryColor}07 100%)`, border: `1px solid ${primaryColor}18` }}
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${primaryColor}20` }}>
                    <Quote className="w-3.5 h-3.5" style={{ color: primaryColor }} />
                  </div>
                  <span className="text-[11px] font-bold tracking-widest uppercase text-muted-foreground">Brand Story</span>
                </div>
                <button onClick={handleRegenerateStory} disabled={generatingStory}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/[0.08] text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-50">
                  <RefreshCw className={cn("w-3 h-3", generatingStory && "animate-spin")} />
                  {generatingStory ? "Regenerating…" : "Regenerate"}
                </button>
              </div>

              {isVisible("story") ? (
                <div className="space-y-5">
                  {(kit.brandStory ?? "").split("\n\n").filter(Boolean).map((para, i) => (
                    <p key={i} className={cn("leading-relaxed", i === 0 ? "text-lg font-medium text-foreground" : "text-sm text-foreground/80")}>
                      <TypewriterText text={para} active={isAnimating("story") && i === 0} longText speed={2} />
                    </p>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">{[100, 95, 88, 78].map((w, i) => <SkeletonLine key={i} w={`${w}%`} h="18px" />)}</div>
                  <div className="space-y-2">{[100, 90, 82].map((w, i) => <SkeletonLine key={i} w={`${w}%`} />)}</div>
                </div>
              )}
            </div>
          </Section>

          {/* ── CTA BLOCK ─────────────────────────────────────────────────── */}
          <Section visible={isVisible("cta")} className="mt-10">
            <div
              className="rounded-3xl p-8 sm:p-10 text-center"
              style={{ background: `linear-gradient(135deg, ${primaryColor}18 0%, ${secondaryColor}0E 100%)`, border: `1px solid ${primaryColor}20` }}
            >
              <div className="w-14 h-14 rounded-2xl mx-auto mb-5 flex items-center justify-center" style={{ backgroundColor: `${primaryColor}20` }}>
                <Sparkles className="w-7 h-7" style={{ color: primaryColor }} />
              </div>
              <h3 className="text-xl font-black text-foreground mb-2">Ready to launch your campaign?</h3>
              <p className="text-sm text-muted-foreground mb-7 max-w-md mx-auto">
                Use this brand identity to generate an AI-powered marketing campaign with platform-specific posts and on-brand visuals.
              </p>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <button onClick={() => navigate(`/brands/${brandId}/campaigns/new`)}
                  className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl font-bold text-sm text-primary-foreground hover:opacity-90 transition-opacity shadow-lg"
                  style={{ backgroundColor: primaryColor }}>
                  <Sparkles className="w-4 h-4" /> Launch Campaign Wizard
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button onClick={handleRegenerateKit} disabled={regeneratingKit}
                  className="inline-flex items-center gap-2 px-5 py-3.5 rounded-2xl font-semibold text-sm border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-50">
                  <RefreshCw className={cn("w-4 h-4", regeneratingKit && "animate-spin")} />
                  Regenerate Identity
                </button>
              </div>
            </div>
          </Section>

          <div className="h-10" />
        </div>
      )}
    </div>
  );
}
