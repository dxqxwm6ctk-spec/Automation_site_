/**
 * Socket.io server singleton — Phase 1.6 real-time execution overlay.
 *
 * Call `initSocketServer(httpServer)` once from index.ts (before .listen()).
 * Call `getIO()` from anywhere else (e.g. the execution engine) to emit events.
 *
 * Rooms: each execution gets its own room `execution:<executionId>`.
 * Clients join via the "execution:subscribe" event and leave on disconnect /
 * "execution:unsubscribe".
 */
import { Server } from "socket.io";
import type { Server as HttpServer } from "http";
import { logger } from "../lib/logger";

let _io: Server | null = null;

export function initSocketServer(httpServer: HttpServer): Server {
  _io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    // Must match the path the Replit proxy forwards. The proxy routes
    // /api/* to this server, so the socket.io polling/upgrade path lives
    // under /api/socket.io to be reachable from the web frontend at the same
    // origin via { path: "/api/socket.io" }.
    path: "/api/socket.io",
  });

  _io.on("connection", (socket) => {
    logger.debug({ socketId: socket.id }, "Socket connected");

    socket.on("execution:subscribe", (executionId: unknown) => {
      if (typeof executionId === "string") {
        void socket.join(`execution:${executionId}`);
        logger.debug({ socketId: socket.id, executionId }, "Subscribed to execution room");
      }
    });

    socket.on("execution:unsubscribe", (executionId: unknown) => {
      if (typeof executionId === "string") {
        void socket.leave(`execution:${executionId}`);
      }
    });

    socket.on("disconnect", () => {
      logger.debug({ socketId: socket.id }, "Socket disconnected");
    });
  });

  return _io;
}

/** Returns the live Socket.io server, or null if called before initSocketServer. */
export function getIO(): Server | null {
  return _io;
}

// ─── Typed event emitters ─────────────────────────────────────────────────────

export interface ExecutionStartedEvent {
  executionId: string;
}

export function emitExecutionStarted(event: ExecutionStartedEvent): void {
  _io?.to(`execution:${event.executionId}`).emit("execution:started", event);
}

export interface ExecutionNodeStartEvent {
  executionId: string;
  nodeKey: string;
}

export interface ExecutionNodeDoneEvent {
  executionId: string;
  nodeKey: string;
  /** "success" | "error" | "skipped" */
  status: string;
  durationMs?: number;
  output?: unknown;
  error?: { message: string };
}

export interface ExecutionDoneEvent {
  executionId: string;
  /** "success" | "error" | "cancelled" | "timeout" */
  status: string;
  output?: unknown;
  error?: unknown;
}

/** Emits to every client subscribed to this execution's room. */
export function emitNodeStart(event: ExecutionNodeStartEvent): void {
  _io?.to(`execution:${event.executionId}`).emit("execution:node:start", event);
}

export function emitNodeDone(event: ExecutionNodeDoneEvent): void {
  _io?.to(`execution:${event.executionId}`).emit("execution:node:done", event);
}

export function emitExecutionDone(event: ExecutionDoneEvent): void {
  _io?.to(`execution:${event.executionId}`).emit("execution:done", event);
}
