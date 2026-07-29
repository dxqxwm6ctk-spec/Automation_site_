import pinoHttp from "pino-http";
import { logger } from "../lib/logger";

/**
 * Structured request/response logging for every inbound request. Attaches a
 * child logger (correlated by request id) to `req.log` for use inside route
 * handlers — see the pnpm-workspace server skill's `req.log` convention.
 *
 * Kept as its own module (rather than inlined in app.ts) per the Phase 0.3
 * file layout in docs/06-implementation-phases.md.
 */
export const requestLogger = pinoHttp({
  logger,
  serializers: {
    req(req) {
      return {
        id: req.id,
        method: req.method,
        url: req.url?.split("?")[0],
      };
    },
    res(res) {
      return {
        statusCode: res.statusCode,
      };
    },
  },
});
