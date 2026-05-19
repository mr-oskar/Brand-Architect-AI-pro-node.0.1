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
  CheckCircle2, Star, Clock, ChevronRight, Palette, Target,
  MessageSquare, Layers, TrendingUp, Users, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Tools & features data ──────────────────────────────────────────────────────

const TOOLS = [
  {
    icon: Sparkles,
    label: "Brand Kit Generator",
    desc: "AI builds your complete brand identity — personality, colors, tone of voice, and visual style.",
    href: "/brands/new",
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/20",
    cta: "Create Brand",
    badge: "Core",
    badgeColor: "bg-violet-500/15 text-violet-400",
  },
  {
    icon: Megaphone,
    label: "Campaign Generator",
    desc: "Generate a full multi-day social media campaign with strategy, captions, and hashtags.",
    href: null,
    color: "text-pink-400",
    bg: "bg-pink-500/10",
    border: "border-pink-500/20",
    cta: "Open a Brand",
    badge: "AI",
    badgeColor: "bg-pink-500/15 text-pink-400",
  },
  {
    icon: ImageIcon,
    label: "AI Image Generation",
    desc: "Create stunning on-brand visuals for every social post — with your logo and brand colors.",
    href: null,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
    cta: "Open a Campaign",
    badge: "AI",
    badgeColor: "bg-cyan-500/15 text-cyan-400",
  },
  {
    icon: FileText,
    label: "Social Post Writer",
    desc: "Platform-specific captions for Instagram, LinkedIn, X, Facebook, and TikTok.",
    href: null,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    cta: "Open a Campaign",
    badge: "AI",
    badgeColor: "bg-emerald-500/15 text-emerald-400",
  },
  {
    icon: BookOpen,
    label: "Brand Story",
    desc: "Let the AI craft your brand's narrative — mission, vision, and emotional positioning.",
    href: null,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    cta: "Open a Brand",
    badge: "AI",
    badgeColor: "bg-amber-500/15 text-amber-400",
  },
  {
    icon: Palette,
    label: "Logo Variants",
    desc: "Auto-generate black, white, and grayscale logo variants from your uploaded logo.",
    href: null,
    color: "text-sky-400",
    bg: "bg-sky-500/10",
    border: "border-sky-500/20",
    cta: "Open a Brand",
    badge: "Tools",
    badgeColor: "bg-sky-500/15 text-sky-400",
  },
  {
    icon: Wand2,
    label: "Long-form Content",
    desc: "Generate blog posts, emails, and newsletters aligned with your brand voice.",
    href: null,
    color: "text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/20",
    cta: "Open a Brand",
    badge: "AI",
    badgeColor: "bg-rose-500/15 text-rose-400",
  },
  {
    icon: Layers,
    label: "A/B Post Variants",
    desc: "Generate alternative versions of any post for split testing and optimization.",
    href: null,
    color: "text-indigo-400",
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/20",
    cta: "Open a Campaign",
    badge: "AI",
    badgeColor: "bg-indigo-500/15 text-indigo-400",
  },
  {
    icon: BarChart3,
    label: "Content Calendar",
    desc: "Plan and visualize your content schedule across all platforms in one view.",
    href: "/calendar",
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
    cta: "Coming Soon",
    badge: "Soon",
    badgeColor: "bg-orange-500/15 text-orange-400",
    soon: true,
  },
  {
    icon: Globe,
    label: "Asset Library",
    desc: "Store and organize all your brand assets, images, and generated content.",
    href: "/assets",
    color: "text-teal-400",
    bg: "bg-teal-500/10",
    border: "border-teal-500/20",
    cta: "Coming Soon",
    badge: "Soon",
    badgeColor: "bg-teal-500/15 text-teal-400",
    soon: true,
  },
];

const STEPS = [
  {
    n: "01",
    icon: Building2,
    title: "Create Your Brand",
    desc: "Enter your company name, industry, and upload your logo. The AI learns your brand DNA instantly.",
    color: "text-violet-400",
    bg: "bg-violet-500/10",
  },
  {
    n: "02",
    icon: Sparkles,
    title: "Generate Brand Kit",
    desc: "One click — the AI creates your complete brand identity: personality, tone, visual style, colors, and messaging pillars.",
    color: "text-pink-400",
    bg: "bg-pink-500/10",
  },
  {
    n: "03",
    icon: Megaphone,
    title: "Launch Campaigns",
    desc: "Generate a full social media campaign with posts, captions, hashtags, and AI visuals for every platform.",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
  },
];

const PRICING = [
  { action: "Generate Brand Kit", cost: 50, icon: Sparkles, color: "text-violet-400" },
  { action: "Generate Campaign", cost: 60, icon: Megaphone, color: "text-pink-400" },
  { action: "Generate Image", cost: 10, icon: ImageIcon, color: "text-cyan-400" },
  { action: "Regenerate Post", cost: 8, icon: FileText, color: "text-emerald-400" },
  { action: "Brand Story", cost: 10, icon: BookOpen, color: "text-amber-400" },
  { action: "A/B Variant", cost: 5, icon: Layers, color: "text-indigo-400" },
  { action: "Long-form Content", cost: 5, icon: Wand2, color: "text-rose-400" },
];

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color, bg, loading }: {
  label: string; value: number | string; icon: React.ElementType;
  color: string; bg: string; loading?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5 flex items-center gap-4">
      <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0", bg)}>
        <Icon className={cn("w-5 h-5", color)} />
      </div>
      <div>
        {loading ? (
          <div className="h-6 w-10 bg-white/10 rounded animate-pulse mb-1" />
        ) : (
          <p className="text-2xl font-bold text-foreground tabular-nums leading-none">{value}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
      </div>
    </div>
  );
}

// ── Tool card ─────────────────────────────────────────────────────────────────

function ToolCard({ tool }: { tool: typeof TOOLS[0] }) {
  const Icon = tool.icon;
  const inner = (
    <div className={cn(
      "group relative rounded-2xl border bg-white/[0.02] p-5 flex flex-col gap-4 transition-all duration-200 h-full",
      tool.border,
      tool.soon
        ? "opacity-60 cursor-default"
        : "hover:bg-white/[0.05] hover:border-white/10 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 cursor-pointer"
    )}>
      {/* Badge */}
      <span className={cn("absolute top-4 right-4 text-[10px] font-bold px-2 py-0.5 rounded-full", tool.badgeColor)}>
        {tool.badge}
      </span>

      {/* Icon */}
      <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center", tool.bg)}>
        <Icon className={cn("w-5 h-5", tool.color)} />
      </div>

      {/* Content */}
      <div className="flex-1">
        <h3 className="font-semibold text-sm text-foreground mb-1">{tool.label}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">{tool.desc}</p>
      </div>

      {/* CTA */}
      <div className={cn(
        "flex items-center gap-1 text-xs font-medium",
        tool.soon ? "text-muted-foreground/50" : tool.color
      )}>
        {tool.cta}
        {!tool.soon && <ChevronRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />}
      </div>
    </div>
  );

  if (tool.href && !tool.soon) {
    return <Link href={tool.href} className="h-full">{inner}</Link>;
  }
  return <div className="h-full">{inner}</div>;
}

// ── Main page ─────────────────────────────────────────────────────────────────

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
    <div className="min-h-screen pb-20">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-violet-950/40 via-background to-background pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-violet-500/8 rounded-full blur-3xl pointer-events-none" />

        <div className="relative px-6 pt-10 pb-12 max-w-7xl mx-auto">
          {/* Status pill */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-medium text-emerald-400">AI Agent Active</span>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
            <div className="max-w-2xl">
              <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-3 leading-tight">
                Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-pink-400">{displayName}</span>
              </h1>
              <p className="text-base text-muted-foreground leading-relaxed max-w-xl">
                Your AI-powered brand & marketing platform. Build complete brand identities, generate campaigns, and create stunning visuals — all in minutes.
              </p>
              <div className="flex items-center gap-3 mt-6 flex-wrap">
                <Link
                  href="/brands/new"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 text-white text-sm font-semibold hover:from-violet-500 hover:to-pink-500 transition-all shadow-lg shadow-violet-900/30"
                >
                  <PlusCircle className="w-4 h-4" />
                  Create New Brand
                </Link>
                {brandList.length > 0 && (
                  <Link
                    href={`/brands/${brandList[0].id}`}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/10 bg-white/5 text-sm font-medium text-foreground hover:bg-white/10 transition-all"
                  >
                    Open Last Brand
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
              </div>
            </div>

            {/* Credits pill */}
            <div className="flex-shrink-0">
              <div className={cn(
                "rounded-2xl border p-4 min-w-[160px]",
                isAdmin ? "border-emerald-500/20 bg-emerald-500/5" : "border-violet-500/20 bg-violet-500/5"
              )}>
                <div className={cn("flex items-center gap-2 mb-1", isAdmin ? "text-emerald-400" : "text-violet-400")}>
                  <Zap className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase tracking-wide">Credits</span>
                </div>
                <p className={cn("text-3xl font-bold", isAdmin ? "text-emerald-300" : "text-foreground")}>
                  {isAdmin ? "∞" : credits.toLocaleString()}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {isAdmin ? "Admin — unlimited" : "Available balance"}
                </p>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8">
            <StatCard label="Total Brands" value={summary?.totalBrands ?? 0} icon={Building2} color="text-violet-400" bg="bg-violet-500/10" loading={summaryLoading} />
            <StatCard label="Campaigns" value={summary?.totalCampaigns ?? 0} icon={Megaphone} color="text-pink-400" bg="bg-pink-500/10" loading={summaryLoading} />
            <StatCard label="Social Posts" value={summary?.totalPosts ?? 0} icon={FileText} color="text-cyan-400" bg="bg-cyan-500/10" loading={summaryLoading} />
            <StatCard label="AI Tools" value={10} icon={Star} color="text-amber-400" bg="bg-amber-500/10" />
          </div>
        </div>
      </div>

      <div className="px-6 max-w-7xl mx-auto space-y-16">

        {/* ── Recent Projects ──────────────────────────────────────────────── */}
        {brandList.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-foreground">Recent Projects</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Jump back into your brands</p>
              </div>
              <Link href="/" className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors">
                View all <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {brandList.map((brand) => (
                <Link
                  key={brand.id}
                  href={`/brands/${brand.id}`}
                  className="group rounded-2xl border border-white/5 bg-white/[0.02] p-4 hover:bg-white/[0.05] hover:border-white/10 transition-all flex flex-col gap-3"
                >
                  <div className="flex items-center gap-3">
                    {brand.logoUrl ? (
                      <img src={brand.logoUrl} alt={brand.companyName} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-5 h-5 text-violet-400" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-foreground truncate">{brand.companyName}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{brand.industry}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                      brand.status === "active" ? "bg-emerald-500/10 text-emerald-400" :
                      brand.status === "kit_ready" ? "bg-blue-500/10 text-blue-400" :
                      "bg-white/5 text-muted-foreground"
                    )}>
                      {brand.status === "kit_ready" ? "Kit Ready" : brand.status === "active" ? "Active" : "Draft"}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                </Link>
              ))}
              {/* New brand CTA */}
              <Link
                href="/brands/new"
                className="group rounded-2xl border border-dashed border-white/10 bg-transparent p-4 hover:bg-white/[0.03] hover:border-white/20 transition-all flex flex-col items-center justify-center gap-2 min-h-[100px]"
              >
                <div className="w-9 h-9 rounded-xl border-2 border-dashed border-white/20 flex items-center justify-center group-hover:border-primary/40 transition-colors">
                  <PlusCircle className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">New Brand</span>
              </Link>
            </div>
          </section>
        )}

        {/* ── AI Tools Grid ────────────────────────────────────────────────── */}
        <section>
          <div className="mb-6">
            <h2 className="text-lg font-bold text-foreground">AI Tools & Features</h2>
            <p className="text-sm text-muted-foreground mt-1">Everything you need to build and scale your brand</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {TOOLS.map((tool) => (
              <ToolCard key={tool.label} tool={tool} />
            ))}
            {/* Empty state if no brands */}
            {brandList.length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed border-white/10 p-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-8 h-8 text-violet-400" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Start with your first brand</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                  Create a brand to unlock all AI tools — campaigns, images, content, and more.
                </p>
                <Link
                  href="/brands/new"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 text-white text-sm font-semibold hover:from-violet-500 hover:to-pink-500 transition-all"
                >
                  <PlusCircle className="w-4 h-4" />
                  Create Your First Brand
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <section>
          <div className="mb-8 text-center">
            <h2 className="text-lg font-bold text-foreground">How it Works</h2>
            <p className="text-sm text-muted-foreground mt-1">From zero to a complete brand in three steps</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 relative">
            {/* Connector line */}
            <div className="hidden sm:block absolute top-10 left-[calc(33%+24px)] right-[calc(33%+24px)] h-px bg-gradient-to-r from-white/10 via-white/20 to-white/10" />

            {STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.n} className="flex flex-col items-center text-center gap-4">
                  <div className="relative">
                    <div className={cn("w-20 h-20 rounded-2xl flex items-center justify-center border border-white/10", step.bg)}>
                      <Icon className={cn("w-8 h-8", step.color)} />
                    </div>
                    <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-background border border-white/10 flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                      {step.n}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-foreground mb-1.5">{step.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed max-w-[220px] mx-auto">{step.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-10 flex justify-center">
            <Link
              href="/brands/new"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 text-white text-sm font-semibold hover:from-violet-500 hover:to-pink-500 transition-all shadow-lg shadow-violet-900/20"
            >
              <Sparkles className="w-4 h-4" />
              Get Started — Create a Brand
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>

        {/* ── Credit Pricing ───────────────────────────────────────────────── */}
        <section>
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
            <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-base font-bold text-foreground">Credit Pricing</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Each AI action costs a small number of credits</p>
              </div>
              <div className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-medium",
                isAdmin
                  ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                  : "border-violet-500/20 bg-violet-500/5 text-violet-400"
              )}>
                <Zap className="w-3.5 h-3.5" />
                {isAdmin ? "Unlimited (Admin)" : `${credits.toLocaleString()} credits available`}
              </div>
            </div>
            <div className="divide-y divide-white/5">
              {PRICING.map((p) => {
                const Icon = p.icon;
                const canAfford = isAdmin || credits >= p.cost;
                return (
                  <div key={p.action} className="flex items-center justify-between px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <Icon className={cn("w-4 h-4", p.color)} />
                      <span className="text-sm text-foreground">{p.action}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-sm font-semibold tabular-nums",
                        canAfford ? "text-foreground" : "text-red-400/70"
                      )}>
                        {p.cost}
                      </span>
                      <span className="text-xs text-muted-foreground">credits</span>
                      {canAfford ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/60" />
                      ) : (
                        <span className="text-[10px] text-red-400/60 font-medium">Low</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-6 py-4 bg-white/[0.02] border-t border-white/5">
              <p className="text-xs text-muted-foreground text-center">
                Credits are refunded automatically if an AI operation fails. First registered user gets admin (unlimited) access.
              </p>
            </div>
          </div>
        </section>

        {/* ── Features highlights ──────────────────────────────────────────── */}
        <section>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: Shield, label: "Secure by Design", desc: "JWT auth, rate limiting, and credit guards protect every action.", color: "text-emerald-400", bg: "bg-emerald-500/10" },
              { icon: Zap, label: "Instant Generation", desc: "Most AI operations complete in seconds. Background jobs for long tasks.", color: "text-amber-400", bg: "bg-amber-500/10" },
              { icon: Users, label: "Multi-brand Support", desc: "Manage unlimited brand workspaces, each with its own identity and campaigns.", color: "text-violet-400", bg: "bg-violet-500/10" },
              { icon: Target, label: "Platform-specific Content", desc: "Posts tailored for Instagram, LinkedIn, X, Facebook, and TikTok.", color: "text-pink-400", bg: "bg-pink-500/10" },
              { icon: MessageSquare, label: "Consistent Brand Voice", desc: "Every piece of content aligns with your brand personality and tone.", color: "text-cyan-400", bg: "bg-cyan-500/10" },
              { icon: TrendingUp, label: "Growing Feature Set", desc: "Asset Library, Content Calendar, and Templates are on the roadmap.", color: "text-sky-400", bg: "bg-sky-500/10" },
            ].map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.label} className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 flex gap-4">
                  <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5", f.bg)}>
                    <Icon className={cn("w-4.5 h-4.5", f.color)} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-foreground mb-1">{f.label}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

      </div>
    </div>
  );
}
