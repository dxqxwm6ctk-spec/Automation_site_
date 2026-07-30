import { Router, type IRouter } from "express";
import workflowsRouter from "./workflows";
import executionsRouter from "./executions";
import webhooksRouter from "./webhooks";
import credentialsRouter from "./credentials";
import schedulesRouter from "./schedules";
import variablesRouter from "./variables";

const router: IRouter = Router();

router.use("/workflows", workflowsRouter);
router.use("/executions", executionsRouter);
router.use("/webhooks", webhooksRouter);
router.use("/credentials", credentialsRouter);
router.use("/schedules", schedulesRouter);
router.use("/variables", variablesRouter);

export default router;
