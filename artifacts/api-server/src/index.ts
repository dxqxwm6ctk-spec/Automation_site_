import { createServer } from "http";
import app from "./app";
import { initSocketServer } from "./realtime/socket";
import { bootstrapScheduler } from "./scheduler/schedulerService";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Attach Socket.io to the raw http.Server (not Express directly) so that
// WebSocket upgrade requests are handled before Express sees them.
const httpServer = createServer(app);
initSocketServer(httpServer);

httpServer.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");

  // Arm cron timers for every active workflow with a schedule_trigger node.
  bootstrapScheduler().catch((e: unknown) =>
    logger.error({ err: e }, "Scheduler bootstrap failed"),
  );
});
