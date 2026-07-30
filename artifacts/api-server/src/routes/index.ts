import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import v1Router from "./v1";
import webhookReceiverRouter from "./webhooks";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use("/v1", v1Router);
// Inbound webhook delivery — mounted without /v1 so the URLs are short and stable.
router.use("/webhooks", webhookReceiverRouter);

export default router;
