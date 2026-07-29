import type { Graph, GraphConnection, GraphNode } from "../lib/graph";

/**
 * The graph's structure is unsound for execution: a connection points at a
 * node key that doesn't exist, there's no single entry node, or (see
 * GraphCycleError below) it contains a cycle.
 */
export class GraphStructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphStructureError";
  }
}

/**
 * The graph contains a cycle, so no execution order exists. This is the one
 * structural defect also rejected at *save* time (see assertAcyclic below
 * and its use in routes/v1/workflows.ts's assertValidGraph) — everything
 * else here (entry-node count, dangling refs) is checked only when a graph
 * is actually run, because an in-progress graph with no nodes yet, or nodes
 * not wired up yet, is a normal, valid thing to save.
 */
export class GraphCycleError extends GraphStructureError {
  constructor(message: string) {
    super(message);
    this.name = "GraphCycleError";
  }
}

/** Verifies the graph has no cycle via Kahn's algorithm (docs/07-workflow-engine.md "Topological Sort"). */
export function assertAcyclic(graph: Graph): void {
  const indegree = new Map<string, number>();
  for (const node of graph.nodes) indegree.set(node.key, 0);

  const outgoingByKey = new Map<string, string[]>();
  for (const node of graph.nodes) outgoingByKey.set(node.key, []);

  for (const connection of graph.connections) {
    // Dangling references aren't this function's concern (see buildExecutionPlan).
    if (!indegree.has(connection.targetKey) || !outgoingByKey.has(connection.sourceKey)) continue;
    indegree.set(connection.targetKey, (indegree.get(connection.targetKey) ?? 0) + 1);
    outgoingByKey.get(connection.sourceKey)?.push(connection.targetKey);
  }

  const queue = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([key]) => key);
  let visited = 0;
  while (queue.length > 0) {
    const key = queue.shift() as string;
    visited += 1;
    for (const targetKey of outgoingByKey.get(key) ?? []) {
      const next = (indegree.get(targetKey) ?? 0) - 1;
      indegree.set(targetKey, next);
      if (next === 0) queue.push(targetKey);
    }
  }

  if (visited !== graph.nodes.length) {
    throw new GraphCycleError("Workflow graph contains a cycle and cannot be executed");
  }
}

export interface ExecutionPlan {
  nodesByKey: Map<string, GraphNode>;
  /** Outgoing connections, keyed by source node key. */
  outgoing: Map<string, GraphConnection[]>;
  /** Incoming connections, keyed by target node key. */
  incoming: Map<string, GraphConnection[]>;
  /** The graph's single entry point — the node with no incoming connections. */
  entryKey: string;
}

/**
 * Builds the execution-ready view of a graph: adjacency maps plus the
 * single entry point. Throws GraphStructureError for anything that makes
 * the graph impossible to run — a dangling connection reference, zero or
 * multiple entry nodes, or a cycle.
 */
export function buildExecutionPlan(graph: Graph): ExecutionPlan {
  const nodesByKey = new Map(graph.nodes.map((node) => [node.key, node]));

  const outgoing = new Map<string, GraphConnection[]>();
  const incoming = new Map<string, GraphConnection[]>();
  for (const node of graph.nodes) {
    outgoing.set(node.key, []);
    incoming.set(node.key, []);
  }

  for (const connection of graph.connections) {
    if (!nodesByKey.has(connection.sourceKey)) {
      throw new GraphStructureError(
        `Connection references unknown source node "${connection.sourceKey}"`,
      );
    }
    if (!nodesByKey.has(connection.targetKey)) {
      throw new GraphStructureError(
        `Connection references unknown target node "${connection.targetKey}"`,
      );
    }
    outgoing.get(connection.sourceKey)?.push(connection);
    incoming.get(connection.targetKey)?.push(connection);
  }

  const entryKeys = graph.nodes
    .filter((node) => (incoming.get(node.key)?.length ?? 0) === 0)
    .map((node) => node.key);

  if (entryKeys.length === 0) {
    throw new GraphStructureError(
      "Workflow has no entry node — add a trigger node with no incoming connections",
    );
  }
  if (entryKeys.length > 1) {
    throw new GraphStructureError(
      `Workflow has more than one entry node (${entryKeys.join(", ")}) — only one trigger is allowed per workflow`,
    );
  }

  assertAcyclic(graph);

  return { nodesByKey, outgoing, incoming, entryKey: entryKeys[0] };
}
