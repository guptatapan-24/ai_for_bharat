import { Router, type IRouter } from "express";
import { requireAuth, ensureUserExists } from "../middlewares/auth";
import healthRouter from "./health";
import casesRouter from "./cases";
import directivesRouter from "./directives";
import actionPlanRouter from "./action-plan";
import dashboardRouter from "./dashboard";
import auditRouter from "./audit";
import uploadRouter from "./upload";
import usersRouter from "./users";

const router: IRouter = Router();

router.use(healthRouter);
router.use(requireAuth);
router.use(ensureUserExists);
router.use(usersRouter);
router.use(casesRouter);
router.use(directivesRouter);
router.use(actionPlanRouter);
router.use(dashboardRouter);
router.use(auditRouter);
router.use(uploadRouter);

export default router;
