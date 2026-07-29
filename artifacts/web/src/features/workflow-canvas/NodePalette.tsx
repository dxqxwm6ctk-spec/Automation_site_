import { cn } from "@/lib/utils";
import { NODE_COLOR_CLASSES, NODE_DEFINITIONS, NODE_TYPE_LIST } from "./node-registry";

export const WORKFLOW_NODE_DND_TYPE = "application/flowforge-node";

export function NodePalette() {
  return (
    <aside
      className="flex w-64 shrink-0 flex-col gap-1 overflow-y-auto border-r bg-sidebar p-3"
      data-testid="panel-node-palette"
    >
      <h2 className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Nodes
      </h2>
      <div className="flex flex-col gap-2">
        {NODE_TYPE_LIST.map((type) => {
          const definition = NODE_DEFINITIONS[type];
          const colors = NODE_COLOR_CLASSES[type];
          const Icon = definition.icon;
          return (
            <div
              key={type}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(WORKFLOW_NODE_DND_TYPE, type);
                event.dataTransfer.effectAllowed = "move";
              }}
              className={cn(
                "hover-elevate active-elevate-2 flex cursor-grab items-start gap-2 rounded-md border bg-card p-2.5 active:cursor-grabbing",
              )}
              data-testid={`palette-node-${type}`}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                  colors.badge,
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-card-foreground">{definition.label}</p>
                <p className="text-xs leading-snug text-muted-foreground">
                  {definition.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 px-1 text-xs text-muted-foreground">
        Drag a node onto the canvas to add it.
      </p>
    </aside>
  );
}
