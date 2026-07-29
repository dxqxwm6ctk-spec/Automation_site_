import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { NODE_COLOR_CLASSES, NODE_DEFINITIONS } from "./node-registry";
import type { FlowNode } from "./types";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

interface NodeInspectorProps {
  node: FlowNode | null;
  onChangeLabel: (nodeId: string, label: string) => void;
  onChangeConfig: (nodeId: string, config: Record<string, unknown>) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

export function NodeInspector({
  node,
  onChangeLabel,
  onChangeConfig,
  onDelete,
  onClose,
}: NodeInspectorProps) {
  if (!node) {
    return (
      <aside
        className="flex w-80 shrink-0 flex-col border-l bg-sidebar p-4"
        data-testid="panel-node-inspector-empty"
      >
        <p className="text-sm text-muted-foreground">
          Select a node on the canvas to edit its settings.
        </p>
      </aside>
    );
  }

  const activeNode = node;
  const definition = NODE_DEFINITIONS[activeNode.data.nodeType];
  const colors = NODE_COLOR_CLASSES[activeNode.data.nodeType];
  const Icon = definition.icon;
  const config = activeNode.data.config as Record<string, unknown>;

  function patchConfig(patch: Record<string, unknown>) {
    onChangeConfig(activeNode.id, { ...config, ...patch });
  }

  return (
    <aside
      className="flex w-80 shrink-0 flex-col border-l bg-sidebar"
      data-testid="panel-node-inspector"
    >
      <div className="flex items-center justify-between border-b p-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
              colors.badge,
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
          <span className="truncate text-sm font-semibold">{definition.label}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onClose}
          data-testid="button-close-inspector"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="space-y-1.5">
          <Label htmlFor="node-label">Label</Label>
          <Input
            id="node-label"
            value={activeNode.data.label}
            onChange={(event) => onChangeLabel(activeNode.id, event.target.value)}
            data-testid="input-node-label"
          />
        </div>

        <Separator />

        {activeNode.data.nodeType === "http_request" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="node-method">Method</Label>
              <Select
                value={(config.method as string) ?? "GET"}
                onValueChange={(value) => patchConfig({ method: value })}
              >
                <SelectTrigger id="node-method" data-testid="select-http-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HTTP_METHODS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {method}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="node-url">URL</Label>
              <Input
                id="node-url"
                placeholder="https://api.example.com/resource"
                value={(config.url as string) ?? ""}
                onChange={(event) => patchConfig({ url: event.target.value })}
                data-testid="input-http-url"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="node-headers">Headers (JSON)</Label>
              <Textarea
                id="node-headers"
                rows={3}
                placeholder='{ "Content-Type": "application/json" }'
                value={
                  typeof config.headers === "string"
                    ? config.headers
                    : JSON.stringify(config.headers ?? {}, null, 2)
                }
                onChange={(event) => patchConfig({ headers: event.target.value })}
                data-testid="textarea-http-headers"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="node-body">Body</Label>
              <Textarea
                id="node-body"
                rows={4}
                placeholder="Raw request body"
                value={(config.body as string) ?? ""}
                onChange={(event) => patchConfig({ body: event.target.value })}
                data-testid="textarea-http-body"
              />
            </div>
          </>
        )}

        {activeNode.data.nodeType === "delay" && (
          <div className="space-y-1.5">
            <Label htmlFor="node-duration">Duration (seconds)</Label>
            <Input
              id="node-duration"
              type="number"
              min={0}
              value={Number(config.durationSeconds ?? 0)}
              onChange={(event) => patchConfig({ durationSeconds: Number(event.target.value) })}
              data-testid="input-delay-duration"
            />
          </div>
        )}

        {activeNode.data.nodeType === "if" && (
          <div className="space-y-1.5">
            <Label htmlFor="node-condition">Condition</Label>
            <Textarea
              id="node-condition"
              rows={3}
              placeholder="e.g. {{previous.status}} == 200"
              value={(config.condition as string) ?? ""}
              onChange={(event) => patchConfig({ condition: event.target.value })}
              data-testid="textarea-if-condition"
            />
            <p className="text-xs text-muted-foreground">
              Connect the "True" and "False" outputs to different branches.
            </p>
          </div>
        )}

        {(activeNode.data.nodeType === "start" || activeNode.data.nodeType === "end") && (
          <p className="text-xs text-muted-foreground">{definition.description}</p>
        )}
      </div>

      <div className="border-t p-3">
        <Button
          variant="outline"
          className="w-full gap-2 text-destructive hover:text-destructive"
          onClick={() => onDelete(activeNode.id)}
          data-testid="button-delete-node"
        >
          <Trash2 className="h-4 w-4" />
          Delete node
        </Button>
      </div>
    </aside>
  );
}
