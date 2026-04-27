import { useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ImagePlus, Upload, X, Maximize2, RotateCcw, Loader2 } from "lucide-react";
import type { ImageNodeData } from "./types";
import ImageLightbox from "@/components/ImageLightbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const MAX_BYTES = 8 * 1024 * 1024;

function approxBytesFromDataUrl(dataUrl: string): number {
  const i = dataUrl.indexOf(",");
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}

export default function ImageInputNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as ImageNodeData;
  const fileRef = useRef<HTMLInputElement>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const isUploading = !!d.uploading;

  const handleSelect = (file: File | null) => {
    if (!file) return;
    setLocalError(null);
    if (!file.type.startsWith("image/")) {
      setLocalError("Image files only");
      return;
    }
    if (file.size > MAX_BYTES) {
      setLocalError("Max 8 MB");
      return;
    }
    d.onUploadingChange(id, true);
    const reader = new FileReader();
    reader.onload = () => {
      d.onChange(id, String(reader.result), file.name);
      d.onUploadingChange(id, false);
    };
    reader.onerror = () => {
      setLocalError("Could not read file");
      d.onUploadingChange(id, false);
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
        className={`bg-card border rounded-xl shadow-lg shadow-black/30 w-52 overflow-hidden transition-all ${
          selected ? "border-cyan-400/70 ring-2 ring-cyan-500/30" : "border-border hover:border-cyan-500/40"
        }`}
        data-testid={`node-image-${id}`}
      >
        <div className="px-2.5 py-1.5 border-b border-border bg-gradient-to-r from-cyan-500/10 to-transparent flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
            <ImagePlus className="w-2.5 h-2.5 text-cyan-300" />
          </div>
          <span className="text-[10.5px] font-semibold text-foreground truncate flex-1">{d.label}</span>
          {d.imageDataUrl && !isUploading && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="text-muted-foreground hover:text-foreground transition-colors nodrag p-0.5"
                  data-testid={`button-replace-${id}`}
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Replace</TooltipContent>
            </Tooltip>
          )}
          {isUploading && <Loader2 className="w-3 h-3 text-cyan-300 animate-spin" />}
        </div>
        <div className="p-2 space-y-1.5">
          {isUploading ? (
            <div className="w-full h-32 rounded-lg border border-cyan-500/30 bg-cyan-500/5 flex flex-col items-center justify-center gap-1.5 nodrag">
              <Loader2 className="w-5 h-5 text-cyan-300 animate-spin" />
              <span className="text-[10px] text-cyan-200/80">Uploading…</span>
            </div>
          ) : d.imageDataUrl ? (
            <div className="relative group">
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="block w-full h-32 rounded-lg overflow-hidden nodrag cursor-zoom-in"
                data-testid={`button-preview-image-${id}`}
              >
                <img
                  src={d.imageDataUrl}
                  alt="reference"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute bottom-1.5 left-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                  <Maximize2 className="w-2.5 h-2.5" />
                </div>
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => d.onChange(id, null, null)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/65 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity nodrag hover:bg-red-500/85"
                    aria-label="Remove image"
                    data-testid={`button-remove-image-${id}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Remove</TooltipContent>
              </Tooltip>
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
              className={`w-full h-32 rounded-lg border-2 border-dashed transition-all flex flex-col items-center justify-center gap-1 nodrag ${
                dragOver
                  ? "border-cyan-400/70 bg-cyan-500/10 text-cyan-200"
                  : "border-border hover:border-cyan-500/50 hover:bg-muted/20 text-muted-foreground"
              }`}
              data-testid={`button-upload-${id}`}
            >
              <Upload className="w-4 h-4" />
              <span className="text-[10px]">{dragOver ? "Drop here" : "Click or drop image"}</span>
              <span className="text-[9px] text-muted-foreground/60">PNG · JPG · WebP · 8MB</span>
            </button>
          )}
          <div className="flex items-center justify-between px-1.5 py-0.5 rounded bg-muted/40 text-[9px] text-muted-foreground gap-2">
            <span className="truncate flex-1">{d.filename || (localError ? localError : "No file")}</span>
            {sizeBytes != null && !isUploading && (
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
          className="!w-3 !h-3 !bg-cyan-500 !border-2 !border-card hover:!w-3.5 hover:!h-3.5 transition-all"
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
