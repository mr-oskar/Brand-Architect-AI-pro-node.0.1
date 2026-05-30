import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/apiFetch";
import { notifyError, notifySuccess } from "@/lib/apiError";
import { Loader2, Key, Check, X, Eye, EyeOff, Trash2, RefreshCw, Plus, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

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
}

interface FormState {
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
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

export default function AdminApiKeys() {
  const { user } = useAuth();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ apiKey: "", baseUrl: "", enabled: true });
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

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
    });
    setShowKey(false);
    setTestResult(null);
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
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? "Failed to save");
      }
      notifySuccess("API key saved", `${providers.find(p => p.id === providerId)?.label} configured successfully`);
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
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setTestResult({ success: true, message: data.message ?? "Connection successful" });
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
      notifySuccess("API key removed", `${providers.find(p => p.id === providerId)?.label} key deleted`);
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
          Configure API keys for AI providers. Keys are stored securely in the database.
          The first enabled and configured provider is used automatically.
        </p>
      </div>

      {/* Priority note */}
      <div className="mb-6 px-4 py-3 rounded-lg bg-primary/5 border border-primary/15 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Priority order: </span>
        Nano Banana → OpenAI → Google Gemini → Environment variables (OPENAI_API_KEY / GEMINI_API_KEY)
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
                      <span className="text-sm font-semibold text-foreground">{provider.label}</span>

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
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{provider.description}</p>
                    {provider.configured && (
                      <p className="text-[10px] text-muted-foreground/50 mt-0.5 font-mono">{provider.maskedKey}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Toggle active (only if configured) */}
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

                    {/* Configure / Edit */}
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

                {/* Expanded form */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border/50 pt-4 space-y-4">

                    {/* Doc link */}
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

                    {/* API Key input */}
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1.5">
                        API Key {provider.configured && <span className="text-muted-foreground font-normal">(leave blank to keep existing)</span>}
                      </label>
                      <div className="relative">
                        <input
                          type={showKey ? "text" : "password"}
                          value={form.apiKey}
                          onChange={(e) => setForm(f => ({ ...f, apiKey: e.target.value }))}
                          placeholder={provider.configured ? "Enter new key to replace..." : "sk-..."}
                          className="w-full bg-background border border-border rounded-lg px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey(v => !v)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Base URL (only for nano_banana) */}
                    {provider.hasBaseUrl && (
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1.5">
                          API Base URL
                        </label>
                        <input
                          type="url"
                          value={form.baseUrl}
                          onChange={(e) => setForm(f => ({ ...f, baseUrl: e.target.value }))}
                          placeholder="https://your-api-endpoint.com/v1"
                          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                        />
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Must be an OpenAI-compatible endpoint (supports /chat/completions)
                        </p>
                      </div>
                    )}

                    {/* Test result */}
                    {testResult && (
                      <div className={cn(
                        "flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs",
                        testResult.success
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-red-500/10 text-red-400 border border-red-500/20"
                      )}>
                        {testResult.success
                          ? <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                          : <X className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
                        <span>{testResult.message}</span>
                      </div>
                    )}

                    {/* Footer actions */}
                    <div className="flex items-center justify-between gap-3 pt-1">
                      <div className="flex items-center gap-2">
                        {/* Test */}
                        <button
                          onClick={() => handleTest(provider.id)}
                          disabled={testing || !form.apiKey.trim()}
                          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          Test connection
                        </button>

                        {/* Delete */}
                        {provider.configured && (
                          <button
                            onClick={() => handleDelete(provider.id)}
                            disabled={isDeleting}
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
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Info footer */}
      <div className="mt-8 px-4 py-3 rounded-lg bg-muted/30 border border-border text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground/70">Security note</p>
        <p>API keys are stored encrypted in the database and are only visible to admin users. Keys are never exposed in the frontend — only the last 4 characters are shown.</p>
      </div>
    </div>
  );
}
