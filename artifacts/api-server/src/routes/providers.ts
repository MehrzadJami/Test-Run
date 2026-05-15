import { Router, type IRouter } from "express";

import { getProviderStatus } from "../lib/provider-status";

const router: IRouter = Router();

router.get("/providers/status", (_req, res): void => {
  res.json(getProviderStatus());
});

export default router;
