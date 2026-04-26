import { useRef } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ImagePlus, Upload, X } from "lucide-react";
import type { ImageNodeData } from "./types";

const MAX_BYTES = 8 * 1024 * 1024;

export default function ImageInputNode({ id, data }: NodeProps) {
  const d = data as unknown as ImageNodeData;
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSelect = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("الرجاء اختيار ملف صورة");
      return;
    }
    if (file.size > MAX_BYTES) {
      alert("حجم الصورة يجب أن يكون أقل من 8MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      d.onChange(id, String(reader.result), file.name);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="bg-card border border-border rounded-2xl shadow-lg w-60 overflow-hidden" data-testid={`node-image-${id}`}>
      <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center gap-2">
        <ImagePlus className="w-3.5 h-3.5 text-cyan-500" />
        <span className="text-[11px] font-semibold text-foreground">{d.label}</span>
      </div>
      <div className="p-3 space-y-2">
        {d.imageDataUrl ? (
          <div className="relative group">
            <img src={d.imageDataUrl} alt="reference" className="w-full h-40 object-cover rounded-lg" />
            <button
              onClick={() => d.onChange(id, null, null)}
              className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Remove image"
              data-testid={`button-remove-image-${id}`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full h-40 rounded-lg border-2 border-dashed border-border hover:border-primary/60 hover:bg-muted/20 transition-colors flex flex-col items-center justify-center gap-1.5 text-muted-foreground"
            data-testid={`button-upload-${id}`}
          >
            <Upload className="w-5 h-5" />
            <span className="text-[11px]">اضغط لرفع صورة</span>
          </button>
        )}
        <div className="px-1.5 py-1 rounded bg-muted/40 text-[10px] text-muted-foreground truncate">
          {d.filename || "Added file"}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={(e) => handleSelect(e.target.files?.[0] ?? null)}
          className="hidden"
        />
      </div>
      <Handle type="source" position={Position.Right} id="image" className="!w-2.5 !h-2.5 !bg-cyan-500 !border-2 !border-card" />
    </div>
  );
}
