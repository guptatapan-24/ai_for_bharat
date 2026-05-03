import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import healthRouter from "./health";
import casesRouter from "./cases";
import directivesRouter from "./directives";
import actionPlanRouter from "./action-plan";
import dashboardRouter from "./dashboard";
import auditRouter from "./audit";
import uploadRouter from "./upload";

const router: IRouter = Router();

const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

router.use(healthRouter);
router.use(requireAuth);
router.use(casesRouter);
router.use(directivesRouter);
router.use(actionPlanRouter);
router.use(dashboardRouter);
router.use(auditRouter);
router.use(uploadRouter);

export default router;
