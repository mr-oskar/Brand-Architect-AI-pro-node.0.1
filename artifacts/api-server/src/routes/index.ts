import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import brandsRouter from "./brands";
import campaignsRouter from "./campaigns";
import postsRouter from "./posts";
import dashboardRouter from "./dashboard";
import imagesRouter from "./images";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(brandsRouter);
router.use(campaignsRouter);
router.use(postsRouter);
router.use(dashboardRouter);
router.use(imagesRouter);

export default router;
