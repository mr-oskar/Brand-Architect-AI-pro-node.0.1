import { useState, useEffect, useCallback } from "react";
import { Cpu, Save, RotateCcw, ChevronDown, ChevronUp, Info, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/apiFetch";
import { extractApiError, notifyError, notifySuccess } from "@/lib/apiError";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TaskConfig {
  taskType: string;
  label: string;
  description: string;
  primaryModel: string | null;
  fallbackModel: string | null;
}

interface AvailableModel {
  id: string;
  name: string;
  capability: string;
  isDefault: boolean;
}

// ── Static fallback suggestions (shown when no API key is configured) ─────────

const STATIC_SUGGESTIONS = [
  { group: "OpenAI", models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1", "o4-mini", "o3"] },
  { group: "Gemini", models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"] },
];

// ── Model input with suggestions dropdown ─────────────────────────────────────

function ModelInput({
  value,
  onChange,
  placeholder,
  configuredModels,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  configuredModels: AvailableModel[];
}) {
  const [open, setOpen] = useState(false);

  const configuredTextModels = configuredModels.filter((m) => m.capability === "text");

  return (
    <div className="relative">
      <div className="flex gap-1">
        <Input
          className="h-8 text-xs font-mono bg-background border-border flex-1"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); }}
          className="px-2 text-muted-foreground hover:text-foreground transition-colors"
          title="Show suggestions"
        >
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl overflow-hidden max-h-64 overflow-y-auto">
          {/* Configured models from API Keys — shown first */}
          {configuredTextModels.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[10px] font-semibold text-primary uppercase tracking-wider bg-primary/5 border-b border-border flex items-center gap-1.5">
                <Zap className="w-2.5 h-2.5" /> Configured in API Keys
              </div>
              {configuredTextModels.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-xs font-mono hover:bg-primary/10 hover:text-primary transition-colors flex items-center justify-between gap-2"
                  onMouseDown={() => { onChange(m.id); setOpen(false); }}
                >
                  <span>{m.id}</span>
                  {m.isDefault && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-primary/15 text-primary font-semibold flex-shrink-0">default</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Static fallback suggestions */}
          {STATIC_SUGGESTIONS.map((grp) => (
            <div key={grp.group}>
              <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/40 border-b border-border">
                {grp.group}
              </div>
              {grp.models.map((m) => (
                <button
                  key={m}
                  type="button"
                  className="w-full text-left px-3 py-2 text-xs font-mono hover:bg-primary/10 hover:text-primary transition-colors"
                  onMouseDown={() => { onChange(m); setOpen(false); }}
                >
                  {m}
                </button>
              ))}
            </div>
          ))}

          <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-border">
            Or type any model name manually
          </div>
        </div>
      )}
    </div>
  );
}

// ── Task row ──────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  onSaved,
  configuredModels,
}: {
  task: TaskConfig;
  onSaved: (updated: TaskConfig) => void;
  configuredModels: AvailableModel[];
}) {
  const [primary,  setPrimary]  = useState(task.primaryModel  ?? "");
  const [fallback, setFallback] = useState(task.fallbackModel ?? "");
  const [saving,   setSaving]   = useState(false);
  const [dirty,    setDirty]    = useState(false);

  useEffect(() => {
    const isDirty =
      (primary  || null) !== (task.primaryModel  || null) ||
      (fallback || null) !== (task.fallbackModel || null);
    setDirty(isDirty);
  }, [primary, fallback, task.primaryModel, task.fallbackModel]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/admin/models/task-config/${task.taskType}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryModel:  primary.trim()  || null,
          fallbackModel: fallback.trim() || null,
        }),
      });
      if (!res.ok) {
        const msg = await extractApiError(res);
        notifyError("Save failed", msg);
        return;
      }
      const data: TaskConfig = await res.json();
      onSaved({ ...task, primaryModel: data.primaryModel, fallbackModel: data.fallbackModel });
      setDirty(false);
      notifySuccess(`Saved "${task.label}"`, "Model config updated.");
    } catch (err) {
      notifyError("Save failed", err);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setPrimary(task.primaryModel  ?? "");
    setFallback(task.fallbackModel ?? "");
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-foreground">{task.label}</span>
            <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 text-muted-foreground">
              {task.taskType}
            </Badge>
            {task.primaryModel && (
              <Badge className="text-[10px] px-1.5 py-0 bg-violet-500/15 text-violet-400 border-violet-500/30">
                {task.primaryModel}
              </Badge>
            )}
            {task.fallbackModel && (
              <Badge className="text-[10px] px-1.5 py-0 bg-amber-500/15 text-amber-400 border-amber-500/30">
                ↩ {task.fallbackModel}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
        </div>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            Primary model
          </label>
          <ModelInput
            value={primary}
            onChange={setPrimary}
            placeholder="e.g. gpt-4o  (blank = global default)"
            configuredModels={configuredModels}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            Fallback model{" "}
            <span className="text-muted-foreground/60">(tried if primary fails)</span>
          </label>
          <ModelInput
            value={fallback}
            onChange={setFallback}
            placeholder="e.g. gpt-4o-mini  (optional)"
            configuredModels={configuredModels}
          />
        </div>
      </div>

      {/* Actions */}
      {dirty && (
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving…
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Save className="w-3 h-3" />
                Save
              </span>
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-muted-foreground"
            onClick={handleReset}
            disabled={saving}
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Revert
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminTaskModels() {
  const [tasks,            setTasks]            = useState<TaskConfig[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [error,            setError]            = useState<string | null>(null);
  const [configuredModels, setConfiguredModels] = useState<AvailableModel[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [configRes, modelsRes] = await Promise.all([
        apiFetch("/api/admin/models/task-config"),
        apiFetch("/api/ai/models").catch(() => null),
      ]);

      if (!configRes.ok) {
        setError(await extractApiError(configRes));
        return;
      }
      const data: TaskConfig[] = await configRes.json();
      setTasks(data);

      if (modelsRes?.ok) {
        const modelsData = await modelsRes.json().catch(() => ({ models: [] }));
        setConfiguredModels(modelsData.models ?? []);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load task configs";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaved = (updated: TaskConfig) =>
    setTasks((prev) => prev.map((t) => (t.taskType === updated.taskType ? updated : t)));

  const configuredCount = tasks.filter((t) => t.primaryModel).length;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold">Task Models</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Configure which AI model to use for each generation task, and an automatic fallback if the primary fails.
          </p>
        </div>
        {!loading && tasks.length > 0 && (
          <div className="text-right flex-shrink-0">
            <div className="text-2xl font-bold text-primary">{configuredCount}</div>
            <div className="text-xs text-muted-foreground">of {tasks.length} configured</div>
          </div>
        )}
      </div>

      {/* Info banner */}
      <div className="flex gap-3 bg-violet-500/10 border border-violet-500/20 rounded-xl p-4 text-sm text-violet-300">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-violet-400" />
        <div>
          <strong className="text-violet-200">How it works:</strong>{" "}
          Tasks with no primary model use the global default from{" "}
          <span className="font-medium">Admin → API Keys → Text Model</span>.
          If the primary model call fails for any reason, the fallback model is tried automatically
          and logged with <span className="font-mono text-xs">is_fallback = true</span>.
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-6 text-center text-sm text-destructive">
          {error}
          <Button size="sm" variant="outline" className="mt-3 mx-auto block" onClick={load}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskRow key={task.taskType} task={task} onSaved={handleSaved} configuredModels={configuredModels} />
          ))}
        </div>
      )}
    </div>
  );
}
