import { useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ImagePlus, Upload, X, Maximize2, RotateCcw } from "lucide-react";
import type { ImageNodeData } from "./types";
import ImageLightbox from "@/components/ImageLightbox";

const MAX_BYTES = 8 * 1024 * 1024;

function approxBytesFromDataUrl(dataUrl: string): number {
  const i = dataUrl.indexOf(",");
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}

export default function ImageInputNode({ id, data }: NodeProps) {
  const d = data as unknown as ImageNodeData;
  const fileRef = useRef<HTMLInputElement>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);

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

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleSelect(file);
  };

  const sizeBytes = d.imageDataUrl ? approxBytesFromDataUrl(d.imageDataUrl) : null;

  return (
    <>
      <div
        className="bg-card border border-border rounded-2xl shadow-lg shadow-black/30 w-64 overflow-hidden hover:shadow-cyan-500/10 transition-shadow"
        data-testid={`node-image-${id}`}
      >
        <div className="px-3 py-2 border-b border-border bg-gradient-to-r from-cyan-500/10 to-transparent flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-cyan-500/20 flex items-center justify-center">
            <ImagePlus className="w-3 h-3 text-cyan-300" />
          </div>
          <span className="text-[11px] font-semibold text-foreground truncate flex-1">{d.label}</span>
          {d.imageDataUrl && (
            <button
              onClick={() => fileRef.current?.click()}
              className="text-muted-foreground hover:text-foreground transition-colors nodrag"
              title="استبدال الصورة"
              data-testid={`button-replace-${id}`}
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="p-3 space-y-2">
          {d.imageDataUrl ? (
            <div className="relative group">
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="block w-full h-40 rounded-lg overflow-hidden nodrag cursor-zoom-in"
                title="اضغط للعرض بالحجم الكامل"
                data-testid={`button-preview-image-${id}`}
              >
                <img
                  src={d.imageDataUrl}
                  alt="reference"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute bottom-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/55 backdrop-blur text-[9.5px] text-white/90 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Maximize2 className="w-2.5 h-2.5" />
                  عرض كامل
                </div>
              </button>
              <button
                onClick={() => d.onChange(id, null, null)}
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/65 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity nodrag hover:bg-red-500/85"
                aria-label="Remove image"
                title="حذف"
                data-testid={`button-remove-image-${id}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`w-full h-40 rounded-lg border-2 border-dashed transition-all flex flex-col items-center justify-center gap-1.5 nodrag ${
                dragOver
                  ? "border-cyan-400/70 bg-cyan-500/10 text-cyan-200"
                  : "border-border hover:border-cyan-500/50 hover:bg-muted/20 text-muted-foreground"
              }`}
              data-testid={`button-upload-${id}`}
            >
              <Upload className="w-5 h-5" />
              <span className="text-[11px]">{dragOver ? "أفلت الصورة هنا" : "اضغط أو اسحب الصورة"}</span>
              <span className="text-[9.5px] text-muted-foreground/60">PNG/JPG/WebP حتى 8MB</span>
            </button>
          )}
          <div className="flex items-center justify-between px-1.5 py-1 rounded bg-muted/40 text-[10px] text-muted-foreground gap-2">
            <span className="truncate flex-1">{d.filename || "بدون ملف"}</span>
            {sizeBytes != null && (
              <span className="font-mono text-muted-foreground/70 flex-shrink-0">
                {sizeBytes < 1024 * 1024
                  ? `${(sizeBytes / 1024).toFixed(0)} KB`
                  : `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`}
              </span>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleSelect(e.target.files?.[0] ?? null)}
            className="hidden"
          />
        </div>
        <Handle
          type="source"
          position={Position.Right}
          id="image"
          className="!w-2.5 !h-2.5 !bg-cyan-500 !border-2 !border-card"
        />
      </div>

      <ImageLightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        src={d.imageDataUrl}
        title={d.label}
        filename={d.filename ?? `${d.label}.png`}
        meta={{ sizeBytes }}
      />
    </>
  );
}
