import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/apiFetch";
import { notifyError, notifySuccess } from "@/lib/apiError";
import {
  Loader2, Key, Check, X, Eye, EyeOff, Trash2, RefreshCw,
  Plus, ChevronDown, ChevronUp, ExternalLink, Zap,
  MessageSquare, ImageIcon, AlertTriangle, Search, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ModelInfo { id: string; name: string; description: string }

interface FetchedModels {
  textModels:  ModelInfo[];
  imageModels: ModelInfo[];
  otherModels: ModelInfo[];
  totalFetched: number;
}

interface Provider {
  id:            string;
  label:         string;
  description:   string;
  hasBaseUrl:    boolean;
  defaultBaseUrl: string;
  docsUrl:       string;
  enabled:       boolean;
  configured:    boolean;
  envConfigured: boolean;
  maskedKey:     string;
  baseUrl:       string | null;
  textModel:     string;
  imageModel:    string;
  textModels:    string[];
  imageModels:   string[];
}

interface FormState {
  apiKey:      string;
  baseUrl:     string;
  enabled:     boolean;
  textModels:  string[];
  imageModels: string[];
}

type TestStatus = "idle" | "testing" | "ok" | "warn" | "fail";

// ── Statics ───────────────────────────────────────────────────────────────────

const PROVIDER_ICONS: Record<string, string> = {
  openai:  "🤖",
  gemini:  "✨",
  custom:  "🔧",
  nano_banana: "🔧",
};

const PROVIDER_COLOR_CLASS: Record<string, string> = {
  openai: "text-emerald-400",
  gemini: "text-blue-400",
  custom: "text-amber-400",
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ provider }: { provider: Provider }) {
  if (provider.configured) {
    return (
      <span className={cn(
        "inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
        provider.enabled
          ? "bg-emerald-500/15 text-emerald-400"
          : "bg-muted text-muted-foreground",
      )}>
        {provider.enabled ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
        {provider.enabled ? "Active" : "Disabled"}
      </span>
    );
  }
  if (provider.envConfigured) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400">
        Via env var
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
      Not configured
    </span>
  );
}

function ModelBadge({ icon: Icon, label, models }: { icon: React.ElementType; label: string; models: string[] }) {
  const visible = models.filter(Boolean);
  if (visible.length === 0) return null;
  return (
    <>
      {visible.map((m, i) => (
        <span key={i} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground border border-border/50">
          <Icon className="w-2.5 h-2.5 flex-shrink-0" />
          <span className="font-mono truncate max-w-[140px]">{m}</span>
        </span>
      ))}
    </>
  );
}

function ModelPicker({
  label,
  icon: Icon,
  models,
  value,
  onChange,
  emptyHint,
}: {
  label:     string;
  icon:      React.ElementType;
  models:    ModelInfo[];
  value:     string[];
  onChange:  (v: string[]) => void;
  emptyHint: string;
}) {
  const [customVal, setCustomVal] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter(v => v !== id));
    } else {
      onChange([...value, id]);
    }
  }

  function addCustom() {
    const id = customVal.trim();
    if (!id) return;
    if (!value.includes(id)) onChange([...value, id]);
    setCustomVal("");
    setShowCustom(false);
  }

  // models not in the fetched list but manually added
  const customSelected = value.filter(v => !models.find(m => m.id === v));

  return (
    <div className="space-y-1.5">
      {label && (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
          {label}
        </p>
      )}

      {models.length === 0 ? (
        <p className="text-[11px] text-muted-foreground px-1">{emptyHint}</p>
      ) : (
        <div className="grid gap-1 max-h-48 overflow-y-auto pr-1">
          {models.map(m => {
            const selected = value.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggle(m.id)}
                className={cn(
                  "flex items-start gap-2.5 w-full text-left px-3 py-2 rounded-lg border text-xs transition-all",
                  selected
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-background text-muted-foreground hover:border-border/80 hover:bg-muted/30 hover:text-foreground",
                )}
              >
                <span className={cn(
                  "w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center mt-0.5",
                  selected ? "border-primary bg-primary" : "border-muted-foreground/40",
                )}>
                  {selected && <Check className="w-2.5 h-2.5 text-white" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[11px] text-foreground truncate">{m.id}</div>
                  {m.name !== m.id && (
                    <div className="text-[10px] text-primary/80 truncate">{m.name}</div>
                  )}
                  {m.description && (
                    <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{m.description}</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Manually-added custom IDs not in the fetched list */}
      {customSelected.map(id => (
        <div key={id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/5 text-xs">
          <Check className="w-3 h-3 text-primary flex-shrink-0" />
          <span className="font-mono text-foreground flex-1 truncate">{id}</span>
          <button type="button" onClick={() => onChange(value.filter(v => v !== id))}
            className="text-muted-foreground hover:text-red-400 transition-colors">
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}

      {/* Custom model ID entry */}
      <button
        type="button"
        onClick={() => setShowCustom(v => !v)}
        className={cn(
          "flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-dashed transition-colors w-full",
          showCustom
            ? "border-primary/40 text-primary bg-primary/5"
            : "border-border text-muted-foreground hover:text-foreground hover:border-border/80",
        )}
      >
        <Plus className="w-3 h-3 flex-shrink-0" />
        {showCustom ? "Cancel" : "Add custom model ID"}
      </button>

      {showCustom && (
        <div className="flex gap-2">
          <input
            type="text"
            value={customVal}
            onChange={e => setCustomVal(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addCustom(); }}
            placeholder="e.g. gemini-2.5-pro-preview"
            className="flex-1 bg-background border border-primary/30 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono"
            autoFocus
          />
          <button
            type="button"
            onClick={addCustom}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AdminApiKeys() {
  const { user } = useAuth();
  const [providers,   setProviders]   = useState<Provider[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [expandedId,  setExpandedId]  = useState<string | null>(null);
  const [form,        setForm]        = useState<FormState>({
    apiKey: "", baseUrl: "", enabled: true, textModels: [], imageModels: [],
  });
  const [showKey,       setShowKey]       = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [testStatus,    setTestStatus]    = useState<TestStatus>("idle");
  const [testMsg,       setTestMsg]       = useState("");
  const [deleting,      setDeleting]      = useState<string | null>(null);
  const [fetching,      setFetching]      = useState(false);
  const [fetchedModels, setFetchedModels] = useState<FetchedModels | null>(null);
  const [fetchError,    setFetchError]    = useState<string | null>(null);

  const loadProviders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/api-keys");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setProviders(data.providers ?? []);
    } catch (err) {
      notifyError("Failed to load API keys", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProviders(); }, [loadProviders]);

  if (user?.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">Access denied.</p>
      </div>
    );
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  function openEdit(p: Provider) {
    if (expandedId === p.id) { setExpandedId(null); return; }
    setExpandedId(p.id);
    setForm({
      apiKey: "", baseUrl: p.baseUrl ?? p.defaultBaseUrl ?? "", enabled: p.enabled,
      textModels:  p.textModels?.length  ? p.textModels  : (p.textModel  ? [p.textModel]  : []),
      imageModels: p.imageModels?.length ? p.imageModels : (p.imageModel ? [p.imageModel] : []),
    });
    setShowKey(false);
    setTestStatus("idle"); setTestMsg("");
    setFetchedModels(null); setFetchError(null);
  }

  async function handleFetchModels(providerId: string) {
    const key = form.apiKey.trim();
    if (!key) { notifyError("Enter an API key first", null); return; }
    if (providerId === "custom" && !form.baseUrl.trim()) {
      notifyError("Enter a Base URL for the custom endpoint", null); return;
    }
    setFetching(true); setFetchedModels(null); setFetchError(null);
    try {
      const res = await apiFetch(`/api/admin/api-keys/${providerId}/fetch-models`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key, baseUrl: form.baseUrl.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail ?? "Failed to fetch models");
      setFetchedModels(data as FetchedModels);

      // Auto-select first model if nothing is selected yet
      const txtList: ModelInfo[] = data.textModels  ?? [];
      const imgList: ModelInfo[] = data.imageModels ?? [];
      setForm(f => ({
        ...f,
        textModels:  f.textModels.length  ? f.textModels  : (txtList[0] ? [txtList[0].id] : []),
        imageModels: f.imageModels.length ? f.imageModels : (imgList[0] ? [imgList[0].id] : []),
      }));
    } catch (err) {
      setFetchError(String(err instanceof Error ? err.message : err));
    } finally {
      setFetching(false);
    }
  }

  async function handleTest(providerId: string) {
    const key = form.apiKey.trim();
    if (!key) { notifyError("Enter an API key first", null); return; }
    setTestStatus("testing"); setTestMsg("");
    try {
      const res = await apiFetch(`/api/admin/api-keys/${providerId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key, baseUrl: form.baseUrl.trim() || null, textModel: form.textModels[0] || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setTestStatus(data.warning ? "warn" : "ok");
        setTestMsg(data.message ?? "Connection successful");
      } else {
        setTestStatus("fail");
        setTestMsg(data.detail ?? "Connection failed");
      }
    } catch (err) {
      setTestStatus("fail");
      setTestMsg(String(err));
    }
  }

  async function handleSave(providerId: string) {
    if (!form.apiKey.trim()) { notifyError("API key is required", null); return; }
    setSaving(true);
    try {
      const res = await apiFetch(`/api/admin/api-keys/${providerId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey:      form.apiKey.trim(),
          baseUrl:     form.baseUrl.trim() || null,
          enabled:     form.enabled,
          textModels:  form.textModels.length  ? form.textModels  : null,
          imageModels: form.imageModels.length ? form.imageModels : null,
          textModel:   form.textModels[0]  || null,
          imageModel:  form.imageModels[0] || null,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail ?? "Failed to save");
      }
      notifySuccess("API key saved", `${providers.find(p => p.id === providerId)?.label} configured successfully`);
      setExpandedId(null);
      await loadProviders();
    } catch (err) {
      notifyError("Failed to save API key", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(providerId: string) {
    setDeleting(providerId);
    try {
      const res = await apiFetch(`/api/admin/api-keys/${providerId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      notifySuccess("API key removed", `${providers.find(p => p.id === providerId)?.label} key deleted`);
      setExpandedId(null);
      await loadProviders();
    } catch (err) {
      notifyError("Failed to delete API key", err);
    } finally {
      setDeleting(null);
    }
  }

  async function handleToggle(provider: Provider) {
    try {
      const res = await apiFetch(`/api/admin/api-keys/${provider.id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !provider.enabled }),
      });
      if (!res.ok) throw new Error("Failed to toggle");
      await loadProviders();
    } catch (err) {
      notifyError("Failed to toggle provider", err);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Key className="w-4 h-4 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground">AI Provider Keys</h1>
        </div>
        <p className="text-sm text-muted-foreground ml-12">
          Add an API key — the system will fetch all available models directly from the provider and let you choose which model handles text generation and image generation.
        </p>
      </div>

      {/* Priority banner */}
      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-primary/5 border border-primary/15 text-xs">
        <Zap className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
        <div>
          <span className="font-semibold text-foreground">Active provider priority: </span>
          <span className="text-muted-foreground">
            🔧 Custom Compatible → 🤖 OpenAI → ✨ Google Gemini → Environment variables
          </span>
        </div>
      </div>

      {/* Provider cards */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map(provider => {
            const isExpanded = expandedId === provider.id;
            const isDeleting = deleting === provider.id;
            const colorClass = PROVIDER_COLOR_CLASS[provider.id] ?? "text-foreground";

            return (
              <div
                key={provider.id}
                className={cn(
                  "rounded-xl border transition-all duration-200",
                  isExpanded ? "border-primary/30 bg-card shadow-sm" : "border-border bg-card/50 hover:bg-card",
                )}
              >
                {/* ── Provider summary row ── */}
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <span className="text-xl flex-shrink-0">{PROVIDER_ICONS[provider.id] ?? "🔑"}</span>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("text-sm font-semibold", colorClass)}>
                        {provider.label}
                      </span>
                      <StatusBadge provider={provider} />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{provider.description}</p>

                    {/* Active model pills */}
                    {provider.configured && ((provider.textModels?.length ?? 0) > 0 || (provider.imageModels?.length ?? 0) > 0) && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {provider.maskedKey && (
                          <span className="text-[10px] font-mono text-muted-foreground/40 self-center mr-0.5">
                            {provider.maskedKey}
                          </span>
                        )}
                        <ModelBadge icon={MessageSquare} label="Text"  models={provider.textModels  ?? (provider.textModel  ? [provider.textModel]  : [])} />
                        <ModelBadge icon={ImageIcon}     label="Image" models={provider.imageModels ?? (provider.imageModel ? [provider.imageModel] : [])} />
                      </div>
                    )}
                  </div>

                  {/* Row actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {provider.configured && (
                      <button
                        onClick={() => handleToggle(provider)}
                        className={cn(
                          "text-[11px] font-medium px-2 py-1 rounded-md transition-colors",
                          provider.enabled
                            ? "text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10"
                            : "text-muted-foreground hover:text-emerald-400 hover:bg-emerald-400/10",
                        )}
                      >
                        {provider.enabled ? "Disable" : "Enable"}
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(provider)}
                      className={cn(
                        "flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-md transition-colors",
                        isExpanded
                          ? "bg-primary/10 text-primary"
                          : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {provider.configured
                        ? <><span>Edit</span> {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}</>
                        : <><Plus className="w-3 h-3" /><span>Configure</span></>}
                    </button>
                  </div>
                </div>

                {/* ── Expanded form ── */}
                {isExpanded && (
                  <div className="border-t border-border/50 px-4 pb-5 pt-4 space-y-5">

                    {/* Doc link */}
                    {provider.docsUrl && (
                      <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-primary/80 hover:text-primary hover:underline">
                        <ExternalLink className="w-3 h-3" />
                        Get API key from {provider.label} →
                      </a>
                    )}

                    {/* ── Step 1: API Key ── */}
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                        1 · API Key
                      </p>

                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1.5">
                          Secret key
                          {provider.configured && <span className="text-muted-foreground font-normal ml-1">(leave blank to keep existing)</span>}
                        </label>
                        <div className="relative">
                          <input
                            type={showKey ? "text" : "password"}
                            value={form.apiKey}
                            onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                            placeholder={provider.configured ? "Enter new key to replace…" : provider.id === "openai" ? "sk-…" : provider.id === "gemini" ? "AIzaSy…" : "Your API key"}
                            className="w-full bg-background border border-border rounded-lg px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono"
                          />
                          <button type="button" onClick={() => setShowKey(v => !v)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Base URL — custom only */}
                      {provider.hasBaseUrl && (
                        <div>
                          <label className="block text-xs font-medium text-foreground mb-1.5">
                            API Base URL
                          </label>
                          <input
                            type="url"
                            value={form.baseUrl}
                            onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}
                            placeholder="https://your-endpoint.com/v1"
                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50"
                          />
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Must be OpenAI-compatible (supports <code className="font-mono">/chat/completions</code> and <code className="font-mono">/models</code>)
                          </p>
                        </div>
                      )}

                      {/* Fetch models button */}
                      <button
                        type="button"
                        onClick={() => handleFetchModels(provider.id)}
                        disabled={fetching || !form.apiKey.trim()}
                        className={cn(
                          "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all",
                          fetching
                            ? "border-border text-muted-foreground cursor-not-allowed"
                            : !form.apiKey.trim()
                              ? "border-border/50 text-muted-foreground/50 cursor-not-allowed"
                              : "border-primary/40 text-primary bg-primary/5 hover:bg-primary/10 hover:border-primary/60",
                        )}
                      >
                        {fetching
                          ? <><Loader2 className="w-4 h-4 animate-spin" /> Fetching models from {provider.label}…</>
                          : <><Search className="w-4 h-4" /> Verify key & load available models</>}
                      </button>

                      {/* Fetch error */}
                      {fetchError && (
                        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                          <span>{fetchError}</span>
                        </div>
                      )}
                    </div>

                    {/* ── Step 2: Model Selection (appears after fetch) ── */}
                    {fetchedModels && (
                      <div className="space-y-4 pt-1">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                            2 · Select Models
                          </p>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-medium">
                            {fetchedModels.totalFetched} models found
                          </span>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-4">
                          {/* Text model */}
                          <div className="rounded-xl border border-border bg-background/50 p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                                <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                                Text generation
                              </p>
                              <span className="text-[10px] text-muted-foreground">{fetchedModels.textModels.length} models</span>
                            </div>
                            <ModelPicker
                              label=""
                              icon={MessageSquare}
                              models={fetchedModels.textModels}
                              value={form.textModels}
                              onChange={v => setForm(f => ({ ...f, textModels: v }))}
                              emptyHint="No text models found — add a custom model ID below"
                            />
                            {form.textModels.length > 0 && (
                              <p className="text-[10px] text-muted-foreground pt-1">
                                <span className="font-semibold">{form.textModels.length}</span> selected · primary: <span className="font-mono">{form.textModels[0]}</span>
                              </p>
                            )}
                          </div>

                          {/* Image model */}
                          <div className="rounded-xl border border-border bg-background/50 p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                                <ImageIcon className="w-3.5 h-3.5 text-violet-400" />
                                Image generation
                              </p>
                              <span className="text-[10px] text-muted-foreground">{fetchedModels.imageModels.length} models</span>
                            </div>
                            <ModelPicker
                              label=""
                              icon={ImageIcon}
                              models={fetchedModels.imageModels}
                              value={form.imageModels}
                              onChange={v => setForm(f => ({ ...f, imageModels: v }))}
                              emptyHint="No image models detected — add a custom model ID below"
                            />
                            {form.imageModels.length > 0 && (
                              <p className="text-[10px] text-muted-foreground pt-1">
                                <span className="font-semibold">{form.imageModels.length}</span> selected · primary: <span className="font-mono">{form.imageModels[0]}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── Enable toggle ── */}
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
                        className={cn(
                          "relative w-9 h-5 rounded-full transition-colors flex-shrink-0",
                          form.enabled ? "bg-primary" : "bg-muted",
                        )}
                      >
                        <span className={cn(
                          "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                          form.enabled ? "translate-x-4" : "translate-x-0.5",
                        )} />
                      </button>
                      <span className="text-xs text-muted-foreground">
                        {form.enabled ? "Enabled — will be used as active provider" : "Disabled — key saved but not used"}
                      </span>
                    </div>

                    {/* Test result */}
                    {testStatus !== "idle" && (
                      <div className={cn(
                        "flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs",
                        testStatus === "ok"   && "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
                        testStatus === "warn" && "bg-amber-500/10  text-amber-400  border border-amber-500/20",
                        testStatus === "fail" && "bg-red-500/10    text-red-400    border border-red-500/20",
                        testStatus === "testing" && "bg-muted text-muted-foreground border border-border",
                      )}>
                        {testStatus === "testing" && <Loader2 className="w-3.5 h-3.5 mt-0.5 animate-spin flex-shrink-0" />}
                        {testStatus === "ok"      && <ShieldCheck     className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
                        {testStatus === "warn"    && <AlertTriangle   className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
                        {testStatus === "fail"    && <X              className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
                        <span>{testStatus === "testing" ? "Verifying connection…" : testMsg}</span>
                      </div>
                    )}

                    {/* Footer buttons */}
                    <div className="flex items-center justify-between gap-3 pt-1">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleTest(provider.id)}
                          disabled={testStatus === "testing" || !form.apiKey.trim()}
                          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <RefreshCw className={cn("w-3 h-3", testStatus === "testing" && "animate-spin")} />
                          Test connection
                        </button>

                        {provider.configured && (
                          <button
                            onClick={() => handleDelete(provider.id)}
                            disabled={!!isDeleting}
                            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400/70 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                            Remove key
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setExpandedId(null)}
                          className="text-xs px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSave(provider.id)}
                          disabled={saving || !form.apiKey.trim()}
                          className="flex items-center gap-1.5 text-xs font-semibold px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Security note */}
      <div className="px-4 py-3 rounded-xl bg-muted/20 border border-border text-xs text-muted-foreground">
        <p className="font-medium text-foreground/60 mb-1">Security</p>
        <p>API keys are stored encrypted in the database and shown only to admin users. Model preferences take effect immediately — no restart required.</p>
      </div>
    </div>
  );
}
