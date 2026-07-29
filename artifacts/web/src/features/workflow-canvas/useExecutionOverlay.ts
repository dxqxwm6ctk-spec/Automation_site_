/**
 * Subscribes to real-time execution events for a single execution and
 * returns a per-nodeKey status map that CanvasNode uses for its overlay.
 *
 * Lifecycle:
 *   - Pass the executionId returned by POST /execute to activate.
 *   - Pass null to clear the overlay (e.g. before starting a new run).
 *   - The socket subscribes to room `execution:<id>` while mounted.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";

export type NodeExecutionState = "running" | "success" | "error" | "skipped";
export type ExecutionOverlayState = Map<string, NodeExecutionState>;

export type OverallStatus =
  | "idle"
  | "running"
  | "success"
  | "error"
  | "cancelled"
  | "timeout";

interface NodeStartEvent {
  executionId: string;
  nodeKey: string;
}
interface NodeDoneEvent {
  executionId: string;
  nodeKey: string;
  status: string;
  durationMs?: number;
}
interface ExecutionDoneEvent {
  executionId: string;
  status: string;
}

export function useExecutionOverlay(executionId: string | null) {
  const [nodeStates, setNodeStates] = useState<ExecutionOverlayState>(new Map());
  const [overallStatus, setOverallStatus] = useState<OverallStatus>("idle");
  const activeIdRef = useRef<string | null>(null);

  const clear = useCallback(() => {
    setNodeStates(new Map());
    setOverallStatus("idle");
  }, []);

  useEffect(() => {
    if (!executionId) {
      clear();
      return;
    }

    activeIdRef.current = executionId;
    const socket = getSocket();

    if (!socket.connected) socket.connect();

    socket.emit("execution:subscribe", executionId);
    setOverallStatus("running");

    function onNodeStart(event: NodeStartEvent) {
      if (event.executionId !== activeIdRef.current) return;
      setNodeStates((prev) => {
        const next = new Map(prev);
        next.set(event.nodeKey, "running");
        return next;
      });
    }

    function onNodeDone(event: NodeDoneEvent) {
      if (event.executionId !== activeIdRef.current) return;
      const state =
        event.status === "success"
          ? "success"
          : event.status === "skipped"
            ? "skipped"
            : "error";
      setNodeStates((prev) => {
        const next = new Map(prev);
        next.set(event.nodeKey, state as NodeExecutionState);
        return next;
      });
    }

    function onExecutionDone(event: ExecutionDoneEvent) {
      if (event.executionId !== activeIdRef.current) return;
      const s = event.status as OverallStatus;
      setOverallStatus(["success", "error", "cancelled", "timeout"].includes(s) ? s : "error");
    }

    socket.on("execution:node:start", onNodeStart);
    socket.on("execution:node:done", onNodeDone);
    socket.on("execution:done", onExecutionDone);

    return () => {
      socket.emit("execution:unsubscribe", executionId);
      socket.off("execution:node:start", onNodeStart);
      socket.off("execution:node:done", onNodeDone);
      socket.off("execution:done", onExecutionDone);
    };
  }, [executionId, clear]);

  return { nodeStates, overallStatus, clear };
}
