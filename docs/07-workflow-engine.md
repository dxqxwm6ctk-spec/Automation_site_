# FlowForge — Workflow Engine Deep Dive

## Overview

The workflow execution engine lives in `apps/worker`. It is a separate Node.js process that consumes jobs from BullMQ and runs workflows to completion. It never touches the HTTP layer — all communication with the outside world is through the Postgres database, Redis pub/sub, and the BullMQ queue.

---

## How Workflows Execute

```
API enqueues job
       │
       ▼
BullMQ picks up job (worker process)
       │
       ▼
ExecutionEngine.run(executionId)
  │
  ├─ Load workflow graph from DB
  ├─ GraphBuilder → in-memory DAG
  ├─ VariableStore.init() → load workspace + workflow variables
  ├─ Find start nodes (no incoming edges)
  │
  └─ Topological walk:
       for each node in order:
         NodeRunner.run(node, context)
           ├─ Decrypt credential if needed
           ├─ Build NodeContext (input, vars, env)
           ├─ Call node.execute(context)
           ├─ Write execution_log record
           └─ Publish exec:{id}:node:{key} event to Redis
```

---

## Execution Order

### Topological Sort

The graph is a **Directed Acyclic Graph (DAG)**. On each execution:

1. `GraphBuilder` deserialises the `workflow_versions.graph_json`
2. Builds an adjacency list `{ nodeKey → outgoing edges[] }`
3. Runs **Kahn's algorithm** to produce a topological ordering
4. Cycles in the graph (not from loop nodes — those are handled separately) are rejected at save time with a validation error

### Trigger Node

The start node is the single node with no incoming edges. Its "output" is the `execution.trigger_payload`. Multiple trigger nodes are not allowed in the same workflow.

### Sequential Execution (default)

Nodes are executed in topological order. Each node receives the output of its upstream node(s) as its `$input`. When a node has multiple upstream nodes (merge/join), all upstream outputs are merged into a single object keyed by `nodeKey`.

### Parallel Execution

When two or more nodes share the same upstream node and have no dependency between them, they can execute in parallel:

```
      HTTP_1
     /      \
SLACK_1   EMAIL_1     ← these run in parallel
     \      /
     LOG_1
```

Implementation: `ExecutionEngine` detects nodes at the same "depth" in the topological order and `Promise.all()`s them. Each parallel branch writes its own `execution_logs` record. `LOG_1` waits for both to complete before receiving merged inputs.

---

## Branches

The **Condition node** evaluates a boolean expression against `$input` and routes execution to one of two branches: `true` or `false`.

```
  [HTTP_1]
     │
  [CONDITION: $input.status === 200]
    │                        │
  [SLACK_1] (true)     [LOG_ERROR] (false)
```

- The condition expression is a simple JavaScript expression evaluated in a **sandboxed eval** (not `isolated-vm` — no async needed; just `new Function('$input', expr)($input)`).
- Branches are independent sub-graphs. Nodes reachable only via an unselected branch are **skipped** (`execution_log.status = skipped`).
- Both branches can reconverge at a downstream node; the downstream node waits for the branch that actually ran.

---

## Loops

The **Loop node** iterates over an array value from `$input`:

```
[SET_ITEMS: items = [1, 2, 3]]
      │
  [LOOP: $input.items]
      │
  [HTTP per item] ← runs once per item
      │
[MERGE: collect results]
```

Implementation:
1. `LoopController` reads the loop node's `iterateOver` expression, evaluates it against `$input`
2. For each item in the array, a **child execution context** is created with `$item` set to the current element
3. The loop body (sub-graph between loop start and loop end nodes) runs sequentially per item (parallel option configurable)
4. Results are collected and emitted as an array from the loop node's output
5. Max iterations: 1000 (configurable); exceeding limit → node error

---

## Parallel Execution Details

Two parallelism modes:

| Mode | Trigger | Implementation |
|---|---|---|
| **DAG fan-out** | Nodes at same topological depth | `Promise.all()` in ExecutionEngine |
| **Loop parallel** | Loop node with `mode: "parallel"` | `Promise.all(items.map(...))` in LoopController, concurrency limit via `p-limit` |

`p-limit(5)` is the default concurrency cap for parallel loops to avoid overwhelming external APIs.

---

## Error Recovery

Node errors are classified:

| Error type | Example | Recovery |
|---|---|---|
| **Transient** | HTTP 429, 503, network timeout | Retry with backoff |
| **Permanent** | HTTP 400, auth failure, schema validation | Fail immediately; no retry |
| **Timeout** | Node exceeds per-node timeout | Counted as transient unless max retries exceeded |
| **Fatal** | Worker crash, OOM | Job requeued by BullMQ (at-least-once guarantee) |

The node manifest declares `"retryable": true/false` for its error class. The `RetryManager` checks this flag.

---

## Retry Logic

Each node can be configured with:

```json
{
  "retryCount": 3,
  "retryDelay": 1000,
  "retryBackoff": "exponential"
}
```

Backoff formula: `delay * (2 ^ attempt)` with ±10% jitter.

The `RetryManager` runs the node function up to `retryCount + 1` times. Each attempt:
1. Writes an `execution_log` with `attempt = N`
2. Publishes retry event to Redis (`execution:node:retry`)
3. Waits `backoffDelay(attempt)` ms before next attempt

If all attempts fail, the node is marked `error` and the execution enters error handling.

---

## Resume Execution

Future feature (v1.2+): a **Human Approval** node pauses execution and stores state:

1. Execution status set to `waiting_for_input`
2. Approval URL sent to designated email/Slack
3. On `POST /executions/:id/resume` with approval payload → execution resumes from the paused node

Current MVP: no resume support. Executions are atomic run-to-completion.

---

## Timeouts

Two timeout layers:

| Timeout | Default | Config |
|---|---|---|
| Per-node | 30 s | `node.config.timeoutMs` |
| Per-execution | 300 s (5 min) | `workspace.settings.executionTimeoutMs` |

`TimeoutWatcher` uses `AbortController`. On timeout:
- Node's `execute()` promise is raced against `AbortSignal`
- On abort: node marked `timeout` (counts as a retryable error)
- If per-execution timeout fires: all pending nodes cancelled, execution → `timeout` status

---

## Variable Passing

### Between Nodes

Each node's output becomes `$input` for all directly downstream nodes.

When a node has multiple upstream outputs (merge point), inputs are merged:
```js
$input = {
  http_1: { statusCode: 200, body: { ... } },
  slack_1: { messageId: "abc" }
}
```

### Expressions

Variables are accessed via dot notation in expression fields:
- `$input.body.userId` — output from upstream node
- `$vars.API_BASE_URL` — workspace/workflow variable
- `$item` — current loop item
- `$execution.id` — execution metadata
- `$env.NODE_ENV` — environment variables (allowlist only)

Expressions are evaluated with a minimal sandbox (`new Function`) — not full JS; no `fetch`, `require`, `process`.

---

## Data Mapping

The **Set Variable** node and expression fields support a data mapping DSL:

```json
{
  "mapping": [
    { "target": "userId", "source": "$input.body.id" },
    { "target": "name",   "source": "$input.body.firstName + ' ' + $input.body.lastName" },
    { "target": "score",  "source": "$input.score * 100" }
  ]
}
```

Mapping is evaluated top-to-bottom; earlier results available to later expressions. Implemented as a lightweight interpreter — not `eval` — parsing the expression AST with `acorn` in a restricted mode.

---

## Node System — Plugin Architecture

### Node Manifest

Every node type is described by a **manifest** (TypeScript interface from `@flowforge/node-sdk`):

```typescript
interface NodeManifest {
  type: string;           // "action.http"
  version: string;        // semver "1.2.0"
  label: string;
  category: string;       // "Core" | "Communication" | "Data" | "Logic" | ...
  description: string;
  iconUrl: string;
  inputSchema: JSONSchema7;        // Zod-converted at validation time
  outputSchema: JSONSchema7;
  credentialTypes?: string[];      // compatible credential types
  retryable?: boolean;
  timeoutMs?: number;              // default timeout override
  execute: (ctx: NodeContext) => Promise<NodeResult>;
}
```

### NodeContext

```typescript
interface NodeContext {
  input: Record<string, unknown>;        // merged upstream outputs
  config: Record<string, unknown>;       // node config from canvas
  credential?: DecryptedCredential;
  vars: Record<string, string>;
  item?: unknown;                        // set during loop iteration
  execution: { id: string; workflowId: string; attempt: number };
  logger: NodeLogger;                    // scoped Pino logger
  signal: AbortSignal;                   // for timeout cancellation
}
```

### NodeResult

```typescript
interface NodeResult {
  output: Record<string, unknown>;       // passed to downstream nodes
  metadata?: Record<string, unknown>;    // stored in execution_log only
}
```

### Node Versioning

- Nodes carry a semver `version` field.
- When a workflow is saved, the active version of each node type is snapshotted into `workflow_versions.graph_json` as `{ nodeType: "action.http", nodeVersion: "1.2.0" }`.
- Executions always use the pinned version, never the latest. This prevents silent breaking changes from new node releases affecting existing workflows.
- When the worker loads a node, it resolves the pinned version from the `NodeRegistryService`.

### Custom Nodes

Custom nodes are packaged as a zip containing:
```
my-node/
├── manifest.json     (NodeManifest without the execute fn)
├── index.js          (CommonJS bundle; exports { execute })
└── icon.svg
```

Uploaded via `POST /api/v1/workspaces/:id/nodes`. The worker loads custom nodes from the workspace's node directory using a dynamic `require()` in a restricted module sandbox.

### Marketplace Support (v2+)

Marketplace nodes are distributed as versioned npm packages under `@flowforge-nodes/` scope. The worker can install them on-demand (with cache) or they can be pre-installed in a custom worker Docker image for predictable startup times.

---

## Canvas — Visual Editor

### Drag & Drop
React Flow handles pointer events. Nodes are dragged from the palette using `onDragStart`/`onDrop` with a custom `transferType = "node-type"`. Dropped coordinates are transformed from viewport to canvas space via `reactFlowInstance.screenToFlowPosition()`.

### Zoom & Pan
React Flow built-in: scroll-to-zoom, Space+drag to pan, or trackpad pinch. Zoom range: 10%–200%. `fitView()` called after auto-layout.

### Connection System
Nodes expose named **handles** (ports). Output handles are on the right; input handles on the left. Condition nodes expose `true` and `output-false` handles. Loop nodes expose `loop-body` and `loop-complete` handles.

Connection validation: `isValidConnection()` callback checks:
- Output handle type matches input handle type
- No self-loops
- No duplicate connections to the same target handle

### Auto Layout
Dagre algorithm (`@dagrejs/dagre`) computes x/y positions from the DAG topology. Triggered manually ("Auto Layout" button) or automatically on first load of a workflow with no saved positions.

### Node Grouping
Future feature. Nodes can be grouped into a named container (rendered as a React Flow Group node). Groups can be collapsed.

### Copy/Paste
Selected nodes serialised to clipboard as JSON. On paste: nodes duplicated with new keys, offset by +20px, connections internal to the selection are preserved.

### Undo/Redo
Implemented with a Zustand immer-based history stack. Each canvas mutation pushes a new snapshot. Cmd+Z pops; Cmd+Shift+Z re-applies. Stack limit: 50 entries.

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+Z` | Undo |
| `Cmd+Shift+Z` | Redo |
| `Del` / `Backspace` | Delete selected nodes/edges |
| `Cmd+A` | Select all |
| `Cmd+C` | Copy selected |
| `Cmd+V` | Paste |
| `Cmd+D` | Duplicate selected |
| `Cmd+S` | Save workflow |
| `Space + drag` | Pan canvas |
| `Scroll` | Zoom |
| `Cmd+Shift+F` | Fit view |
| `Cmd+F` | Open node search |
| `/` | Focus node palette search |
| `Esc` | Deselect / close panel |
