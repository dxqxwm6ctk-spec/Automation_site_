import { getNodeDefinition } from "./registry";

/** A single field-level validation problem. */
export interface FieldError {
  field: string;
  message: string;
}

export interface NodeConfigValidationResult {
  valid: boolean;
  errors: FieldError[];
}

/**
 * Validates a node's `config` against its registered type's schema.
 * Unknown types are reported as a `type` field error rather than throwing,
 * so callers can aggregate errors across a whole graph.
 */
export function validateNodeConfig(type: string, config: unknown): NodeConfigValidationResult {
  const definition = getNodeDefinition(type);
  if (!definition) {
    return { valid: false, errors: [{ field: "type", message: `Unknown node type: "${type}"` }] };
  }

  const result = definition.configSchema.safeParse(config ?? {});
  if (result.success) {
    return { valid: true, errors: [] };
  }

  const errors = result.error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join(".") : "(root)",
    message: issue.message,
  }));
  return { valid: false, errors };
}

export interface WorkflowNodeValidationError extends FieldError {
  nodeId: string;
}

export interface WorkflowGraphValidationResult {
  valid: boolean;
  errors: WorkflowNodeValidationError[];
}

/**
 * Minimal structural shape `validateWorkflowGraph` needs. Kept as loose,
 * unknown-keyed records (rather than the API's or the web app's own graph
 * types) so both the API server and the web client can pass their graph
 * value directly without an adapter, and so a node missing `key`/`type`
 * altogether is reported as a validation error instead of a type error.
 */
export interface WorkflowGraphNodeLike {
  key?: unknown;
  type?: unknown;
  config?: unknown;
  [extra: string]: unknown;
}

export interface WorkflowGraphLike {
  nodes: ReadonlyArray<WorkflowGraphNodeLike>;
  connections?: ReadonlyArray<Record<string, unknown>>;
}

/**
 * Validates every node in a workflow graph: each node must have a `type`
 * that's a known node type, and a `config` that satisfies that type's
 * schema. Does not validate connections/edges — that's out of scope for
 * node-registry (it knows nodes, not graph topology).
 */
export function validateWorkflowGraph(graph: WorkflowGraphLike): WorkflowGraphValidationResult {
  const errors: WorkflowNodeValidationError[] = [];

  graph.nodes.forEach((node, index) => {
    const nodeId = typeof node.key === "string" && node.key.length > 0 ? node.key : `#${index}`;

    if (typeof node.type !== "string" || node.type.length === 0) {
      errors.push({ nodeId, field: "type", message: "Node type is required" });
      return;
    }

    const result = validateNodeConfig(node.type, node.config);
    for (const error of result.errors) {
      errors.push({ nodeId, ...error });
    }
  });

  return { valid: errors.length === 0, errors };
}
