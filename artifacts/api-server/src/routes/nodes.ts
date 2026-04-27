import { Router, type IRouter } from "express";
import sharp from "sharp";
import { Buffer } from "node:buffer";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { asyncHandler } from "../lib/asyncHandler";
import {
  generateImageWithReferences,
  openai,
  type ImageSize,
  type ImageQuality,
  type ImageBackground,
  type ImageModel,
} from "@workspace/integrations-openai-ai-server";
import { uploadImageBuffer } from "../lib/imageStorage";
import { chargeCredits, InsufficientCreditsError } from "../lib/credits";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const MAX_REFS = 6;
const MAX_PROMPT_LEN = 4000;
const VALID_SIZES: ReadonlyArray<ImageSize> = ["1024x1024", "1024x1536", "1536x1024", "auto"];
const VALID_QUALITIES: ReadonlyArray<ImageQuality> = ["low", "medium", "high", "auto"];
const VALID_BACKGROUNDS: ReadonlyArray<ImageBackground> = ["transparent", "opaque", "auto"];
const VALID_MODELS: ReadonlyArray<ImageModel> = ["auto", "gpt-image-1", "gemini-2.5-flash-image"];

/** Parse "1024x1536" into [width, height]. Returns null for "auto" or invalid. */
function parseSize(size: ImageSize): [number, number] | null {
  if (size === "auto") return null;
  const m = /^(\d+)x(\d+)$/.exec(size);
  if (!m) return null;
  return [Number(m[1]), Number(m[2])];
}

/**
 * Guarantee the output matches the requested aspect ratio. If the model returned
 * a buffer that doesn't match (common with Gemini), we cover-crop & resize to the
 * exact pixel dimensions so the user always gets the size they asked for.
 */
async function enforceSize(buf: Buffer, size: ImageSize): Promise<Buffer> {
  const target = parseSize(size);
  if (!target) return buf;
  const [tw, th] = target;
  try {
    const meta = await sharp(buf).metadata();
    if (meta.width === tw && meta.height === th) return buf;
    return await sharp(buf)
      .resize(tw, th, { fit: "cover", position: "attention" })
      .png()
      .toBuffer();
  } catch (err) {
    logger.warn({ err }, "[nodes] enforceSize failed; returning original buffer");
    return buf;
  }
}

router.post(
  "/nodes/generate-image",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const { prompt, referenceImages, size, quality, background, model } = req.body ?? {};

    if (typeof prompt !== "string" || !prompt.trim()) {
      res.status(400).json({ error: "Prompt is required" });
      return;
    }
    if (prompt.length > MAX_PROMPT_LEN) {
      res.status(400).json({ error: `Prompt too long (max ${MAX_PROMPT_LEN} chars)` });
      return;
    }

    const refs: string[] = Array.isArray(referenceImages) ? referenceImages : [];
    if (refs.length > MAX_REFS) {
      res.status(400).json({ error: `Too many reference images (max ${MAX_REFS})` });
      return;
    }
    for (const r of refs) {
      if (typeof r !== "string" || !r.startsWith("data:image/")) {
        res.status(400).json({ error: "Each reference image must be a base64 data URL" });
        return;
      }
    }

    const requestedSize: ImageSize =
      typeof size === "string" && VALID_SIZES.includes(size as ImageSize)
        ? (size as ImageSize)
        : "1024x1024";

    const requestedQuality: ImageQuality | undefined =
      typeof quality === "string" && VALID_QUALITIES.includes(quality as ImageQuality)
        ? (quality as ImageQuality)
        : undefined;

    const requestedBackground: ImageBackground | undefined =
      typeof background === "string" && VALID_BACKGROUNDS.includes(background as ImageBackground)
        ? (background as ImageBackground)
        : undefined;

    const requestedModel: ImageModel | undefined =
      typeof model === "string" && VALID_MODELS.includes(model as ImageModel)
        ? (model as ImageModel)
        : undefined;

    try {
      await chargeCredits(userId, "design.generate-image");
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        res.status(402).json({ error: err.message });
        return;
      }
      throw err;
    }

    try {
      const buf = await generateImageWithReferences(refs, prompt, {
        size: requestedSize,
        quality: requestedQuality,
        background: requestedBackground,
        model: requestedModel,
      });
      const enforced = await enforceSize(buf, requestedSize);
      const objectPath = await uploadImageBuffer(enforced, "image/png");
      const url = `/api${objectPath.replace(/^\/objects\//, "/storage/images/objects/")}`;
      res.json({ url });
    } catch (err: any) {
      logger.error({ err }, "[nodes] image generation failed");
      const message = err?.message || "Image generation failed";
      res.status(500).json({ error: message });
    }
  }),
);

const STYLE_EXTRACT_SYSTEM = `You are an expert visual prompt engineer. Given an image, write a single dense paragraph that captures ONLY the visual STYLE of that image, so it can be applied as a style overlay to ANY other subject without distorting that subject.

Strict rules:
- Do NOT describe the subject, characters, objects, scene, action, or composition of the source image.
- Do NOT include nouns that name the depicted content (e.g. "a cat on a chair") — describe only HOW it looks, not WHAT is shown.
- Do NOT mention the source image, the analysis task, or that this is a description.
- Write the paragraph as a reusable style instruction that begins with phrasing like "Render in a style characterized by…" or "Apply a visual treatment featuring…".

Cover ONLY these stylistic dimensions, in flowing prose (no headings, no bullets):
- Art style / medium (photo, oil painting, 3D render, vector, anime, etc.)
- Color palette (specific hues, saturation, contrast)
- Lighting quality (direction, hardness, color temperature, mood)
- Texture, materials, surface finish, grain
- Rendering technique, line quality, brushwork, post-processing
- Mood and overall atmosphere

Keep it under 160 words.`;

router.post(
  "/nodes/extract-style",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const { imageDataUrl } = req.body ?? {};

    if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
      res.status(400).json({ error: "imageDataUrl must be a base64 data URL" });
      return;
    }
    if (imageDataUrl.length > 12 * 1024 * 1024) {
      res.status(400).json({ error: "Image is too large (max ~9 MB)" });
      return;
    }

    try {
      await chargeCredits(userId, "design.generate-image");
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        res.status(402).json({ error: err.message });
        return;
      }
      throw err;
    }

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 500,
        temperature: 0.4,
        messages: [
          { role: "system", content: STYLE_EXTRACT_SYSTEM },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this image and produce a professional image-generation prompt as described.",
              },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
      });
      const text = completion.choices?.[0]?.message?.content?.trim() ?? "";
      if (!text) {
        res.status(500).json({ error: "Model returned no text" });
        return;
      }
      res.json({ prompt: text });
    } catch (err: any) {
      logger.error({ err }, "[nodes] style extraction failed");
      res.status(500).json({ error: err?.message || "Style extraction failed" });
    }
  }),
);

export default router;
