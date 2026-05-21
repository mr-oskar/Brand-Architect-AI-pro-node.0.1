/**
 * Image utility functions — pure helpers with no React dependencies.
 *
 * Import anywhere in the frontend: import { removeLogoBackground } from "@/lib/imageUtils"
 *
 * To add a new image utility:
 *   1. Write a pure async function here
 *   2. Export it
 *   3. Never import React here — keep this module framework-agnostic
 */

/**
 * Reads a File and returns a base64 data URL.
 */
export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Resizes an image file to fit within maxDimension while preserving aspect ratio.
 * Preserves transparency for PNG files that have alpha channels.
 * Returns a base64 data URL (PNG for transparent, JPEG for opaque).
 */
export async function resizeImageFile(
  file: File,
  maxDimension = 800,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          const ratio = Math.min(maxDimension / width, maxDimension / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;

        const isPng = file.type === "image/png";
        let hasAlpha = false;
        if (isPng) {
          ctx.drawImage(img, 0, 0, width, height);
          const pixels = ctx.getImageData(0, 0, width, height).data;
          for (let i = 3; i < pixels.length; i += 4) {
            if (pixels[i]! < 200) { hasAlpha = true; break; }
          }
        }

        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        resolve(
          hasAlpha
            ? canvas.toDataURL("image/png")
            : canvas.toDataURL("image/jpeg", 0.85),
        );
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = result;
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Removes the background from a logo image using corner-sampling heuristics.
 * Pixels close in color to the sampled background color are made transparent.
 *
 * Falls back to returning the original URL on CORS/load errors.
 *
 * @param logoUrl  - URL or data URL of the logo
 * @param tolerance - Color-distance threshold 0–765, default 50
 */
export async function removeLogoBackground(
  logoUrl: string,
  tolerance = 50,
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;

      const corners = [
        [d[0]!, d[1]!, d[2]!],
        [d[(canvas.width - 1) * 4]!, d[(canvas.width - 1) * 4 + 1]!, d[(canvas.width - 1) * 4 + 2]!],
        [d[(canvas.height - 1) * canvas.width * 4]!, d[(canvas.height - 1) * canvas.width * 4 + 1]!, d[(canvas.height - 1) * canvas.width * 4 + 2]!],
        [d[((canvas.height - 1) * canvas.width + canvas.width - 1) * 4]!, d[((canvas.height - 1) * canvas.width + canvas.width - 1) * 4 + 1]!, d[((canvas.height - 1) * canvas.width + canvas.width - 1) * 4 + 2]!],
      ];
      const bgR = Math.round(corners.reduce((s, c) => s + c[0]!, 0) / 4);
      const bgG = Math.round(corners.reduce((s, c) => s + c[1]!, 0) / 4);
      const bgB = Math.round(corners.reduce((s, c) => s + c[2]!, 0) / 4);

      for (let i = 0; i < d.length; i += 4) {
        const dist =
          Math.abs(d[i]! - bgR) +
          Math.abs(d[i + 1]! - bgG) +
          Math.abs(d[i + 2]! - bgB);
        if (dist < tolerance) d[i + 3] = 0;
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(logoUrl);
    img.src = logoUrl;
  });
}
