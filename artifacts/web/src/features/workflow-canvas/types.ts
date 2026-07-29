import type { Node } from "@xyflow/react";
import type { WorkflowGraphNodeConfig, WorkflowGraphNodeType } from "@workspace/api-client-react";

/**
 * Data carried by every React Flow node on the canvas. `nodeType` mirrors the
 * API's WorkflowGraphNodeType and drives both rendering (node-registry) and
 * serialization (graph-transform).
 */
export interface FlowNodeData extends Record<string, unknown> {
  nodeType: WorkflowGraphNodeType;
  label: string;
  config: WorkflowGraphNodeConfig;
  /** Live execution state — set by the execution overlay and cleared on the next run. */
  executionState?: "running" | "success" | "error" | "skipped";
}

export type FlowNode = Node<FlowNodeData>;
