import { useRef } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Sparkles, Loader2, AlertCircle, Download, Play, AtSign } from "lucide-react";
import type { GenerateNodeData } from "./types";

export default function GenerateImageNode({ id, data }: NodeProps) {
  const raw = (data ?? {}) as Partial<GenerateNodeData>;
  const d: GenerateNodeData = {
    prompt: raw.prompt ?? "",
    status: raw.status ?? "idle",
    resultUrl: raw.resultUrl ?? null,
    error: raw.error ?? null,
    references: raw.references ?? [],
    onPromptChange: raw.onPromptChange ?? (() => {}),
    onRun: raw.onRun ?? (() => {}),
  };
  const isRunning = d.status === "running";
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertMention = (mention: string) => {
    const el = textareaRef.current;
    const current = d.prompt || "";
    if (!el) {
      d.onPromptChange(id, `${current}${current && !current.endsWith(" ") ? " " : ""}${mention} `);
      return;
    }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const before = current.slice(0, start);
    const after = current.slice(end);
    const padBefore = before.length === 0 || before.endsWith(" ") ? "" : " ";
    const padAfter = after.length === 0 || after.startsWith(" ") ? "" : " ";
    const next = `${before}${padBefore}${mention}${padAfter}${after}`;
    d.onPromptChange(id, next);
    requestAnimationFrame(() => {
      const pos = (before + padBefore + mention + padAfter).length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="bg-card border border-border rounded-2xl shadow-xl w-80 overflow-hidden" data-testid={`node-generate-${id}`}>
      <Handle type="target" position={Position.Left} id="references" className="!w-2.5 !h-2.5 !bg-cyan-500 !border-2 !border-card" style={{ top: "30%" }} />
      <Handle type="target" position={Position.Left} id="prompt" className="!w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-card" style={{ top: "60%" }} />

      {/* Header with run button at top-right */}
      <div className="px-3 py-2 border-b border-border bg-gradient-to-r from-violet-500/10 to-primary/10 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
          <span className="text-[11px] font-semibold text-foreground truncate">ChatGPT Image</span>
          <span className="text-[9px] text-muted-foreground/70 flex-shrink-0">5 CU</span>
        </div>
        <button
          onClick={() => d.onRun(id)}
          disabled={isRunning}
          className="flex items-center justify-center w-6 h-6 rounded-md bg-violet-500/15 hover:bg-violet-500/30 text-violet-400 hover:text-violet-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all nodrag flex-shrink-0"
          title={isRunning ? "Generating..." : "Run"}
          data-testid={`button-run-${id}`}
        >
          {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 fill-current" />}
        </button>
      </div>

      <div className="p-3 space-y-2.5">
        {/* Reference mentions chips */}
        {d.references.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium">
              <AtSign className="w-2.5 h-2.5" />
              <span>المراجع المتصلة</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {d.references.map((ref) => (
                <button
                  key={ref.id}
                  onClick={() => insertMention(ref.mention)}
                  className="group flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 hover:border-cyan-500/40 text-[10px] text-cyan-200 hover:text-cyan-100 transition-all nodrag"
                  title={`اضغط لإدراج ${ref.mention} في البرومت`}
                  data-testid={`chip-mention-${ref.id}`}
                >
                  {ref.thumbnail ? (
                    <img src={ref.thumbnail} alt="" className="w-4 h-4 rounded-full object-cover ring-1 ring-cyan-500/40" />
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-cyan-500/30 flex items-center justify-center">
                      <AtSign className="w-2 h-2 text-cyan-100" />
                    </div>
                  )}
                  <span className="font-mono">{ref.mention}</span>
                  <span className="text-cyan-400/60 truncate max-w-[80px]">{ref.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* In-node prompt */}
        <textarea
          ref={textareaRef}
          value={d.prompt}
          onChange={(e) => d.onPromptChange(id, e.target.value)}
          placeholder={d.references.length > 0
            ? "اكتب البرومت هنا... استخدم @ref1, @ref2 لذكر المراجع"
            : "اكتب البرومت هنا، أو وصّل صور مرجعية على اليسار"}
          rows={4}
          className="w-full text-[11.5px] leading-relaxed bg-muted/20 border border-border rounded-lg px-2.5 py-2 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-transparent resize-none nodrag"
          data-testid={`textarea-generate-prompt-${id}`}
        />

        {/* Result preview */}
        <div className="relative w-full h-44 rounded-lg overflow-hidden bg-muted/30 border border-border flex items-center justify-center">
          {d.resultUrl ? (
            <>
              <img src={d.resultUrl} alt="generated" className="w-full h-full object-cover" />
              <a
                href={d.resultUrl}
                download="generated.png"
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full bg-black/70 hover:bg-black/90 text-white flex items-center justify-center backdrop-blur transition-colors nodrag"
                title="تحميل"
                data-testid={`button-download-${id}`}
              >
                <Download className="w-3.5 h-3.5" />
              </a>
            </>
          ) : isRunning ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
              <span className="text-[10px]">جاري التوليد...</span>
            </div>
          ) : d.status === "error" ? (
            <div className="flex flex-col items-center gap-1.5 text-red-400 px-3 text-center">
              <AlertCircle className="w-5 h-5" />
              <span className="text-[10px] leading-tight">{d.error || "حدث خطأ"}</span>
            </div>
          ) : (
            <div className="text-[10px] text-muted-foreground/70">المخرجات ستظهر هنا</div>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="image" className="!w-2.5 !h-2.5 !bg-emerald-500 !border-2 !border-card" />
    </div>
  );
}
