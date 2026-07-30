import { useMemo, useState } from "react";
import { Check, Copy, Plus, Trash2, X } from "lucide-react";
import {
  httpMethods,
  logLevels,
  validateNodeConfig,
  webhookResponseModes,
  type FieldError,
} from "@workspace/node-registry";
import { useListCredentials } from "@workspace/api-client-react";
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
  /** Generated webhook URL (e.g. https://domain/api/webhooks/wh_…) shown on webhook_trigger nodes. */
  webhookUrl?: string;
}

/** Returns the first validation message for `field`, if any. */
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
 * node's real config.
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

/** A read-only URL row with a copy-to-clipboard button. */
function CopyableUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 py-1.5">
      <code className="min-w-0 flex-1 truncate text-xs">{url}</code>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 text-muted-foreground hover:text-foreground"
        title="Copy URL"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

/** A small helper input row with an expression-friendly placeholder. */
function ExprInput({
  id,
  label,
  value,
  placeholder,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function NodeInspector({
  node,
  onChangeLabel,
  onChangeConfig,
  onDelete,
  onClose,
  webhookUrl,
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

  return (
    <NodeInspectorContent
      key={node.id}
      node={node}
      onChangeLabel={onChangeLabel}
      onChangeConfig={onChangeConfig}
      onDelete={onDelete}
      onClose={onClose}
      webhookUrl={webhookUrl}
    />
  );
}

function NodeInspectorContent({
  node,
  onChangeLabel,
  onChangeConfig,
  onDelete,
  onClose,
  webhookUrl,
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

  // Load credentials only when inspecting an http_request node
  const credentialsQuery = useListCredentials({
    query: {
      enabled: node.data.nodeType === "http_request",
      queryKey: ["/api/v1/credentials"] as const,
    },
  });
  const credentials = credentialsQuery.data?.credentials ?? [];

  function patchConfig(patch: Record<string, unknown>) {
    onChangeConfig(node.id, { ...config, ...patch });
  }

  const auth = (config.auth as Record<string, unknown> | undefined) ?? { type: "none" };
  const authType = typeof auth.type === "string" ? auth.type : "none";

  function patchAuth(patch: Record<string, unknown>) {
    patchConfig({ auth: { ...auth, ...patch } });
  }

  // ── Switch rules helpers ───────────────────────────────────────────────────
  const switchRules = (config.rules as Array<{ condition: string; label: string }> | undefined) ?? [];

  function updateSwitchRule(index: number, patch: Partial<{ condition: string; label: string }>) {
    const next = switchRules.map((r, i) => (i === index ? { ...r, ...patch } : r));
    patchConfig({ rules: next });
  }

  function addSwitchRule() {
    patchConfig({ rules: [...switchRules, { condition: "", label: `Case ${switchRules.length + 1}` }] });
  }

  function removeSwitchRule(index: number) {
    patchConfig({ rules: switchRules.filter((_, i) => i !== index) });
  }

  // ── Telegram action helpers ────────────────────────────────────────────────
  const tgOp = (config.operation as string) ?? "send_message";

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
        {/* ── Label ── */}
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

        {/* ── webhook_trigger ── */}
        {node.data.nodeType === "webhook_trigger" && (
          <>
            {webhookUrl && (
              <div className="space-y-1.5">
                <Label>Webhook URL</Label>
                <CopyableUrl url={webhookUrl} />
                <p className="text-xs text-muted-foreground">
                  POST to this URL to trigger the workflow.
                </p>
              </div>
            )}
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

        {/* ── telegram_trigger ── */}
        {node.data.nodeType === "telegram_trigger" && (
          <ExprInput
            id="node-tg-trigger-token"
            label="Bot Token"
            value={(config.botToken as string) ?? ""}
            placeholder="env:TELEGRAM_BOT_TOKEN"
            onChange={(v) => patchConfig({ botToken: v })}
            hint="Use env:VAR_NAME to read from an environment variable."
          />
        )}

        {/* ── telegram_action ── */}
        {node.data.nodeType === "telegram_action" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="node-tg-op">Operation</Label>
              <Select
                value={tgOp}
                onValueChange={(v) => patchConfig({ operation: v })}
              >
                <SelectTrigger id="node-tg-op">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="send_message">Send Message</SelectItem>
                  <SelectItem value="send_photo">Send Photo</SelectItem>
                  <SelectItem value="answer_callback_query">Answer Callback Query</SelectItem>
                  <SelectItem value="get_file">Get File</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <ExprInput
              id="node-tg-token"
              label="Bot Token"
              value={(config.botToken as string) ?? ""}
              placeholder="env:TELEGRAM_BOT_TOKEN"
              onChange={(v) => patchConfig({ botToken: v })}
              hint="Use env:VAR_NAME or =expr syntax."
            />

            {(tgOp === "send_message" || tgOp === "send_photo") && (
              <ExprInput
                id="node-tg-chat"
                label="Chat ID"
                value={(config.chatId as string) ?? ""}
                placeholder="=$input?.chatId"
                onChange={(v) => patchConfig({ chatId: v })}
              />
            )}

            {tgOp === "send_message" && (
              <div className="space-y-1.5">
                <Label htmlFor="node-tg-text">Text</Label>
                <Textarea
                  id="node-tg-text"
                  rows={3}
                  placeholder="Hello!"
                  value={(config.text as string) ?? ""}
                  onChange={(e) => patchConfig({ text: e.target.value })}
                />
              </div>
            )}

            {tgOp === "send_photo" && (
              <>
                <ExprInput
                  id="node-tg-photo"
                  label="Photo (URL / base64 / file_id)"
                  value={(config.photoData as string) ?? ""}
                  placeholder="=$input?.imageDataUrl"
                  onChange={(v) => patchConfig({ photoData: v })}
                />
                <ExprInput
                  id="node-tg-caption"
                  label="Caption"
                  value={(config.caption as string) ?? ""}
                  placeholder="=$input?.productName"
                  onChange={(v) => patchConfig({ caption: v })}
                />
                <ExprInput
                  id="node-tg-reply-markup"
                  label="Reply Markup (JSON)"
                  value={(config.replyMarkup as string) ?? ""}
                  placeholder='{"inline_keyboard":[[{"text":"Click","callback_data":"cb"}]]}'
                  onChange={(v) => patchConfig({ replyMarkup: v })}
                />
                <ExprInput
                  id="node-tg-reply-to"
                  label="Reply-to Message ID"
                  value={(config.replyToMessageId as string) ?? ""}
                  placeholder="=$input?.origMessageId"
                  onChange={(v) => patchConfig({ replyToMessageId: v })}
                />
              </>
            )}

            {tgOp === "answer_callback_query" && (
              <>
                <ExprInput
                  id="node-tg-cb-id"
                  label="Callback Query ID"
                  value={(config.callbackQueryId as string) ?? ""}
                  placeholder="=$input?.callback_query?.id"
                  onChange={(v) => patchConfig({ callbackQueryId: v })}
                />
                <ExprInput
                  id="node-tg-cb-text"
                  label="Notification Text"
                  value={(config.callbackText as string) ?? ""}
                  placeholder="Processing…"
                  onChange={(v) => patchConfig({ callbackText: v })}
                />
              </>
            )}

            {tgOp === "get_file" && (
              <ExprInput
                id="node-tg-file-id"
                label="File ID"
                value={(config.fileId as string) ?? ""}
                placeholder="=$input?.fileId"
                onChange={(v) => patchConfig({ fileId: v })}
              />
            )}
          </>
        )}

        {/* ── openai_image ── */}
        {node.data.nodeType === "openai_image" && (
          <>
            <ExprInput
              id="node-oai-key"
              label="API Key"
              value={(config.apiKey as string) ?? ""}
              placeholder="env:OPENAI_API_KEY"
              onChange={(v) => patchConfig({ apiKey: v })}
              hint="Use env:VAR_NAME to keep it out of the graph."
            />
            <ExprInput
              id="node-oai-model"
              label="Model"
              value={(config.model as string) ?? "gpt-image-1"}
              placeholder="gpt-image-1"
              onChange={(v) => patchConfig({ model: v })}
            />
            <div className="space-y-1.5">
              <Label htmlFor="node-oai-op">Operation</Label>
              <Select
                value={(config.operation as string) ?? "edit"}
                onValueChange={(v) => patchConfig({ operation: v })}
              >
                <SelectTrigger id="node-oai-op">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="edit">Edit (image + prompt)</SelectItem>
                  <SelectItem value="generate">Generate (prompt only)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="node-oai-prompt">Prompt</Label>
              <Textarea
                id="node-oai-prompt"
                rows={4}
                placeholder="=$input?.builtPrompt"
                value={(config.prompt as string) ?? ""}
                onChange={(e) => patchConfig({ prompt: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Prefix with <code className="rounded bg-muted px-1">=</code> to evaluate as JS expression.
              </p>
            </div>
            {(config.operation as string) !== "generate" && (
              <ExprInput
                id="node-oai-image"
                label="Image (URL or base64)"
                value={(config.imageData as string) ?? ""}
                placeholder="=$input?.fileUrl"
                onChange={(v) => patchConfig({ imageData: v })}
              />
            )}
            <ExprInput
              id="node-oai-size"
              label="Size"
              value={(config.size as string) ?? "1024x1536"}
              placeholder="1024x1536"
              onChange={(v) => patchConfig({ size: v })}
              hint="1024x1024, 1024x1536, 1536x1024"
            />
            <ExprInput
              id="node-oai-quality"
              label="Quality"
              value={(config.quality as string) ?? "high"}
              placeholder="high"
              onChange={(v) => patchConfig({ quality: v })}
              hint="low, medium, high"
            />
          </>
        )}

        {/* ── switch ── */}
        {node.data.nodeType === "switch" && (
          <>
            <div className="space-y-3">
              <Label>Rules</Label>
              {switchRules.length === 0 && (
                <p className="text-xs text-muted-foreground">No rules yet. Add one below.</p>
              )}
              {switchRules.map((rule, i) => (
                <div key={i} className="space-y-2 rounded-md border p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Rule {i + 1}</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => removeSwitchRule(i)}
                      title="Remove rule"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`rule-label-${i}`}>Output label</Label>
                    <Input
                      id={`rule-label-${i}`}
                      placeholder={`Case ${i + 1}`}
                      value={rule.label}
                      onChange={(e) => updateSwitchRule(i, { label: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`rule-cond-${i}`}>Condition (JS)</Label>
                    <Textarea
                      id={`rule-cond-${i}`}
                      rows={2}
                      placeholder="$input?.status === 200"
                      value={rule.condition}
                      onChange={(e) => updateSwitchRule(i, { condition: e.target.value })}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
              ))}
              {switchRules.length < 4 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5"
                  onClick={addSwitchRule}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add rule
                </Button>
              )}
            </div>
            <ExprInput
              id="node-switch-fallback"
              label="Fallback output label"
              value={(config.fallbackLabel as string) ?? "Default"}
              onChange={(v) => patchConfig({ fallbackLabel: v })}
            />
          </>
        )}

        {/* ── http_request ── */}
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
                  else if (value === "credential") patchConfig({ auth: { type: "credential", credentialId: "" } });
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
                  <SelectItem value="credential">Saved credential</SelectItem>
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
            {authType === "credential" && (
              <div className="space-y-1.5 rounded-md border p-2.5">
                <Label htmlFor="node-auth-credential">Credential</Label>
                {credentialsQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">Loading credentials…</p>
                ) : credentialsQuery.isError ? (
                  <p className="text-xs text-destructive">Failed to load credentials</p>
                ) : credentials.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No credentials saved yet. Add one on the{" "}
                    <a href="/credentials" className="underline">Credentials page</a>.
                  </p>
                ) : (
                  <Select
                    value={(auth.credentialId as string) ?? ""}
                    onValueChange={(value) => patchAuth({ credentialId: value })}
                  >
                    <SelectTrigger id="node-auth-credential" data-testid="select-http-auth-credential">
                      <SelectValue placeholder="Select a credential…" />
                    </SelectTrigger>
                    <SelectContent>
                      {credentials.map((cred) => (
                        <SelectItem key={cred.id} value={cred.id}>
                          {cred.name}
                          <span className="ml-1.5 text-xs text-muted-foreground">({cred.credentialType})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </>
        )}

        {/* ── delay ── */}
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

        {/* ── if ── */}
        {node.data.nodeType === "if" && (
          <div className="space-y-1.5">
            <Label htmlFor="node-condition">Condition</Label>
            <Textarea
              id="node-condition"
              rows={3}
              placeholder="e.g. $input.status === 200"
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

        {/* ── schedule_trigger ── */}
        {node.data.nodeType === "schedule_trigger" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="node-cron">Cron expression</Label>
              <Input
                id="node-cron"
                placeholder="0 * * * *"
                value={(config.cronExpression as string) ?? ""}
                onChange={(event) => patchConfig({ cronExpression: event.target.value })}
                data-testid="input-schedule-cron"
              />
              {errorFor("cronExpression") && (
                <p className="text-xs text-destructive">{errorFor("cronExpression")}</p>
              )}
              <p className="text-xs text-muted-foreground">
                minute · hour · day · month · weekday
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="node-timezone">Timezone</Label>
              <Input
                id="node-timezone"
                placeholder="UTC"
                value={(config.timezone as string) ?? "UTC"}
                onChange={(event) => patchConfig({ timezone: event.target.value })}
                data-testid="input-schedule-timezone"
              />
              {errorFor("timezone") && (
                <p className="text-xs text-destructive">{errorFor("timezone")}</p>
              )}
            </div>
          </>
        )}

        {/* ── code ── */}
        {node.data.nodeType === "code" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="node-code">Code</Label>
              <Textarea
                id="node-code"
                rows={8}
                placeholder={"// $input holds the upstream output\nreturn $input;"}
                value={(config.code as string) ?? ""}
                onChange={(event) => patchConfig({ code: event.target.value })}
                className="font-mono text-xs"
                data-testid="textarea-code"
              />
              {errorFor("code") && (
                <p className="text-xs text-destructive">{errorFor("code")}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Use <code className="rounded bg-muted px-1">$input</code> to access the upstream output.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="node-code-timeout">Timeout (ms)</Label>
              <Input
                id="node-code-timeout"
                type="number"
                min={1}
                max={30000}
                value={Number(config.timeout ?? 10_000)}
                onChange={(event) => patchConfig({ timeout: Number(event.target.value) })}
                data-testid="input-code-timeout"
              />
              {errorFor("timeout") && (
                <p className="text-xs text-destructive">{errorFor("timeout")}</p>
              )}
            </div>
          </>
        )}

        {/* ── loop ── */}
        {node.data.nodeType === "loop" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="node-items-expr">Items expression</Label>
              <Textarea
                id="node-items-expr"
                rows={3}
                placeholder="$input.results"
                value={(config.itemsExpression as string) ?? ""}
                onChange={(event) => patchConfig({ itemsExpression: event.target.value })}
                data-testid="textarea-loop-items"
              />
              {errorFor("itemsExpression") && (
                <p className="text-xs text-destructive">{errorFor("itemsExpression")}</p>
              )}
              <p className="text-xs text-muted-foreground">
                JS expression returning an array. <code className="rounded bg-muted px-1">$input</code> is the upstream output.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="node-max-iter">Max iterations</Label>
              <Input
                id="node-max-iter"
                type="number"
                min={1}
                max={10000}
                value={Number(config.maxIterations ?? 100)}
                onChange={(event) => patchConfig({ maxIterations: Number(event.target.value) })}
                data-testid="input-loop-max-iterations"
              />
              {errorFor("maxIterations") && (
                <p className="text-xs text-destructive">{errorFor("maxIterations")}</p>
              )}
            </div>
          </>
        )}

        {/* ── set_variable ── */}
        {node.data.nodeType === "set_variable" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="node-var-name">Variable name</Label>
              <Input
                id="node-var-name"
                placeholder="result"
                value={(config.variableName as string) ?? ""}
                onChange={(event) => patchConfig({ variableName: event.target.value })}
                data-testid="input-set-variable-name"
              />
              {errorFor("variableName") && (
                <p className="text-xs text-destructive">{errorFor("variableName")}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="node-var-expr">Value expression</Label>
              <Textarea
                id="node-var-expr"
                rows={3}
                placeholder="$input.statusCode === 200"
                value={(config.valueExpression as string) ?? ""}
                onChange={(event) => patchConfig({ valueExpression: event.target.value })}
                data-testid="textarea-set-variable-expr"
              />
              {errorFor("valueExpression") && (
                <p className="text-xs text-destructive">{errorFor("valueExpression")}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Result is merged onto the output as <code className="rounded bg-muted px-1">{`{...input, [name]: value}`}</code>.
              </p>
            </div>
          </>
        )}

        {/* ── log ── */}
        {node.data.nodeType === "log" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="node-log-message">Message</Label>
              <Textarea
                id="node-log-message"
                rows={3}
                placeholder={'Status: {{$input.statusCode}}'}
                value={(config.message as string) ?? ""}
                onChange={(event) => patchConfig({ message: event.target.value })}
                data-testid="textarea-log-message"
              />
              {errorFor("message") && (
                <p className="text-xs text-destructive">{errorFor("message")}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Use <code className="rounded bg-muted px-1">{"{{$input.field}}"}</code> for interpolation.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="node-log-level">Level</Label>
              <Select
                value={(config.level as string) ?? "info"}
                onValueChange={(value) => patchConfig({ level: value })}
              >
                <SelectTrigger id="node-log-level" data-testid="select-log-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {logLevels.map((level) => (
                    <SelectItem key={level} value={level}>
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {/* ── start / end ── */}
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
