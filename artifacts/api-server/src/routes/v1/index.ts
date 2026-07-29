import { Router, type IRouter } from "express";
import workflowsRouter from "./workflows";

const router: IRouter = Router();

router.use("/workflows", workflowsRouter);

export default router;
