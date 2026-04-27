import { Router, type IRouter } from "express";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { asyncHandler } from "../lib/asyncHandler";
import {
  generateImageWithReferences,
  type ImageSize,
  type ImageQuality,
  type ImageBackground,
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

router.post(
  "/nodes/generate-image",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const { prompt, referenceImages, size, quality, background } = req.body ?? {};

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
      });
      const objectPath = await uploadImageBuffer(buf, "image/png");
      const url = `/api${objectPath.replace(/^\/objects\//, "/storage/images/objects/")}`;
      res.json({ url });
    } catch (err: any) {
      logger.error({ err }, "[nodes] image generation failed");
      const message = err?.message || "Image generation failed";
      res.status(500).json({ error: message });
    }
  }),
);

export default router;
