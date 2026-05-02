import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pdfRouter from "./pdf";
import projectsRouter from "./projects";
import exportAllRouter from "./export-all";
import editingRouter from "./editing";
import authRouter from "./auth";
import shareRouter from "./share";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(pdfRouter);
router.use(exportAllRouter);
router.use(projectsRouter);
router.use(editingRouter);
router.use(shareRouter);

export default router;
