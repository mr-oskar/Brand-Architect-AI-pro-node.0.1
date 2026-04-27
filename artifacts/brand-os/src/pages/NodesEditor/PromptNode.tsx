import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { PromptNodeData } from "./types";

export default function PromptNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as PromptNodeData;
  return (
    <div
      className={`group/node relative w-60 rounded-2xl backdrop-blur-xl bg-[#15171f]/85 border transition-all duration-200 ${
        selected
          ? "border-amber-300/50 shadow-[0_0_0_1px_rgba(252,211,77,0.30),0_18px_50px_-12px_rgba(252,211,77,0.25)]"
          : "border-white/[0.07] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)] hover:border-white/15"
      }`}
      data-testid={`node-prompt-${id}`}
    >
      <div
        aria-hidden
        className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/55 to-transparent"
      />
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-300 shadow-[0_0_8px_2px_rgba(252,211,77,0.45)]" />
        <span className="text-[11px] font-medium text-foreground/95 tracking-tight">Instructions</span>
      </div>
      <div className="px-2.5 pb-2.5">
        <textarea
          value={d.text}
          onChange={(e) => d.onChange(id, e.target.value)}
          placeholder="Describe what to generate…"
          rows={5}
          className="w-full text-[11px] leading-relaxed bg-white/[0.02] border border-white/[0.06] rounded-xl px-2.5 py-2 text-foreground placeholder:text-muted-foreground/45 focus:outline-none focus:bg-white/[0.04] focus:border-amber-300/40 resize-none nodrag transition-colors"
          data-testid={`textarea-prompt-${id}`}
        />
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="prompt"
        className="!w-2.5 !h-2.5 !bg-[#0b0d12] !border-[1.5px] !border-amber-300 hover:!w-3 hover:!h-3 transition-all"
      />
    </div>
  );
}
