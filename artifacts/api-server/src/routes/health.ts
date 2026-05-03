import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getProvidersStatus } from "../lib/extractor";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/providers/status", async (_req, res) => {
  const status = await getProvidersStatus();
  res.json(status);
});

export default router;
