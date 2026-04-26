import { Handle, Position, type NodeProps } from "@xyflow/react";
import { FileText } from "lucide-react";
import type { PromptNodeData } from "./types";

export default function PromptNode({ id, data }: NodeProps) {
  const d = data as unknown as PromptNodeData;
  return (
    <div className="bg-card border border-border rounded-2xl shadow-lg w-72 overflow-hidden" data-testid={`node-prompt-${id}`}>
      <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center gap-2">
        <FileText className="w-3.5 h-3.5 text-amber-500" />
        <span className="text-[11px] font-semibold text-foreground">Instructions</span>
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Input</span>
          <span>Output</span>
        </div>
        <textarea
          value={d.text}
          onChange={(e) => d.onChange(id, e.target.value)}
          placeholder="اكتب تعليماتك هنا... مثلاً: حوّل هذه الصورة إلى أسود وأبيض بأسلوب فني"
          rows={6}
          className="w-full text-[12px] leading-relaxed bg-muted/20 border border-border rounded-lg px-2.5 py-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-transparent resize-none nodrag"
          data-testid={`textarea-prompt-${id}`}
        />
      </div>
      <Handle type="source" position={Position.Right} id="prompt" className="!w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-card" />
    </div>
  );
}
