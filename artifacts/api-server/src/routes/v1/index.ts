import { Router, type IRouter } from "express";
import workflowsRouter from "./workflows";
import executionsRouter from "./executions";
import webhooksRouter from "./webhooks";

const router: IRouter = Router();

router.use("/workflows", workflowsRouter);
router.use("/executions", executionsRouter);
router.use("/webhooks", webhooksRouter);

export default router;
