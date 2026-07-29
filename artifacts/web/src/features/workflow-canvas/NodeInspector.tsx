import { useMemo, useState } from "react";
import { Trash2, X } from "lucide-react";
import {
  httpMethods,
  validateNodeConfig,
  webhookResponseModes,
  type FieldError,
} from "@workspace/node-registry";
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

interface NodeInspectorProps {
  node: FlowNode | null;
  onChangeLabel: (nodeId: string, label: string) => void;
  onChangeConfig: (nodeId: string, config: Record<string, unknown>) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

/** Returns the first validation message for `field` (or a nested `field.*` key, e.g. a header entry), if any. */
function messageForField(errors: FieldError[], field: string): string | undefined {
  return errors.find((error) => error.field === field || error.field.startsWith(`${field}.`))
    ?.message;
}

interface JsonRecordFieldProps {
  id: string;
  label: string;
  value: unknown;
  placeholder: string;
  onCommit: (value: Record<string, string>) => void;
  errorMessage?: string;
}

/**
 * A JSON-object textarea (used for HTTP headers/query params). Keeps its own
 * draft text so an in-progress, momentarily-invalid edit never overwrites the
 * node's real config — only well-formed JSON objects are committed.
 */
function JsonRecordField({ id, label, value, placeholder, onCommit, errorMessage }: JsonRecordFieldProps) {
  const [text, setText] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        rows={3}
        placeholder={placeholder}
        value={text}
        onChange={(event) => {
          const nextText = event.target.value;
          setText(nextText);
          if (nextText.trim() === "") {
            setParseError(null);
            onCommit({});
            return;
          }
          try {
            const parsed: unknown = JSON.parse(nextText);
            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
              setParseError("Must be a JSON object");
              return;
            }
            setParseError(null);
            onCommit(parsed as Record<string, string>);
          } catch {
            setParseError("Invalid JSON");
          }
        }}
        data-testid={`textarea-${id}`}
      />
      {(parseError ?? errorMessage) && (
        <p className="text-xs text-destructive">{parseError ?? errorMessage}</p>
      )}
    </div>
  );
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

  // Keyed on the node id so every field's local draft state (JsonRecordField's
  // text, etc.) resets cleanly when the selected node changes instead of
  // carrying over stale text from the previously selected node.
  return (
    <NodeInspectorContent
      key={node.id}
      node={node}
      onChangeLabel={onChangeLabel}
      onChangeConfig={onChangeConfig}
      onDelete={onDelete}
      onClose={onClose}
    />
  );
}

function NodeInspectorContent({
  node,
  onChangeLabel,
  onChangeConfig,
  onDelete,
  onClose,
}: NodeInspectorProps & { node: FlowNode }) {
  const definition = NODE_DEFINITIONS[node.data.nodeType];
  const colors = NODE_COLOR_CLASSES[node.data.nodeType];
  const Icon = definition.icon;
  const config = node.data.config as Record<string, unknown>;

  const validation = useMemo(
    () => validateNodeConfig(node.data.nodeType, config),
    [node.data.nodeType, config],
  );
  const errorFor = (field: string) => messageForField(validation.errors, field);

  function patchConfig(patch: Record<string, unknown>) {
    onChangeConfig(node.id, { ...config, ...patch });
  }

  const auth = (config.auth as Record<string, unknown> | undefined) ?? { type: "none" };
  const authType = typeof auth.type === "string" ? auth.type : "none";

  function patchAuth(patch: Record<string, unknown>) {
    patchConfig({ auth: { ...auth, ...patch } });
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
            value={node.data.label}
            onChange={(event) => onChangeLabel(node.id, event.target.value)}
            data-testid="input-node-label"
          />
        </div>

        <Separator />

        {node.data.nodeType === "webhook_trigger" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="node-webhook-path">Path</Label>
              <Input
                id="node-webhook-path"
                placeholder="/webhook"
                value={(config.path as string) ?? ""}
                onChange={(event) => patchConfig({ path: event.target.value })}
                data-testid="input-webhook-path"
              />
              {errorFor("path") && (
                <p className="text-xs text-destructive">{errorFor("path")}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="node-webhook-response-mode">Response mode</Label>
              <Select
                value={(config.responseMode as string) ?? "immediate"}
                onValueChange={(value) => patchConfig({ responseMode: value })}
              >
                <SelectTrigger id="node-webhook-response-mode" data-testid="select-webhook-response-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {webhookResponseModes.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {mode === "immediate" ? "Immediate" : "Wait for completion"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {node.data.nodeType === "http_request" && (
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
                  {httpMethods.map((method) => (
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
              {errorFor("url") && <p className="text-xs text-destructive">{errorFor("url")}</p>}
            </div>
            <JsonRecordField
              id="node-headers"
              label="Headers (JSON)"
              value={config.headers}
              placeholder='{ "Content-Type": "application/json" }'
              onCommit={(headers) => patchConfig({ headers })}
              errorMessage={errorFor("headers")}
            />
            <JsonRecordField
              id="node-query-params"
              label="Query params (JSON)"
              value={config.queryParams}
              placeholder='{ "page": "1" }'
              onCommit={(queryParams) => patchConfig({ queryParams })}
              errorMessage={errorFor("queryParams")}
            />
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
            <div className="space-y-1.5">
              <Label htmlFor="node-timeout">Timeout (ms)</Label>
              <Input
                id="node-timeout"
                type="number"
                min={0}
                value={Number(config.timeout ?? 30_000)}
                onChange={(event) => patchConfig({ timeout: Number(event.target.value) })}
                data-testid="input-http-timeout"
              />
              {errorFor("timeout") && (
                <p className="text-xs text-destructive">{errorFor("timeout")}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="node-auth-type">Authentication</Label>
              <Select
                value={authType}
                onValueChange={(value) => {
                  if (value === "basic") patchConfig({ auth: { type: "basic", username: "", password: "" } });
                  else if (value === "bearer") patchConfig({ auth: { type: "bearer", token: "" } });
                  else patchConfig({ auth: { type: "none" } });
                }}
              >
                <SelectTrigger id="node-auth-type" data-testid="select-http-auth-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="bearer">Bearer token</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {authType === "basic" && (
              <div className="space-y-2 rounded-md border p-2.5">
                <div className="space-y-1.5">
                  <Label htmlFor="node-auth-username">Username</Label>
                  <Input
                    id="node-auth-username"
                    value={(auth.username as string) ?? ""}
                    onChange={(event) => patchAuth({ username: event.target.value })}
                    data-testid="input-http-auth-username"
                  />
                  {errorFor("auth.username") && (
                    <p className="text-xs text-destructive">{errorFor("auth.username")}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="node-auth-password">Password</Label>
                  <Input
                    id="node-auth-password"
                    type="password"
                    value={(auth.password as string) ?? ""}
                    onChange={(event) => patchAuth({ password: event.target.value })}
                    data-testid="input-http-auth-password"
                  />
                  {errorFor("auth.password") && (
                    <p className="text-xs text-destructive">{errorFor("auth.password")}</p>
                  )}
                </div>
              </div>
            )}
            {authType === "bearer" && (
              <div className="space-y-1.5 rounded-md border p-2.5">
                <Label htmlFor="node-auth-token">Token</Label>
                <Input
                  id="node-auth-token"
                  value={(auth.token as string) ?? ""}
                  onChange={(event) => patchAuth({ token: event.target.value })}
                  data-testid="input-http-auth-token"
                />
                {errorFor("auth.token") && (
                  <p className="text-xs text-destructive">{errorFor("auth.token")}</p>
                )}
              </div>
            )}
          </>
        )}

        {node.data.nodeType === "delay" && (
          <div className="space-y-1.5">
            <Label htmlFor="node-duration">Duration (ms)</Label>
            <Input
              id="node-duration"
              type="number"
              min={0}
              value={Number(config.durationMs ?? 0)}
              onChange={(event) => patchConfig({ durationMs: Number(event.target.value) })}
              data-testid="input-delay-duration"
            />
            {errorFor("durationMs") && (
              <p className="text-xs text-destructive">{errorFor("durationMs")}</p>
            )}
          </div>
        )}

        {node.data.nodeType === "if" && (
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
            {errorFor("condition") && (
              <p className="text-xs text-destructive">{errorFor("condition")}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Connect the "True" and "False" outputs to different branches.
            </p>
          </div>
        )}

        {(node.data.nodeType === "start" || node.data.nodeType === "end") && (
          <p className="text-xs text-muted-foreground">{definition.description}</p>
        )}
      </div>

      <div className="border-t p-3">
        <Button
          variant="outline"
          className="w-full gap-2 text-destructive hover:text-destructive"
          onClick={() => onDelete(node.id)}
          data-testid="button-delete-node"
        >
          <Trash2 className="h-4 w-4" />
          Delete node
        </Button>
      </div>
    </aside>
  );
}
