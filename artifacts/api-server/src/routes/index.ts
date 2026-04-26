import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import brandsRouter from "./brands";
import campaignsRouter from "./campaigns";
import postsRouter from "./posts";
import dashboardRouter from "./dashboard";
import socialRouter from "./social";
import jobsRouter from "./jobs";
import imagesRouter from "./images";
import designsRouter from "./designs";
import adminRouter, { publicSettingsRouter } from "./admin";
import adminPlatformRouter from "./admin-platform";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(brandsRouter);
router.use(campaignsRouter);
router.use(postsRouter);
router.use(dashboardRouter);
router.use(socialRouter);
router.use(jobsRouter);
router.use(imagesRouter);
router.use(designsRouter);
router.use(publicSettingsRouter);
router.use(adminRouter);
router.use(adminPlatformRouter);

export default router;
