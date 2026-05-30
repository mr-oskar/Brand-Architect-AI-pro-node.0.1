import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/apiFetch";
import { notifyError, notifySuccess } from "@/lib/apiError";
import {
  Loader2, Key, Check, X, Eye, EyeOff, Trash2, RefreshCw,
  Plus, ChevronDown, ChevronUp, ExternalLink, Zap, Image, Type,
  AlertTriangle, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ModelOption {
  id: string;
  name: string;
  description: string;
}

interface Provider {
  id: string;
  label: string;
  description: string;
  hasBaseUrl: boolean;
  defaultBaseUrl: string;
  enabled: boolean;
  configured: boolean;
  envConfigured: boolean;
  maskedKey: string;
  baseUrl: string | null;
  textModel: string;
  imageModel: string;
  availableTextModels: ModelOption[];
  availableImageModels: ModelOption[];
}

interface FormState {
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
  textModel: string;
  imageModel: string;
}

interface TestResult {
  success: boolean;
  message: string;
  textModel?: string;
  warning?: boolean;
}

interface FetchedModels {
  textModels: ModelOption[];
  imageModels: ModelOption[];
  totalModels: number;
}

const PROVIDER_DOCS: Record<string, string> = {
  openai: "https://platform.openai.com/api-keys",
  gemini: "https://aistudio.google.com/apikey",
  nano_banana: "",
};

const PROVIDER_ICONS: Record<string, string> = {
  openai: "🤖",
  gemini: "✨",
  nano_banana: "🍌",
};

const PROVIDER_COLORS: Record<string, string> = {
  openai: "text-emerald-400",
  gemini: "text-blue-400",
  nano_banana: "text-yellow-400",
};

function ModelSelector({
  label,
  icon: Icon,
  value,
  options,
  customOptions,
  onChange,
  placeholder,
}: {
  label: string;
  icon: React.ElementType;
  value: string;
  options: ModelOption[];
  customOptions?: ModelOption[];
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const allOptions = [...options, ...(customOptions ?? [])];
  const [showCustom, setShowCustom] = useState(false);

  const selected = allOptions.find((m) => m.id === value);
  const isCustom = value && !allOptions.find((m) => m.id === value);

  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-medium text-foreground mb-2">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        {label}
      </label>

      {allOptions.length > 0 ? (
        <div className="grid grid-cols-1 gap-1.5">
          {allOptions.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange(m.id)}
              className={cn(
                "flex items-start gap-2.5 w-full text-left px-3 py-2 rounded-lg border text-xs transition-all",
                value === m.id
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-border/80 hover:bg-muted/30 hover:text-foreground"
              )}
            >
              <div className={cn(
                "w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center mt-0.5",
                value === m.id
                  ? "border-primary bg-primary"
                  : "border-border"
              )}>
                {value === m.id && <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />}
              </div>
              <div className="min-w-0">
                <div className="font-medium text-foreground text-[12px] truncate">{m.name}</div>
                {m.description && (
                  <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{m.description}</div>
                )}
              </div>
            </button>
          ))}

          {/* Custom model input toggle */}
          <button
            type="button"
            onClick={() => setShowCustom((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-dashed border-border hover:border-border/80 transition-colors"
          >
            <Plus className="w-3 h-3" />
            {isCustom ? `Using custom: ${value}` : "Enter custom model ID"}
          </button>

          {showCustom && (
            <input
              type="text"
              value={isCustom ? value : ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder || "e.g. gpt-4-turbo-preview"}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono"
            />
          )}
        </div>
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || "Enter model ID"}
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono"
        />
      )}
    </div>
  );
}

export default function AdminApiKeys() {
  const { user } = useAuth();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    apiKey: "", baseUrl: "", enabled: true, textModel: "", imageModel: "",
  });
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<FetchedModels | null>(null);
  const [activeTab, setActiveTab] = useState<"key" | "text" | "image">("key");

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/api-keys");
      if (!res.ok) throw new Error("Failed to load API keys");
      const data = await res.json();
      setProviders(data.providers ?? []);
    } catch (err) {
      notifyError("Failed to load API keys", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProviders(); }, [fetchProviders]);

  if (user?.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">Access denied.</p>
      </div>
    );
  }

  function openEdit(provider: Provider) {
    if (expandedId === provider.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(provider.id);
    setForm({
      apiKey: "",
      baseUrl: provider.baseUrl ?? provider.defaultBaseUrl ?? "",
      enabled: provider.enabled,
      textModel: provider.textModel || "",
      imageModel: provider.imageModel || "",
    });
    setShowKey(false);
    setTestResult(null);
    setFetchedModels(null);
    setActiveTab("key");
  }

  async function handleFetchModels(providerId: string) {
    if (!form.apiKey.trim()) {
      notifyError("Enter an API key first", null);
      return;
    }
    setFetchingModels(true);
    setFetchedModels(null);
    try {
      const res = await apiFetch(`/api/admin/api-keys/${providerId}/fetch-models`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: form.apiKey.trim(),
          baseUrl: form.baseUrl.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail ?? "Failed to fetch models");
      setFetchedModels({
        textModels: data.textModels ?? [],
        imageModels: data.imageModels ?? [],
        totalModels: data.totalModels ?? 0,
      });
      notifySuccess(
        "Models loaded",
        `Found ${data.totalModels} models — ${data.textModels?.length ?? 0} text, ${data.imageModels?.length ?? 0} image`
      );
    } catch (err) {
      notifyError("Failed to fetch models", err);
    } finally {
      setFetchingModels(false);
    }
  }

  async function handleSave(providerId: string) {
    if (!form.apiKey.trim()) {
      notifyError("API key is required", null);
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch(`/api/admin/api-keys/${providerId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: form.apiKey.trim(),
          baseUrl: form.baseUrl.trim() || null,
          enabled: form.enabled,
          textModel: form.textModel || null,
          imageModel: form.imageModel || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? "Failed to save");
      }
      notifySuccess(
        "API key saved",
        `${providers.find((p) => p.id === providerId)?.label} configured successfully`
      );
      setExpandedId(null);
      await fetchProviders();
    } catch (err) {
      notifyError("Failed to save API key", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(providerId: string) {
    if (!form.apiKey.trim()) {
      notifyError("Enter an API key to test", null);
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch(`/api/admin/api-keys/${providerId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: form.apiKey.trim(),
          baseUrl: form.baseUrl.trim() || null,
          textModel: form.textModel || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setTestResult({
          success: true,
          message: data.message ?? "Connection successful",
          textModel: data.textModel,
          warning: data.warning,
        });
      } else {
        setTestResult({ success: false, message: data.detail ?? "Connection failed" });
      }
    } catch (err) {
      setTestResult({ success: false, message: String(err) });
    } finally {
      setTesting(false);
    }
  }

  async function handleDelete(providerId: string) {
    setDeleting(providerId);
    try {
      const res = await apiFetch(`/api/admin/api-keys/${providerId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      notifySuccess(
        "API key removed",
        `${providers.find((p) => p.id === providerId)?.label} key deleted`
      );
      setExpandedId(null);
      await fetchProviders();
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
      await fetchProviders();
    } catch (err) {
      notifyError("Failed to toggle provider", err);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Key className="w-4.5 h-4.5 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground">AI Provider Keys</h1>
        </div>
        <p className="text-sm text-muted-foreground ml-12">
          Configure API keys, select models for text and image generation, and verify connections.
        </p>
      </div>

      {/* Priority note */}
      <div className="mb-6 px-4 py-3 rounded-lg bg-primary/5 border border-primary/15 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5 mb-1">
          <Zap className="w-3 h-3 text-primary flex-shrink-0" />
          <span className="font-semibold text-foreground">Active provider priority:</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 ml-4.5">
          {["🍌 Nano Banana", "🤖 OpenAI", "✨ Google Gemini", "🔑 Env vars"].map((item, i, arr) => (
            <span key={item} className="flex items-center gap-1">
              <span className={cn("font-medium", i === 0 ? "text-yellow-400" : i === 1 ? "text-emerald-400" : i === 2 ? "text-blue-400" : "text-muted-foreground/60")}>
                {item}
              </span>
              {i < arr.length - 1 && <span className="text-muted-foreground/40">→</span>}
            </span>
          ))}
        </div>
      </div>

      {/* Provider list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map((provider) => {
            const isExpanded = expandedId === provider.id;
            const isDeleting = deleting === provider.id;
            const docUrl = PROVIDER_DOCS[provider.id];

            return (
              <div
                key={provider.id}
                className={cn(
                  "rounded-xl border transition-all",
                  isExpanded ? "border-primary/30 bg-card" : "border-border bg-card/50 hover:bg-card"
                )}
              >
                {/* Provider row */}
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <span className="text-xl flex-shrink-0">{PROVIDER_ICONS[provider.id] ?? "🔑"}</span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("text-sm font-semibold", PROVIDER_COLORS[provider.id] || "text-foreground")}>
                        {provider.label}
                      </span>

                      {/* Status badges */}
                      {provider.configured && (
                        <span className={cn(
                          "inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                          provider.enabled
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-muted text-muted-foreground"
                        )}>
                          {provider.enabled ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                          {provider.enabled ? "Active" : "Disabled"}
                        </span>
                      )}
                      {provider.envConfigured && !provider.configured && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400">
                          Via env var
                        </span>
                      )}
                      {!provider.configured && !provider.envConfigured && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                          Not configured
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-muted-foreground mt-0.5">{provider.description}</p>

                    {/* Model pills */}
                    {provider.configured && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        {provider.maskedKey && (
                          <span className="text-[10px] font-mono text-muted-foreground/50 mr-0.5">
                            {provider.maskedKey}
                          </span>
                        )}
                        {provider.textModel && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            <Type className="w-2.5 h-2.5" />
                            {provider.textModel}
                          </span>
                        )}
                        {provider.imageModel && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">
                            <Image className="w-2.5 h-2.5" />
                            {provider.imageModel}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {provider.configured && (
                      <button
                        onClick={() => handleToggle(provider)}
                        title={provider.enabled ? "Disable" : "Enable"}
                        className={cn(
                          "text-[11px] font-medium px-2 py-1 rounded-md transition-colors",
                          provider.enabled
                            ? "text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10"
                            : "text-muted-foreground hover:text-emerald-400 hover:bg-emerald-400/10"
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
                          : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      {provider.configured ? (
                        <>Edit {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}</>
                      ) : (
                        <><Plus className="w-3 h-3" /> Configure</>
                      )}
                    </button>
                  </div>
                </div>

                {/* ── Expanded form ── */}
                {isExpanded && (
                  <div className="border-t border-border/50">

                    {/* Tabs */}
                    <div className="flex items-center gap-0 px-4 pt-3 border-b border-border/30">
                      {[
                        { id: "key" as const, label: "API Key", icon: Key },
                        { id: "text" as const, label: "Text Model", icon: Type },
                        { id: "image" as const, label: "Image Model", icon: Image },
                      ].map(({ id, label, icon: Icon }) => (
                        <button
                          key={id}
                          onClick={() => setActiveTab(id)}
                          className={cn(
                            "flex items-center gap-1.5 text-xs font-medium px-3 py-2 border-b-2 -mb-px transition-colors",
                            activeTab === id
                              ? "border-primary text-primary"
                              : "border-transparent text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <Icon className="w-3 h-3" />
                          {label}
                        </button>
                      ))}
                    </div>

                    <div className="px-4 py-4 space-y-4">

                      {/* ── Tab: API Key ── */}
                      {activeTab === "key" && (
                        <>
                          {docUrl && (
                            <a
                              href={docUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Get API key from {provider.label} dashboard
                            </a>
                          )}

                          <div>
                            <label className="block text-xs font-medium text-foreground mb-1.5">
                              API Key{" "}
                              {provider.configured && (
                                <span className="text-muted-foreground font-normal">
                                  (leave blank to keep existing)
                                </span>
                              )}
                            </label>
                            <div className="relative">
                              <input
                                type={showKey ? "text" : "password"}
                                value={form.apiKey}
                                onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                                placeholder={provider.configured ? "Enter new key to replace..." : "sk-..."}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono"
                              />
                              <button
                                type="button"
                                onClick={() => setShowKey((v) => !v)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                              >
                                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>

                          {/* Base URL — Nano Banana only */}
                          {provider.hasBaseUrl && (
                            <div>
                              <label className="block text-xs font-medium text-foreground mb-1.5">
                                API Base URL
                              </label>
                              <input
                                type="url"
                                value={form.baseUrl}
                                onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                                placeholder="https://your-api-endpoint.com/v1"
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                              />
                              <p className="text-[11px] text-muted-foreground mt-1">
                                Must be an OpenAI-compatible endpoint (supports /chat/completions)
                              </p>

                              {/* Fetch models button for nano_banana */}
                              <button
                                type="button"
                                onClick={() => handleFetchModels(provider.id)}
                                disabled={fetchingModels || !form.apiKey.trim() || !form.baseUrl.trim()}
                                className="mt-2 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              >
                                {fetchingModels
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <Search className="w-3 h-3" />}
                                {fetchingModels ? "Fetching models..." : "Fetch available models from endpoint"}
                              </button>

                              {fetchedModels && (
                                <div className="mt-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
                                  <p className="font-medium">
                                    Found {fetchedModels.totalModels} models —{" "}
                                    {fetchedModels.textModels.length} text,{" "}
                                    {fetchedModels.imageModels.length} image
                                  </p>
                                  <p className="text-emerald-400/70 mt-0.5">
                                    Switch to "Text Model" or "Image Model" tabs to select.
                                  </p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Enabled toggle */}
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
                              className={cn(
                                "relative w-9 h-5 rounded-full transition-colors flex-shrink-0",
                                form.enabled ? "bg-primary" : "bg-muted"
                              )}
                            >
                              <span className={cn(
                                "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform",
                                form.enabled ? "translate-x-4" : "translate-x-0.5"
                              )} />
                            </button>
                            <span className="text-xs text-foreground">
                              {form.enabled ? "Enabled — will be used as active provider" : "Disabled — key saved but not used"}
                            </span>
                          </div>
                        </>
                      )}

                      {/* ── Tab: Text Model ── */}
                      {activeTab === "text" && (
                        <ModelSelector
                          label="Text generation model"
                          icon={Type}
                          value={form.textModel}
                          options={provider.availableTextModels}
                          customOptions={fetchedModels?.textModels ?? []}
                          onChange={(v) => setForm((f) => ({ ...f, textModel: v }))}
                          placeholder="e.g. gpt-4o-mini"
                        />
                      )}

                      {/* ── Tab: Image Model ── */}
                      {activeTab === "image" && (
                        <ModelSelector
                          label="Image generation model"
                          icon={Image}
                          value={form.imageModel}
                          options={provider.availableImageModels}
                          customOptions={fetchedModels?.imageModels ?? []}
                          onChange={(v) => setForm((f) => ({ ...f, imageModel: v }))}
                          placeholder="e.g. gpt-image-1"
                        />
                      )}

                      {/* Test result */}
                      {testResult && (
                        <div className={cn(
                          "flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs",
                          testResult.success
                            ? testResult.warning
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-red-500/10 text-red-400 border border-red-500/20"
                        )}>
                          {testResult.success
                            ? testResult.warning
                              ? <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                              : <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                            : <X className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
                          <span>{testResult.message}</span>
                        </div>
                      )}

                      {/* Footer actions */}
                      <div className="flex items-center justify-between gap-3 pt-1">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleTest(provider.id)}
                            disabled={testing || !form.apiKey.trim()}
                            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
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
                            Save key
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Info footer */}
      <div className="mt-8 px-4 py-3 rounded-lg bg-muted/30 border border-border text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground/70">Security note</p>
        <p>
          API keys are stored securely in the database and only visible to admin users.
          Only the last 4 characters are shown. Model preferences are saved per provider
          and take effect immediately without a server restart.
        </p>
      </div>
    </div>
  );
}
