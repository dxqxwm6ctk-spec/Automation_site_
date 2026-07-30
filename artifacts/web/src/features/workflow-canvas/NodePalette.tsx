import { useState } from "react";
import type { NodeCategory } from "@workspace/node-registry";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
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
  const [search, setSearch] = useState("");
  const definitionsByCategory = listNodeDefinitionsByCategory();
  const q = search.trim().toLowerCase();

  return (
    <aside
      className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto border-r bg-sidebar p-3"
      data-testid="panel-node-palette"
    >
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-8 pl-8 text-sm"
          placeholder="Search nodes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="input-node-search"
        />
      </div>

      {CATEGORY_ORDER.map((category) => {
        const all = definitionsByCategory[category];
        const definitions = q
          ? all.filter(
              (d) =>
                d.label.toLowerCase().includes(q) ||
                d.description.toLowerCase().includes(q) ||
                d.type.toLowerCase().includes(q),
            )
          : all;
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

      {q && CATEGORY_ORDER.every((c) => {
        const all = definitionsByCategory[c];
        return all.filter(
          (d) =>
            d.label.toLowerCase().includes(q) ||
            d.description.toLowerCase().includes(q) ||
            d.type.toLowerCase().includes(q),
        ).length === 0;
      }) && (
        <p className="px-1 text-xs text-muted-foreground">No nodes match "{search}".</p>
      )}

      {!q && (
        <p className="mt-1 px-1 text-xs text-muted-foreground">
          Drag a node onto the canvas to add it.
        </p>
      )}
    </aside>
  );
}
