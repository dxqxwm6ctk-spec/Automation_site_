import { Router, type IRouter } from "express";
import workflowsRouter from "./workflows";
import executionsRouter from "./executions";

const router: IRouter = Router();

router.use("/workflows", workflowsRouter);
router.use("/executions", executionsRouter);

export default router;
