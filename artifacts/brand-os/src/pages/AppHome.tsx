import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  useGetDashboardSummary,
  useListBrands,
  getGetDashboardSummaryQueryKey,
  getListBrandsQueryKey,
} from "@workspace/api-client-react";
import {
  Sparkles, PlusCircle, ArrowRight, Building2, Megaphone, FileText,
  Image as ImageIcon, BookOpen, Zap, Wand2, BarChart3, Globe,
  CheckCircle2, Palette, Target, MessageSquare, Layers, Shield,
  TrendingUp, Users, Clock, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────────────────────

const TOOLS = [
  { icon: Sparkles,   label: "Brand Kit Generator",    desc: "AI builds your complete brand identity — personality, colors, tone of voice, and visual style in one click.", href: "/brands/new", cta: "Create Brand" },
  { icon: Megaphone,  label: "Campaign Generator",      desc: "Generate a full multi-day social media campaign with strategy, captions, and hashtags per platform.", href: null, cta: "Open a Brand" },
  { icon: ImageIcon,  label: "AI Image Generation",     desc: "Create stunning on-brand visuals for every social post — with your logo and brand colors embedded.", href: null, cta: "Open a Campaign" },
  { icon: FileText,   label: "Social Post Writer",      desc: "Platform-specific captions for Instagram, LinkedIn, X, Facebook, and TikTok — all on-brand.", href: null, cta: "Open a Campaign" },
  { icon: BookOpen,   label: "Brand Story",             desc: "Let the AI craft your brand's narrative — mission, vision, and emotional positioning.", href: null, cta: "Open a Brand" },
  { icon: Palette,    label: "Logo Variants",           desc: "Auto-generate black, white, and grayscale logo variants from your uploaded logo instantly.", href: null, cta: "Open a Brand" },
  { icon: Wand2,      label: "Long-form Content",       desc: "Generate blog posts, emails, and newsletters that are perfectly aligned with your brand voice.", href: null, cta: "Open a Brand" },
  { icon: Layers,     label: "A/B Post Variants",       desc: "Generate alternative versions of any social post for split testing and campaign optimisation.", href: null, cta: "Open a Campaign" },
  { icon: BarChart3,  label: "Content Calendar",        desc: "Plan and visualize your content schedule across all platforms in one unified view. Coming soon.", href: "/calendar", cta: "Coming Soon" },
  { icon: Globe,      label: "Asset Library",           desc: "Store and organise all your brand assets, generated images, and content in one searchable place.", href: "/assets", cta: "Coming Soon" },
];

const FEATURES = [
  {
    icon: Shield,
    title: "Secure by Design",
    desc: "Every request is protected by JWT authentication, rate limiting, and per-action credit guards. Your data stays yours.",
    detail: "HTTP-only cookies · bcrypt passwords · slowapi rate limiter · credit refund on failure",
  },
  {
    icon: Zap,
    title: "Instant AI Generation",
    desc: "Most operations complete in seconds. Long tasks run as background jobs so you keep working without waiting.",
    detail: "Brand Kit ~10s · Campaign ~30s · Image ~15s · Background polling with live progress",
  },
  {
    icon: Users,
    title: "Multi-brand Workspaces",
    desc: "Manage unlimited brand workspaces from one account. Each brand has its own identity, campaigns, and assets.",
    detail: "Isolated brand context · Shared credit pool · Per-brand stats and history",
  },
  {
    icon: Target,
    title: "Platform-specific Content",
    desc: "Every post is tailored for its target platform — tone, length, hashtags, and format adapted automatically.",
    detail: "Instagram · LinkedIn · X (Twitter) · Facebook · TikTok",
  },
  {
    icon: MessageSquare,
    title: "Consistent Brand Voice",
    desc: "The AI learns your brand personality, tone, and audience from your Brand Kit and applies it across every output.",
    detail: "Tone of voice · Messaging pillars · Target audience · Brand personality archetypes",
  },
  {
    icon: TrendingUp,
    title: "Growing Feature Set",
    desc: "Asset Library, Content Calendar, and Templates are actively being built. Credits never expire.",
    detail: "Asset Library · Content Calendar · Templates · Export tools — all coming soon",
  },
];

const PRICING = [
  { action: "Brand Kit",      cost: 50, icon: Sparkles },
  { action: "Campaign",       cost: 60, icon: Megaphone },
  { action: "Generate Image", cost: 10, icon: ImageIcon },
  { action: "Regenerate Post",cost: 8,  icon: FileText },
  { action: "Brand Story",    cost: 10, icon: BookOpen },
  { action: "A/B Variant",    cost: 5,  icon: Layers },
  { action: "Long-form",      cost: 5,  icon: Wand2 },
  { action: "Logo Variants",  cost: 0,  icon: Palette },
];

// ─────────────────────────────────────────────────────────────────────────────
// Pricing ticker — infinite horizontal scroll
// ─────────────────────────────────────────────────────────────────────────────

function PricingTicker({ isAdmin, credits }: { isAdmin: boolean; credits: number }) {
  const items = [...PRICING, ...PRICING]; // duplicate for seamless loop

  return (
    <div className="relative overflow-hidden select-none">
      {/* fade edges */}
      <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />

      <div className="flex gap-3 w-max animate-ticker hover:[animation-play-state:paused]">
        {items.map((p, i) => {
          const Icon = p.icon;
          const canAfford = isAdmin || p.cost === 0 || credits >= p.cost;
          return (
            <div
              key={i}
              className="flex items-center gap-3 px-5 py-3.5 rounded-2xl border border-white/8 bg-white/[0.03] flex-shrink-0 min-w-[170px]"
            >
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground/70 leading-none mb-1">{p.action}</p>
                <p className={cn("text-base font-bold tabular-nums leading-none", canAfford ? "text-foreground" : "text-destructive/70")}>
                  {p.cost === 0 ? "Free" : `${p.cost}`}
                  {p.cost !== 0 && <span className="text-[10px] font-normal text-muted-foreground ml-1">cr</span>}
                </p>
              </div>
              {canAfford && p.cost > 0 && <CheckCircle2 className="w-3.5 h-3.5 text-primary/40 ml-auto" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tools drag-scroll carousel
// ─────────────────────────────────────────────────────────────────────────────

function ToolsCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const el = trackRef.current;
    if (!el) return;
    isDragging.current = true;
    startX.current = e.pageX - el.offsetLeft;
    scrollLeft.current = el.scrollLeft;
    el.style.cursor = "grabbing";
    el.style.userSelect = "none";
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || !trackRef.current) return;
    e.preventDefault();
    const x = e.pageX - trackRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.2;
    trackRef.current.scrollLeft = scrollLeft.current - walk;
  }, []);

  const stopDrag = useCallback(() => {
    isDragging.current = false;
    if (trackRef.current) {
      trackRef.current.style.cursor = "grab";
      trackRef.current.style.userSelect = "";
    }
  }, []);

  // Touch support
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const el = trackRef.current;
    if (!el) return;
    isDragging.current = true;
    startX.current = e.touches[0].pageX - el.offsetLeft;
    scrollLeft.current = el.scrollLeft;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || !trackRef.current) return;
    const x = e.touches[0].pageX - trackRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.2;
    trackRef.current.scrollLeft = scrollLeft.current - walk;
  }, []);

  return (
    <div className="relative">
      {/* Fade edges */}
      <div className="absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none rounded-l-2xl" />
      <div className="absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none rounded-r-2xl" />

      <div
        ref={trackRef}
        className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 cursor-grab active:cursor-grabbing"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={stopDrag}
      >
        {/* Spacer */}
        <div className="flex-shrink-0 w-4" />

        {TOOLS.map((tool, i) => {
          const Icon = tool.icon;
          const isSoon = tool.cta === "Coming Soon";
          const inner = (
            <div className={cn(
              "flex flex-col gap-4 p-5 rounded-2xl border border-white/8 bg-white/[0.03]",
              "w-[220px] flex-shrink-0 h-full select-none",
              "transition-all duration-200",
              isSoon
                ? "opacity-50"
                : "hover:border-primary/30 hover:bg-primary/[0.04] hover:shadow-lg hover:shadow-primary/5"
            )}>
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm text-foreground mb-1.5 leading-snug">{tool.label}</p>
                <p className="text-[12px] text-muted-foreground leading-relaxed">{tool.desc}</p>
              </div>
              <div className={cn(
                "flex items-center gap-1 text-[12px] font-medium",
                isSoon ? "text-muted-foreground/40" : "text-primary/80"
              )}>
                {tool.cta}
                {!isSoon && <ChevronRight className="w-3 h-3" />}
              </div>
            </div>
          );

          if (tool.href && !isSoon) {
            return (
              <Link key={i} href={tool.href} className="flex-shrink-0 h-full" draggable={false}>
                {inner}
              </Link>
            );
          }
          return <div key={i} className="flex-shrink-0">{inner}</div>;
        })}

        {/* Spacer */}
        <div className="flex-shrink-0 w-4" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Features ad-screen rotator
// ─────────────────────────────────────────────────────────────────────────────

function FeaturesRotator() {
  const [active, setActive] = useState(0);
  const [animating, setAnimating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goTo = useCallback((index: number) => {
    if (animating) return;
    setAnimating(true);
    setTimeout(() => {
      setActive(index);
      setAnimating(false);
    }, 350);
  }, [animating]);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      goTo((active + 1) % FEATURES.length);
    }, 4500);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [active, goTo]);

  const f = FEATURES[active];
  const Icon = f.icon;

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] overflow-hidden">
      {/* Main display */}
      <div className="relative min-h-[260px] flex flex-col items-center justify-center px-8 py-10 text-center">
        {/* Background glow */}
        <div
          className="absolute inset-0 opacity-30 pointer-events-none transition-opacity duration-700"
          style={{ background: "radial-gradient(ellipse at 50% 0%, hsl(var(--primary) / 0.15) 0%, transparent 70%)" }}
        />

        {/* Content */}
        <div
          className="relative z-10 transition-all duration-350"
          style={{
            opacity: animating ? 0 : 1,
            transform: animating ? "translateY(12px)" : "translateY(0)",
          }}
        >
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-5">
            <Icon className="w-7 h-7 text-primary" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-3">{f.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto mb-4">{f.desc}</p>
          <p className="text-[11px] text-muted-foreground/50 font-mono">{f.detail}</p>
        </div>
      </div>

      {/* Progress dots + labels */}
      <div className="border-t border-white/5 px-6 py-4">
        <div className="flex items-center justify-between gap-2">
          {FEATURES.map((feat, i) => {
            const FIcon = feat.icon;
            const isActive = i === active;
            return (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={cn(
                  "group flex flex-col items-center gap-1.5 flex-1 transition-all duration-300",
                  isActive ? "opacity-100" : "opacity-30 hover:opacity-60"
                )}
              >
                <div className={cn(
                  "w-7 h-7 rounded-xl flex items-center justify-center transition-all duration-300",
                  isActive ? "bg-primary/20 border border-primary/30" : "bg-white/5"
                )}>
                  <FIcon className={cn("w-3.5 h-3.5", isActive ? "text-primary" : "text-muted-foreground")} />
                </div>
                {/* Progress bar under active */}
                <div className={cn(
                  "h-0.5 w-full rounded-full transition-all duration-300",
                  isActive ? "bg-primary" : "bg-white/10"
                )}>
                  {isActive && (
                    <div
                      className="h-full bg-primary/50 rounded-full origin-left"
                      style={{ animation: "progress-bar 4.5s linear forwards" }}
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stat card
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, loading }: {
  label: string; value: number | string; icon: React.ElementType; loading?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4.5 h-4.5 text-primary" />
      </div>
      <div>
        {loading ? (
          <div className="h-5 w-8 bg-white/10 rounded animate-pulse mb-1" />
        ) : (
          <p className="text-xl font-bold text-foreground tabular-nums leading-none">{value}</p>
        )}
        <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function AppHome() {
  const { user } = useAuth();
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() },
  });
  const { data: brands, isLoading: brandsLoading } = useListBrands({
    query: { queryKey: getListBrandsQueryKey() },
  });

  const displayName = user?.name || user?.email?.split("@")[0] || "there";
  const credits = user?.credits ?? 0;
  const isAdmin = user?.role === "admin";
  const brandList = Array.isArray(brands) ? brands.slice(0, 4) : [];

  return (
    <>
      {/* Inject keyframes */}
      <style>{`
        @keyframes ticker {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-ticker {
          animation: ticker 28s linear infinite;
        }
        @keyframes progress-bar {
          from { width: 0%; }
          to   { width: 100%; }
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .transition-all.duration-350 { transition-duration: 350ms; }
      `}</style>

      <div className="min-h-screen pb-20">

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-primary/6 rounded-full blur-3xl pointer-events-none" />

          <div className="relative px-6 pt-10 pb-10 max-w-6xl mx-auto">
            {/* Status */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-medium text-primary/80">AI Agent Active</span>
            </div>

            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
              <div className="max-w-xl">
                <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-3 leading-tight">
                  Welcome back,{" "}
                  <span className="text-primary">{displayName}</span>
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  AI-powered brand & marketing platform. Build complete brand identities, generate campaigns, and create stunning visuals — all in minutes.
                </p>
                <div className="flex items-center gap-3 mt-6 flex-wrap">
                  <Link
                    href="/brands/new"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                  >
                    <PlusCircle className="w-4 h-4" />
                    Create New Brand
                  </Link>
                  {brandList.length > 0 && (
                    <Link
                      href={`/brands/${brandList[0].id}`}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/10 bg-white/5 text-sm font-medium text-foreground hover:bg-white/8 transition-all"
                    >
                      Open Last Brand
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  )}
                </div>
              </div>

              {/* Credits */}
              <div className="flex-shrink-0">
                <div className={cn(
                  "rounded-2xl border p-4 min-w-[150px]",
                  isAdmin ? "border-primary/20 bg-primary/5" : "border-white/8 bg-white/[0.03]"
                )}>
                  <div className="flex items-center gap-2 text-primary mb-1">
                    <Zap className="w-4 h-4" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest">Credits</span>
                  </div>
                  <p className="text-3xl font-bold text-foreground">
                    {isAdmin ? "∞" : credits.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {isAdmin ? "Admin — unlimited" : "Available"}
                  </p>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8">
              <StatCard label="Total Brands"  value={summary?.totalBrands ?? 0}    icon={Building2}  loading={summaryLoading} />
              <StatCard label="Campaigns"     value={summary?.totalCampaigns ?? 0} icon={Megaphone}  loading={summaryLoading} />
              <StatCard label="Social Posts"  value={summary?.totalPosts ?? 0}     icon={FileText}   loading={summaryLoading} />
              <StatCard label="AI Tools"      value={10}                           icon={Sparkles} />
            </div>
          </div>
        </div>

        <div className="px-6 max-w-6xl mx-auto space-y-14">

          {/* ── Recent Projects ──────────────────────────────────────────── */}
          {(brandList.length > 0 || !brandsLoading) && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-foreground">Recent Projects</h2>
                <span className="text-xs text-muted-foreground">{brands?.length ?? 0} total</span>
              </div>

              {brandsLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[1,2,3,4].map(i => (
                    <div key={i} className="h-[88px] rounded-2xl bg-white/5 animate-pulse" />
                  ))}
                </div>
              ) : brandList.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <Sparkles className="w-6 h-6 text-primary" />
                  </div>
                  <p className="font-semibold text-foreground mb-1">No brands yet</p>
                  <p className="text-sm text-muted-foreground mb-5 max-w-xs mx-auto">
                    Create your first brand and let AI build a complete identity and strategy.
                  </p>
                  <Link
                    href="/brands/new"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-all"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    Create First Brand
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {brandList.map((brand) => (
                    <Link
                      key={brand.id}
                      href={`/brands/${brand.id}`}
                      className="group rounded-2xl border border-white/8 bg-white/[0.02] p-4 hover:border-primary/25 hover:bg-primary/[0.03] transition-all"
                    >
                      <div className="flex items-center gap-2.5 mb-3">
                        {brand.logoUrl ? (
                          <img src={brand.logoUrl} alt={brand.companyName} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Building2 className="w-4 h-4 text-primary" />
                          </div>
                        )}
                        <p className="font-semibold text-sm text-foreground truncate flex-1">{brand.companyName}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                          brand.status === "active"    ? "bg-primary/10 text-primary" :
                          brand.status === "kit_ready" ? "bg-primary/10 text-primary/70" :
                          "bg-white/5 text-muted-foreground"
                        )}>
                          {brand.status === "kit_ready" ? "Kit Ready" : brand.status === "active" ? "Active" : "Draft"}
                        </span>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                          <Clock className="w-3 h-3" />
                          {new Date(brand.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </Link>
                  ))}
                  {/* New brand slot */}
                  <Link
                    href="/brands/new"
                    className="group rounded-2xl border border-dashed border-white/10 bg-transparent p-4 hover:border-primary/30 hover:bg-primary/[0.02] transition-all flex flex-col items-center justify-center gap-2 min-h-[88px]"
                  >
                    <PlusCircle className="w-5 h-5 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                    <span className="text-[11px] text-muted-foreground/40 group-hover:text-muted-foreground transition-colors">New Brand</span>
                  </Link>
                </div>
              )}
            </section>
          )}

          {/* ── AI Tools (drag scroll) ───────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-4 px-0">
              <div>
                <h2 className="text-base font-bold text-foreground">AI Tools</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Drag to explore all {TOOLS.length} tools</p>
              </div>
              <Link href="/brands/new" className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors">
                Get started <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <ToolsCarousel />
          </section>

          {/* ── Features rotator ─────────────────────────────────────────── */}
          <section>
            <div className="mb-4">
              <h2 className="text-base font-bold text-foreground">Platform Features</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Click any icon or wait for the auto-tour</p>
            </div>
            <FeaturesRotator />
          </section>

          {/* ── Credit pricing ticker ─────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-foreground">Credit Pricing</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Each AI action costs a small number of credits</p>
              </div>
              <div className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium",
                isAdmin
                  ? "border-primary/20 bg-primary/5 text-primary"
                  : "border-white/8 bg-white/[0.03] text-muted-foreground"
              )}>
                <Zap className="w-3 h-3" />
                {isAdmin ? "Unlimited" : `${credits.toLocaleString()} available`}
              </div>
            </div>
            <PricingTicker isAdmin={isAdmin} credits={credits} />
            <p className="text-center text-[11px] text-muted-foreground/40 mt-4">
              Credits are automatically refunded if an AI operation fails · First registered user is Admin (unlimited)
            </p>
          </section>

          {/* ── How it works ─────────────────────────────────────────────── */}
          <section>
            <div className="mb-8 text-center">
              <h2 className="text-base font-bold text-foreground">How it Works</h2>
              <p className="text-xs text-muted-foreground mt-1">From zero to a complete brand in three steps</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 relative">
              <div className="hidden sm:block absolute top-9 left-[calc(33%+20px)] right-[calc(33%+20px)] h-px bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20" />
              {[
                { n: "01", icon: Building2,  title: "Create Your Brand",   desc: "Enter your company name, industry, and upload your logo. The AI learns your brand DNA instantly." },
                { n: "02", icon: Sparkles,   title: "Generate Brand Kit",  desc: "One click — the AI creates your complete brand identity: personality, tone, colors, and messaging." },
                { n: "03", icon: Megaphone,  title: "Launch Campaigns",    desc: "Generate a full social media campaign with posts, captions, hashtags, and AI visuals per platform." },
              ].map((step) => {
                const Icon = step.icon;
                return (
                  <div key={step.n} className="flex flex-col items-center text-center gap-3">
                    <div className="relative">
                      <div className="w-18 h-18 rounded-2xl bg-primary/8 border border-primary/15 flex items-center justify-center">
                        <Icon className="w-7 h-7 text-primary" />
                      </div>
                      <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-background border border-white/15 flex items-center justify-center text-[9px] font-bold text-muted-foreground">
                        {step.n}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-foreground mb-1">{step.title}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed max-w-[200px] mx-auto">{step.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-center mt-8">
              <Link
                href="/brands/new"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
              >
                <Sparkles className="w-4 h-4" />
                Start Building
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </section>

        </div>
      </div>
    </>
  );
}
