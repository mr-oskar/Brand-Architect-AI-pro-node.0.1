import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Sparkles, Loader2, AlertCircle, Download, Play } from "lucide-react";
import type { GenerateNodeData } from "./types";

export default function GenerateImageNode({ id, data }: NodeProps) {
  const d = data as unknown as GenerateNodeData;
  const isRunning = d.status === "running";

  return (
    <div className="bg-card border border-border rounded-2xl shadow-xl w-72 overflow-hidden" data-testid={`node-generate-${id}`}>
      <Handle type="target" position={Position.Left} id="references" className="!w-2.5 !h-2.5 !bg-cyan-500 !border-2 !border-card" style={{ top: "30%" }} />
      <Handle type="target" position={Position.Left} id="prompt" className="!w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-card" style={{ top: "60%" }} />

      <div className="px-3 py-2 border-b border-border bg-gradient-to-r from-violet-500/10 to-primary/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-violet-500" />
          <span className="text-[11px] font-semibold text-foreground">ChatGPT Image</span>
        </div>
        <span className="text-[10px] text-muted-foreground">5 CU</span>
      </div>

      <div className="p-3 space-y-2">
        <div className="relative w-full h-48 rounded-lg overflow-hidden bg-muted/30 border border-border flex items-center justify-center">
          {d.resultUrl ? (
            <img src={d.resultUrl} alt="generated" className="w-full h-full object-cover" />
          ) : isRunning ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
              <span className="text-[11px]">جاري التوليد...</span>
            </div>
          ) : d.status === "error" ? (
            <div className="flex flex-col items-center gap-1.5 text-red-500 px-3 text-center">
              <AlertCircle className="w-5 h-5" />
              <span className="text-[10px] leading-tight">{d.error || "حدث خطأ"}</span>
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground/70">المخرجات ستظهر هنا</div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span>References + Prompt</span>
          <span>Image</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => d.onRun(id)}
            disabled={isRunning}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors nodrag"
            data-testid={`button-run-${id}`}
          >
            {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {isRunning ? "Generating" : "Run"}
          </button>
          {d.resultUrl && (
            <a
              href={d.resultUrl}
              download="generated.png"
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-2 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors nodrag"
              title="Download"
              data-testid={`button-download-${id}`}
            >
              <Download className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="image" className="!w-2.5 !h-2.5 !bg-emerald-500 !border-2 !border-card" />
    </div>
  );
}
