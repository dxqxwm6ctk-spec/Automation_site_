import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { NODE_COLOR_CLASSES, NODE_DEFINITIONS } from "./node-registry";
import type { FlowNode } from "./types";

const HANDLE_CLASSES =
  "!h-3 !w-3 !border-2 !border-background !bg-foreground/50 hover:!bg-primary";

function CanvasNodeComponent({ data, selected }: NodeProps<FlowNode>) {
  const definition = NODE_DEFINITIONS[data.nodeType];
  const colors = NODE_COLOR_CLASSES[data.nodeType];
  const Icon = definition.icon;
  const outputCount = definition.outputs.length;

  return (
    <div
      className={cn(
        "min-w-[190px] rounded-lg border-2 bg-card shadow-sm",
        colors.border,
        selected && cn("shadow-md ring-2 ring-offset-2 ring-offset-background", colors.ring),
      )}
      data-testid={`node-canvas-${data.nodeType}`}
    >
      {definition.hasInput && (
        <Handle type="target" position={Position.Left} className={HANDLE_CLASSES} />
      )}

      <div className="flex items-center gap-2 px-3 py-2.5">
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
