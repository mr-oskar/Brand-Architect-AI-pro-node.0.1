import { Handle, Position, type NodeProps } from "@xyflow/react";
import { FileText } from "lucide-react";
import type { PromptNodeData } from "./types";

export default function PromptNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as PromptNodeData;
  return (
    <div
      className={`bg-card border rounded-xl shadow-lg w-60 overflow-hidden transition-all ${
        selected ? "border-amber-400/70 ring-2 ring-amber-500/30" : "border-border hover:border-amber-500/40"
      }`}
      data-testid={`node-prompt-${id}`}
    >
      <div className="px-2.5 py-1.5 border-b border-border bg-gradient-to-r from-amber-500/10 to-transparent flex items-center gap-2">
        <div className="w-4 h-4 rounded bg-amber-500/20 flex items-center justify-center flex-shrink-0">
          <FileText className="w-2.5 h-2.5 text-amber-300" />
        </div>
        <span className="text-[10.5px] font-semibold text-foreground">Instructions</span>
      </div>
      <div className="p-2">
        <textarea
          value={d.text}
          onChange={(e) => d.onChange(id, e.target.value)}
          placeholder="Describe what to generate…"
          rows={5}
          className="w-full text-[11px] leading-relaxed bg-muted/20 border border-border rounded-lg px-2 py-1.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-transparent resize-none nodrag"
          data-testid={`textarea-prompt-${id}`}
        />
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="prompt"
        className="!w-3 !h-3 !bg-amber-500 !border-2 !border-card hover:!w-3.5 hover:!h-3.5 transition-all"
      />
    </div>
  );
}
