import type { ZodType } from "zod/v4";

/**
 * Broad classification used to group nodes in the palette UI. Kept small and
 * closed — new categories should be rare and deliberate.
 */
export type NodeCategory = "trigger" | "action" | "logic" | "control";

/**
 * A single input or output connection point on a node. `id` distinguishes
 * multiple ports of the same kind (e.g. the "if" node's `true`/`false`
 * outputs) — omit it for nodes with a single, unambiguous port.
 */
export interface NodePort {
  id?: string;
  label: string;
}

/**
 * Framework-agnostic description of a node type. This is the single source
 * of truth for what a node is, what it's configured with, and how that
 * config is validated. It intentionally knows nothing about React, icons as
 * components, or canvas rendering — `icon` is a plain string id that
 * consumers (e.g. the web app) map to their own icon components.
 */
export interface NodeDefinition<TConfig = Record<string, unknown>> {
  /** Stable identifier persisted as the node's `type` in workflow graph JSON. */
  id: string;
  name: string;
  description: string;
  category: NodeCategory;
  /** Icon identifier (e.g. "globe"); consumers map this to a real icon. */
  icon: string;
  inputs: NodePort[];
  outputs: NodePort[];
  configSchema: ZodType<TConfig>;
  defaultConfig: TConfig;
  /**
   * Runs this node during execution (Phase 1.4). Optional so node-registry
   * stays usable as a pure metadata/validation library where an executor
   * doesn't make sense (e.g. future purely-structural node types) — but
   * every node a workflow can actually run must define one, or the engine
   * fails that node with an "engine_error".
   */
  execute?: NodeExecutor<TConfig>;
}

/**
 * Runtime context passed to a node's `execute` function. Deliberately
 * small: Phase 1.4 has no variable store, loop scope, or credential store,
 * so a node has access only to its own config, the upstream node's output,
 * and an abort signal.
 */
export interface NodeExecutionContext<TConfig = Record<string, unknown>> {
  /** This node's own config, already validated against `configSchema`. */
  config: TConfig;
  /**
   * Output of the upstream node. `null` for entry nodes (start/webhook
   * trigger) — an execution's `triggerPayload` becomes this. An array when
   * more than one live branch merges into this node.
   */
  input: unknown;
  /**
   * Aborts when the execution is cancelled or the execution-level (5 min
   * default) timeout elapses. Nodes that do async I/O (e.g. http_request's
   * fetch, delay's sleep) must pass this through so they can be interrupted
   * promptly; synchronous nodes can ignore it.
   */
  signal: AbortSignal;
}

/**
 * Result of running a single node. `output` becomes the downstream node's
 * `input`. `branch` selects which outgoing connection(s) to follow —
 * omit it for nodes with a single unconditional output (see NodePort);
 * the "if" node is the only Phase 1.4 node that sets it, to "true" or
 * "false", matching its output port ids.
 */
export interface NodeExecutionResult {
  output: unknown;
  branch?: string;
}

export type NodeExecutor<TConfig = Record<string, unknown>> = (
  context: NodeExecutionContext<TConfig>,
) => Promise<NodeExecutionResult>;

/**
 * Thrown by a node's `execute` to signal that IT (not the engine's ambient
 * per-node or execution-level timeout) decided an operation took too long —
 * e.g. http_request's own configurable `config.timeout`. The engine catches
 * this to classify the execution_log/execution row as a timeout rather than
 * a generic error.
 */
export class NodeTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NodeTimeoutError";
  }
}
