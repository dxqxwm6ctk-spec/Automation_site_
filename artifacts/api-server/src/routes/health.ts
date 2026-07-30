import { Router, type IRouter } from "express";
import { HealthCheckResponse, ReadinessCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";
import { pingRedis, getQueueMode } from "../queue";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/ready", async (req, res): Promise<void> => {
  let postgres: "ok" | "error";
  try {
    await pool.query("SELECT 1");
    postgres = "ok";
  } catch (err) {
    req.log.error({ err }, "Readiness check: Postgres unreachable");
    postgres = "error";
  }

  // Ping Redis via the BullMQ queue client if REDIS_URL is configured.
  const redis = await pingRedis();
  const queue = getQueueMode();

  const ready = postgres === "ok";
  const data = ReadinessCheckResponse.parse({
    status: ready ? "ok" : "degraded",
    checks: { postgres, redis, queue },
  });

  res.status(ready ? 200 : 503).json(data);
});

export default router;
