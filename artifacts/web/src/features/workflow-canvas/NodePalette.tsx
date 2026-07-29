import type { NodeCategory } from "@workspace/node-registry";
import { cn } from "@/lib/utils";
import { NODE_COLOR_CLASSES, listNodeDefinitionsByCategory } from "./node-registry";

export const WORKFLOW_NODE_DND_TYPE = "application/flowforge-node";

const CATEGORY_ORDER: NodeCategory[] = ["trigger", "action", "logic", "control"];

const CATEGORY_LABELS: Record<NodeCategory, string> = {
  trigger: "Triggers",
  action: "Actions",
  logic: "Logic",
  control: "Control",
};

export function NodePalette() {
  const definitionsByCategory = listNodeDefinitionsByCategory();

  return (
    <aside
      className="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r bg-sidebar p-3"
      data-testid="panel-node-palette"
    >
      {CATEGORY_ORDER.map((category) => {
        const definitions = definitionsByCategory[category];
        if (definitions.length === 0) return null;

        return (
          <div key={category} className="flex flex-col gap-2">
            <h2 className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {CATEGORY_LABELS[category]}
            </h2>
            <div className="flex flex-col gap-2">
              {definitions.map((definition) => {
                const colors = NODE_COLOR_CLASSES[definition.type];
                const Icon = definition.icon;
                return (
                  <div
                    key={definition.type}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData(WORKFLOW_NODE_DND_TYPE, definition.type);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    className={cn(
                      "hover-elevate active-elevate-2 flex cursor-grab items-start gap-2 rounded-md border bg-card p-2.5 active:cursor-grabbing",
                    )}
                    data-testid={`palette-node-${definition.type}`}
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
          </div>
        );
      })}
      <p className="mt-1 px-1 text-xs text-muted-foreground">
        Drag a node onto the canvas to add it.
      </p>
    </aside>
  );
}
