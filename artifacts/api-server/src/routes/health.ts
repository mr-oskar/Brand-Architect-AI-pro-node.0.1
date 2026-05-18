import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { appSettingsTable } from "@workspace/db/schema";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { getJob } from "../lib/jobStore";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/public-settings", async (_req, res) => {
  try {
    const rows = await db.select().from(appSettingsTable);
    const map = new Map<string, unknown>(rows.map((r) => [r.key, r.value]));
    const site = (map.get("site") as Record<string, unknown>) ?? {};
    const features = (map.get("features") as Record<string, unknown>) ?? {};
    const maintenance = (map.get("maintenance") as Record<string, unknown>) ?? {};
    res.json({ ...site, features, maintenance });
  } catch {
    res.json({
      siteName: "Brand Architect AI Pro",
      tagline: "AI Brand & Marketing OS",
      primaryColor: "#7c3aed",
      features: { imageGeneration: true, socialPublishing: true, analytics: true, templates: true },
      maintenance: { enabled: false, message: "" },
    });
  }
});

router.get("/jobs/:id", requireAuth, (req, res) => {
  const userId = (req as AuthRequest).userId;
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  if (job.userId && job.userId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json(job);
});

export default router;
