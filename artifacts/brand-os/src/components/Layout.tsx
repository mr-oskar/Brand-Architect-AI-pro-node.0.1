import { Link, useLocation } from "wouter";
import {
  Sparkles, PlusCircle, Menu, X,
  ChevronRight, LogOut, Building2, Loader2,
  Zap, Shield, LayoutDashboard, Home,
  FileText, BarChart3, Layers, Settings, Key, TrendingUp,
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useSiteSettings } from "@/contexts/SiteSettingsContext";
import {
  getGetDashboardSummaryQueryKey,
  getListBrandsQueryKey,
  useListBrands,
} from "@workspace/api-client-react";

// ── Data prefetch ─────────────────────────────────────────────────────────────

function usePrefetchCoreData() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    const prefetchIfMissing = async (queryKey: readonly unknown[], url: string) => {
      if (queryClient.getQueryData(queryKey)) return;
      try {
        const res = await fetch(`${baseUrl}${url}`);
        if (res.ok) queryClient.setQueryData(queryKey, await res.json());
      } catch {}
    };
    prefetchIfMissing(getGetDashboardSummaryQueryKey(), "/api/dashboard/summary");
    prefetchIfMissing(getListBrandsQueryKey(), "/api/brands");
  }, [queryClient]);
}

// ── Nav item ──────────────────────────────────────────────────────────────────

function NavItem({
  href,
  icon: Icon,
  label,
  onClick,
  exact = false,
  externalHref,
}: {
  href?: string;
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
  exact?: boolean;
  externalHref?: string;
}) {
  const [location] = useLocation();

  const isActive = href
    ? exact
      ? location === href
      : location === href || location.startsWith(href + "/")
    : false;

  const cls = cn(
    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all group w-full",
    isActive
      ? "bg-primary/10 text-primary"
      : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
  );

  if (externalHref) {
    return (
      <a href={externalHref} target="_blank" rel="noopener noreferrer" className={cls} onClick={onClick}>
        <Icon className={cn("w-4 h-4 flex-shrink-0", isActive ? "text-primary" : "")} />
        <span className="flex-1">{label}</span>
      </a>
    );
  }

  return (
    <Link href={href!} onClick={onClick} className={cls}>
      <Icon className={cn("w-4 h-4 flex-shrink-0", isActive ? "text-primary" : "")} />
      <span className="flex-1">{label}</span>
      {isActive && <ChevronRight className="w-3 h-3 text-primary/60 flex-shrink-0" />}
    </Link>
  );
}

// ── Projects (brands) list ────────────────────────────────────────────────────

function ProjectsList({ onNavigate }: { onNavigate: () => void }) {
  const [location] = useLocation();
  const { data: brands, isLoading } = useListBrands({
    query: { staleTime: 1000 * 60 * 2, queryKey: getListBrandsQueryKey() },
  });

  const brandList = Array.isArray(brands) ? brands : [];

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5">
        <Loader2 className="w-3 h-3 animate-spin text-sidebar-foreground/30" />
        <span className="text-[11px] text-sidebar-foreground/30">Loading...</span>
      </div>
    );
  }

  if (brandList.length === 0) {
    return (
      <Link
        href="/brands/new"
        onClick={onNavigate}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] text-sidebar-foreground/40 hover:text-primary hover:bg-primary/5 transition-all border border-dashed border-white/10 hover:border-primary/20 mx-0.5"
      >
        <PlusCircle className="w-3.5 h-3.5 flex-shrink-0" />
        <span>Create first brand</span>
      </Link>
    );
  }

  return (
    <div className="space-y-0.5">
      {brandList.map((brand: any) => {
        const href = `/brands/${brand.id}`;
        const active = location === href || location.startsWith(`/brands/${brand.id}/`);
        const name = brand.companyName || brand.company_name || "Untitled";
        const initials = name
          .split(" ")
          .slice(0, 2)
          .map((w: string) => w[0])
          .join("")
          .toUpperCase();

        return (
          <Link
            key={brand.id}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all group",
              active
                ? "bg-primary/10 text-primary"
                : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )}
          >
            {brand.logoUrl ? (
              <img
                src={brand.logoUrl}
                alt={name}
                className="w-5 h-5 rounded-md object-cover flex-shrink-0 border border-white/10"
              />
            ) : (
              <div className={cn(
                "w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold flex-shrink-0",
                active ? "bg-primary/20 text-primary" : "bg-sidebar-accent text-sidebar-foreground/60"
              )}>
                {initials}
              </div>
            )}
            <span className="flex-1 truncate">{name}</span>
            {active && <ChevronRight className="w-3 h-3 text-primary/60 flex-shrink-0" />}
          </Link>
        );
      })}
    </div>
  );
}

// ── User profile + credits ────────────────────────────────────────────────────

function UserProfile({ onNavigate }: { onNavigate: () => void }) {
  const { user, signOut, refresh } = useAuth();
  if (!user) return null;

  const displayName = user.name || user.email.split("@")[0] || "User";
  const initials = (user.name?.[0] ?? user.email[0] ?? "U").toUpperCase();
  const credits = user.credits ?? 0;
  const isAdmin = user.role === "admin";
  const lowCredits = !isAdmin && credits <= 20;

  return (
    <div className="px-3 pt-3 border-t border-sidebar-border/60 mt-2 space-y-1">
      {/* User info */}
      <div className="flex items-center gap-2.5 px-1 py-1 mb-1">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-primary flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-sidebar-foreground leading-none truncate">{displayName}</p>
          <p className="text-[10px] text-sidebar-foreground/40 mt-0.5 truncate">{user.email}</p>
        </div>
        {isAdmin && (
          <span className="text-[9px] font-bold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">
            ADMIN
          </span>
        )}
      </div>

      {/* Credits badge */}
      <button
        onClick={() => refresh()}
        title="Your available credits — click to refresh"
        className={cn(
          "w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg transition-colors",
          isAdmin
            ? "bg-emerald-500/10 hover:bg-emerald-500/15"
            : lowCredits
            ? "bg-amber-500/10 hover:bg-amber-500/15"
            : "bg-primary/10 hover:bg-primary/15"
        )}
      >
        <span className={cn(
          "flex items-center gap-1.5 text-[11px] font-medium",
          isAdmin ? "text-emerald-500" : lowCredits ? "text-amber-500" : "text-primary"
        )}>
          <Zap className="w-3 h-3" />
          {isAdmin ? "Unlimited credits" : `${credits.toLocaleString()} credits`}
        </span>
        {!isAdmin && lowCredits && (
          <span className="text-[9px] text-amber-500/70">Low</span>
        )}
      </button>

      {/* Sign Out */}
      <button
        onClick={() => { onNavigate(); signOut(); }}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] text-sidebar-foreground/50 hover:bg-red-500/10 hover:text-red-400 transition-colors group"
      >
        <LogOut className="w-3.5 h-3.5 group-hover:text-red-400" />
        Sign Out
      </button>
    </div>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9px] font-semibold text-sidebar-foreground/30 uppercase tracking-widest px-2 mb-1">
      {children}
    </p>
  );
}

// ── Main Layout ───────────────────────────────────────────────────────────────

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { settings } = useSiteSettings();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  usePrefetchCoreData();

  const closeMobile = () => setMobileOpen(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  return (
    <div className="min-h-screen bg-background flex">

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-60 flex flex-col transition-transform duration-200",
        "bg-sidebar border-r border-sidebar-border",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>

        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-sidebar-border gap-3 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-primary flex items-center justify-center shadow-sm flex-shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[13px] text-sidebar-foreground tracking-tight leading-none truncate">
              {settings.siteName}
            </p>
            <p className="text-[9px] text-sidebar-foreground/40 font-medium mt-0.5 uppercase tracking-wider truncate">
              {settings.tagline}
            </p>
          </div>
          <button
            className="lg:hidden text-sidebar-foreground/50 hover:text-sidebar-foreground p-1"
            onClick={closeMobile}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2.5 py-3 overflow-y-auto space-y-5">

          {/* ── Pages ────────────────────────────────────────────────────── */}
          <div>
            <SectionLabel>Pages</SectionLabel>
            <div className="space-y-0.5">
              <NavItem href="/" icon={Home} label="Home" onClick={closeMobile} exact />
              <NavItem href="/dashboard" icon={LayoutDashboard} label="Dashboard" onClick={closeMobile} />
              <NavItem href="/assets" icon={Layers} label="Asset Library" onClick={closeMobile} />
              <NavItem href="/calendar" icon={BarChart3} label="Content Calendar" onClick={closeMobile} />
              <NavItem href="/templates" icon={FileText} label="Templates" onClick={closeMobile} />
            </div>
          </div>

          {/* ── Projects ─────────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between px-2 mb-1">
              <SectionLabel>Projects</SectionLabel>
              <Link
                href="/brands/new"
                onClick={closeMobile}
                className="text-sidebar-foreground/30 hover:text-primary transition-colors p-0.5 rounded"
                title="New brand"
              >
                <PlusCircle className="w-3 h-3" />
              </Link>
            </div>
            <ProjectsList onNavigate={closeMobile} />
          </div>

          {/* ── Admin ────────────────────────────────────────────────────── */}
          {isAdmin && (
            <div>
              <SectionLabel>Admin</SectionLabel>
              <div className="space-y-0.5">
                <NavItem href="/admin/api-keys"        icon={Key}         label="API Keys"      onClick={closeMobile} />
                <NavItem href="/admin/cost-dashboard"  icon={TrendingUp}  label="Cost Monitor"  onClick={closeMobile} />
                <NavItem externalHref="/api/docs"      icon={Shield}      label="API Docs"      onClick={closeMobile} />
              </div>
            </div>
          )}

        </nav>

        {/* User profile */}
        <div className="flex-shrink-0 pb-2">
          <UserProfile onNavigate={closeMobile} />
        </div>
      </aside>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={closeMobile}
        />
      )}

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="flex-1 lg:ml-60 flex flex-col min-h-screen">
        {/* Mobile header */}
        <header className="lg:hidden h-12 border-b border-border flex items-center px-4 bg-background/95 backdrop-blur sticky top-0 z-30">
          <button
            className="text-foreground/60 hover:text-foreground p-1"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 ml-3">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-600 to-primary flex items-center justify-center">
              <Sparkles className="w-3 h-3 text-white" />
            </div>
            <span className="font-bold text-sm text-foreground">{settings.siteName}</span>
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
