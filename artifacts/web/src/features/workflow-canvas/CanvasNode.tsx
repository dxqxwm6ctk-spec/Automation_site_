import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CheckCircle2, Loader2, SkipForward, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { NODE_COLOR_CLASSES, NODE_DEFINITIONS } from "./node-registry";
import type { FlowNode } from "./types";

const HANDLE_CLASSES =
  "!h-3 !w-3 !border-2 !border-background !bg-foreground/50 hover:!bg-primary";

/** Ring + border applied on top of the node's normal colour when it has an execution state. */
const EXECUTION_RING: Record<string, string> = {
  running: "ring-2 ring-amber-400 ring-offset-2 ring-offset-background animate-pulse",
  success: "ring-2 ring-emerald-500 ring-offset-2 ring-offset-background",
  error: "ring-2 ring-destructive ring-offset-2 ring-offset-background",
  skipped: "",
};

const EXECUTION_BADGE: Record<string, React.ReactNode> = {
  running: <Loader2 className="h-3 w-3 animate-spin text-amber-500" />,
  success: <CheckCircle2 className="h-3 w-3 text-emerald-500" />,
  error: <XCircle className="h-3 w-3 text-destructive" />,
  skipped: <SkipForward className="h-3 w-3 text-muted-foreground" />,
};

function CanvasNodeComponent({ data, selected }: NodeProps<FlowNode>) {
  const definition = NODE_DEFINITIONS[data.nodeType];
  const colors = NODE_COLOR_CLASSES[data.nodeType];
  const Icon = definition.icon;
  const inputCount = definition.inputs.length;
  const outputCount = definition.outputs.length;
  const execState = data.executionState;

  return (
    <div
      className={cn(
        "min-w-[190px] rounded-lg border-2 bg-card shadow-sm transition-opacity",
        colors.border,
        selected && cn("shadow-md ring-2 ring-offset-2 ring-offset-background", colors.ring),
        execState && EXECUTION_RING[execState],
        execState === "skipped" && "opacity-40",
      )}
      data-testid={`node-canvas-${data.nodeType}`}
    >
      {inputCount > 0 && (
        <div className={cn("relative", inputCount > 1 ? "h-8 pt-1" : "")}>
          {definition.inputs.map((input, index) => {
            const top = inputCount === 1 ? "0%" : `${((index + 1) / (inputCount + 1)) * 100}%`;
            return (
              <div key={input.id ?? "default"}>
                {inputCount > 1 && (
                  <span
                    className="absolute left-5 -translate-y-1/2 text-[10px] font-medium text-muted-foreground"
                    style={{ top }}
                  >
                    {input.label}
                  </span>
                )}
                <Handle
                  type="target"
                  position={Position.Left}
                  id={input.id}
                  style={inputCount > 1 ? { top } : undefined}
                  className={HANDLE_CLASSES}
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="relative flex items-center gap-2 px-3 py-2.5">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
            colors.badge,
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-card-foreground">{data.label}</p>
          <p className="truncate text-xs text-muted-foreground">{definition.label}</p>
        </div>
        {execState && (
          <span className="shrink-0" data-testid={`node-exec-badge-${execState}`}>
            {EXECUTION_BADGE[execState]}
          </span>
        )}
      </div>

      {outputCount > 0 && (
        <div className={cn("relative", outputCount > 1 ? "h-8 pb-1" : "")}>
          {definition.outputs.map((output, index) => {
            const top =
              outputCount === 1 ? "0%" : `${((index + 1) / (outputCount + 1)) * 100}%`;
            return (
              <div key={output.id ?? "default"}>
                {outputCount > 1 && (
                  <span
                    className="absolute right-5 -translate-y-1/2 text-[10px] font-medium text-muted-foreground"
                    style={{ top }}
                  >
                    {output.label}
                  </span>
                )}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={output.id}
                  style={outputCount > 1 ? { top } : undefined}
                  className={HANDLE_CLASSES}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const CanvasNode = memo(CanvasNodeComponent);
