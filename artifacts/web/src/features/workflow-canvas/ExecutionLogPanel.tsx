/**
 * Execution log panel — shows per-node status badges after a workflow run.
 * Sits beneath the canvas; collapses when there's nothing to show.
 */
import { CheckCircle2, Circle, Loader2, SkipForward, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NodeExecutionState, ExecutionOverlayState, OverallStatus } from "./useExecutionOverlay";

interface ExecutionLogPanelProps {
  executionId: string | null;
  overallStatus: OverallStatus;
  nodeStates: ExecutionOverlayState;
  /** Names for each nodeKey (from the canvas nodes list). */
  nodeLabels: Map<string, string>;
}

const STATUS_ICON: Record<NodeExecutionState, React.ReactNode> = {
  running: <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />,
  success: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
  error: <XCircle className="h-3.5 w-3.5 text-destructive" />,
  skipped: <SkipForward className="h-3.5 w-3.5 text-muted-foreground" />,
};

const OVERALL_LABEL: Record<OverallStatus, string> = {
  idle: "Ready",
  running: "Running…",
  success: "Succeeded",
  error: "Failed",
  cancelled: "Cancelled",
  timeout: "Timed out",
};

const OVERALL_COLOR: Record<OverallStatus, string> = {
  idle: "text-muted-foreground",
  running: "text-amber-600 dark:text-amber-400",
  success: "text-emerald-600 dark:text-emerald-400",
  error: "text-destructive",
  cancelled: "text-muted-foreground",
  timeout: "text-destructive",
};

export function ExecutionLogPanel({
  executionId,
  overallStatus,
  nodeStates,
  nodeLabels,
}: ExecutionLogPanelProps) {
  if (!executionId && overallStatus === "idle") return null;

  const entries = [...nodeStates.entries()];

  return (
    <div
      className="border-t bg-card px-4 py-2.5"
      data-testid="panel-execution-log"
    >
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">Last run</span>
        <span className={cn("text-xs font-semibold", OVERALL_COLOR[overallStatus])}>
          {OVERALL_LABEL[overallStatus]}
        </span>
        {executionId && (
          <span className="font-mono text-[10px] text-muted-foreground/60 hidden sm:inline">
            {executionId.slice(0, 8)}…
          </span>
        )}
      </div>

      {entries.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {entries.map(([nodeKey, state]) => (
            <span
              key={nodeKey}
              className="flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-0.5 text-xs"
            >
              {STATUS_ICON[state] ?? <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
              <span className="max-w-[120px] truncate">
                {nodeLabels.get(nodeKey) ?? nodeKey}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
