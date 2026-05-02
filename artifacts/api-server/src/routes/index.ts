import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pdfRouter from "./pdf";
import projectsRouter from "./projects";
import exportAllRouter from "./export-all";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pdfRouter);
router.use(exportAllRouter);
router.use(projectsRouter);

export default router;
