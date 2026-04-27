import fs from "node:fs";
import OpenAI, { toFile } from "openai";
import { Buffer } from "node:buffer";

const geminiKey = process.env.GEMINI_API_KEY;
const userKey = process.env.OPENAI_API_KEY;
const proxyKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const proxyBaseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

const provider: "gemini" | "openai" = geminiKey ? "gemini" : "openai";

let openaiClient: OpenAI | null = null;
if (provider === "openai") {
  if (userKey) {
    openaiClient = new OpenAI({ apiKey: userKey, baseURL: process.env.OPENAI_BASE_URL || undefined });
  } else if (proxyKey && proxyBaseUrl) {
    openaiClient = new OpenAI({ apiKey: proxyKey, baseURL: proxyBaseUrl });
  } else {
    throw new Error(
      "No image provider configured. Set GEMINI_API_KEY, OPENAI_API_KEY, or provision the Replit OpenAI AI integration.",
    );
  }
}

export const openai = openaiClient ?? new OpenAI({ apiKey: "noop" });

export type ImageSize = "1024x1024" | "1024x1536" | "1536x1024" | "auto";
export type ImageQuality = "low" | "medium" | "high" | "auto";
export type ImageBackground = "transparent" | "opaque" | "auto";

export interface ImageGenOptions {
  size?: ImageSize;
  quality?: ImageQuality;
  background?: ImageBackground;
}

function getGeminiImageModel(): string {
  return process.env.GEMINI_IMAGE_MODEL?.trim() || "gemini-2.5-flash-image";
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  inline_data?: { mime_type: string; data: string };
}

async function geminiGenerateImage(parts: GeminiPart[]): Promise<Buffer> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${getGeminiImageModel()}:generateContent?key=${encodeURIComponent(geminiKey!)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts }] }),
  });
  if (!res.ok) {
    const txt = await res.text();
    const isQuota = res.status === 429 || /quota|free_tier|billing/i.test(txt);
    if (isQuota) {
      throw new Error(
        "Gemini image generation requires a paid plan (the free tier does not include image generation). " +
        "To enable AI images, either set OPENAI_API_KEY (recommended) or enable billing on your Google AI Studio account. " +
        "Text-based design generation still works on the free tier.",
      );
    }
    throw new Error(`Gemini image generation failed (${res.status}): ${txt}`);
  }
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  };
  const out = json.candidates?.[0]?.content?.parts ?? [];
  for (const p of out) {
    const data = p.inlineData?.data ?? p.inline_data?.data;
    if (data) return Buffer.from(data, "base64");
  }
  throw new Error("Gemini returned no image data");
}

export async function generateImageBuffer(
  prompt: string,
  size: ImageSize = "1024x1024",
): Promise<Buffer> {
  if (provider === "gemini") {
    return geminiGenerateImage([{ text: prompt }]);
  }
  const response = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size,
  });
  const base64 = response.data?.[0]?.b64_json ?? "";
  return Buffer.from(base64, "base64");
}

export async function generateImageWithLogoReference(
  logoBase64DataUrl: string,
  prompt: string,
  size: ImageSize = "1024x1024",
): Promise<Buffer> {
  const base64Data = logoBase64DataUrl.replace(/^data:image\/\w+;base64,/, "");
  const mimeType = logoBase64DataUrl.startsWith("data:image/png") ? "image/png" : "image/jpeg";

  if (provider === "gemini") {
    return geminiGenerateImage([
      { inlineData: { mimeType, data: base64Data } },
      { text: prompt },
    ]);
  }

  const imageBuffer = Buffer.from(base64Data, "base64");
  const imageFile = await toFile(imageBuffer, "logo-reference.png", { type: mimeType });

  const response = await openai.images.edit({
    model: "gpt-image-1",
    image: imageFile,
    prompt,
    size,
  });

  const resultBase64 = response.data?.[0]?.b64_json ?? "";
  return Buffer.from(resultBase64, "base64");
}

export async function generateImageWithReferences(
  referenceDataUrls: string[],
  prompt: string,
  sizeOrOpts: ImageSize | ImageGenOptions = "1024x1024",
): Promise<Buffer> {
  const opts: ImageGenOptions =
    typeof sizeOrOpts === "string" ? { size: sizeOrOpts } : sizeOrOpts;
  const size: ImageSize = opts.size ?? "1024x1024";

  if (referenceDataUrls.length === 0) {
    return generateImageBuffer(prompt, size);
  }

  if (provider === "gemini") {
    const parts: GeminiPart[] = referenceDataUrls.map((url) => {
      const base64Data = url.replace(/^data:image\/\w+;base64,/, "");
      const mimeType = url.startsWith("data:image/png") ? "image/png" : "image/jpeg";
      return { inlineData: { mimeType, data: base64Data } };
    });
    parts.push({ text: prompt });
    return geminiGenerateImage(parts);
  }

  const imageFiles = await Promise.all(
    referenceDataUrls.map(async (url, idx) => {
      const base64Data = url.replace(/^data:image\/\w+;base64,/, "");
      const mimeType = url.startsWith("data:image/png") ? "image/png" : "image/jpeg";
      const ext = mimeType === "image/png" ? "png" : "jpg";
      const buffer = Buffer.from(base64Data, "base64");
      return toFile(buffer, `reference-${idx + 1}.${ext}`, { type: mimeType });
    }),
  );

  const editParams: Record<string, unknown> = {
    model: "gpt-image-1",
    image: imageFiles,
    prompt,
    size,
  };
  if (opts.quality && opts.quality !== "auto") editParams.quality = opts.quality;
  if (opts.background && opts.background !== "auto") editParams.background = opts.background;

  const response = await openai.images.edit(editParams as Parameters<typeof openai.images.edit>[0]);

  const resultBase64 = response.data?.[0]?.b64_json ?? "";
  return Buffer.from(resultBase64, "base64");
}

export async function editImages(
  imageFiles: string[],
  prompt: string,
  outputPath?: string,
): Promise<Buffer> {
  if (provider === "gemini") {
    const parts: GeminiPart[] = imageFiles.map((file) => {
      const data = fs.readFileSync(file).toString("base64");
      return { inlineData: { mimeType: "image/png", data } };
    });
    parts.push({ text: prompt });
    const out = await geminiGenerateImage(parts);
    if (outputPath) fs.writeFileSync(outputPath, out);
    return out;
  }

  const images = await Promise.all(
    imageFiles.map((file) =>
      toFile(fs.createReadStream(file), file, { type: "image/png" }),
    ),
  );

  const response = await openai.images.edit({
    model: "gpt-image-1",
    image: images,
    prompt,
  });

  const imageBase64 = response.data?.[0]?.b64_json ?? "";
  const imageBytes = Buffer.from(imageBase64, "base64");

  if (outputPath) {
    fs.writeFileSync(outputPath, imageBytes);
  }

  return imageBytes;
}
