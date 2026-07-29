import type { Edge } from "@xyflow/react";
import type {
  WorkflowGraph,
  WorkflowGraphConnection,
  WorkflowGraphNode,
} from "@workspace/api-client-react";
import { NODE_DEFINITIONS } from "./node-registry";
import type { FlowNode } from "./types";

/** Deterministic id for a connection, since the API graph has no edge id of its own. */
function connectionEdgeId(connection: WorkflowGraphConnection): string {
  const sourceHandle = connection.sourceHandle ?? "default";
  const targetHandle = connection.targetHandle ?? "default";
  return `${connection.sourceKey}:${sourceHandle}->${connection.targetKey}:${targetHandle}`;
}

/** Simple grid fallback for nodes the API returned without a saved position. */
function fallbackPosition(index: number): { x: number; y: number } {
  const columns = 4;
  return {
    x: 120 + (index % columns) * 260,
    y: 120 + Math.floor(index / columns) * 160,
  };
}

/** Converts the API's persisted graph shape into React Flow nodes/edges for rendering and editing. */
export function graphToFlow(graph: WorkflowGraph): { nodes: FlowNode[]; edges: Edge[] } {
  const nodes: FlowNode[] = graph.nodes.map((node, index) => ({
    id: node.key,
    type: node.type,
    position: node.position ?? fallbackPosition(index),
    data: {
      nodeType: node.type,
      label: node.label ?? NODE_DEFINITIONS[node.type].label,
      config: node.config ?? {},
    },
  }));

  const edges: Edge[] = graph.connections.map((connection) => ({
    id: connectionEdgeId(connection),
    source: connection.sourceKey,
    target: connection.targetKey,
    sourceHandle: connection.sourceHandle ?? undefined,
    targetHandle: connection.targetHandle ?? undefined,
  }));

  return { nodes, edges };
}

/** Inverse of graphToFlow: serializes current canvas state back into the API's graph shape for saving. */
export function flowToGraph(nodes: FlowNode[], edges: Edge[]): WorkflowGraph {
  const graphNodes: WorkflowGraphNode[] = nodes.map((node) => ({
    key: node.id,
    type: node.data.nodeType,
    label: node.data.label,
    position: { x: node.position.x, y: node.position.y },
    config: node.data.config,
  }));

  const connections: WorkflowGraphConnection[] = edges.map((edge) => ({
    sourceKey: edge.source,
    sourceHandle: edge.sourceHandle ?? null,
    targetKey: edge.target,
    targetHandle: edge.targetHandle ?? null,
  }));

  return { nodes: graphNodes, connections };
}
