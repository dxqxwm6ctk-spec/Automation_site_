import { Router, type IRouter } from "express";
import { HealthCheckResponse, ReadinessCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

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

  // Redis/BullMQ infrastructure is Phase 0.4 (not yet provisioned — no
  // REDIS_URL, no client dependency installed). Reported honestly instead
  // of faking a connectivity result; it does not gate readiness until it is
  // actually part of the system. Replace with a real ping once Phase 0.4
  // adds the Redis client.
  const redis = "not_configured" as const;

  const ready = postgres === "ok";
  const data = ReadinessCheckResponse.parse({
    status: ready ? "ok" : "degraded",
    checks: { postgres, redis },
  });

  res.status(ready ? 200 : 503).json(data);
});

export default router;
