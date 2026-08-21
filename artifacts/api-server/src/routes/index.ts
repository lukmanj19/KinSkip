import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import mediaRouter from "./media";
import jumpframesRouter from "./jumpframes";
import submissionsRouter from "./submissions";
import adminRouter from "./admin";
import subtitlesRouter from "./subtitles";
import rewardsRouter from "./rewards";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(mediaRouter);
router.use(jumpframesRouter);
router.use(submissionsRouter);
router.use(adminRouter);
router.use(subtitlesRouter);
router.use(rewardsRouter);

export default router;
