import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DollarSign, Zap, Activity, AlertCircle, TrendingUp,
  Clock, CheckCircle, XCircle, BarChart3, RefreshCw,
  ChevronDown,
} from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

interface CostSummary {
  calls: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  avgLatencyMs: number;
}

interface BreakdownRow {
  label: string;
  calls: number;
  tokens: number;
  costUsd: number;
}

interface CostReport {
  period: string;
  groupBy: string;
  summary: CostSummary;
  breakdown: BreakdownRow[];
}

interface LatencyStats {
  avg: number | null;
  p50: number | null;
  p90: number | null;
  p95: number | null;
  p99: number | null;
  min: number | null;
  max: number | null;
}

interface ModelPerf {
  model: string;
  total: number;
  success: number;
  failed: number;
  successRate: number;
  avgLatencyMs: number | null;
  totalTokens: number;
}

interface HealthReport {
  period: string;
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  successRate: number;
  latency: LatencyStats;
  errors: { message: string; count: number }[];
  modelPerformance: ModelPerf[];
  callVolume: { time: string; calls: number; success: number }[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt$(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.001) return `$${n.toFixed(6)}`;
  if (n < 1)    return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtMs(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${Math.round(n)}ms`;
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "violet",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color?: "violet" | "emerald" | "amber" | "rose" | "sky";
}) {
  const bg: Record<string, string> = {
    violet: "bg-violet-500/10 text-violet-400",
    emerald: "bg-emerald-500/10 text-emerald-400",
    amber:  "bg-amber-500/10 text-amber-400",
    rose:   "bg-rose-500/10 text-rose-400",
    sky:    "bg-sky-500/10 text-sky-400",
  };
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center mb-3", bg[color])}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <p className="text-2xl font-bold text-foreground leading-none">{value}</p>
      <p className="text-sm text-muted-foreground mt-1">{label}</p>
      {sub && <p className="text-xs text-muted-foreground/60 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Select ─────────────────────────────────────────────────────────────────────

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none bg-card border border-border text-sm text-foreground rounded-lg px-3 py-1.5 pr-7 focus:outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-foreground mb-3">{title}</h2>
      {children}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { value: "1d",  label: "Last 24h" },
  { value: "7d",  label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

const GROUP_OPTIONS = [
  { value: "model", label: "By model" },
  { value: "task",  label: "By task type" },
  { value: "day",   label: "By day" },
  { value: "user",  label: "By user" },
];

const HEALTH_PERIOD_OPTIONS = [
  { value: "1h",  label: "Last 1h" },
  { value: "24h", label: "Last 24h" },
  { value: "7d",  label: "Last 7d" },
  { value: "30d", label: "Last 30d" },
];

export default function AdminCostDashboard() {
  const [period,       setPeriod]       = useState("30d");
  const [groupBy,      setGroupBy]      = useState("model");
  const [healthPeriod, setHealthPeriod] = useState("24h");

  const { data: costData, isLoading: costLoading, refetch: refetchCost, error: costErr } =
    useQuery<CostReport>({
      queryKey: ["admin-cost-report", period, groupBy],
      queryFn:  () =>
        apiFetch(`/api/admin/models/cost-report?period=${period}&group_by=${groupBy}`).then(async r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<CostReport>;
        }),
      staleTime: 1000 * 60,
    });

  const { data: healthData, isLoading: healthLoading, refetch: refetchHealth, error: healthErr } =
    useQuery<HealthReport>({
      queryKey: ["admin-api-health", healthPeriod],
      queryFn:  () =>
        apiFetch(`/api/admin/models/health?period=${healthPeriod}`).then(async r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<HealthReport>;
        }),
      staleTime: 1000 * 60,
    });

  const summary = (costData && typeof costData.summary?.calls === 'number') ? costData.summary : undefined;
  const health  = (healthData && typeof healthData.successRate === 'number') ? healthData : undefined;

  function ErrorBox({ msg }: { msg: string }) {
    return (
      <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-sm text-rose-400 flex items-center gap-2">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        {msg}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Cost & Token Monitor</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track AI API usage, token consumption, and monetary cost in real time.
          </p>
        </div>
        <button
          onClick={() => { refetchCost(); refetchHealth(); }}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-border hover:bg-card transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* COST REPORT                                                        */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <div className="space-y-5">
        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-foreground">Cost report</span>
          <Select value={period}  onChange={setPeriod}  options={PERIOD_OPTIONS} />
          <Select value={groupBy} onChange={setGroupBy} options={GROUP_OPTIONS}  />
        </div>

        {costErr && <ErrorBox msg="Failed to load cost report. Make sure the Python API server is running." />}

        {/* Summary cards */}
        {costLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-5 h-28 animate-pulse" />
            ))}
          </div>
        ) : summary ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              icon={DollarSign}
              label="Total cost"
              value={fmt$(summary.totalCostUsd)}
              sub={`${PERIOD_OPTIONS.find(o => o.value === period)?.label}`}
              color="violet"
            />
            <StatCard
              icon={Zap}
              label="Total tokens"
              value={fmtNum(summary.totalTokens)}
              sub={`↑${fmtNum(summary.inputTokens)} / ↓${fmtNum(summary.outputTokens)}`}
              color="sky"
            />
            <StatCard
              icon={Activity}
              label="API calls"
              value={fmtNum(summary.calls)}
              color="emerald"
            />
            <StatCard
              icon={Clock}
              label="Avg latency"
              value={fmtMs(summary.avgLatencyMs)}
              color="amber"
            />
          </div>
        ) : null}

        {/* Breakdown table */}
        {!costLoading && costData?.breakdown && costData.breakdown.length > 0 && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {groupBy === "model" ? "Model" : groupBy === "task" ? "Task type" : groupBy === "day" ? "Date" : "User ID"}
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Calls</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tokens</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cost (USD)</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">% of total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {costData.breakdown.map((row, i) => {
                  const pct = summary && summary.totalCostUsd > 0
                    ? (row.costUsd / summary.totalCostUsd * 100)
                    : 0;
                  return (
                    <tr key={i} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-foreground truncate max-w-[200px]">
                        {row.label || "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{fmtNum(row.calls)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{fmtNum(row.tokens)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">{fmt$(row.costUsd)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-violet-500 rounded-full"
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <span className="tabular-nums text-muted-foreground text-xs w-10 text-right">
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!costLoading && costData?.breakdown?.length === 0 && (
          <div className="bg-card border border-border rounded-xl p-10 text-center text-muted-foreground text-sm">
            No cost data for this period. AI calls will be logged once token tracking is active.
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* API HEALTH                                                          */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <div className="space-y-5">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-foreground">API health</span>
          <Select value={healthPeriod} onChange={setHealthPeriod} options={HEALTH_PERIOD_OPTIONS} />
        </div>

        {healthErr && <ErrorBox msg="Failed to load health data." />}

        {healthLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-5 h-28 animate-pulse" />
            ))}
          </div>
        ) : health ? (
          <>
            {/* Health summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard
                icon={health.successRate >= 95 ? CheckCircle : AlertCircle}
                label="Success rate"
                value={`${health.successRate.toFixed(1)}%`}
                sub={`${fmtNum(health.successCalls)} ok / ${fmtNum(health.failedCalls)} failed`}
                color={health.successRate >= 95 ? "emerald" : health.successRate >= 80 ? "amber" : "rose"}
              />
              <StatCard icon={Activity} label="Total calls" value={fmtNum(health.totalCalls)} color="sky" />
              <StatCard
                icon={Clock}
                label="p50 latency"
                value={fmtMs(health.latency.p50)}
                sub={`p95: ${fmtMs(health.latency.p95)}`}
                color="violet"
              />
              <StatCard
                icon={TrendingUp}
                label="p99 latency"
                value={fmtMs(health.latency.p99)}
                sub={`max: ${fmtMs(health.latency.max)}`}
                color={
                  health.latency.p99 == null ? "emerald"
                  : health.latency.p99 < 5000 ? "emerald"
                  : health.latency.p99 < 15000 ? "amber"
                  : "rose"
                }
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Model performance table */}
              {health.modelPerformance.length > 0 && (
                <Section title="Model performance">
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Model</th>
                          <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Calls</th>
                          <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Success%</th>
                          <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">p50 lat.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {health.modelPerformance.map((m, i) => (
                          <tr key={i} className="hover:bg-muted/20">
                            <td className="px-4 py-2.5 font-mono text-xs text-foreground truncate max-w-[140px]">{m.model}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{fmtNum(m.total)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">
                              <span className={cn(
                                "text-xs font-medium",
                                m.successRate >= 95 ? "text-emerald-400" :
                                m.successRate >= 80 ? "text-amber-400" : "text-rose-400"
                              )}>
                                {m.successRate.toFixed(1)}%
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground text-xs">
                              {fmtMs(m.avgLatencyMs)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Section>
              )}

              {/* Error distribution */}
              {health.errors.length > 0 ? (
                <Section title="Top errors">
                  <div className="bg-card border border-border rounded-xl divide-y divide-border">
                    {health.errors.map((e, i) => (
                      <div key={i} className="flex items-start gap-3 px-4 py-3">
                        <XCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-foreground/80 font-mono leading-relaxed break-all line-clamp-2">
                            {e.message}
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-rose-400 flex-shrink-0">{e.count}×</span>
                      </div>
                    ))}
                  </div>
                </Section>
              ) : (
                <Section title="Top errors">
                  <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground text-sm">
                    <CheckCircle className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                    No errors in this period
                  </div>
                </Section>
              )}
            </div>

            {/* Call volume sparkline (text-based) */}
            {health.callVolume.length > 0 && (
              <Section title="Call volume">
                <div className="bg-card border border-border rounded-xl p-5">
                  <div className="flex items-end gap-1 h-16">
                    {health.callVolume.map((v, i) => {
                      const maxCalls = Math.max(...health.callVolume.map(x => x.calls), 1);
                      const h = Math.max(4, (v.calls / maxCalls) * 60);
                      const failedPct = v.calls > 0 ? (v.calls - v.success) / v.calls : 0;
                      return (
                        <div
                          key={i}
                          className="flex-1 group relative"
                          title={`${v.time}: ${v.calls} calls`}
                        >
                          <div
                            className={cn(
                              "w-full rounded-sm transition-colors",
                              failedPct > 0.1 ? "bg-rose-500/50 group-hover:bg-rose-500/70" :
                              "bg-violet-500/40 group-hover:bg-violet-500/60"
                            )}
                            style={{ height: `${h}px` }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-2 text-[10px] text-muted-foreground/50">
                    <span>{health.callVolume[0]?.time?.slice(0, 10) || ""}</span>
                    <span>{health.callVolume[health.callVolume.length - 1]?.time?.slice(0, 10) || ""}</span>
                  </div>
                </div>
              </Section>
            )}
          </>
        ) : null}

        {!healthLoading && health && health.totalCalls === 0 && (
          <div className="bg-card border border-border rounded-xl p-10 text-center text-muted-foreground text-sm">
            No API calls recorded in this period.
          </div>
        )}
      </div>

      {/* ── Latency percentile table ───────────────────────────────────── */}
      {health && health.latency.avg != null && (
        <Section title="Latency percentiles (successful calls)">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Min", "p50", "p90", "p95", "p99", "Max", "Avg"].map(h => (
                    <th key={h} className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {[
                    health.latency.min,
                    health.latency.p50,
                    health.latency.p90,
                    health.latency.p95,
                    health.latency.p99,
                    health.latency.max,
                    health.latency.avg,
                  ].map((v, i) => (
                    <td key={i} className="px-4 py-3 text-center tabular-nums font-mono text-xs text-foreground">
                      {fmtMs(v)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Section>
      )}

    </div>
  );
}
